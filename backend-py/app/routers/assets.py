import io
import json
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import ValidationError
from sqlalchemy import String, cast, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import auth, category_importance, models, schemas
from ..database import get_db
from ..upload_limits import read_upload_bytes

router = APIRouter(prefix="/api/assets", tags=["assets"])


def _like_pattern(search: str) -> str:
    """LIKE 검색어에 리터럴로 포함된 %, _, \\를 이스케이프한다.
    이스케이프하지 않으면 검색어에 우연히 %나 _가 들어있을 때(파일 시리얼
    번호 등) 의도치 않게 와일드카드로 동작해 검색 결과가 부정확해진다
    (SQLAlchemy .like()는 파라미터 바인딩을 쓰므로 인젝션 자체는 원래도
    안전하다 - 이건 순수 정확성 문제다)."""
    escaped = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


_TRACKED_FIELDS = [
    ("asset_name", "assetName"),
    ("asset_code", "assetCode"),
    ("category", "category"),
    ("location", "location"),
    ("responsible_person", "responsiblePerson"),
    ("purchase_date", "purchaseDate"),
    ("purchase_price", "purchasePrice"),
    ("useful_life", "usefulLife"),
    ("status", "status"),
    ("description", "description"),
]


# 감사 로그(changes["maintenance_record"])에 들어가는 요약 문자열이라 프론트에서
# 필드 단위로 다시 쪼개 번역할 수 없다. 여기서 한글로 만들어 내려보낸다.
# frontend/src/components/StatusBadge.jsx의 MAINTENANCE_TYPE 라벨과 동일하게 맞춘다.
_MAINTENANCE_TYPE_LABEL = {
    "ROUTINE": "정기점검",
    "REPAIR": "수리",
    "REPLACEMENT": "교체",
    "INSPECTION": "점검",
}


def _maintenance_summary(record: models.MaintenanceRecord) -> str:
    cost = f"{float(record.cost):,.0f}원" if record.cost is not None else "비용 미기재"
    type_value = record.maintenance_type.value if record.maintenance_type else None
    parts = [
        record.maintenance_date.isoformat() if record.maintenance_date else "-",
        _MAINTENANCE_TYPE_LABEL.get(type_value, type_value or "-"),
        cost,
    ]
    if record.description:
        parts.append(record.description)
    return " | ".join(parts)


def maintenance_to_dto(record: models.MaintenanceRecord) -> dict:
    return {
        "id": record.id,
        "assetId": record.asset_id,
        "maintenanceDate": record.maintenance_date.isoformat() if record.maintenance_date else None,
        "maintenanceType": record.maintenance_type.value if record.maintenance_type else None,
        "cost": float(record.cost) if record.cost is not None else 0.0,
        "description": record.description,
        "technician": record.technician,
        "failureType": record.failure_type,
    }


def asset_to_dto(asset: models.Asset) -> dict:
    return {
        "id": asset.id,
        "assetName": asset.asset_name,
        "assetCode": asset.asset_code,
        "category": asset.category,
        "location": asset.location,
        "responsiblePerson": asset.responsible_person,
        "purchaseDate": asset.purchase_date.isoformat() if asset.purchase_date else None,
        "purchasePrice": float(asset.purchase_price) if asset.purchase_price is not None else 0.0,
        "usefulLife": asset.useful_life,
        "status": asset.status.value if asset.status else "ACTIVE",
        "description": asset.description,
        "createdAt": asset.created_at,
        "updatedAt": asset.updated_at,
    }


