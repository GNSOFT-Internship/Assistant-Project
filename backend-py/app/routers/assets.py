import json
from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
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


def audit_to_dto(log: models.AssetAuditLog) -> dict:
    try:
        changes = json.loads(log.changes) if log.changes else None
    except (TypeError, ValueError):
        changes = None
    return {
        "id": log.id,
        "assetId": log.asset_id,
        "assetCode": log.asset_code,
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


@router.get("")
def get_all_assets(
    db: Session = Depends(get_db),
    page: int = 1,
    pageSize: int = 20,
    search: str = "",
    category: str = "",
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
    assets = (
        query.order_by(models.Asset.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

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
    current_user: dict = Depends(auth.get_current_user),
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
    current_user: dict = Depends(auth.get_current_user),
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
def get_asset_maintenance_history(asset_id: int, db: Session = Depends(get_db)):
    asset = db.query(models.Asset).filter(models.Asset.id == asset_id).first()
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")

    records = (
        db.query(models.MaintenanceRecord)
        .filter(models.MaintenanceRecord.asset_id == asset_id)
        .order_by(models.MaintenanceRecord.maintenance_date.desc())
        .all()
    )
    return {"success": True, "message": None, "data": [maintenance_to_dto(r) for r in records]}


@router.post("/{asset_id}/maintenance")
def add_asset_maintenance_record(asset_id: int, request: schemas.MaintenanceRecordRequest, db: Session = Depends(get_db)):
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
    db.commit()
    db.refresh(record)
    return {"success": True, "message": "Maintenance record added", "data": maintenance_to_dto(record)}


@router.put("/{asset_id}/maintenance/{record_id}")
def update_maintenance_record(
    asset_id: int,
    record_id: int,
    request: schemas.MaintenanceRecordRequest,
    db: Session = Depends(get_db),
):
    record = (
        db.query(models.MaintenanceRecord)
        .filter(models.MaintenanceRecord.id == record_id, models.MaintenanceRecord.asset_id == asset_id)
        .first()
    )
    if record is None:
        raise HTTPException(status_code=404, detail="Maintenance record not found")

    record.maintenance_date = date.fromisoformat(request.maintenanceDate)
    record.maintenance_type = models.MaintenanceType(request.maintenanceType)
    record.cost = Decimal(str(request.cost)) if request.cost is not None else None
    record.description = request.description
    record.technician = request.technician
    record.failure_type = request.failureType

    db.commit()
    db.refresh(record)
    return {"success": True, "message": "Maintenance record updated", "data": maintenance_to_dto(record)}


@router.delete("/{asset_id}/maintenance/{record_id}")
def delete_maintenance_record(asset_id: int, record_id: int, db: Session = Depends(get_db)):
    record = (
        db.query(models.MaintenanceRecord)
        .filter(models.MaintenanceRecord.id == record_id, models.MaintenanceRecord.asset_id == asset_id)
        .first()
    )
    if record is not None:
        db.delete(record)
        db.commit()
    return {"success": True, "message": "Maintenance record deleted", "data": None}


@router.get("/{asset_id}/history")
def get_asset_history(asset_id: int, db: Session = Depends(get_db)):
    logs = (
        db.query(models.AssetAuditLog)
        .filter(models.AssetAuditLog.asset_id == asset_id)
        .order_by(models.AssetAuditLog.created_at.desc())
        .all()
    )
    return {"success": True, "message": None, "data": [audit_to_dto(l) for l in logs]}


@router.delete("/{asset_id}")
def delete_asset(
    asset_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(auth.get_current_user),
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
