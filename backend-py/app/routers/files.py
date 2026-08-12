import json
import logging
import os
import re
import uuid
from datetime import date, datetime
from typing import Optional

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import auth, models
from ..config import settings
from ..database import get_db
from ..upload_limits import copy_upload_to_path
from .assets import (
    _IMPORT_REQUIRED_COLUMNS,
    _log_change,
    _maintenance_summary,
    create_assets_from_rows,
    parse_asset_import_rows,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/files", tags=["files"])


def _safe_stored_filename(original_filename: str) -> str:
    """업로드 원본 파일명에 경로 구분자나 '..'가 섞여 있어도(예: '../../etc/passwd')
    디스크 저장 경로가 UPLOAD_DIRECTORY 밖으로 벗어나지 않도록, 디렉터리 성분을
    제거하고 UUID를 붙인 안전한 파일명만 사용한다."""
    base_name = os.path.basename(original_filename or "upload")
    return f"{uuid.uuid4()}_{base_name}"

MAINTENANCE_TYPE_MAP = {
    "정기점검": models.MaintenanceType.ROUTINE,
    "점검": models.MaintenanceType.INSPECTION,
    "수리": models.MaintenanceType.REPAIR,
    "교체": models.MaintenanceType.REPLACEMENT,
    "ROUTINE": models.MaintenanceType.ROUTINE,
    "REPAIR": models.MaintenanceType.REPAIR,
    "REPLACEMENT": models.MaintenanceType.REPLACEMENT,
    "INSPECTION": models.MaintenanceType.INSPECTION,
}

COLUMN_ALIASES = {
    # "자산번호"가 자산 등록용 엑셀(/export, /import)과 같은 컬럼명이라 이제 표준이다.
    # "자산코드"는 예전 유지보수 내역서 양식과의 호환을 위해 계속 인식만 해준다.
    "asset_code": ["자산번호", "자산코드", "asset_code", "assetCode"],
    "maintenance_date": ["정비일", "정비일자", "maintenance_date"],
    "maintenance_type": ["정비유형", "유형", "maintenance_type"],
    "cost": ["비용", "정비비용", "cost"],
    "description": ["설명", "내용", "description"],
    "technician": ["담당자", "기술자", "technician"],
    "failure_type": ["고장유형", "failure_type"],
}


def file_to_response(f: models.FileUpload) -> dict:
    extracted_summary = None
    if f.extracted_data:
        try:
            parsed = json.loads(f.extracted_data)
            if parsed.get("kind") == "maintenance_records":
                extracted_summary = {
                    "kind": "maintenance_records",
                    "totalRows": parsed.get("totalRows"),
                    "validRows": parsed.get("validRows"),
                    "errorRowCount": len(parsed.get("errorRows", [])),
                    "errorRows": parsed.get("errorRows", []),
                    "unmatchedAssetCodes": parsed.get("unmatchedAssetCodes", []),
                    "records": parsed.get("records", []),
                    "appliedRecordCount": parsed.get("appliedRecordCount"),
                }
            elif parsed.get("kind") == "asset_registration":
                extracted_summary = {
                    "kind": "asset_registration",
                    "totalRows": parsed.get("totalRows"),
                    "validRows": parsed.get("validRows"),
                    "errorRowCount": len(parsed.get("errorRows", [])),
                    "errorRows": parsed.get("errorRows", []),
                    "rows": [
                        {
                            "row": r["row"],
                            "assetName": r["assetRequest"]["assetName"],
                            "category": r["assetRequest"]["category"],
                        }
                        for r in parsed.get("rows", [])
                    ],
                    "appliedAssetCount": parsed.get("appliedAssetCount"),
                }
            elif parsed.get("kind") == "pdf_quote":
                extracted_summary = {
                    "kind": "pdf_quote",
                    "characterCount": parsed.get("characterCount"),
                    "preview": (parsed.get("extractedText") or "")[:300],
                    "assetCode": parsed.get("assetCode"),
                    "assetExists": parsed.get("assetExists"),
                    "vendor": parsed.get("vendor"),
                    "quoteDate": parsed.get("quoteDate"),
                    "totalAmount": parsed.get("totalAmount"),
                    "appliedRecordCount": parsed.get("appliedRecordCount"),
                }
        except (TypeError, ValueError):
            extracted_summary = None

    return {
        "id": f.id,
        "filename": f.filename,
        "originalFilename": f.original_filename,
        "fileType": f.file_type.value if f.file_type else None,
        "status": f.status.value if f.status else None,
        "applied": f.applied,
        "errorMessage": f.error_message,
        "extractedSummary": extracted_summary,
    }


def detect_file_type(filename: str) -> models.FileType:
    if not filename:
        return models.FileType.PDF
    lower = filename.lower()
    if lower.endswith(".csv"):
        return models.FileType.CSV
    if lower.endswith(".xlsx") or lower.endswith(".xls"):
        return models.FileType.EXCEL
    return models.FileType.PDF


def _find_column(columns, aliases):
    for alias in aliases:
        for col in columns:
            if str(col).strip() == alias:
                return col
    return None


def _detect_spreadsheet_kind(columns) -> Optional[str]:
    """업로드된 엑셀/CSV가 '자산 등록'용인지 '유지보수 내역'용인지 컬럼 구성만 보고 판별한다.
    두 형식 모두 자산을 가리키는 컬럼명은 "자산번호"로 통일돼 있어서, 자산 등록에만 있는
    나머지 필수 컬럼(자산명/카테고리/구매일/구매가/내용연수(년))이 전부 있는지로 구분한다.
    이 6개가 다 있으면 자산 등록, 아니고 자산번호+정비일만 있으면 유지보수 내역이다."""
    cols = {str(c).strip() for c in columns}
    if _IMPORT_REQUIRED_COLUMNS <= cols:
        return "asset_registration"
    if _find_column(columns, COLUMN_ALIASES["asset_code"]) and _find_column(columns, COLUMN_ALIASES["maintenance_date"]):
        return "maintenance_records"
    return None


def _read_spreadsheet_df(file_path: str, file_type: models.FileType, *, as_str: bool):
    if file_type == models.FileType.CSV:
        return pd.read_csv(file_path, dtype=str, keep_default_na=False) if as_str else pd.read_csv(file_path)
    return pd.read_excel(file_path, dtype=str, keep_default_na=False) if as_str else pd.read_excel(file_path)


def _parse_maintenance_rows(df):
    col_map = {}
    for field, aliases in COLUMN_ALIASES.items():
        found = _find_column(df.columns, aliases)
        if found:
            col_map[field] = found

    if "asset_code" not in col_map or "maintenance_date" not in col_map:
        raise ValueError("필수 컬럼(자산번호, 정비일)을 찾을 수 없습니다.")

    rows = []
    errors = []
    for idx, row in df.iterrows():
        line_no = idx + 2  # header is row 1
        asset_code_raw = str(row.get(col_map["asset_code"], "")).strip()
        maint_date_raw = str(row.get(col_map["maintenance_date"], "")).strip()
        try:
            asset_code = int(float(asset_code_raw)) if asset_code_raw else None
        except ValueError:
            asset_code = None
        if asset_code is None or not maint_date_raw:
            errors.append({"row": line_no, "reason": "자산번호가 숫자가 아니거나 정비일이 누락되었습니다."})
            continue

        try:
            maint_date = pd.to_datetime(maint_date_raw).date().isoformat()
        except Exception:
            errors.append({"row": line_no, "reason": f"정비일 형식 오류: {maint_date_raw}"})
            continue

        type_raw = str(row.get(col_map.get("maintenance_type", ""), "")).strip() if "maintenance_type" in col_map else ""
        maint_type = MAINTENANCE_TYPE_MAP.get(type_raw, models.MaintenanceType.REPAIR)

        cost_raw = str(row.get(col_map.get("cost", ""), "")).strip() if "cost" in col_map else ""
        cost_clean = cost_raw.replace(",", "").replace("원", "").strip()
        try:
            cost = float(cost_clean) if cost_clean else None
        except ValueError:
            cost = None

        rows.append({
            "row": line_no,
            "assetCode": asset_code,
            "maintenanceDate": maint_date,
            "maintenanceType": maint_type.value,
            "cost": cost,
            "description": str(row.get(col_map.get("description", ""), "")).strip() or None,
            "technician": str(row.get(col_map.get("technician", ""), "")).strip() or None,
            "failureType": str(row.get(col_map.get("failure_type", ""), "")).strip() or None,
        })

    return rows, errors


def _parse_pdf(file_path: str) -> str:
    import pdfplumber

    text_parts = []
    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            text_parts.append(page.extract_text() or "")
    return "\n".join(text_parts)


_ASSET_CODE_LABELED_RE = re.compile(r"자산\s?(?:코드|번호)\s*[:\-]?\s*(\d+)")
_TOTAL_AMOUNT_RE = re.compile(r"(?:합\s?계|총\s?금액|총액|견적\s?금액)\s*[:\-]?\s*([\d,]+)\s*원?")
_QUOTE_DATE_RE = re.compile(r"(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})")
_VENDOR_RE = re.compile(r"(?:상호|업체명|공급자)\s*[:\-]?\s*([^\n]+)")


def _parse_pdf_quote(text: str) -> dict:
    asset_code_match = _ASSET_CODE_LABELED_RE.search(text)
    asset_code = int(asset_code_match.group(1)) if asset_code_match else None

    total_match = _TOTAL_AMOUNT_RE.search(text)
    total_amount = None
    if total_match:
        try:
            total_amount = float(total_match.group(1).replace(",", ""))
        except ValueError:
            total_amount = None

    date_match = _QUOTE_DATE_RE.search(text)
    quote_date = None
    if date_match:
        try:
            y, m, d = (int(g) for g in date_match.groups())
            quote_date = date(y, m, d).isoformat()
        except ValueError:
            quote_date = None

    vendor_match = _VENDOR_RE.search(text)
    vendor = vendor_match.group(1).strip() if vendor_match else None

    return {
        "assetCode": asset_code,
        "totalAmount": total_amount,
        "quoteDate": quote_date,
        "vendor": vendor,
    }


@router.get("")
def get_all_files(db: Session = Depends(get_db)):
    files = db.query(models.FileUpload).all()
    return {"success": True, "message": None, "data": [file_to_response(f) for f in files]}


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(auth.require_admin),
):
    try:
        os.makedirs(settings.UPLOAD_DIRECTORY, exist_ok=True)
        original_filename = file.filename
        filename = _safe_stored_filename(original_filename)
        file_path = os.path.join(settings.UPLOAD_DIRECTORY, filename)

        # 업로드 전체를 메모리에 올렸다가 쓰지 않고, 청크 단위로 바로 디스크에 흘려보낸다.
        # 서비스가 systemd MemoryMax로 제한돼 있어서, 큰 파일을 한 번에 메모리로
        # 읽으면 그 한도를 넘겨 프로세스가 강제 종료될 수 있다. 그렇다고 크기
        # 상한 없이 무제한으로 받으면 디스크가 고갈될 수 있으므로 함께 강제한다.
        copy_upload_to_path(file, file_path)

        file_upload = models.FileUpload(
            filename=filename,
            original_filename=original_filename,
            file_type=detect_file_type(original_filename),
            file_path=file_path,
            status=models.UploadStatus.PENDING,
            applied=False,
        )
        db.add(file_upload)
        db.commit()
        db.refresh(file_upload)

        return {"success": True, "message": "File uploaded successfully", "data": file_to_response(file_upload)}
    except HTTPException:
        raise
    except Exception:
        logger.warning("파일 업로드 실패", exc_info=True)
        raise HTTPException(status_code=400, detail="File upload failed")


