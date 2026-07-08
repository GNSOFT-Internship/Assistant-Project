import re
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..qna_logic import answer_question
from .assets import asset_to_dto

router = APIRouter(prefix="/api/ai", tags=["ai"])


class NaturalSearchRequest(BaseModel):
    query: str = ""


class ReplacementRequest(BaseModel):
    budget: Optional[float] = None


@router.post("/qa")
def ask_question(request: schemas.QnARequest, db: Session = Depends(get_db)):
    result = answer_question(db, request.question)
    return {"success": True, "message": None, "data": result}


def _matches_query(asset: models.Asset, query: str) -> bool:
    if not query.strip():
        return True

    matched = False

    if asset.asset_name and asset.asset_name.lower() in query:
        return True

    if asset.category and (
        asset.category.lower() in query
        or ("노트북" in query and "it" in asset.category.lower())
        or ("프린터" in query and "사무" in asset.category.lower())
    ):
        matched = True

    if asset.location and asset.location.lower() in query:
        matched = True

    year_match = re.search(r"(\d+)\s*년\s*이상", query)
    if year_match:
        min_years = int(year_match.group(1))
        used_years = date.today().year - asset.purchase_date.year
        matched = matched and used_years >= min_years

    if "교체" in query or "고장" in query:
        matched = matched and asset.status == models.AssetStatus.REPLACEMENT_NEEDED

    return matched


@router.post("/natural-language-search")
def natural_language_search(request: NaturalSearchRequest, db: Session = Depends(get_db)):
    query = (request.query or "").lower()
    all_assets = db.query(models.Asset).all()
    filtered = [a for a in all_assets if _matches_query(a, query)]

    is_default_result = len(filtered) == 0 and bool(query.strip())
    result_assets = all_assets if is_default_result else filtered

    return {
        "success": True,
        "message": None,
        "data": {
            "assets": [asset_to_dto(a) for a in result_assets],
            "explanation": f"'{request.query}'에 대한 검색 결과 {len(result_assets)}건을 찾았습니다.",
            "isSimulated": False,
        },
    }


@router.post("/replacement-recommendation")
def replacement_recommendation(request: ReplacementRequest, db: Session = Depends(get_db)):
    budget = request.budget
    all_assets = db.query(models.Asset).all()
    recommendations = []

    for asset in all_assets:
        records = db.query(models.MaintenanceRecord).filter(models.MaintenanceRecord.asset_id == asset.id).all()
        maintenance_count = len(records)
        total_repair_cost = sum(float(r.cost) if r.cost is not None else 0.0 for r in records)
        used_years = date.today().year - asset.purchase_date.year

        price = float(asset.purchase_price)
        repair_ratio = (total_repair_cost / price) if price > 0 else 0.0

        score = (used_years / max(asset.useful_life, 1)) * 40 + repair_ratio * 40 + min(maintenance_count, 10) * 2
        if asset.status == models.AssetStatus.REPLACEMENT_NEEDED:
            score += 20

        recommendations.append({
            "assetId": asset.id,
            "assetName": asset.asset_name,
            "assetCode": asset.asset_code,
            "usedYears": used_years,
            "usefulLife": asset.useful_life,
            "maintenanceCount": maintenance_count,
            "totalRepairCost": total_repair_cost,
            "purchasePrice": price,
            "score": round(score, 1),
            "reason": (
                f"사용기간 {used_years}년(내용연수 {asset.useful_life}년), "
                f"수리비가 구매가의 {repair_ratio * 100:.0f}% 수준이며 "
                f"최근 유지보수 {maintenance_count}회가 발생했습니다."
            ),
        })

    recommendations.sort(key=lambda r: r["score"], reverse=True)

    total_recommended_cost = 0.0
    if budget is not None:
        within_budget = []
        remaining = budget
        for rec in recommendations:
            if rec["purchasePrice"] <= remaining:
                within_budget.append(rec)
                remaining -= rec["purchasePrice"]
                total_recommended_cost += rec["purchasePrice"]
        recommendations = within_budget
    else:
        recommendations = recommendations[:5]
        total_recommended_cost = sum(r["purchasePrice"] for r in recommendations)

    ai_analysis = (
        "현재 교체 권장 자산이 없습니다."
        if not recommendations
        else f"총 {len(recommendations)}건의 교체 우선순위 추천 결과입니다."
    )

    return {
        "success": True,
        "message": None,
        "data": {
            "recommendations": recommendations,
            "aiAnalysis": ai_analysis,
            "budget": budget,
            "totalRecommendedCost": total_recommended_cost,
        },
    }


@router.get("/maintenance-analysis")
def maintenance_analysis(db: Session = Depends(get_db)):
    all_records = db.query(models.MaintenanceRecord).all()

    total_records = len(all_records)
    total_cost = sum(float(r.cost) if r.cost is not None else 0.0 for r in all_records)

    failure_count_by_asset: dict = {}
    for r in all_records:
        if r.maintenance_type == models.MaintenanceType.REPAIR:
            failure_count_by_asset[r.asset_id] = failure_count_by_asset.get(r.asset_id, 0) + 1

    failure_patterns: dict = {}
    for r in all_records:
        if r.failure_type and r.failure_type.strip():
            failure_patterns[r.failure_type] = failure_patterns.get(r.failure_type, 0) + 1

    repeated_failure_count = sum(1 for c in failure_count_by_asset.values() if c >= 2)

    ai_analysis = (
        "분석할 유지보수 데이터가 없습니다."
        if total_records == 0
        else (
            f"총 {total_records}건의 유지보수 기록이 있으며, 누적 비용은 {total_cost:,.0f}원입니다. "
            f"반복 고장 자산은 {repeated_failure_count}건입니다."
        )
    )

    return {
        "success": True,
        "message": None,
        "data": {
            "statistics": {
                "totalRecords": total_records,
                "totalCost": total_cost,
                "repeatedFailureAssetCount": repeated_failure_count,
            },
            "aiAnalysis": ai_analysis,
            "costTrend": {},
            "failurePatterns": failure_patterns,
        },
    }