def _field_value(asset: models.Asset, field: str):
    value = getattr(asset, field)
    if isinstance(value, (date,)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if hasattr(value, "value"):  # enum
        return value.value
    return value


def audit_to_dto(log: models.AssetAuditLog, asset_name: Optional[str] = None) -> dict:
    try:
        changes = json.loads(log.changes) if log.changes else None
    except (TypeError, ValueError):
        changes = None
    return {
        "id": log.id,
        "assetId": log.asset_id,
        "assetCode": log.asset_code,
        "assetName": asset_name,
        "action": log.action.value if log.action else None,
        "changedBy": log.changed_by,
        "changes": changes,
        "createdAt": log.created_at,
    }


def _log_change(
    db: Session,
    asset: models.Asset,
    action: models.AuditAction,
    changed_by: Optional[str],
    changes: Optional[dict],
):
    entry = models.AssetAuditLog(
        asset_id=asset.id,
        asset_code=asset.asset_code,
        action=action,
        changed_by=changed_by,
        changes=json.dumps(changes, ensure_ascii=False) if changes is not None else None,
    )
    db.add(entry)


def _next_asset_code(db: Session) -> int:
    """새 자산에 부여할 다음 자산번호(1부터 순차 증가)를 서버가 자동으로 계산한다.
    동시 등록 시 레이스 컨디션을 줄이기 위해 같은 트랜잭션 안에서 행 잠금을 걸고 조회한다."""
    max_code = db.query(func.max(models.Asset.asset_code)).with_for_update().scalar()
    return (max_code or 0) + 1


_ASSET_SORT_COLUMNS = {
    "assetName": models.Asset.asset_name,
    "assetCode": models.Asset.asset_code,
    "purchaseDate": models.Asset.purchase_date,
    "purchasePrice": models.Asset.purchase_price,
    "status": models.Asset.status,
}


@router.get("")
def get_all_assets(
    db: Session = Depends(get_db),
    page: int = 1,
    pageSize: int = 20,
    search: str = "",
    category: str = "",
    sortBy: str = "",
    sortOrder: str = "asc",
):
    query = db.query(models.Asset)

    if search:
        like = _like_pattern(search)
        query = query.filter(
            or_(
                models.Asset.asset_name.like(like, escape="\\"),
                cast(models.Asset.asset_code, String).like(like, escape="\\"),
            )
        )
    if category:
        query = query.join(models.Category).filter(models.Category.name == category)

    total = query.count()
    page = max(1, page)
    page_size = max(1, min(pageSize, 200))

    sort_column = _ASSET_SORT_COLUMNS.get(sortBy)
    if sort_column is not None:
        order_clause = sort_column.desc() if sortOrder == "desc" else sort_column.asc()
        query = query.order_by(order_clause, models.Asset.id)
    else:
        query = query.order_by(models.Asset.id)

    assets = query.offset((page - 1) * page_size).limit(page_size).all()

    return {
        "success": True,
        "message": None,
        "data": {
            "items": [asset_to_dto(a) for a in assets],
            "total": total,
            "page": page,
            "pageSize": page_size,
        },
    }


@router.get("/export")
def export_assets(
    db: Session = Depends(get_db),
    search: str = "",
    category: str = "",
    sortBy: str = "",
    sortOrder: str = "asc",
):
    """현재 목록 화면의 검색어/카테고리 필터와 정렬 순서를 그대로 반영해 자산 목록을 엑셀로 내려받는다."""
    query = db.query(models.Asset)
    if search:
        like = _like_pattern(search)
        query = query.filter(
            or_(
                models.Asset.asset_name.like(like, escape="\\"),
                cast(models.Asset.asset_code, String).like(like, escape="\\"),
            )
        )
    if category:
        query = query.join(models.Category).filter(models.Category.name == category)

    sort_column = _ASSET_SORT_COLUMNS.get(sortBy)
    if sort_column is not None:
        order_clause = sort_column.desc() if sortOrder == "desc" else sort_column.asc()
        query = query.order_by(order_clause, models.Asset.id)
    else:
        query = query.order_by(models.Asset.id)

    assets = query.all()

    rows = [
        {
            "자산번호": a.asset_code,
            "자산명": a.asset_name,
            "카테고리": a.category,
            "위치": a.location,
            "담당자": a.responsible_person,
            "구매일": a.purchase_date.isoformat() if a.purchase_date else None,
            "구매가": float(a.purchase_price) if a.purchase_price is not None else 0.0,
            "내용연수(년)": a.useful_life,
            "상태": a.status.value if a.status else "ACTIVE",
            "설명": a.description,
        }
        for a in assets
    ]
    df = pd.DataFrame(rows)

    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="자산목록")
    buffer.seek(0)

    filename = f"asset-list-{datetime.now().strftime('%Y%m%d')}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/categories")