def _process_file_task_logic(file_upload: models.FileUpload, db: Session):
    try:
        if file_upload.file_type in (models.FileType.EXCEL, models.FileType.CSV):
            # 헤더만 먼저 훑어서 '자산 등록'용 엑셀인지 '유지보수 내역'용인지 판별한다.
            # 두 형식 모두 "자산번호" 컬럼을 쓰지만, 자산 등록에만 있는 나머지 필수 컬럼
            # (자산명/카테고리/구매일/구매가/내용연수(년)) 유무로 자동 판별이 가능하다.
            header_df = _read_spreadsheet_df(file_upload.file_path, file_upload.file_type, as_str=True)
            kind = _detect_spreadsheet_kind(header_df.columns)

            if kind == "asset_registration":
                # 자산 등록 파싱(assets.py)은 날짜/숫자를 pandas 기본 타입 추론으로 다루므로,
                # 문자열로 강제 변환한 header_df가 아니라 원본 타입 그대로 다시 읽는다.
                asset_df = _read_spreadsheet_df(file_upload.file_path, file_upload.file_type, as_str=False)
                valid_rows, errors = parse_asset_import_rows(asset_df)

                result = {
                    "kind": "asset_registration",
                    "filename": file_upload.original_filename,
                    "totalRows": len(valid_rows) + len(errors),
                    "validRows": len(valid_rows),
                    "errorRows": errors,
                    "rows": valid_rows,
                }
            elif kind == "maintenance_records":
                rows, errors = _parse_maintenance_rows(header_df)

                asset_codes = {r["assetCode"] for r in rows}
                existing_codes = set()
                if asset_codes:
                    existing_codes = {
                        a.asset_code
                        for a in db.query(models.Asset.asset_code)
                        .filter(models.Asset.asset_code.in_(asset_codes))
                        .all()
                    }
                for r in rows:
                    r["assetExists"] = r["assetCode"] in existing_codes

                result = {
                    "kind": "maintenance_records",
                    "filename": file_upload.original_filename,
                    "totalRows": len(rows) + len(errors),
                    "validRows": len(rows),
                    "errorRows": errors,
                    "unmatchedAssetCodes": sorted({r["assetCode"] for r in rows if not r["assetExists"]}),
                    "records": rows,
                }
            else:
                raise ValueError(
                    "지원하지 않는 파일 형식입니다. 자산 등록용 엑셀(자산번호/자산명/카테고리/구매일/구매가/내용연수(년)) "
                    "또는 유지보수 내역용 파일(자산번호/정비일)의 컬럼 구성을 확인해주세요."
                )
        else:
            text = _parse_pdf(file_upload.file_path)
            quote = _parse_pdf_quote(text)
            asset_exists = False
            if quote["assetCode"]:
                asset_exists = (
                    db.query(models.Asset)
                    .filter(models.Asset.asset_code == quote["assetCode"])
                    .first()
                    is not None
                )
            result = {
                "kind": "pdf_quote",
                "filename": file_upload.original_filename,
                "extractedText": text,
                "characterCount": len(text),
                "assetCode": quote["assetCode"],
                "assetExists": asset_exists,
                "vendor": quote["vendor"],
                "quoteDate": quote["quoteDate"],
                "totalAmount": quote["totalAmount"],
            }

        file_upload.extracted_data = json.dumps(result, ensure_ascii=False)
        file_upload.status = models.UploadStatus.COMPLETED
        file_upload.error_message = None
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"File process background task failed: {e}", exc_info=True)
        file_upload.status = models.UploadStatus.FAILED
        file_upload.error_message = str(e)

    file_upload.updated_at = datetime.now()
    db.commit()


