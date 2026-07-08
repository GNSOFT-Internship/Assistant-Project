from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import llm, models, schemas
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


# ---------------------------------------------------------------------------
# 1. 자연어 검색
# ---------------------------------------------------------------------------

_SEARCH_FILTER_SCHEMA = {
    "type": "object",
    "properties": {
        "category": {"type": ["string", "null"], "description": "자산 카테고리 키워드 (부분 일치), 없으면 null"},
        "location": {"type": ["string", "null"], "description": "위치 키워드 (부분 일치), 없으면 null"},
        "keyword": {"type": ["string", "null"], "description": "자산명에서 찾을 키워드, 없으면 null"},
        "minUsedYears": {"type": ["integer", "null"], "description": "최소 사용기간(년), 없으면 null"},
        "maxUsedYears": {"type": ["integer", "null"], "description": "최대 사용기간(년), 없으면 null"},
        "statusFilter": {
            "type": ["string", "null"],
            "enum": ["ACTIVE", "INACTIVE", "REPLACEMENT_NEEDED", "UNDER_MAINTENANCE", None],
            "description": "자산 상태 필터, 없으면 null",
        },
        "explanation": {"type": "string", "description": "검색 조건을 어떻게 해석했는지 한국어로 한 문장 설명"},
    },
    "required": ["category", "location", "keyword", "minUsedYears", "maxUsedYears", "statusFilter", "explanation"],
    "additionalProperties": False,
}

_SEARCH_SYSTEM_PROMPT = (
    "당신은 공공기관 자산관리 시스템의 자연어 검색 파서다. 사용자의 한국어 질문을 분석하여 "
    "자산 목록을 필터링할 조건을 JSON으로 추출한다. '3년 이상 사용', '노트북', 'A동' 같은 "
    "표현을 정확히 해석한다. 카테고리는 'IT 장비', '사무기기', '설비', '전기설비', '안전설비', "
    "'보안장비', '가구', '측정장비' 중에서 가장 가까운 것을 선택하되, 확신이 없으면 keyword로 넘긴다."
)


def _apply_filter(asset: models.Asset, f: dict) -> bool:
    if f.get("category") and f["category"].lower() not in (asset.category or "").lower():
        return False
    if f.get("location") and f["location"].lower() not in (asset.location or "").lower():
        return False
    if f.get("keyword") and f["keyword"].lower() not in (asset.asset_name or "").lower():
        return False
    used_years = date.today().year - asset.purchase_date.year
    if f.get("minUsedYears") is not None and used_years < f["minUsedYears"]:
        return False
    if f.get("maxUsedYears") is not None and used_years > f["maxUsedYears"]:
        return False
    if f.get("statusFilter") and asset.status.value != f["statusFilter"]:
        return False
    return True


@router.post("/natural-language-search")
def natural_language_search(request: NaturalSearchRequest, db: Session = Depends(get_db)):
    all_assets = db.query(models.Asset).all()
    query = request.query or ""

    if not query.strip():
        return {
            "success": True,
            "message": None,
            "data": {
                "assets": [asset_to_dto(a) for a in all_assets],
                "explanation": "검색어가 없어 전체 자산을 표시합니다.",
                "isSimulated": False,
            },
        }

    if not llm.is_configured():
        filtered = [a for a in all_assets if query.lower() in (a.asset_name or "").lower()]
        return {
            "success": True,
            "message": None,
            "data": {
                "assets": [asset_to_dto(a) for a in (filtered or all_assets)],
                "explanation": f"'{query}'에 대한 검색 결과 {len(filtered)}건을 찾았습니다. "
                "(AI 자연어 해석을 사용하려면 ANTHROPIC_API_KEY를 설정하세요.)",
                "isSimulated": False,
            },
        }

    try:
        filter_result = llm.ask_json(_SEARCH_SYSTEM_PROMPT, query, _SEARCH_FILTER_SCHEMA, effort="low")
        filtered = [a for a in all_assets if _apply_filter(a, filter_result)]
        explanation = filter_result.get("explanation") or f"'{query}'에 대한 검색 결과 {len(filtered)}건을 찾았습니다."
    except Exception:
        filtered = [a for a in all_assets if query.lower() in (a.asset_name or "").lower()]
        explanation = f"'{query}'에 대한 검색 결과 {len(filtered)}건을 찾았습니다."

    return {
        "success": True,
        "message": None,
        "data": {
            "assets": [asset_to_dto(a) for a in filtered],
            "explanation": explanation,
            "isSimulated": False,
        },
    }


# ---------------------------------------------------------------------------
# 2. AI 교체 우선순위 추천
# ---------------------------------------------------------------------------