def get_asset_categories(db: Session = Depends(get_db)):
    """자산 등록/필터 화면의 카테고리 목록. category는 자유 문자열 컬럼이라(엑셀 일괄
    등록 시 임의의 값이 들어올 수 있음) 프론트엔드에 고정 목록을 하드코딩하면 실제
    데이터와 어긋날 수 있으므로, 실제로 쓰이고 있는 값을 DB에서 그대로 가져온다."""
    categories = [
        row[0] for row in
        db.query(models.Category.name)
        .join(models.Asset, models.Asset.category_id == models.Category.id)
        .distinct()
        .order_by(models.Category.name)
        .all()
    ]
    return {"success": True, "message": None, "data": categories}


@router.get("/category-importance")
def list_category_importance(db: Session = Depends(get_db)):
    """카테고리별 교체 우선순위 중요도(0~100점) 목록. 새 카테고리가 자산 등록 시
    자동으로 채워지므로, 여기 없는 카테고리는 아직 자산이 하나도 없다는 뜻이다."""
    rows = (
        db.query(models.CategoryImportance)
        .join(models.Category)
        .order_by(models.Category.name)
        .all()
    )
    return {
        "success": True,
        "message": None,
        "data": [
            {
                "category": row.category,
                "score": float(row.importance_score),
                "reason": row.reason,
                "source": row.source.value if row.source else None,
                "updatedAt": row.updated_at,
            }
            for row in rows
        ],
    }


@router.put("/category-importance")
def update_category_importance(
    request: schemas.CategoryImportanceUpdateRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(auth.require_admin),
):
    """관리자가 AI가 매긴(또는 기본값) 카테고리 중요도를 직접 덮어쓴다.
    이후에는 source가 MANUAL로 표시되고, AI가 자동으로 재계산하지 않는다."""
    record = category_importance.set_manual_importance(
        db, request.category, request.score,
        changed_by=current_user.get("username"), reason=request.reason,
    )
    return {
        "success": True,
        "message": "카테고리 중요도가 저장되었습니다.",
        "data": {
            "category": record.category,
            "score": float(record.importance_score),
            "reason": record.reason,
            "source": record.source.value if record.source else None,
            "updatedAt": record.updated_at,
        },
    }


@router.post("/category-importance/ai-recompute")
def recompute_category_importance_with_ai(
    request: schemas.CategoryImportanceAiRecomputeRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(auth.require_admin),
):
    """관리자가 이미 지정한 값(MANUAL)이 있어도 참고하지 않고, AI에게 새로 물어봐서
    점수/근거를 다시 산정해 덮어쓴다."""
    try:
        record = category_importance.recompute_ai_importance(db, request.category)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {
        "success": True,
        "message": "AI가 카테고리 중요도를 다시 산정했습니다.",
        "data": {
            "category": record.category,
            "score": float(record.importance_score),
            "reason": record.reason,
            "source": record.source.value if record.source else None,
            "updatedAt": record.updated_at,
        },
    }


@router.get("/audit-logs")
def get_all_audit_logs(
    db: Session = Depends(get_db),
    page: int = 1,
    pageSize: int = 50,
    action: str = "",
    changedBy: str = "",
    search: str = "",
    _admin: dict = Depends(auth.require_admin),
):
    """자산별 이력 화면과 별개로, 시스템 전체에서 누가 언제 무엇을 등록·수정·
    삭제했는지 한 화면에서 확인할 수 있는 감사 로그. 관리자만 조회 가능하다."""
    query = db.query(models.AssetAuditLog)
    if action:
        try:
            query = query.filter(models.AssetAuditLog.action == models.AuditAction(action))
        except ValueError:
            raise HTTPException(status_code=400, detail="유효하지 않은 action 값입니다.")
    if changedBy:
        query = query.filter(models.AssetAuditLog.changed_by == changedBy)
    if search:
        # 자산코드가 아니라 자산명으로만 검색한다 (감사 로그에는 자산코드가 이미 별도
        # 컬럼으로 표시되므로, 자산명 검색을 별도로 지원해달라는 요구사항).
        matching_ids = [
            row[0] for row in
            db.query(models.Asset.id)
            .filter(models.Asset.asset_name.like(_like_pattern(search), escape="\\"))
            .all()
        ]
        query = query.filter(models.AssetAuditLog.asset_id.in_(matching_ids))

    query = query.order_by(models.AssetAuditLog.created_at.desc())
    total = query.count()
    page = max(1, page)
    page_size = max(1, min(pageSize, 200))
    logs = query.offset((page - 1) * page_size).limit(page_size).all()

    asset_ids = {l.asset_id for l in logs}
    asset_names = dict(
        db.query(models.Asset.id, models.Asset.asset_name).filter(models.Asset.id.in_(asset_ids)).all()
    ) if asset_ids else {}

    return {
        "success": True,
        "message": None,
        "data": {
            "items": [audit_to_dto(l, asset_names.get(l.asset_id)) for l in logs],
            "total": total,
            "page": page,
            "pageSize": page_size,
        },
    }