def _process_file_in_background(file_id: int):
    from ..database import SessionLocal
    db = SessionLocal()
    try:
        file_upload = db.query(models.FileUpload).filter(models.FileUpload.id == file_id).first()
        if file_upload:
            _process_file_task_logic(file_upload, db)
    finally:
        db.close()


@router.post("/{file_id}/process")
def process_file(
    file_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: dict = Depends(auth.require_admin),
):
    file_upload = db.query(models.FileUpload).filter(models.FileUpload.id == file_id).first()
    if file_upload is None:
        raise HTTPException(status_code=404, detail="File not found")
    if file_upload.applied:
        # 이미 적용된 파일을 재분석하면 extracted_data가 통째로 덮어써져
        # appliedMaintenanceRecordIds가 사라진다. 그러면 이후 "적용 취소"가
        # 지울 기록을 찾지 못해 조용히 0건 삭제로 끝나고, 다시 "적용"하면
        # 기존 기록은 그대로 둔 채 똑같은 기록이 중복 생성된다. 재분석 자체를 막아 차단한다.
        raise HTTPException(
            status_code=400,
            detail="이미 적용된 파일입니다. 먼저 적용을 취소한 후 다시 분석해주세요.",
        )

    file_upload.status = models.UploadStatus.PROCESSING
    db.commit()

    from ..main import app
    if get_db in app.dependency_overrides:
        # 테스트 환경의 격리된 트랜잭션 롤백 메커니즘 지원을 위해 동기 실행
        _process_file_task_logic(file_upload, db)
    else:
        background_tasks.add_task(_process_file_in_background, file_id)

    return {"success": True, "message": "File processing started", "data": file_to_response(file_upload)}


