import json
import os
import re
import uuid
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from .. import models
from ..config import settings
from ..database import get_db

router = APIRouter(prefix="/api/files", tags=["files"])

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
    "asset_code": ["자산코드", "asset_code", "assetCode"],
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


def _parse_spreadsheet(file_path: str, file_type: models.FileType):
    import pandas as pd

    if file_type == models.FileType.CSV:
        df = pd.read_csv(file_path, dtype=str, keep_default_na=False)
    else:
        df = pd.read_excel(file_path, dtype=str, keep_default_na=False)

    col_map = {}
    for field, aliases in COLUMN_ALIASES.items():
        found = _find_column(df.columns, aliases)
        if found:
            col_map[field] = found

    if "asset_code" not in col_map or "maintenance_date" not in col_map:
        raise ValueError("필수 컬럼(자산코드, 정비일)을 찾을 수 없습니다.")

    rows = []
    errors = []
    for idx, row in df.iterrows():
        line_no = idx + 2  # header is row 1
        asset_code = str(row.get(col_map["asset_code"], "")).strip()
        maint_date_raw = str(row.get(col_map["maintenance_date"], "")).strip()
        if not asset_code or not maint_date_raw:
            errors.append({"row": line_no, "reason": "자산코드 또는 정비일 누락"})
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


_ASSET_CODE_LABELED_RE = re.compile(r"자산\s?(?:코드|번호)\s*[:\-]?\s*([A-Za-z]+-\d+)")
_ASSET_CODE_BARE_RE = re.compile(r"\b([A-Z]{2,}-\d{2,})\b")
_TOTAL_AMOUNT_RE = re.compile(r"(?:합\s?계|총\s?금액|총액|견적\s?금액)\s*[:\-]?\s*([\d,]+)\s*원?")
_QUOTE_DATE_RE = re.compile(r"(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})")
_VENDOR_RE = re.compile(r"(?:상호|업체명|공급자)\s*[:\-]?\s*([^\n]+)")


def _parse_pdf_quote(text: str) -> dict:
    asset_code_match = _ASSET_CODE_LABELED_RE.search(text) or _ASSET_CODE_BARE_RE.search(text)
    asset_code = asset_code_match.group(1) if asset_code_match else None

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
async def upload_file(file: UploadFile = File(...), db: Session = Depends(get_db)):
    try:
        os.makedirs(settings.UPLOAD_DIRECTORY, exist_ok=True)
        original_filename = file.filename
        filename = f"{uuid.uuid4()}_{original_filename}"
        file_path = os.path.join(settings.UPLOAD_DIRECTORY, filename)

        contents = await file.read()
        with open(file_path, "wb") as f:
            f.write(contents)

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
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"File upload failed: {e}")


@router.post("/{file_id}/process")
def process_file(file_id: int, db: Session = Depends(get_db)):
    file_upload = db.query(models.FileUpload).filter(models.FileUpload.id == file_id).first()
    if file_upload is None:
        raise HTTPException(status_code=400, detail="File not found")

    file_upload.status = models.UploadStatus.PROCESSING
    db.commit()

    try:
        if file_upload.file_type in (models.FileType.EXCEL, models.FileType.CSV):
            rows, errors = _parse_spreadsheet(file_upload.file_path, file_upload.file_type)

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
        file_upload.status = models.UploadStatus.FAILED
        file_upload.error_message = str(e)

    file_upload.updated_at = datetime.now()
    db.commit()
    db.refresh(file_upload)
    return {"success": True, "message": "File processed successfully", "data": file_to_response(file_upload)}


@router.post("/{file_id}/apply")
def apply_file(file_id: int, db: Session = Depends(get_db)):
    file_upload = db.query(models.FileUpload).filter(models.FileUpload.id == file_id).first()
    if file_upload is None:
        raise HTTPException(status_code=400, detail="File not found")

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
    if result.get("kind") == "maintenance_records":
        assets_by_code = {
            a.asset_code: a.id for a in db.query(models.Asset.id, models.Asset.asset_code).all()
        }
        for r in result.get("records", []):
            asset_id = assets_by_code.get(r["assetCode"])
            if not asset_id:
                continue
            record = models.MaintenanceRecord(
                asset_id=asset_id,
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

        result["appliedRecordCount"] = created_count
        result["appliedMaintenanceRecordIds"] = created_ids
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
    elif result.get("kind") == "pdf_quote":
        message = (
            f"견적서 기반 유지보수 기록이 등록되었습니다." if created_count else
            "견적서에서 자산코드/금액을 자동으로 인식하지 못해 기록을 생성하지 못했습니다."
        )

    return {"success": True, "message": message, "data": file_to_response(file_upload)}


@router.post("/{file_id}/unapply")
def unapply_file(file_id: int, db: Session = Depends(get_db)):
    file_upload = db.query(models.FileUpload).filter(models.FileUpload.id == file_id).first()
    if file_upload is None:
        raise HTTPException(status_code=400, detail="File not found")
    if not file_upload.applied:
        raise HTTPException(status_code=400, detail="File is not applied")

    try:
        result = json.loads(file_upload.extracted_data) if file_upload.extracted_data else {}
    except (TypeError, ValueError):
        result = {}

    record_ids = result.get("appliedMaintenanceRecordIds", [])
    deleted_count = 0
    if record_ids:
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
def delete_file(file_id: int, db: Session = Depends(get_db)):
    file_upload = db.query(models.FileUpload).filter(models.FileUpload.id == file_id).first()
    if file_upload is None:
        raise HTTPException(status_code=400, detail="File not found")

    try:
        if file_upload.file_path and os.path.exists(file_upload.file_path):
            os.remove(file_upload.file_path)
    except OSError as e:
        print(f"File deletion failed: {e}")

    db.delete(file_upload)
    db.commit()
    return {"success": True, "message": "File deleted successfully", "data": None}