_IMPORT_COLUMN_MAP = {
    "자산명": "assetName",
    "카테고리": "category",
    "위치": "location",
    "담당자": "responsiblePerson",
    "구매일": "purchaseDate",
    "구매가": "purchasePrice",
    "내용연수(년)": "usefulLife",
    "상태": "status",
    "설명": "description",
}
_IMPORT_REQUIRED_COLUMNS = {"자산명", "카테고리", "구매일", "구매가", "내용연수(년)"}
_IMPORT_FIELD_KOR = {eng: kor for kor, eng in _IMPORT_COLUMN_MAP.items()}


def _friendly_pydantic_error_message(err: dict) -> str:
    """pydantic ValidationError의 필드별 오류를 유지보수 내역서 오류 메시지와 톤을 맞춘
    한국어 문구로 바꾼다 (원본은 'Input should be greater than 0 [type=greater_than, ...]'
    같은 영문 기술 메시지라 엑셀만 보는 사용자에게는 그대로 보여주기 어렵다)."""
    err_type = err.get("type")
    if err_type == "value_error":
        # 커스텀 validator가 던진 메시지는 이미 한국어이므로 "Value error, " 접두사만 제거한다.
        return str(err.get("msg", "")).split("Value error, ", 1)[-1]
    if err_type == "greater_than":
        return "0보다 큰 값을 입력해주세요."
    if err_type in ("missing", "string_type"):
        return "값이 비어있습니다."
    if err_type in ("int_type", "int_parsing"):
        return "정수 형식이 아닙니다."
    if err_type in ("float_type", "float_parsing"):
        return "숫자 형식이 아닙니다."
    return str(err.get("msg", "값이 올바르지 않습니다."))


def _format_asset_validation_error(exc: ValidationError) -> str:
    parts = []
    for err in exc.errors():
        field = err["loc"][0] if err.get("loc") else ""
        field_kor = _IMPORT_FIELD_KOR.get(field, field)
        parts.append(f"{field_kor}: {_friendly_pydantic_error_message(err)}")
    return "; ".join(parts) if parts else "값이 올바르지 않습니다."


def parse_asset_import_rows(df) -> tuple[list[dict], list[dict]]:
    """자산 등록용 엑셀 DataFrame을 행 단위로 검증한다 (DB에 쓰지 않음).
    반환값: (검증된 자산 payload 목록, 실패한 행의 오류 목록)"""
    missing = _IMPORT_REQUIRED_COLUMNS - set(df.columns)
    if missing:
        raise ValueError(f"필수 컬럼이 없습니다: {', '.join(sorted(missing))}")

    valid_rows: list[dict] = []
    errors: list[dict] = []

    for idx, row in df.iterrows():
        excel_row_no = idx + 2  # 헤더 행 제외, 엑셀 기준 1-based 행 번호

        payload = {}
        for kor, eng in _IMPORT_COLUMN_MAP.items():
            if kor not in df.columns:
                continue
            value = row[kor]
            payload[eng] = None if pd.isna(value) else value

        try:
            if payload.get("purchaseDate") is not None:
                raw_date = payload["purchaseDate"]
                payload["purchaseDate"] = (
                    raw_date.date().isoformat() if hasattr(raw_date, "date") else str(raw_date)[:10]
                )
            if payload.get("purchasePrice") is not None:
                payload["purchasePrice"] = float(payload["purchasePrice"])
            if payload.get("usefulLife") is not None:
                payload["usefulLife"] = int(payload["usefulLife"])
            if not payload.get("status"):
                payload["status"] = "ACTIVE"
            asset_req = schemas.AssetRequest(**payload)
        except ValidationError as e:
            errors.append({"row": excel_row_no, "error": _format_asset_validation_error(e)})
            continue
        except (TypeError, ValueError):
            errors.append({"row": excel_row_no, "error": "구매가 또는 내용연수(년) 값이 숫자 형식이 아닙니다."})
            continue

        valid_rows.append({"row": excel_row_no, "assetRequest": asset_req.model_dump()})

    return valid_rows, errors


