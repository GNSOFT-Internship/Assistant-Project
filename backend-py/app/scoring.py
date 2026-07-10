from datetime import date

from . import models


def compute_replacement_metrics(asset: "models.Asset", records: list, today: date = None) -> dict:
    """자산의 교체 우선순위 점수와 관련 지표를 계산한다.

    ai.py의 교체추천과 reports.py의 월간 보고서가 동일한 공식을 공유한다.
    """
    today = today or date.today()
    used_years = today.year - asset.purchase_date.year
    price = float(asset.purchase_price)
    repair_cost = sum(float(r.cost) if r.cost is not None else 0.0 for r in records)
    repair_ratio = (repair_cost / price) if price > 0 else 0.0
    maintenance_count = len(records)

    score = (used_years / max(asset.useful_life, 1)) * 40 + repair_ratio * 40 + min(maintenance_count, 10) * 2
    if asset.status == models.AssetStatus.REPLACEMENT_NEEDED:
        score += 20

    return {
        "usedYears": used_years,
        "price": price,
        "repairCost": repair_cost,
        "repairRatio": repair_ratio,
        "maintenanceCount": maintenance_count,
        "score": round(score, 1),
    }
