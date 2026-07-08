import random
from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models
from ..config import settings
from ..database import get_db

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("")
def get_dashboard_data(db: Session = Depends(get_db)):
    all_assets = db.query(models.Asset).all()
    total_assets = len(all_assets)
    active_assets = sum(1 for a in all_assets if a.status == models.AssetStatus.ACTIVE)
    replacement_needed_assets = sum(1 for a in all_assets if a.status == models.AssetStatus.REPLACEMENT_NEEDED)

    now = datetime.now()
    records = db.query(models.MaintenanceRecord).all()
    current_month_cost = sum(
        float(r.cost) if r.cost is not None else 0.0
        for r in records
        if r.maintenance_date and r.maintenance_date.month == now.month and r.maintenance_date.year == now.year
    )

    operation_rate = (active_assets * 100.0 / total_assets) if total_assets > 0 else 100.0
    budget_consumption_rate = 45.0

    if settings.DEMO_MODE:
        factor = 1.0 + (random.random() * 0.2 - 0.1)
        current_month_cost *= factor
        operation_rate = max(0.0, min(100.0, operation_rate + random.random() * 4 - 2))
        budget_consumption_rate *= factor

    data = {
        "currentMonthMaintenanceCost": current_month_cost,
        "newFailureCount": 5,
        "operationRate": operation_rate,
        "budgetConsumptionRate": budget_consumption_rate,
        "totalAssets": total_assets,
        "activeAssets": active_assets,
        "replacementNeededAssets": replacement_needed_assets,
        "isSimulated": settings.DEMO_MODE,
    }
    return {"success": True, "message": None, "data": data}
