import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import llm, models
from ..database import get_db
from ..scoring import compute_replacement_metrics
from .assets import asset_to_dto

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai", tags=["ai"])


class NaturalSearchRequest(BaseModel):
    query: str = ""


class ReplacementRequest(BaseModel):
    budget: Optional[float] = None


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
        "failureKeyword": {
            "type": ["string", "null"],
            "description": (
                "유지보수 이력의 고장 유형(failure_type) 또는 정비 설명(description)에서 부분 일치로 "
                "찾을 키워드. '전원고장', '배터리', 'HDD 오류' 같은 고장 유형은 물론, "
                "'하드디스크를 교체한', '키보드 수리한'처럼 실제 정비 내용을 가리키는 표현도 여기에 "
                "핵심 키워드(예: '하드디스크', '키보드')로 추출한다. 조건이 없으면 null. "
                "'~이 있었던', '~을 겪은', '~한 적 있는', '~을 교체한' 등의 표현이 있으면 이 필드를 사용한다."
            ),
        },
        "minFailureCount": {
            "type": ["integer", "null"],
            "description": (
                "해당 고장 유형이 최소 몇 번 이상 발생했어야 하는지. "
                "'1번이라도', '한 번이라도'이면 1, '2번 이상'이면 2, 횟수 조건이 없으면 null."
            ),
        },
        "minMaintenanceCount": {
            "type": ["integer", "null"],
            "description": (
                "고장 유형과 무관하게 전체 유지보수(정기점검+수리+교체+점검) 건수가 최소 몇 건 "
                "이상이어야 하는지. '유지보수 건수가 4건 이상인 장비', '정비 이력이 3번 넘는 자산' "
                "처럼 특정 고장 유형이 아니라 전체 정비 횟수를 묻는 경우에 설정하고, 없으면 null. "
                "failureKeyword가 있는 질문의 minFailureCount와는 다른 필드이니 혼동하지 않는다."
            ),
        },
        "noRepairHistory": {
            "type": ["boolean", "null"],
            "description": (
                "'수리 이력이 없는', '고장난 적 없는', '한 번도 고장나지 않은'처럼 수리(REPAIR)/"
                "교체(REPLACEMENT) 이력이 전혀 없어야 하는 조건이면 true. 정기점검(ROUTINE/"
                "INSPECTION) 기록만 있거나 아예 이력이 없는 자산 모두 여기 해당한다. 조건이 없으면 null."
            ),
        },
        "noMaintenanceHistory": {
            "type": ["boolean", "null"],
            "description": (
                "'유지보수 이력이 전혀 없는', '한 번도 점검받은 적 없는'처럼 정기점검을 포함한 "
                "모든 종류의 유지보수 기록이 단 한 건도 없어야 하는 조건이면 true. "
                "noRepairHistory보다 더 엄격한 조건이며, 조건이 없으면 null."
            ),
        },
        "explanation": {"type": "string", "description": "검색 조건을 어떻게 해석했는지 한국어로 한 문장 설명"},
    },
    "required": [
        "category", "location", "keyword", "minUsedYears", "maxUsedYears", "statusFilter",
        "failureKeyword", "minFailureCount", "minMaintenanceCount", "noRepairHistory",
        "noMaintenanceHistory", "explanation",
    ],
    "additionalProperties": False,
}

_SEARCH_SYSTEM_PROMPT = (
    "당신은 공공기관 자산관리 시스템의 자연어 검색 파서다. 사용자의 한국어 질문을 분석하여 "
    "자산 목록을 필터링할 조건을 JSON으로 추출한다. '3년 이상 사용', '노트북', 'A동' 같은 "
    "표현을 정확히 해석한다. 카테고리는 'IT 장비', '사무기기', '설비', '전기설비', '안전설비', "
    "'보안장비', '가구', '측정장비' 중에서 가장 가까운 것을 선택하되, 확신이 없으면 keyword로 넘긴다. "
    "'전원고장이 있었던', '배터리 문제가 발생한', 'HDD 오류를 겪은' 등 특정 고장 유형/정비 내용과 "
    "관련된 조건은 failureKeyword에 핵심 키워드를 넣고, 횟수 조건이 있으면 minFailureCount에도 "
    "설정한다. 반면 '유지보수 건수가 4건 이상인 장비'처럼 특정 고장 유형이 아니라 전체 정비 "
    "횟수를 묻는 경우에는 minMaintenanceCount에 그 숫자를 설정한다 (failureKeyword는 null로 둔다). "
    "'수리 이력이 없는', '고장난 적 없는'처럼 부정/결여형 조건이면 noRepairHistory를 true로, "
    "'유지보수 이력이 아예 없는'처럼 정기점검까지 포함해 어떤 기록도 없어야 하면 "
    "noMaintenanceHistory를 true로 설정한다."
)


_REPAIR_TYPES = (models.MaintenanceType.REPAIR, models.MaintenanceType.REPLACEMENT)