def create_assets_from_rows(db: Session, rows: list[dict], changed_by: Optional[str]) -> tuple[int, list[dict]]:
    """parse_asset_import_rows가 검증해둔 행들을 실제로 DB에 등록한다."""
    created = 0
    errors: list[dict] = []
    # 같은 배치 안에서 같은 카테고리가 여러 번 나와도 중요도는 한 번만 산정한다.
    seen_categories: set = set()

    # 행마다 db.commit()으로 왕복하는 대신 SAVEPOINT로 행 단위 격리만 유지하고,
    # 실제 커밋은 루프가 끝난 뒤 한 번만 한다 (N행 임포트가 N번의 트랜잭션 왕복을
    # 만들지 않도록). 중복 자산번호로 실패한 행은 SAVEPOINT만 롤백되어 그 행의
    # 변경만 취소되고, 이미 성공한 다른 행들은 영향받지 않는다.
    for item in rows:
        asset_req = schemas.AssetRequest(**item["assetRequest"])
        savepoint = db.begin_nested()
        category_row = category_importance.get_or_create_category(db, asset_req.category)
        if asset_req.category not in seen_categories:
            category_importance.ensure_category_importance(db, asset_req.category)
            seen_categories.add(asset_req.category)
        asset = models.Asset(
            asset_name=asset_req.assetName,
            asset_code=_next_asset_code(db),
            category_ref=category_row,
            location=asset_req.location,
            responsible_person=asset_req.responsiblePerson,
            purchase_date=date.fromisoformat(asset_req.purchaseDate),
            purchase_price=Decimal(str(asset_req.purchasePrice)),
            useful_life=asset_req.usefulLife,
            status=models.AssetStatus(asset_req.status or "ACTIVE"),
            description=asset_req.description,
        )
        db.add(asset)
        try:
            db.flush()
        except IntegrityError:
            savepoint.rollback()
            errors.append({"row": item["row"], "error": "자산번호 채번 중 충돌이 발생했습니다. 다시 시도해주세요."})
            continue

        _log_change(
            db, asset, models.AuditAction.CREATE, changed_by,
            {field: {"old": None, "new": _field_value(asset, field)} for field, _ in _TRACKED_FIELDS},
        )
        savepoint.commit()
        created += 1

    if created:
        db.commit()

    return created, errors


@router.post("/import")
def import_assets_excel(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(auth.require_admin),
):
    """엑셀 내보내기(/export)와 같은 컬럼 형식으로 자산을 대량 등록한다.
    행 단위로 검증해서 실패한 행은 건너뛰고, 성공한 행까지는 그대로 반영한다."""
    # pandas가 file.file을 직접 받아 통째로 읽게 하면, 업로드 크기에 상한이
    # 없어 큰(또는 압축률이 높은) xlsx 하나로 메모리를 고갈시킬 수 있다.
    # 먼저 상한 이내로만 읽어 BytesIO에 담은 뒤 그것만 pandas에 넘긴다.
    raw = read_upload_bytes(file)
    try:
        df = pd.read_excel(io.BytesIO(raw))
    except Exception:
        raise HTTPException(status_code=400, detail="엑셀 파일을 읽을 수 없습니다. xlsx 형식을 확인해주세요.")

    try:
        valid_rows, parse_errors = parse_asset_import_rows(df)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    created, create_errors = create_assets_from_rows(db, valid_rows, current_user.get("username"))
    errors = parse_errors + create_errors

    message = f"{created}건 등록 완료"
    if errors:
        message += f", {len(errors)}건 실패"

    return {
        "success": True,
        "message": message,
        "data": {"created": created, "failed": errors},
    }


@router.get("/{asset_id}")
def get_asset(asset_id: int, db: Session = Depends(get_db)):
    asset = db.query(models.Asset).filter(models.Asset.id == asset_id).first()
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")
    return {"success": True, "message": None, "data": asset_to_dto(asset)}


