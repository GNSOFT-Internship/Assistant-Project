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

    current_budget = (
        db.query(models.Budget)
        .filter(models.Budget.year == now.year, models.Budget.month == now.month)
        .first()
    )
    if current_budget is not None and float(current_budget.allocated_amount) > 0:
        budget_consumption_rate = round(current_month_cost / float(current_budget.allocated_amount) * 100, 1)
    elif settings.DEMO_MODE:
        budget_consumption_rate = 45.0
    else:
        budget_consumption_rate = None

    # DEMO_MODE의 지터는 실제 데이터가 없을 때만 적용한다. 실제 자산/유지보수
    # 데이터가 있으면 그대로 보여주고, 데이터가 전혀 없는 빈 데모 환경에서만
    # 화면이 밋밋해 보이지 않도록 약간의 변동을 더한다.
    is_simulated = False
    if settings.DEMO_MODE and total_assets == 0:
        factor = 1.0 + (random.random() * 0.2 - 0.1)
        current_month_cost *= factor
        operation_rate = max(0.0, min(100.0, operation_rate + random.random() * 4 - 2))
        if current_budget is None and budget_consumption_rate is not None:
            budget_consumption_rate *= factor
        is_simulated = True
    elif current_budget is None and budget_consumption_rate is not None:
        # 예산 소진율만 실제 예산이 없어 임의 기본값(45%)을 쓰는 경우
        is_simulated = True

    data = {
        "currentMonthMaintenanceCost": current_month_cost,
        "newFailureCount": new_failure_count,
        "operationRate": operation_rate,
        "budgetConsumptionRate": budget_consumption_rate,
        "hasBudgetData": current_budget is not None,
        "totalAssets": total_assets,
        "activeAssets": active_assets,
        "replacementNeededAssets": replacement_needed_assets,
        "isSimulated": is_simulated,
    }
    return {"success": True, "message": None, "data": data}