def _apply_filter(asset: models.Asset, f: dict, records: Optional[list] = None) -> bool:
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

    needs_records = any(
        f.get(key) for key in ("failureKeyword", "minMaintenanceCount", "noRepairHistory", "noMaintenanceHistory")
    )
    if needs_records:
        records = records or []

        if f.get("noMaintenanceHistory") and len(records) > 0:
            return False

        if f.get("noRepairHistory") and any(r.maintenance_type in _REPAIR_TYPES for r in records):
            return False

        # 고장/정비 이력 필터: failure_type뿐 아니라 정비 설명(description)에서도
        # 키워드를 찾는다 ("하드디스크를 교체한 장비"처럼 고장유형이 아닌 정비
        # 내용으로 질문하는 경우를 포함하기 위함).
        if f.get("failureKeyword"):
            kw = f["failureKeyword"].lower()
            min_count = f.get("minFailureCount") or 1
            matched = sum(
                1 for r in records
                if (r.failure_type and kw in r.failure_type.lower())
                or (r.description and kw in r.description.lower())
            )
            if matched < min_count:
                return False

        # 고장 유형과 무관한 전체 유지보수 건수 필터
        if f.get("minMaintenanceCount") and len(records) < f["minMaintenanceCount"]:
            return False

    return True


_FILTER_CRITERIA_FIELDS = [
    "category", "location", "keyword", "minUsedYears", "maxUsedYears", "statusFilter",
    "failureKeyword", "minMaintenanceCount", "noRepairHistory", "noMaintenanceHistory",
]


