from datetime import date

from . import models


def calc_used_years(purchase_date: date, today: date = None) -> int:
    """구매일로부터 오늘까지 만으로 몇 년이 지났는지 계산한다.

    단순히 연도만 빼면(today.year - purchase_date.year) 12월에 산 자산이
    다음 해 1월 1일부터 "1년 사용"으로 잡히는 등 최대 1년까지 오차가
    생기므로, 월/일까지 비교해 만 나이 계산과 동일한 방식으로 보정한다.
    """
    today = today or date.today()
    years = today.year - purchase_date.year
    if (today.month, today.day) < (purchase_date.month, purchase_date.day):
        years -= 1
    return max(years, 0)


def compute_replacement_metrics(
    asset: "models.Asset",
    records: list,
    today: date = None,
    category_importance_score: float = 50.0,
) -> dict:
    """자산의 교체 우선순위 점수(0~100점 만점)와 관련 지표를 계산한다.

    ai.py의 교체추천과 reports.py의 월간 보고서가 동일한 공식을 공유한다.
    구성: 사용기간 비율 30점 + 수리비 비율 25점 + 유지보수 횟수 10점
         + 카테고리 중요도 20점 + 교체필요 상태 15점.
    각 비율 항목은 100%(1.0)를 넘겨도 만점(해당 배점)으로 고정해 총점이 100점을 넘지 않는다.

    category_importance_score(0~100)는 카테고리별 업무 중요도로, 같은 사용기간·수리비라도
    NAS처럼 중요한 장비가 정수기 같은 장비보다 우선순위가 높게 나오도록 반영한다
    (category_importance.get_importance_score로 조회/산정한 값을 호출자가 넘긴다).
    """
    today = today or date.today()
    used_years = calc_used_years(asset.purchase_date, today)
    price = float(asset.purchase_price)
    repair_cost = sum(float(r.cost) if r.cost is not None else 0.0 for r in records)
    repair_ratio = (repair_cost / price) if price > 0 else 0.0
    maintenance_count = len(records)

    age_ratio = min(used_years / max(asset.useful_life, 1), 1.0)
    capped_repair_ratio = min(repair_ratio, 1.0)
    maintenance_ratio = min(maintenance_count, 10) / 10
    importance_ratio = min(max(category_importance_score, 0.0), 100.0) / 100.0

    score = (
        age_ratio * 30
        + capped_repair_ratio * 25
        + maintenance_ratio * 10
        + importance_ratio * 20
    )
    if asset.status == models.AssetStatus.REPLACEMENT_NEEDED:
        score += 15

    return {
        "usedYears": used_years,
        "price": price,
        "repairCost": repair_cost,
        "repairRatio": repair_ratio,
        "maintenanceCount": maintenance_count,
        "categoryImportance": category_importance_score,
        "score": round(score, 1),
    }