@router.post("/batch-upload")
async def batch_upload_files(
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(auth.require_admin),
):
    try:
        os.makedirs(settings.UPLOAD_DIRECTORY, exist_ok=True)
        uploaded_records = []
        for file in files:
            original_filename = file.filename
            filename = _safe_stored_filename(original_filename)
            file_path = os.path.join(settings.UPLOAD_DIRECTORY, filename)

            # 단건 업로드(/upload)와 동일하게 청크 단위로 디스크에 흘려보내고,
            # 파일 하나당 크기 상한도 동일하게 강제한다. 파일 전체를 메모리에
            # 올리면 배치 업로드에서는 여러 파일이 동시에 쌓여 systemd MemoryMax
            # 한도를 넘기기 더 쉽고, 상한 없이 받으면 디스크 고갈로도 이어진다.
            copy_upload_to_path(file, file_path)

            file_upload = models.FileUpload(
                filename=filename,
                original_filename=original_filename,
                file_type=detect_file_type(original_filename),
                file_path=file_path,
                status=models.UploadStatus.PROCESSING,
                applied=False,
            )
            db.add(file_upload)
            db.commit()
            db.refresh(file_upload)

            from ..main import app
            if get_db in app.dependency_overrides:
                _process_file_task_logic(file_upload, db)
            else:
                background_tasks.add_task(_process_file_in_background, file_upload.id)

            uploaded_records.append(file_to_response(file_upload))

        return {"success": True, "message": f"{len(uploaded_records)} files uploaded and queued for processing", "data": uploaded_records}
    except HTTPException:
        raise
    except Exception:
        logger.warning("일괄 파일 업로드 실패", exc_info=True)
        raise HTTPException(status_code=400, detail="Batch upload failed")