def _has_filter_criteria(filter_result: dict) -> bool:
    return any(filter_result.get(f) is not None for f in _FILTER_CRITERIA_FIELDS)


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
                "hasFilter": False,
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
                "(AI 자연어 해석을 사용하려면 GN_API_KEY를 설정하세요.)",
                "isSimulated": False,
                "hasFilter": bool(filtered),
            },
        }

    try:
        filter_result = llm.ask_json(_SEARCH_SYSTEM_PROMPT, query, _SEARCH_FILTER_SCHEMA, effort="low")
        records_by_asset: dict = {}
        for r in db.query(models.MaintenanceRecord).all():
            records_by_asset.setdefault(r.asset_id, []).append(r)
        filtered = [a for a in all_assets if _apply_filter(a, filter_result, records_by_asset.get(a.id, []))]
        explanation = filter_result.get("explanation") or f"'{query}'에 대한 검색 결과 {len(filtered)}건을 찾았습니다."
        has_filter = _has_filter_criteria(filter_result)
    except Exception:
        logger.warning("자연어 검색 LLM 호출 실패, 단순 키워드 검색으로 전환", exc_info=True)
        filtered = [a for a in all_assets if query.lower() in (a.asset_name or "").lower()]
        explanation = f"'{query}'에 대한 검색 결과 {len(filtered)}건을 찾았습니다."
        has_filter = bool(filtered)

    return {
        "success": True,
        "message": None,
        "data": {
            "assets": [asset_to_dto(a) for a in filtered],
            "explanation": explanation,
            "isSimulated": False,
            "hasFilter": has_filter,
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
    all_records = db.query(models.MaintenanceRecord).all()
    records_by_asset: dict = {}
    for r in all_records:
        records_by_asset.setdefault(r.asset_id, []).append(r)

    recommendations = []

    for asset in all_assets:
        records = records_by_asset.get(asset.id, [])
        metrics = compute_replacement_metrics(asset, records)

        recommendations.append({
            "assetId": asset.id,
            "assetName": asset.asset_name,
            "assetCode": asset.asset_code,
            "usedYears": metrics["usedYears"],
            "usefulLife": asset.useful_life,
            "maintenanceCount": metrics["maintenanceCount"],
            "totalRepairCost": metrics["repairCost"],
            "purchasePrice": metrics["price"],
            "score": metrics["score"],
            "reason": (
                f"사용기간 {metrics['usedYears']}년(내용연수 {asset.useful_life}년), "
                f"수리비가 구매가의 {metrics['repairRatio'] * 100:.0f}% 수준이며 "
                f"최근 유지보수 {metrics['maintenanceCount']}회가 발생했습니다."
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
            logger.warning("교체 추천 AI 서술 생성 실패, 규칙 기반 문구 유지", exc_info=True)

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


def _parse_year_month(value: Optional[str]):
    if not value:
        return None
    try:
        year_str, month_str = value.split("-")
        return int(year_str), int(month_str)
    except (ValueError, AttributeError):
        return None


def _in_month_range(record: models.MaintenanceRecord, start_month: Optional[str], end_month: Optional[str]) -> bool:
    if not start_month and not end_month:
        return True
    if not record.maintenance_date:
        return False
    key = (record.maintenance_date.year, record.maintenance_date.month)

    start = _parse_year_month(start_month)
    if start and key < start:
        return False

    end = _parse_year_month(end_month)
    if end and key > end:
        return False

    return True


@router.get("/maintenance-analysis")
def maintenance_analysis(
    db: Session = Depends(get_db),
    startMonth: Optional[str] = None,
    endMonth: Optional[str] = None,
    includeAi: bool = False,
):
    all_records = db.query(models.MaintenanceRecord).all()
    all_assets = {a.id: a for a in db.query(models.Asset).all()}

    total_records = len(all_records)
    total_cost = sum(float(r.cost) if r.cost is not None else 0.0 for r in all_records)

    failure_count_by_asset: dict = {}
    for r in all_records:
        if r.maintenance_type == models.MaintenanceType.REPAIR:
            failure_count_by_asset[r.asset_id] = failure_count_by_asset.get(r.asset_id, 0) + 1

    # "없음"은 정기점검/점검 기록에 고장이 없었다는 표시일 뿐 실제 고장
    # 유형이 아니므로, 고장 패턴 분석에서는 제외한다.
    # 고장 유형 분포는 startMonth~endMonth 범위로 좁혀볼 수 있고, 나머지
    # 통계(총 건수/비용 등)는 항상 전체 기간 기준을 유지한다.
    failure_patterns: dict = {}
    for r in all_records:
        if not _in_month_range(r, startMonth, endMonth):
            continue
        failure_type = (r.failure_type or "").strip()
        if failure_type and failure_type != "없음":
            failure_patterns[failure_type] = failure_patterns.get(failure_type, 0) + 1

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

    ai_analysis = None
    if includeAi:
        # AI 서술은 화면 상단의 "전체 기간" 통계 카드와 달리, 사용자가 선택한
        # startMonth~endMonth 범위를 실제로 반영해야 한다. 그렇지 않으면
        # 범위를 좁혀도 AI가 전체 기간 기준으로 답하는 것처럼 보인다.
        ai_records = [r for r in all_records if _in_month_range(r, startMonth, endMonth)]
        ai_total_records = len(ai_records)
        ai_total_cost = sum(float(r.cost) if r.cost is not None else 0.0 for r in ai_records)

        ai_failure_count_by_asset: dict = {}
        for r in ai_records:
            if r.maintenance_type == models.MaintenanceType.REPAIR:
                ai_failure_count_by_asset[r.asset_id] = ai_failure_count_by_asset.get(r.asset_id, 0) + 1
        ai_repeated_failure_count = sum(1 for c in ai_failure_count_by_asset.values() if c >= 2)

        ai_monthly_costs: dict = {}
        for r in ai_records:
            key = f"{r.maintenance_date.year}-{r.maintenance_date.month:02d}"
            ai_monthly_costs[key] = ai_monthly_costs.get(key, 0.0) + (float(r.cost) if r.cost is not None else 0.0)
        ai_monthly_costs = dict(sorted(ai_monthly_costs.items()))

        ai_analysis = (
            "분석할 유지보수 데이터가 없습니다."
            if ai_total_records == 0
            else (
                f"총 {ai_total_records}건의 유지보수 기록이 있으며, 누적 비용은 {ai_total_cost:,.0f}원입니다. "
                f"반복 고장 자산은 {ai_repeated_failure_count}건입니다."
            )
        )

        if ai_total_records > 0 and llm.is_configured():
            try:
                repeated_names = [
                    f"{all_assets[aid].asset_name}({cnt}회)"
                    for aid, cnt in sorted(ai_failure_count_by_asset.items(), key=lambda x: -x[1])
                    if aid in all_assets and cnt >= 2
                ]
                period_line = (
                    f"분석 대상 기간: {startMonth or '전체'} ~ {endMonth or '전체'}\n"
                    if (startMonth or endMonth) else ""
                )
                summary_input = (
                    f"{period_line}"
                    f"총 유지보수 건수: {ai_total_records}\n"
                    f"누적 비용: {ai_total_cost:,.0f}원\n"
                    f"월별 비용: {ai_monthly_costs}\n"
                    f"반복 고장 자산: {', '.join(repeated_names) if repeated_names else '없음'}\n"
                    f"고장 유형 빈도: {failure_patterns}"
                )
                llm_result = llm.ask_json(_MAINTENANCE_SYSTEM_PROMPT, summary_input, _MAINTENANCE_ANALYSIS_SCHEMA, effort="medium")
                ai_analysis = llm_result.get("analysis", ai_analysis)
            except Exception:
                logger.warning("유지보수 분석 AI 서술 생성 실패, 규칙 기반 문구 유지", exc_info=True)

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


@router.get("/maintenance-analysis/failure-assets")
def get_assets_by_failure_type(
    failureType: str,
    db: Session = Depends(get_db),
    startMonth: Optional[str] = None,
    endMonth: Optional[str] = None,
):
    records = (
        db.query(models.MaintenanceRecord)
        .filter(models.MaintenanceRecord.failure_type == failureType)
        .all()
    )
    records = [r for r in records if _in_month_range(r, startMonth, endMonth)]

    occurrence_count: dict = {}
    for r in records:
        occurrence_count[r.asset_id] = occurrence_count.get(r.asset_id, 0) + 1

    assets = (
        db.query(models.Asset).filter(models.Asset.id.in_(occurrence_count.keys())).all()
        if occurrence_count
        else []
    )

    result = [
        {**asset_to_dto(a), "occurrenceCount": occurrence_count.get(a.id, 0)}
        for a in assets
    ]
    result.sort(key=lambda a: -a["occurrenceCount"])

    return {"success": True, "message": None, "data": result}
