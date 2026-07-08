from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/assets", tags=["assets"])


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


@router.get("")
def get_all_assets(db: Session = Depends(get_db)):
    assets = db.query(models.Asset).all()
    return {"success": True, "message": None, "data": [asset_to_dto(a) for a in assets]}


@router.get("/{asset_id}")
def get_asset(asset_id: int, db: Session = Depends(get_db)):
    asset = db.query(models.Asset).filter(models.Asset.id == asset_id).first()
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")
    return {"success": True, "message": None, "data": asset_to_dto(asset)}


@router.post("")
def create_asset(request: schemas.AssetRequest, db: Session = Depends(get_db)):
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
    db.commit()
    db.refresh(asset)
    return {"success": True, "message": "Asset created successfully", "data": asset_to_dto(asset)}


@router.put("/{asset_id}")
def update_asset(asset_id: int, request: schemas.AssetRequest, db: Session = Depends(get_db)):
    asset = db.query(models.Asset).filter(models.Asset.id == asset_id).first()
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")

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


@router.delete("/{asset_id}")
def delete_asset(asset_id: int, db: Session = Depends(get_db)):
    asset = db.query(models.Asset).filter(models.Asset.id == asset_id).first()
    if asset is not None:
        db.delete(asset)
        db.commit()
    return {"success": True, "message": "Asset deleted", "data": None}