class BatchApplyRequest(BaseModel):
    fileIds: list[int]


@router.post("/batch-apply")
def batch_apply_files(
    request: BatchApplyRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(auth.require_admin),
):
    success_count = 0
    total_records_created = 0
    errors = []

    # 배치 안의 파일 수만큼 매번 DB를 왕복하지 않도록, 파일 목록과 자산 목록을
    # 루프 시작 전에 한 번씩만 조회해 재사용한다 (N+1 쿼리 방지).
    file_uploads_by_id = {
        f.id: f for f in db.query(models.FileUpload).filter(models.FileUpload.id.in_(request.fileIds)).all()
    }
    assets_by_code = {a.asset_code: a for a in db.query(models.Asset).all()}

    for file_id in request.fileIds:
        file_upload = file_uploads_by_id.get(file_id)
        if file_upload is None:
            errors.append(f"File ID {file_id} not found")
            continue
        if file_upload.status != models.UploadStatus.COMPLETED:
            errors.append(f"File ID {file_id} ({file_upload.original_filename}) is not COMPLETED")
            continue
        if file_upload.applied:
            continue

        result = json.loads(file_upload.extracted_data) if file_upload.extracted_data else {}

        # maintenance_records/pdf_quote 분기는 db.flush()만 쓰고 최종 커밋은 루프 밖에서
        # 한 번에 이루어지므로, 이 파일 처리 중 예외가 나면 SAVEPOINT로 이 파일이 만든
        # 레코드만 롤백한다 (applied=False로 남아 재적용해도 중복이 생기지 않는다).
        # asset_registration 분기(create_assets_from_rows)는 행마다 자체적으로
        # commit()/rollback()하므로 여기 SAVEPOINT로 감싸지 않는다 — 감싸면 내부 commit이
        # SAVEPOINT를 조기 해제해, 이후 실패한 다른 파일의 rollback이 이미 끝난 파일들의
        # 커밋까지 되돌릴 수 있다.
        savepoint = db.begin_nested() if result.get("kind") in ("maintenance_records", "pdf_quote") else None
        try:
            created_count = 0
            created_ids = []
            source_label = f"엑셀 업로드: {file_upload.original_filename}"
            changed_by = current_user.get("username")

            if result.get("kind") == "maintenance_records":
                touched_assets = {}
                counts_by_asset = {}
                for r in result.get("records", []):
                    asset = assets_by_code.get(r["assetCode"])
                    if asset is None:
                        continue
                    record = models.MaintenanceRecord(
                        asset_id=asset.id,
                        maintenance_date=date.fromisoformat(r["maintenanceDate"]),
                        maintenance_type=models.MaintenanceType(r["maintenanceType"]),
                        cost=r.get("cost"),
                        description=r.get("description"),
                        technician=r.get("technician"),
                        failure_type=r.get("failureType"),
                    )
                    db.add(record)
                    db.flush()
                    created_ids.append(record.id)
                    created_count += 1
                    touched_assets[asset.id] = asset
                    counts_by_asset[asset.id] = counts_by_asset.get(asset.id, 0) + 1

                for asset_id, count in counts_by_asset.items():
                    _log_change(
                        db, touched_assets[asset_id], models.AuditAction.CREATE, changed_by,
                        {
                            "source": {"old": None, "new": source_label},
                            "maintenance_record": {"old": None, "new": f"{count}건 등록됨"},
                        },
                    )
                result["appliedRecordCount"] = created_count
                result["appliedMaintenanceRecordIds"] = created_ids
                file_upload.extracted_data = json.dumps(result, ensure_ascii=False)

            elif result.get("kind") == "asset_registration":
                created_count, create_errors = create_assets_from_rows(db, result.get("rows", []), changed_by)
                result["appliedAssetCount"] = created_count
                result["applyErrors"] = create_errors
                file_upload.extracted_data = json.dumps(result, ensure_ascii=False)
                if create_errors:
                    errors.append(
                        f"{file_upload.original_filename}: {len(create_errors)}건 등록 실패 "
                        f"({'; '.join(e['error'] for e in create_errors[:3])})"
                    )

            elif result.get("kind") == "pdf_quote":
                asset = assets_by_code.get(result["assetCode"]) if result.get("assetCode") else None
                if asset is not None and result.get("totalAmount") is not None:
                    description_parts = ["[견적서 자동 등록]"]
                    if result.get("vendor"):
                        description_parts.append(f"업체: {result['vendor']}")
                    record = models.MaintenanceRecord(
                        asset_id=asset.id,
                        maintenance_date=(
                            date.fromisoformat(result["quoteDate"]) if result.get("quoteDate") else date.today()
                        ),
                        maintenance_type=models.MaintenanceType.REPAIR,
                        cost=result["totalAmount"],
                        description=" ".join(description_parts),
                        technician=None,
                        failure_type=None,
                    )
                    db.add(record)
                    db.flush()
                    created_ids.append(record.id)
                    created_count = 1
                    _log_change(
                        db, asset, models.AuditAction.CREATE, changed_by,
                        {
                            "source": {"old": None, "new": f"견적서(PDF) 업로드: {file_upload.original_filename}"},
                            "maintenance_record": {"old": None, "new": _maintenance_summary(record)},
                        },
                    )
                result["appliedRecordCount"] = created_count
                result["appliedMaintenanceRecordIds"] = created_ids
                file_upload.extracted_data = json.dumps(result, ensure_ascii=False)

            file_upload.applied = True
            file_upload.updated_at = datetime.now()
            if savepoint is not None:
                savepoint.commit()
            success_count += 1
            total_records_created += created_count
        except Exception as e:
            if savepoint is not None:
                savepoint.rollback()
            errors.append(f"Error applying {file_upload.original_filename}: {e}")

    db.commit()
    return {
        "success": len(errors) == 0,
        "message": f"Successfully applied {success_count} files. Total {total_records_created} maintenance records created.",
        "data": {
            "successCount": success_count,
            "totalRecordsCreated": total_records_created,
            "errors": errors
        }
    }


