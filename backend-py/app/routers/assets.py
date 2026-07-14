import io
import json
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import ValidationError
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import auth, models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/assets", tags=["assets"])

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


def _maintenance_summary(record: models.MaintenanceRecord) -> str:
    cost = f"{float(record.cost):,.0f}원" if record.cost is not None else "비용 미기재"
    parts = [
        record.maintenance_date.isoformat() if record.maintenance_date else "-",
        record.maintenance_type.value if record.maintenance_type else "-",
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
        like = f"%{search}%"
        query = query.filter(
            or_(models.Asset.asset_name.like(like), models.Asset.asset_code.like(like))
        )
    if category:
        query = query.filter(models.Asset.category == category)

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
        like = f"%{search}%"
        query = query.filter(
            or_(models.Asset.asset_name.like(like), models.Asset.asset_code.like(like))
        )
    if category:
        query = query.filter(models.Asset.category == category)

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
            db.query(models.Asset.id).filter(models.Asset.asset_name.like(f"%{search}%")).all()
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
    "자산번호": "assetCode",
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
_IMPORT_REQUIRED_COLUMNS = {"자산번호", "자산명", "카테고리", "구매일", "구매가", "내용연수(년)"}


@router.post("/import")
def import_assets_excel(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(auth.require_admin),
):
    """엑셀 내보내기(/export)와 같은 컬럼 형식으로 자산을 대량 등록한다.
    행 단위로 검증해서 실패한 행은 건너뛰고, 성공한 행까지는 그대로 반영한다."""
    try:
        df = pd.read_excel(io.BytesIO(file.file.read()))
    except Exception:
        raise HTTPException(status_code=400, detail="엑셀 파일을 읽을 수 없습니다. xlsx 형식을 확인해주세요.")

    missing = _IMPORT_REQUIRED_COLUMNS - set(df.columns)
    if missing:
        raise HTTPException(status_code=400, detail=f"필수 컬럼이 없습니다: {', '.join(sorted(missing))}")

    created = 0
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
        except (ValidationError, TypeError, ValueError) as e:
            errors.append({"row": excel_row_no, "error": str(e)})
            continue

        asset = models.Asset(
            asset_name=asset_req.assetName,
            asset_code=asset_req.assetCode,
            category=asset_req.category,
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
            db.rollback()
            errors.append({"row": excel_row_no, "error": f"자산번호 '{asset_req.assetCode}'가 이미 존재합니다."})
            continue

        _log_change(
            db, asset, models.AuditAction.CREATE, current_user.get("username"),
            {field: {"old": None, "new": _field_value(asset, field)} for field, _ in _TRACKED_FIELDS},
        )
        db.commit()
        created += 1

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
    asset = models.Asset(
        asset_name=request.assetName,
        asset_code=request.assetCode,
        category=request.category,
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

    asset.asset_name = request.assetName
    asset.asset_code = request.assetCode
    asset.category = request.category
    asset.location = request.location
    asset.responsible_person = request.responsiblePerson
    asset.purchase_date = date.fromisoformat(request.purchaseDate)
    asset.purchase_price = Decimal(str(request.purchasePrice))
    asset.useful_life = request.usefulLife
    asset.status = models.AssetStatus(request.status or "ACTIVE")
    asset.description = request.description

    db.flush()
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

    return {
        "success": True,
        "message": None,
        "data": {
            "items": [maintenance_to_dto(r) for r in records],
            "total": total,
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
        _log_change(
            db,
            asset,
            models.AuditAction.DELETE,
            current_user.get("username"),
            {field: {"old": _field_value(asset, field), "new": None} for field, _ in _TRACKED_FIELDS},
        )
        db.delete(asset)
        db.commit()
    return {"success": True, "message": "Asset deleted", "data": None}
