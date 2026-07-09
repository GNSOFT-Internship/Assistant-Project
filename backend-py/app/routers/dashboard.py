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
    current_month_records = [
        r for r in records
        if r.maintenance_date and r.maintenance_date.month == now.month and r.maintenance_date.year == now.year
    ]
    current_month_cost = sum(float(r.cost) if r.cost is not None else 0.0 for r in current_month_records)
    new_failure_count = sum(1 for r in current_month_records if r.maintenance_type == models.MaintenanceType.REPAIR)

    operation_rate = (active_assets * 100.0 / total_assets) if total_assets > 0 else 100.0
    # 예산 데이터를 별도로 관리하지 않아 실제 소진율을 계산할 수 없다.
    # 데모 모드가 아니면 이 자리 표시자 값을 그대로 보여주는 대신 null을 반환한다.
    budget_consumption_rate = 45.0 if settings.DEMO_MODE else None

    if settings.DEMO_MODE:
        factor = 1.0 + (random.random() * 0.2 - 0.1)
        current_month_cost *= factor
        operation_rate = max(0.0, min(100.0, operation_rate + random.random() * 4 - 2))
        budget_consumption_rate *= factor

    data = {
        "currentMonthMaintenanceCost": current_month_cost,
        "newFailureCount": new_failure_count,
        "operationRate": operation_rate,
        "budgetConsumptionRate": budget_consumption_rate,
        "totalAssets": total_assets,
        "activeAssets": active_assets,
        "replacementNeededAssets": replacement_needed_assets,
        "isSimulated": settings.DEMO_MODE,
    }
    return {"success": True, "message": None, "data": data}