@router.post("/{file_id}/apply")
def apply_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(auth.require_admin),
):
    # 같은 파일에 대해 "적용" 요청이 거의 동시에 두 번 들어와도(더블클릭 등) 한쪽만
    # applied=False 상태를 보고 처리하도록, 행 잠금으로 뒤의 요청을 앞의 커밋 이후로 미룬다.
    file_upload = (
        db.query(models.FileUpload)
        .filter(models.FileUpload.id == file_id)
        .with_for_update()
        .first()
    )
    if file_upload is None:
        raise HTTPException(status_code=404, detail="File not found")

    if file_upload.status != models.UploadStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Completed file only can be applied")
    if file_upload.applied:
        raise HTTPException(status_code=400, detail="File already applied")

    try:
        result = json.loads(file_upload.extracted_data) if file_upload.extracted_data else {}
    except (TypeError, ValueError):
        result = {}

    created_count = 0
    created_ids = []
    source_label = f"엑셀 업로드: {file_upload.original_filename}"
    changed_by = current_user.get("username")

    if result.get("kind") == "maintenance_records":
        assets_by_code = {a.asset_code: a for a in db.query(models.Asset).all()}
        touched_assets: dict[int, models.Asset] = {}
        counts_by_asset: dict[int, int] = {}
        for r in result.get("records", []):
            asset = assets_by_code.get(r["assetCode"])
            if asset is None:
                continue
            record = models.MaintenanceRecord(
                asset_id=asset.id,
                maintenance_date=date.fromisoformat(r["maintenanceDate"]),
                maintenance_type=models.MaintenanceType(r["maintenanceType"]),
                cost=r.get("cost"),
                description=r.get("description"),
                technician=r.get("technician"),
                failure_type=r.get("failureType"),
            )
            db.add(record)
            db.flush()
            created_ids.append(record.id)
            created_count += 1
            touched_assets[asset.id] = asset
            counts_by_asset[asset.id] = counts_by_asset.get(asset.id, 0) + 1

        for asset_id, count in counts_by_asset.items():
            _log_change(
                db, touched_assets[asset_id], models.AuditAction.CREATE, changed_by,
                {
                    "source": {"old": None, "new": source_label},
                    "maintenance_record": {"old": None, "new": f"{count}건 등록됨"},
                },
            )

        result["appliedRecordCount"] = created_count
        result["appliedMaintenanceRecordIds"] = created_ids
        file_upload.extracted_data = json.dumps(result, ensure_ascii=False)
    elif result.get("kind") == "asset_registration":
        created_count, create_errors = create_assets_from_rows(db, result.get("rows", []), changed_by)
        result["appliedAssetCount"] = created_count
        result["applyErrors"] = create_errors
        file_upload.extracted_data = json.dumps(result, ensure_ascii=False)
    elif result.get("kind") == "pdf_quote":
        asset = None
        if result.get("assetCode"):
            asset = (
                db.query(models.Asset)
                .filter(models.Asset.asset_code == result["assetCode"])
                .first()
            )
        if asset is not None and result.get("totalAmount") is not None:
            description_parts = ["[견적서 자동 등록]"]
            if result.get("vendor"):
                description_parts.append(f"업체: {result['vendor']}")
            record = models.MaintenanceRecord(
                asset_id=asset.id,
                maintenance_date=(
                    date.fromisoformat(result["quoteDate"]) if result.get("quoteDate") else date.today()
                ),
                maintenance_type=models.MaintenanceType.REPAIR,
                cost=result["totalAmount"],
                description=" ".join(description_parts),
            )
            db.add(record)
            db.flush()
            created_ids.append(record.id)
            created_count = 1
            _log_change(
                db, asset, models.AuditAction.CREATE, changed_by,
                {
                    "source": {"old": None, "new": f"견적서(PDF) 업로드: {file_upload.original_filename}"},
                    "maintenance_record": {"old": None, "new": _maintenance_summary(record)},
                },
            )

        result["appliedRecordCount"] = created_count
        result["appliedMaintenanceRecordIds"] = created_ids
        file_upload.extracted_data = json.dumps(result, ensure_ascii=False)

    file_upload.applied = True
    file_upload.updated_at = datetime.now()
    db.commit()
    db.refresh(file_upload)

    message = "File applied successfully"
    if result.get("kind") == "maintenance_records":
        message = f"유지보수 기록 {created_count}건이 등록되었습니다."
    elif result.get("kind") == "asset_registration":
        message = f"자산 {created_count}건이 등록되었습니다."
        if result.get("applyErrors"):
            message += f" ({len(result['applyErrors'])}건 실패: 이미 존재하는 자산번호)"
    elif result.get("kind") == "pdf_quote":
        message = (
            f"견적서 기반 유지보수 기록이 등록되었습니다." if created_count else
            "견적서에서 자산코드/금액을 자동으로 인식하지 못해 기록을 생성하지 못했습니다."
        )

    return {"success": True, "message": message, "data": file_to_response(file_upload)}