@router.post("")
def create_asset(
    request: schemas.AssetRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(auth.require_admin),
):
    category_row = category_importance.get_or_create_category(db, request.category)
    asset = models.Asset(
        asset_name=request.assetName,
        asset_code=_next_asset_code(db),
        category_ref=category_row,
        location=request.location,
        responsible_person=request.responsiblePerson,
        purchase_date=date.fromisoformat(request.purchaseDate),
        purchase_price=Decimal(str(request.purchasePrice)),
        useful_life=request.usefulLife,
        status=models.AssetStatus(request.status or "ACTIVE"),
        description=request.description,
    )
    db.add(asset)
    db.flush()
    category_importance.ensure_category_importance(db, asset.category)

    _log_change(
        db,
        asset,
        models.AuditAction.CREATE,
        current_user.get("username"),
        {field: {"old": None, "new": _field_value(asset, field)} for field, _ in _TRACKED_FIELDS},
    )

    db.commit()
    db.refresh(asset)
    return {"success": True, "message": "Asset created successfully", "data": asset_to_dto(asset)}


@router.put("/{asset_id}")
def update_asset(
    asset_id: int,
    request: schemas.AssetRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(auth.require_admin),
):
    asset = db.query(models.Asset).filter(models.Asset.id == asset_id).first()
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")

    before = {field: _field_value(asset, field) for field, _ in _TRACKED_FIELDS}
    old_category_id = asset.category_id

    asset.asset_name = request.assetName
    asset.category_ref = category_importance.get_or_create_category(db, request.category)
    asset.location = request.location
    asset.responsible_person = request.responsiblePerson
    asset.purchase_date = date.fromisoformat(request.purchaseDate)
    asset.purchase_price = Decimal(str(request.purchasePrice))
    asset.useful_life = request.usefulLife
    asset.status = models.AssetStatus(request.status or "ACTIVE")
    asset.description = request.description

    db.flush()
    category_importance.ensure_category_importance(db, asset.category)
    after = {field: _field_value(asset, field) for field, _ in _TRACKED_FIELDS}
    changed = {
        field: {"old": before[field], "new": after[field]}
        for field, _ in _TRACKED_FIELDS
        if before[field] != after[field]
    }
    if changed:
        _log_change(db, asset, models.AuditAction.UPDATE, current_user.get("username"), changed)

    db.commit()
    db.refresh(asset)
    if old_category_id != asset.category_id:
        category_importance.delete_category_if_orphaned(db, old_category_id)
    return {"success": True, "message": "Asset updated successfully", "data": asset_to_dto(asset)}


@router.get("/{asset_id}/maintenance")
def get_asset_maintenance_history(
    asset_id: int,
    db: Session = Depends(get_db),
    page: int = 1,
    pageSize: int = 100,
):
    asset = db.query(models.Asset).filter(models.Asset.id == asset_id).first()
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")

    query = (
        db.query(models.MaintenanceRecord)
        .filter(models.MaintenanceRecord.asset_id == asset_id)
        .order_by(models.MaintenanceRecord.maintenance_date.desc())
    )
    total = query.count()
    page = max(1, page)
    page_size = max(1, min(pageSize, 200))
    records = query.offset((page - 1) * page_size).limit(page_size).all()

    # "누적 수리비" 같은 합계는 화면에 보이는 페이지(최대 200건)가 아니라 그 자산의
    # 전체 유지보수 기록을 기준으로 계산해야 하므로, 페이지네이션과 별개로
    # SQL SUM()으로 전체 합계를 구해 함께 내려준다.
    total_cost = float(
        db.query(func.sum(models.MaintenanceRecord.cost))
        .filter(models.MaintenanceRecord.asset_id == asset_id)
        .scalar()
        or 0.0
    )

    return {
        "success": True,
        "message": None,
        "data": {
            "items": [maintenance_to_dto(r) for r in records],
            "total": total,
            "totalCost": total_cost,
            "page": page,
            "pageSize": page_size,
        },
    }


