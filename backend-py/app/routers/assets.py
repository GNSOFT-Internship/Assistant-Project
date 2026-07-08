from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/assets", tags=["assets"])


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


@router.delete("/{asset_id}")
def delete_asset(asset_id: int, db: Session = Depends(get_db)):
    asset = db.query(models.Asset).filter(models.Asset.id == asset_id).first()
    if asset is not None:
        db.delete(asset)
        db.commit()
    return {"success": True, "message": "Asset deleted", "data": None}