@router.post("/{file_id}/unapply")
def unapply_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(auth.require_admin),
):
    # apply_file과 동일하게 행 잠금을 걸어 "적용 취소" 더블클릭 등으로 인한 동시 요청을 직렬화한다.
    file_upload = (
        db.query(models.FileUpload)
        .filter(models.FileUpload.id == file_id)
        .with_for_update()
        .first()
    )
    if file_upload is None:
        raise HTTPException(status_code=404, detail="File not found")
    if not file_upload.applied:
        raise HTTPException(status_code=400, detail="File is not applied")

    try:
        result = json.loads(file_upload.extracted_data) if file_upload.extracted_data else {}
    except (TypeError, ValueError):
        result = {}

    if result.get("kind") == "asset_registration":
        # 등록된 자산은 다른 자산과 마찬가지로 유지보수 기록/감사로그가 쌓일 수 있으므로,
        # 파일 적용 취소로 조용히 무더기 삭제하지 않는다. 되돌리려면 자산 목록에서
        # 개별적으로 삭제해야 한다.
        raise HTTPException(
            status_code=400,
            detail="자산 등록 파일은 적용 취소를 지원하지 않습니다. 등록된 자산은 자산 목록에서 개별적으로 삭제해주세요.",
        )

    if "appliedMaintenanceRecordIds" not in result:
        # applied=True인데 되돌릴 기록 id 목록 자체가 없는 상태다. 정상적으로 적용됐다면
        # apply_file/batch_apply_files가 항상 이 키를 남기므로(생성 건수가 0이어도 빈 배열로),
        # 키가 아예 없다는 건 적용 이후 재분석으로 extracted_data가 덮어써져 추적 정보가
        # 유실됐다는 뜻이다. 이 경우 0건 삭제로 조용히 "성공" 처리하면 실제로 존재하는
        # 유지보수 기록이 고아 상태로 방치되므로, 명확히 실패로 알린다.
        raise HTTPException(
            status_code=409,
            detail=(
                "적용 취소할 유지보수 기록 정보를 찾을 수 없습니다 "
                "(적용 이후 파일을 다시 분석해 추적 정보가 유실된 것으로 보입니다). "
                "관리자에게 문의해주세요."
            ),
        )

    record_ids = result.get("appliedMaintenanceRecordIds", [])
    deleted_count = 0
    if record_ids:
        records = (
            db.query(models.MaintenanceRecord)
            .filter(models.MaintenanceRecord.id.in_(record_ids))
            .all()
        )
        counts_by_asset: dict[int, int] = {}
        assets_by_id: dict[int, models.Asset] = {}
        for r in records:
            counts_by_asset[r.asset_id] = counts_by_asset.get(r.asset_id, 0) + 1
        if counts_by_asset:
            assets_by_id = {
                a.id: a
                for a in db.query(models.Asset).filter(models.Asset.id.in_(counts_by_asset.keys())).all()
            }
        source_label = f"엑셀 업로드 적용 취소: {file_upload.original_filename}"
        changed_by = current_user.get("username")
        for asset_id, count in counts_by_asset.items():
            asset = assets_by_id.get(asset_id)
            if asset is None:
                continue
            _log_change(
                db, asset, models.AuditAction.DELETE, changed_by,
                {
                    "source": {"old": source_label, "new": None},
                    "maintenance_record": {"old": f"{count}건 삭제됨", "new": None},
                },
            )

        deleted_count = (
            db.query(models.MaintenanceRecord)
            .filter(models.MaintenanceRecord.id.in_(record_ids))
            .delete(synchronize_session=False)
        )

    result["appliedRecordCount"] = 0
    result["appliedMaintenanceRecordIds"] = []
    file_upload.extracted_data = json.dumps(result, ensure_ascii=False)
    file_upload.applied = False
    file_upload.updated_at = datetime.now()
    db.commit()
    db.refresh(file_upload)

    return {
        "success": True,
        "message": f"적용된 유지보수 기록 {deleted_count}건을 취소했습니다.",
        "data": file_to_response(file_upload),
    }


@router.delete("/{file_id}")
def delete_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(auth.require_admin),
):
    file_upload = db.query(models.FileUpload).filter(models.FileUpload.id == file_id).first()
    if file_upload is None:
        raise HTTPException(status_code=404, detail="File not found")

    try:
        if file_upload.file_path and os.path.exists(file_upload.file_path):
            os.remove(file_upload.file_path)
    except OSError:
        logger.warning("업로드 파일 삭제 실패: %s", file_upload.file_path, exc_info=True)

    db.delete(file_upload)
    db.commit()
    return {"success": True, "message": "File deleted successfully", "data": None}