@router.post("/{asset_id}/maintenance")
def add_asset_maintenance_record(
    asset_id: int,
    request: schemas.MaintenanceRecordRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(auth.require_admin),
):
    asset = db.query(models.Asset).filter(models.Asset.id == asset_id).first()
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")

    record = models.MaintenanceRecord(
        asset_id=asset_id,
        maintenance_date=date.fromisoformat(request.maintenanceDate),
        maintenance_type=models.MaintenanceType(request.maintenanceType),
        cost=Decimal(str(request.cost)) if request.cost is not None else None,
        description=request.description,
        technician=request.technician,
        failure_type=request.failureType,
    )
    db.add(record)
    db.flush()
    _log_change(
        db, asset, models.AuditAction.CREATE, current_user.get("username"),
        {"maintenance_record": {"old": None, "new": _maintenance_summary(record)}},
    )
    db.commit()
    db.refresh(record)
    return {"success": True, "message": "Maintenance record added", "data": maintenance_to_dto(record)}


@router.put("/{asset_id}/maintenance/{record_id}")
def update_maintenance_record(
    asset_id: int,
    record_id: int,
    request: schemas.MaintenanceRecordRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(auth.require_admin),
):
    asset = db.query(models.Asset).filter(models.Asset.id == asset_id).first()
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")

    record = (
        db.query(models.MaintenanceRecord)
        .filter(models.MaintenanceRecord.id == record_id, models.MaintenanceRecord.asset_id == asset_id)
        .first()
    )
    if record is None:
        raise HTTPException(status_code=404, detail="Maintenance record not found")

    before_summary = _maintenance_summary(record)

    record.maintenance_date = date.fromisoformat(request.maintenanceDate)
    record.maintenance_type = models.MaintenanceType(request.maintenanceType)
    record.cost = Decimal(str(request.cost)) if request.cost is not None else None
    record.description = request.description
    record.technician = request.technician
    record.failure_type = request.failureType

    db.flush()
    after_summary = _maintenance_summary(record)
    if before_summary != after_summary:
        _log_change(
            db, asset, models.AuditAction.UPDATE, current_user.get("username"),
            {"maintenance_record": {"old": before_summary, "new": after_summary}},
        )

    db.commit()
    db.refresh(record)
    return {"success": True, "message": "Maintenance record updated", "data": maintenance_to_dto(record)}


@router.delete("/{asset_id}/maintenance/{record_id}")
def delete_maintenance_record(
    asset_id: int,
    record_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(auth.require_admin),
):
    asset = db.query(models.Asset).filter(models.Asset.id == asset_id).first()
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")

    record = (
        db.query(models.MaintenanceRecord)
        .filter(models.MaintenanceRecord.id == record_id, models.MaintenanceRecord.asset_id == asset_id)
        .first()
    )
    if record is None:
        raise HTTPException(status_code=404, detail="Maintenance record not found")

    summary = _maintenance_summary(record)
    db.delete(record)
    _log_change(
        db, asset, models.AuditAction.DELETE, current_user.get("username"),
        {"maintenance_record": {"old": summary, "new": None}},
    )
    db.commit()
    return {"success": True, "message": "Maintenance record deleted", "data": None}


@router.get("/{asset_id}/history")
def get_asset_history(
    asset_id: int,
    db: Session = Depends(get_db),
    page: int = 1,
    pageSize: int = 100,
):
    asset = db.query(models.Asset).filter(models.Asset.id == asset_id).first()
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")

    query = (
        db.query(models.AssetAuditLog)
        .filter(models.AssetAuditLog.asset_id == asset_id)
        .order_by(models.AssetAuditLog.created_at.desc())
    )
    total = query.count()
    page = max(1, page)
    page_size = max(1, min(pageSize, 200))
    logs = query.offset((page - 1) * page_size).limit(page_size).all()

    return {
        "success": True,
        "message": None,
        "data": {
            "items": [audit_to_dto(l) for l in logs],
            "total": total,
            "page": page,
            "pageSize": page_size,
        },
    }


@router.delete("/{asset_id}")
def delete_asset(
    asset_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(auth.require_admin),
):
    asset = db.query(models.Asset).filter(models.Asset.id == asset_id).first()
    if asset is not None:
        category_id = asset.category_id
        _log_change(
            db,
            asset,
            models.AuditAction.DELETE,
            current_user.get("username"),
            {field: {"old": _field_value(asset, field), "new": None} for field, _ in _TRACKED_FIELDS},
        )
        db.delete(asset)
        db.commit()
        category_importance.delete_category_if_orphaned(db, category_id)
    return {"success": True, "message": "Asset deleted", "data": None}