_REASONS_SCHEMA = {
    "type": "object",
    "properties": {
        "overallAnalysis": {"type": "string", "description": "전체 추천 결과에 대한 한국어 총평"},
        "reasons": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "assetId": {"type": "integer"},
                    "reason": {"type": "string", "description": "이 자산을 교체 우선순위로 추천하는 구체적 이유"},
                },
                "required": ["assetId", "reason"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["overallAnalysis", "reasons"],
    "additionalProperties": False,
}

_REASON_SYSTEM_PROMPT = (
    "당신은 공공기관 자산관리 AI다. 아래 자산별 사용기간/내용연수/수리비율/고장횟수 데이터를 근거로 "
    "왜 각 자산이 교체 우선순위에 올랐는지 한국어로 간결하고 구체적으로 설명한다. 수치를 인용하라."
)


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

    if recommendations and llm.is_configured():
        try:
            summary_input = "\n".join(
                f"assetId={r['assetId']} | {r['assetName']} | 사용기간={r['usedYears']}년/{r['usefulLife']}년 | "
                f"수리비율={(r['totalRepairCost'] / r['purchasePrice'] * 100) if r['purchasePrice'] else 0:.0f}% | "
                f"유지보수횟수={r['maintenanceCount']} | 점수={r['score']}"
                for r in recommendations
            )
            budget_line = f"예산: {budget:,.0f}원\n" if budget is not None else ""
            llm_result = llm.ask_json(
                _REASON_SYSTEM_PROMPT,
                f"{budget_line}{summary_input}",
                _REASONS_SCHEMA,
                effort="medium",
            )
            reason_by_id = {r["assetId"]: r["reason"] for r in llm_result.get("reasons", [])}
            for rec in recommendations:
                if rec["assetId"] in reason_by_id:
                    rec["reason"] = reason_by_id[rec["assetId"]]
            ai_analysis = llm_result.get("overallAnalysis", ai_analysis)
        except Exception:
            pass

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


# ---------------------------------------------------------------------------
# 3. AI 유지보수 분석
# ---------------------------------------------------------------------------

_MAINTENANCE_ANALYSIS_SCHEMA = {
    "type": "object",
    "properties": {
        "analysis": {"type": "string", "description": "유지보수 데이터에 대한 한국어 종합 분석. 반복고장/비용증가/이상패턴을 언급한다."},
    },
    "required": ["analysis"],
    "additionalProperties": False,
}

_MAINTENANCE_SYSTEM_PROMPT = (
    "당신은 공공기관 자산관리 AI다. 아래 유지보수 통계를 바탕으로 반복 고장 장비, 유지보수 비용 증가 여부, "
    "이상 패턴을 짚어내는 한국어 분석을 2~4문장으로 작성한다."
)


@router.get("/maintenance-analysis")
def maintenance_analysis(db: Session = Depends(get_db)):
    all_records = db.query(models.MaintenanceRecord).all()
    all_assets = {a.id: a for a in db.query(models.Asset).all()}

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

    today = date.today()
    current_month_count = sum(
        1 for r in all_records
        if r.maintenance_date and r.maintenance_date.year == today.year and r.maintenance_date.month == today.month
    )
    average_cost = (total_cost / total_records) if total_records else 0.0

    monthly_costs: dict = {}
    for r in all_records:
        key = f"{r.maintenance_date.year}-{r.maintenance_date.month:02d}"
        monthly_costs[key] = monthly_costs.get(key, 0.0) + (float(r.cost) if r.cost is not None else 0.0)
    monthly_costs = dict(sorted(monthly_costs.items()))

    ai_analysis = (
        "분석할 유지보수 데이터가 없습니다."
        if total_records == 0
        else (
            f"총 {total_records}건의 유지보수 기록이 있으며, 누적 비용은 {total_cost:,.0f}원입니다. "
            f"반복 고장 자산은 {repeated_failure_count}건입니다."
        )
    )

    if total_records > 0 and llm.is_configured():
        try:
            repeated_names = [
                f"{all_assets[aid].asset_name}({cnt}회)"
                for aid, cnt in sorted(failure_count_by_asset.items(), key=lambda x: -x[1])
                if aid in all_assets and cnt >= 2
            ]
            summary_input = (
                f"총 유지보수 건수: {total_records}\n"
                f"누적 비용: {total_cost:,.0f}원\n"
                f"월별 비용: {monthly_costs}\n"
                f"반복 고장 자산: {', '.join(repeated_names) if repeated_names else '없음'}\n"
                f"고장 유형 빈도: {failure_patterns}"
            )
            llm_result = llm.ask_json(_MAINTENANCE_SYSTEM_PROMPT, summary_input, _MAINTENANCE_ANALYSIS_SCHEMA, effort="medium")
            ai_analysis = llm_result.get("analysis", ai_analysis)
        except Exception:
            pass

    return {
        "success": True,
        "message": None,
        "data": {
            "statistics": {
                "totalRecords": total_records,
                "totalCost": total_cost,
                "averageCost": average_cost,
                "currentMonthCount": current_month_count,
                "repeatedFailureAssetCount": repeated_failure_count,
            },
            "aiAnalysis": ai_analysis,
            "costTrend": {"monthlyCosts": monthly_costs},
            "failurePatterns": failure_patterns,
        },
    }
