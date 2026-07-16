import io
import json
import logging
import re
from datetime import date
from typing import Optional
from xml.sax.saxutils import escape as xml_escape

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import llm, models, schemas
from ..database import get_db
from ..scoring import calc_used_years, compute_replacement_metrics
from .assets import asset_to_dto

_KOREAN_FONT = "HYGothic-Medium"

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
        "minPrice": {
            "type": ["number", "null"],
            "description": (
                "'~원 이상', '~만원 이상', '~보다 비싼' 같은 최소 구매가 조건이 있으면 그 금액을 "
                "원 단위로 환산해 반환 (예: '100만원 이상' → 1000000). 조건이 없으면 null."
            ),
        },
        "maxPrice": {
            "type": ["number", "null"],
            "description": (
                "'~원 이하', '~만원 이하', '~보다 싼/저렴한' 같은 최대 구매가 조건이 있으면 그 금액을 "
                "원 단위로 환산해 반환 (예: '100만원 이하' → 1000000). 조건이 없으면 null."
            ),
        },
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
        "category", "location", "keyword", "minUsedYears", "maxUsedYears", "minPrice", "maxPrice",
        "statusFilter", "failureKeyword", "minFailureCount", "minMaintenanceCount", "noRepairHistory",
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
    "noMaintenanceHistory를 true로 설정한다. 구매가 관련 이상/이하 조건이 있으면 minPrice/maxPrice에 "
    "원 단위 금액으로 정확히 추출한다 (실제 비교는 별도 로직이 수행하므로 여기서는 조건 자체만 "
    "숫자로 추출하면 된다)."
)


_REPAIR_TYPES = (models.MaintenanceType.REPAIR, models.MaintenanceType.REPLACEMENT)


def _apply_filter(asset: models.Asset, f: dict, records: Optional[list] = None) -> bool:
    if f.get("category") and f["category"].lower() not in (asset.category or "").lower():
        return False
    if f.get("location") and f["location"].lower() not in (asset.location or "").lower():
        return False
    if f.get("keyword") and f["keyword"].lower() not in (asset.asset_name or "").lower():
        return False
    used_years = calc_used_years(asset.purchase_date)
    if f.get("minUsedYears") is not None and used_years < f["minUsedYears"]:
        return False
    if f.get("maxUsedYears") is not None and used_years > f["maxUsedYears"]:
        return False
    price = float(asset.purchase_price) if asset.purchase_price is not None else 0.0
    if f.get("minPrice") is not None and price < f["minPrice"]:
        return False
    if f.get("maxPrice") is not None and price > f["maxPrice"]:
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
    "category", "location", "keyword", "minUsedYears", "maxUsedYears", "minPrice", "maxPrice",
    "statusFilter", "failureKeyword", "minMaintenanceCount", "noRepairHistory", "noMaintenanceHistory",
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
    # 원 단위 금액이라 소수점이 나오면 안 되는데, 단순 나눗셈 결과를 그대로 두면
    # 프론트엔드의 toLocaleString()이 기본값으로 소수점 3자리까지 표시해버린다.
    average_cost = float(round(total_cost / total_records)) if total_records else 0.0

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


# ---------------------------------------------------------------------------
# 5. AI 기반 유지보수 작업 지시서 생성/조회
# ---------------------------------------------------------------------------

_WORK_ORDER_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "description": "작업 지시서 제목 (예: [작업 지시서] 에어컨 냉매 누출 조치)"},
        "steps": {
            "type": "array",
            "items": {"type": "string"},
            "description": "수리 또는 교체 조치를 위한 단계별 상세 수행 가이드"
        },
        "requiredTools": {
            "type": "array",
            "items": {"type": "string"},
            "description": "작업에 필요한 도구, 공구, 교체 부품 등"
        },
        "safetyPrecautions": {
            "type": "array",
            "items": {"type": "string"},
            "description": "작업 시 지켜야 할 안전 주의사항"
        },
        "estimatedTime": {"type": "string", "description": "예상 작업 시간 (예: '1시간 30분', '2시간')"}
    },
    "required": ["title", "steps", "requiredTools", "safetyPrecautions", "estimatedTime"],
    "additionalProperties": False
}

_WORK_ORDER_SYSTEM_PROMPT = (
    "당신은 공공기관 자산 유지보수 전문가 AI다. 아래 입력되는 자산 정보와 고장 증상/정비 내용을 바탕으로 "
    "실무 정비사가 현장에서 바로 보며 안전하고 정확하게 수리/조치할 수 있는 단계별 '작업 지시서(Standard Work Order)'를 한국어로 작성한다."
)


@router.get("/work-orders/{maintenance_record_id}", response_model=schemas.WorkOrderResponse)
def get_or_create_work_order(maintenance_record_id: int, db: Session = Depends(get_db)):
    # 1. 기존 지시서가 있는지 조회
    wo = db.query(models.WorkOrder).filter(models.WorkOrder.maintenance_record_id == maintenance_record_id).first()
    if wo:
        return schemas.WorkOrderResponse(
            id=wo.id,
            maintenanceRecordId=wo.maintenance_record_id,
            title=wo.title,
            steps=json.loads(wo.steps),
            requiredTools=json.loads(wo.required_tools) if wo.required_tools else [],
            safetyPrecautions=json.loads(wo.safety_precautions) if wo.safety_precautions else [],
            estimatedTime=wo.estimated_time,
            createdAt=wo.created_at
        )

    # 2. 없으면 유지보수 기록 조회 및 관련 자산 정보 수집
    record = db.query(models.MaintenanceRecord).filter(models.MaintenanceRecord.id == maintenance_record_id).first()
    if not record:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Maintenance record not found")

    asset = db.query(models.Asset).filter(models.Asset.id == record.asset_id).first()
    asset_info = f"자산명: {asset.asset_name if asset else '알수없음'}, 카테고리: {asset.category if asset else '알수없음'}, 위치: {asset.location if asset else '알수없음'}"
    record_info = f"고장유형: {record.failure_type or '없음'}, 정비유형: {record.maintenance_type.value}, 내용: {record.description or ''}"

    # LLM 호출하여 지시서 생성
    if not llm.is_configured():
        wo_title = f"[작업 지시서] {record.failure_type or '유지보수'} 조치 가이드"
        wo_steps = [
            "현장 방문 및 대상 기기 육안 검사 실시",
            "기기의 전원/연결부 해제 확인",
            "증상 관련 부품 점검 및 수리/교체 조치",
            "기기 재가동 테스트 및 점검 이력 서명"
        ]
        wo_tools = ["기본 수공구 세트", "멀티테스터기"]
        wo_safety = ["작업 전 반드시 기기 전원 차단 확인", "안전 장갑 및 안전화 착용"]
        wo_time = "1시간"
    else:
        try:
            prompt = f"자산 정보: {asset_info}\n유지보수 기록 정보: {record_info}"
            res = llm.ask_json(_WORK_ORDER_SYSTEM_PROMPT, prompt, _WORK_ORDER_SCHEMA, effort="medium")
            wo_title = res.get("title") or f"[작업 지시서] {record.failure_type or '유지보수'} 조치 가이드"
            wo_steps = res.get("steps") or ["현장 점검", "조치 수행"]
            wo_tools = res.get("requiredTools") or []
            wo_safety = res.get("safetyPrecautions") or []
            wo_time = res.get("estimatedTime") or "1시간"
        except Exception:
            logger.warning("AI 작업 지시서 생성 실패, 기본 템플릿 사용", exc_info=True)
            wo_title = f"[작업 지시서] {record.failure_type or '유지보수'} 조치 가이드"
            wo_steps = [
                "현장 방문 및 대상 기기 육안 검사 실시",
                "기기의 전원/연결부 해제 확인",
                "증상 관련 부품 점검 및 수리/교체 조치",
                "기기 재가동 테스트 및 점검 이력 서명"
            ]
            wo_tools = ["기본 수공구 세트"]
            wo_safety = ["작업 전 반드시 기기 전원 차단 확인"]
            wo_time = "1시간"

    # DB에 저장
    wo_obj = models.WorkOrder(
        maintenance_record_id=maintenance_record_id,
        title=wo_title,
        steps=json.dumps(wo_steps, ensure_ascii=False),
        required_tools=json.dumps(wo_tools, ensure_ascii=False),
        safety_precautions=json.dumps(wo_safety, ensure_ascii=False),
        estimated_time=wo_time
    )
    db.add(wo_obj)
    try:
        db.commit()
    except IntegrityError:
        # 동시에 같은 유지보수 기록에 대해 두 요청이 들어와 둘 다 "없음"으로 확인하고
        # 생성을 시도한 경우: 먼저 커밋된 쪽을 그대로 반환한다 (unique 제약 위반은 500이 아니라
        # 이미 생성된 지시서를 조회해 정상 응답하도록 처리).
        db.rollback()
        wo = db.query(models.WorkOrder).filter(models.WorkOrder.maintenance_record_id == maintenance_record_id).first()
        return schemas.WorkOrderResponse(
            id=wo.id,
            maintenanceRecordId=wo.maintenance_record_id,
            title=wo.title,
            steps=json.loads(wo.steps),
            requiredTools=json.loads(wo.required_tools) if wo.required_tools else [],
            safetyPrecautions=json.loads(wo.safety_precautions) if wo.safety_precautions else [],
            estimatedTime=wo.estimated_time,
            createdAt=wo.created_at
        )
    db.refresh(wo_obj)

    return schemas.WorkOrderResponse(
        id=wo_obj.id,
        maintenanceRecordId=wo_obj.maintenance_record_id,
        title=wo_obj.title,
        steps=wo_steps,
        requiredTools=wo_tools,
        safetyPrecautions=wo_safety,
        estimatedTime=wo_obj.estimated_time,
        createdAt=wo_obj.created_at
    )


# ---------------------------------------------------------------------------
# 6. AI 차년도 예산 예측
# ---------------------------------------------------------------------------

_FORECAST_SCHEMA = {
    "type": "object",
    "properties": {
        "forecastYear": {"type": "integer", "description": "예측 대상 연도 (예: 2026)"},
        "monthlyForecast": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "month": {"type": "integer", "description": "월 (1~12)"},
                    "amount": {"type": "number", "description": "예측 유지보수 지출액 (원)"},
                    "reason": {"type": "string", "description": "해당 월 예측 근거 (예: 겨울철 난방기 수리비 증가)"}
                },
                "required": ["month", "amount", "reason"],
                "additionalProperties": False
            }
        },
        "rationale": {"type": "string", "description": "차년도 전체 예산 예측 분석 총평 및 핵심 근거"}
    },
    "required": ["forecastYear", "monthlyForecast", "rationale"],
    "additionalProperties": False
}

_FORECAST_SYSTEM_PROMPT = (
    "당신은 공공기관 자산관리 회계 AI다. 제공되는 과거 연월별 유지보수 지출 이력 통계와 현재 등록된 자산 목록(노후화 정도)을 바탕으로, "
    "다음 연도의 월별 유지보수 예산 소요액(1월~12월)을 합리적으로 예측하여 한국어로 근거와 분석 결과를 제시한다."
)


def _fallback_monthly_forecast(cost_by_month: dict) -> list:
    """월별 과거 데이터가 1건뿐이라 그 값이 그대로 예측치가 되어버리는 것을 막기 위해,
    전체 월 평균을 기준선으로 삼고 각 월의 실적이 있으면 기준선과 절반씩 섞어 완만하게 반영한다."""
    all_costs = list(cost_by_month.values())
    overall_avg = sum(all_costs) / len(all_costs) if all_costs else 1000000.0

    monthly_items = []
    for m in range(1, 13):
        past_months_costs = [v for k, v in cost_by_month.items() if k.endswith(f"-{m:02d}")]
        if len(past_months_costs) >= 2:
            base = sum(past_months_costs) / len(past_months_costs)
            reason = f"과거 {m}월 지출 실적 평균 대비 인플레이션 및 장비 노후화 보정"
        elif len(past_months_costs) == 1:
            # 표본이 1건뿐이면 그 값에 전체 요구치를 매몰시키지 않도록 전체 평균과 절반씩 섞는다.
            base = (past_months_costs[0] + overall_avg) / 2
            reason = f"{m}월 과거 실적이 1건뿐이라 전체 평균과 절반씩 반영해 이상치 영향을 완화"
        else:
            base = overall_avg
            reason = f"{m}월 과거 실적이 없어 전체 월평균 지출을 기준으로 산정"
        amount = round(base * 1.05, -4)  # 5% 상승 및 만원단위 반올림
        monthly_items.append(schemas.BudgetForecastItem(month=m, amount=amount, reason=reason))
    return monthly_items


@router.get("/budgets/forecast", response_model=schemas.BudgetForecastResponse)
def get_budget_forecast(db: Session = Depends(get_db)):
    all_records = db.query(models.MaintenanceRecord).all()
    all_assets = db.query(models.Asset).all()

    # 과거 월별 비용 분석
    cost_by_month: dict = {}
    for r in all_records:
        key = f"{r.maintenance_date.year}-{r.maintenance_date.month:02d}"
        cost_by_month[key] = cost_by_month.get(key, 0.0) + (float(r.cost) if r.cost is not None else 0.0)
    cost_by_month = dict(sorted(cost_by_month.items()))

    # 자산 카테고리 정보 및 노후도(내용연수 초과 대수) - simulate_budget과 동일한 방식으로 집계
    today = date.today()
    asset_summary = {}
    expired_by_cat = {}
    for a in all_assets:
        asset_summary[a.category] = asset_summary.get(a.category, 0) + 1
        used_years = calc_used_years(a.purchase_date, today)
        if used_years > a.useful_life:
            expired_by_cat[a.category] = expired_by_cat.get(a.category, 0) + 1

    forecast_year = date.today().year + 1

    if not llm.is_configured() or not all_records:
        # LLM 미설정 또는 과거 이력 부재 시의 폴백 규칙 기반 계산
        return schemas.BudgetForecastResponse(
            forecastYear=forecast_year,
            monthlyForecast=_fallback_monthly_forecast(cost_by_month),
            rationale="과거 데이터 실적을 기반으로 5%의 안전율을 적용해 수립한 예측안입니다."
        )

    try:
        prompt = (
            f"과거 월별 지출 현황: {cost_by_month}\n"
            f"카테고리별 자산 보유 대수: {asset_summary}\n"
            f"카테고리별 내용연수 초과(노후) 자산 대수: {expired_by_cat}\n"
            f"예측 대상 연도: {forecast_year}년"
        )
        res = llm.ask_json(_FORECAST_SYSTEM_PROMPT, prompt, _FORECAST_SCHEMA, effort="medium")
        by_month = {
            item["month"]: schemas.BudgetForecastItem(
                month=item["month"],
                amount=round(item["amount"], -4),
                reason=item["reason"],
            )
            for item in res.get("monthlyForecast", [])
            if isinstance(item.get("month"), int) and 1 <= item["month"] <= 12
        }
        # LLM이 12개월 중 일부를 누락하면, 그 달만 규칙 기반 값으로 채워 넣는다
        # (전체를 폐기하고 폴백으로 되돌리는 대신, 실제로 온 데이터는 최대한 살린다).
        if len(by_month) < 12:
            fallback_by_month = {item.month: item for item in _fallback_monthly_forecast(cost_by_month)}
            for m in range(1, 13):
                if m not in by_month:
                    by_month[m] = fallback_by_month[m]
        monthly_forecast = [by_month[m] for m in range(1, 13)]
        return schemas.BudgetForecastResponse(
            forecastYear=res.get("forecastYear") or forecast_year,
            monthlyForecast=monthly_forecast,
            rationale=res.get("rationale") or "AI 예측 분석 결과입니다."
        )
    except Exception:
        logger.warning("AI 예산 예측 생성 실패, 폴백 규칙 적용", exc_info=True)
        return schemas.BudgetForecastResponse(
            forecastYear=forecast_year,
            monthlyForecast=_fallback_monthly_forecast(cost_by_month),
            rationale="AI 예측 API 실패로 인해 과거 실적 평균 기반 5% 상승분을 적용해 산출한 백업용 예산 예측 결과입니다."
        )


# ---------------------------------------------------------------------------
# 7. AI 예산 최적화 시뮬레이터
# ---------------------------------------------------------------------------

_SIMULATE_SCHEMA = {
    "type": "object",
    "properties": {
        "allocations": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "category": {"type": "string", "description": "자산 카테고리"},
                    "allocatedAmount": {"type": "number", "description": "배정 예산액 (원)"},
                    "ratio": {"type": "number", "description": "전체 예산 중 비율 (0~1)"},
                    "reason": {"type": "string", "description": "이 카테고리에 해당 예산을 배정한 상세 재무/노후 근거"}
                },
                "required": ["category", "allocatedAmount", "ratio", "reason"],
                "additionalProperties": False
            }
        },
        "totalAllocated": {"type": "number", "description": "배정된 예산 총합 (원)"},
        "summary": {"type": "string", "description": "전체 예산 배분 시뮬레이션 총평"}
    },
    "required": ["allocations", "totalAllocated", "summary"],
    "additionalProperties": False
}

def _clamp_allocations_to_budget(allocations: list, total_budget: float) -> list:
    """LLM/폴백 계산 결과의 합이 total_budget을 넘는 경우를 대비한 최종 안전장치.

    LLM은 "상한액을 넘지 마라"는 지시를 프롬프트로만 전달해도 자주 어기므로,
    코드 레벨에서 총합이 상한액을 초과하면 비율을 유지한 채로 전체를 비례 축소한다.
    """
    if total_budget <= 0 or not allocations:
        return allocations
    current_total = sum(item.allocatedAmount for item in allocations)
    if current_total <= total_budget or current_total <= 0:
        return allocations
    scale = total_budget / current_total
    for item in allocations:
        item.allocatedAmount = round(item.allocatedAmount * scale, -4)

    # 비례 축소 후에도 항목별로 만원 단위 반올림을 거치면 합계가 다시 total_budget을
    # 넘을 수 있다 (이 함수가 보장하려는 "총합 <= 예산" 불변식이 반올림 때문에 깨짐).
    # 배정액이 가장 큰 항목부터 1만원 단위로 초과분을 차감해 최종 합계가 반드시
    # total_budget 이하가 되도록 재보정한다.
    overflow = sum(item.allocatedAmount for item in allocations) - total_budget
    if overflow > 0:
        for item in sorted(allocations, key=lambda i: i.allocatedAmount, reverse=True):
            if overflow <= 0:
                break
            reduce_amount = min(item.allocatedAmount, ((overflow + 9999) // 10000) * 10000)
            item.allocatedAmount -= reduce_amount
            overflow -= reduce_amount

    for item in allocations:
        item.ratio = item.allocatedAmount / total_budget if total_budget > 0 else 0.0
    return allocations


_SIMULATE_SYSTEM_PROMPT = (
    "당신은 공공기관 자산 예산 기획 AI다. 주어진 전체 예산 상한액과 카테고리별 자산 보유량, 내용연수 도달율, "
    "과거 수리비 지출 비중 데이터를 분석하여, 각 카테고리별로 예산을 가장 시급하고 경제적으로 배분하는 최적의 시뮬레이션을 생성한다. "
    "총 배정 금액은 상한액을 넘지 않아야 하며, 비율의 합은 1.0에 가까워야 한다."
)


@router.post("/budgets/simulate", response_model=schemas.BudgetSimulationResponse)
def simulate_budget(request: schemas.BudgetSimulationRequest, db: Session = Depends(get_db)):
    total_budget = request.totalBudget
    all_assets = db.query(models.Asset).all()
    all_records = db.query(models.MaintenanceRecord).all()

    # 카테고리는 고정 8종이 아니라(엑셀 일괄 등록 등으로 다른 이름의 카테고리가 들어올 수 있음),
    # 실제 등록된 자산의 카테고리를 그대로 사용한다. 그래야 표준 8종에 안 맞는 자산도
    # 조용히 누락되지 않고 예산 배분 계산에 포함된다 (get_budget_forecast와 동일한 방식).
    categories = sorted({a.category for a in all_assets if a.category})

    if not categories:
        return schemas.BudgetSimulationResponse(
            allocations=[],
            totalAllocated=0.0,
            summary="등록된 자산이 없어 카테고리별로 배분할 대상이 없습니다.",
        )

    asset_by_cat: dict = {cat: 0 for cat in categories}
    cost_by_cat: dict = {cat: 0.0 for cat in categories}
    expired_by_cat: dict = {cat: 0 for cat in categories}

    today = date.today()
    for a in all_assets:
        if not a.category:
            continue
        asset_by_cat[a.category] += 1
        used_years = calc_used_years(a.purchase_date, today)
        if used_years > a.useful_life:
            expired_by_cat[a.category] += 1

    asset_by_id = {a.id: a for a in all_assets}
    for r in all_records:
        asset = asset_by_id.get(r.asset_id)
        if asset and asset.category:
            cost_by_cat[asset.category] += float(r.cost or 0.0)

    if not llm.is_configured():
        allocations = []
        total_weight = 0.0
        weights = {}
        for cat in categories:
            cost_weight = cost_by_cat[cat]
            expired_weight = expired_by_cat[cat] * 1000000.0
            w = cost_weight + expired_weight + 500000.0
            weights[cat] = w
            total_weight += w

        for cat in categories:
            ratio = weights[cat] / total_weight if total_weight > 0 else (1.0 / len(categories))
            amount = round(total_budget * ratio, -4)
            allocations.append(schemas.CategoryAllocation(
                category=cat,
                allocatedAmount=amount,
                ratio=ratio,
                reason=f"보유 기기 {asset_by_cat[cat]}대(노후 {expired_by_cat[cat]}대) 및 과거 누적 수리비 {cost_by_cat[cat]:,.0f}원에 근거한 최적 배분"
            ))
        allocations = _clamp_allocations_to_budget(allocations, total_budget)
        return schemas.BudgetSimulationResponse(
            allocations=allocations,
            totalAllocated=sum(item.allocatedAmount for item in allocations),
            summary=f"과거 지출 가중치 및 내용연수 초과 기기 현황을 기준으로 총 {total_budget:,.0f}원을 합리적으로 자동 배분한 시뮬레이션입니다."
        )

    try:
        prompt = (
            f"전체 가용 예산: {total_budget:,.0f}원\n"
            f"카테고리별 자산 대수: {asset_by_cat}\n"
            f"카테고리별 내용연수 초과 자산 대수: {expired_by_cat}\n"
            f"카테고리별 과거 수리비 누적액: {cost_by_cat}"
        )
        res = llm.ask_json(_SIMULATE_SYSTEM_PROMPT, prompt, _SIMULATE_SCHEMA, effort="medium")
        allocations = [
            schemas.CategoryAllocation(
                category=item["category"],
                allocatedAmount=round(item["allocatedAmount"], -4),
                ratio=item["ratio"],
                reason=item["reason"]
            )
            for item in res.get("allocations", [])
        ]
        allocations = _clamp_allocations_to_budget(allocations, total_budget)
        return schemas.BudgetSimulationResponse(
            allocations=allocations,
            totalAllocated=sum(item.allocatedAmount for item in allocations),
            summary=res.get("summary") or "AI 예산 시뮬레이션 결과입니다."
        )
    except Exception:
        logger.warning("AI 예산 시뮬레이션 호출 실패, 폴백 적용", exc_info=True)
        allocations = []
        total_weight = 0.0
        weights = {}
        for cat in categories:
            w = cost_by_cat[cat] + (expired_by_cat[cat] * 1000000.0) + 500000.0
            weights[cat] = w
            total_weight += w
        for cat in categories:
            ratio = weights[cat] / total_weight if total_weight > 0 else (1.0 / len(categories))
            amount = round(total_budget * ratio, -4)
            allocations.append(schemas.CategoryAllocation(
                category=cat,
                allocatedAmount=amount,
                ratio=ratio,
                reason=f"과거 수리비 지출 및 노후 장비 비율에 따른 비율 배정 ({ratio*100:.1f}%)"
            ))
        allocations = _clamp_allocations_to_budget(allocations, total_budget)
        return schemas.BudgetSimulationResponse(
            allocations=allocations,
            totalAllocated=sum(item.allocatedAmount for item in allocations),
            summary="AI 시뮬레이터 연동 장애로 인해 과거 지출 비중 기반의 가중치로 대체 계산된 최적 예산 시뮬레이션 결과입니다."
        )
_PROCUREMENT_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "description": "조달 규격서 제목"},
        "specifications": {"type": "string", "description": "마크다운 형식의 기술 규격 사양서 본문"},
        "rfp": {"type": "string", "description": "마크다운 형식의 제안요청서(RFP) 본문"},
        "budgetEstimate": {"type": "number", "description": "예상 조달 예산 (원)"},
        "rationale": {"type": "string", "description": "예산 산정 근거 및 분석 총평"}
    },
    "required": ["title", "specifications", "rfp", "budgetEstimate", "rationale"],
    "additionalProperties": False
}

_PROCUREMENT_SYSTEM_PROMPT = (
    "당신은 대한민국 공공기관의 자산 구매 조달 및 제안요청서(RFP) 기획 AI다. 주어진 자산 모델의 상세 사양과 취득 단가 등을 분석하여, "
    "나라장터(G2B) 규격에 부합하는 조달 구매 기술 규격 사양서와 제안요청서(RFP)를 한국어로 자동 작성하고 예상 조달 예산을 산정한다."
)


def _generate_procurement_spec(asset: models.Asset) -> schemas.ProcurementSpecResponse:
    if not llm.is_configured():
        title = f"[조달 구매 규격서] {asset.asset_name} 대체 장비 도입"
        specifications = (
            f"## 1. 개요\n본 규격서는 노후 자산 `{asset.asset_code}`({asset.asset_name})의 대체를 위한 신규 구매 장비 사양을 정의한다.\n\n"
            f"## 2. 세부 사양\n* 카테고리: {asset.category}\n* 권장 사양: {asset.description or '기존 장비 사양 동등 이상'}\n* 내용연수 기준: {asset.useful_life}년 이상 작동 보증"
        )
        rfp = (
            f"## 제안요청서(RFP)\n\n"
            f"* **사업명**: {asset.asset_name} 교체 조달 구매 사업\n"
            f"* **납품 장소**: {asset.location}\n"
            f"* **제안 요구사항**: 기존 설치 장비의 철거 및 신규 장비의 안정적 설치, 하자 보증 1년 제공."
        )
        return schemas.ProcurementSpecResponse(
            title=title,
            specifications=specifications,
            rfp=rfp,
            budgetEstimate=float(asset.purchase_price) * 1.15 if asset.purchase_price else 1500000.0,
            rationale="AI 모델 미설정으로 인해 기존 장비 취득가 대비 물가상승분(15%)을 적용해 자동 조달 예산을 모의 산정했습니다."
        )

    try:
        prompt = (
            f"기존 자산 이름: {asset.asset_name}\n"
            f"자산 코드: {asset.asset_code}\n"
            f"카테고리: {asset.category}\n"
            f"구매 가격: {asset.purchase_price:,.0f}원\n"
            f"기본 설명 및 스펙: {asset.description or '없음'}"
        )
        res = llm.ask_json(_PROCUREMENT_SYSTEM_PROMPT, prompt, _PROCUREMENT_SCHEMA, effort="medium")
        return schemas.ProcurementSpecResponse(
            title=res.get("title") or f"[조달 규격] {asset.asset_name} 교체 조달",
            specifications=res.get("specifications") or "사양이 생성되지 않았습니다.",
            rfp=res.get("rfp") or "RFP가 생성되지 않았습니다.",
            budgetEstimate=res.get("budgetEstimate") or (float(asset.purchase_price) * 1.15),
            rationale=res.get("rationale") or "AI 분석 결과입니다."
        )
    except Exception:
        logger.warning("AI 조달 규격서 생성 실패, 폴백 템플릿 적용", exc_info=True)
        return schemas.ProcurementSpecResponse(
            title=f"[조달 규격] {asset.asset_name} 신규 구매 규격서",
            specifications=f"## 1. 대상 장비\n* 품명: {asset.asset_name}\n* 기존 사양: {asset.description or 'N/A'}",
            rfp=f"## 제안요청서\n* 기존 장비의 교체를 위한 구매 입찰.",
            budgetEstimate=float(asset.purchase_price) * 1.15 if asset.purchase_price else 1500000.0,
            rationale="AI API 호출 장애로 백업용 템플릿이 반환되었습니다."
        )


@router.get("/procurement-spec/{asset_id}", response_model=schemas.ProcurementSpecResponse)
def generate_procurement_spec(asset_id: int, db: Session = Depends(get_db)):
    asset = db.query(models.Asset).filter(models.Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return _generate_procurement_spec(asset)


def _md_inline_to_xml(text: str) -> str:
    escaped = xml_escape(text or "")
    return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", escaped)


def _markdown_to_flowables(text: str, heading_style, subheading_style, body_style, bullet_style):
    elements = []
    for raw_line in (text or "").split("\n"):
        line = raw_line.strip()
        if not line:
            elements.append(Spacer(1, 2 * mm))
        elif line.startswith("### "):
            elements.append(Paragraph(_md_inline_to_xml(line[4:]), subheading_style))
        elif line.startswith("## "):
            elements.append(Paragraph(_md_inline_to_xml(line[3:]), subheading_style))
        elif line.startswith("# "):
            elements.append(Paragraph(_md_inline_to_xml(line[2:]), heading_style))
        elif line.startswith("- ") or line.startswith("* "):
            elements.append(Paragraph(f"• {_md_inline_to_xml(line[2:])}", bullet_style))
        else:
            elements.append(Paragraph(_md_inline_to_xml(line), body_style))
    return elements


def _build_procurement_spec_pdf(asset: models.Asset, spec: schemas.ProcurementSpecResponse) -> bytes:
    if _KOREAN_FONT not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(UnicodeCIDFont(_KOREAN_FONT))

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=20 * mm, bottomMargin=20 * mm)
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle("PsTitle", parent=styles["Title"], fontName=_KOREAN_FONT, fontSize=16)
    heading_style = ParagraphStyle("PsHeading", parent=styles["Heading2"], fontName=_KOREAN_FONT, fontSize=13, spaceBefore=10, spaceAfter=6)
    subheading_style = ParagraphStyle("PsSubHeading", parent=styles["Heading3"], fontName=_KOREAN_FONT, fontSize=11, spaceBefore=8, spaceAfter=4)
    body_style = ParagraphStyle("PsBody", parent=styles["BodyText"], fontName=_KOREAN_FONT, fontSize=9.5, leading=14)
    bullet_style = ParagraphStyle("PsBullet", parent=body_style, leftIndent=10 * mm)

    elements = [
        Paragraph(_md_inline_to_xml(spec.title), title_style),
        Paragraph(f"자산코드: {asset.asset_code} | 예상 도입 사업비: {spec.budgetEstimate:,.0f}원", body_style),
        Spacer(1, 6 * mm),
        Paragraph("규격 설계 및 예산 근거", heading_style),
        Paragraph(_md_inline_to_xml(spec.rationale), body_style),
        Spacer(1, 6 * mm),
        Paragraph("1. 조달 기술 규격 사양서", heading_style),
        *_markdown_to_flowables(spec.specifications, heading_style, subheading_style, body_style, bullet_style),
        Spacer(1, 6 * mm),
        Paragraph("2. 조달 제안요청서(RFP)", heading_style),
        *_markdown_to_flowables(spec.rfp, heading_style, subheading_style, body_style, bullet_style),
    ]

    doc.build(elements)
    return buffer.getvalue()


@router.post("/procurement-spec/{asset_id}/pdf")
def generate_procurement_spec_pdf(asset_id: int, spec: schemas.ProcurementSpecResponse, db: Session = Depends(get_db)):
    asset = db.query(models.Asset).filter(models.Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    # 화면에 이미 표시된 규격서 데이터를 그대로 PDF로 변환한다 (AI 재호출 없음 → 화면 내용과 100% 일치, 지연/비용 절감).
    pdf_bytes = _build_procurement_spec_pdf(asset, spec)
    filename = f"procurement-spec-{asset.asset_code}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# 9. AI 기반 자산별 고장 진단 및 조치 가이드 챗봇
# ---------------------------------------------------------------------------

_DIAGNOSE_SYSTEM_PROMPT = (
    "당신은 공공기관 시설/장비 전문 정비 AI 엔지니어다. 기기의 상세 정보와 과거 수리 이력이 제공되면, "
    "정비사가 호소하는 고장 증상에 맞춰 과거 사례와 연계하여 최적의 해결책(점검 순서, 필수 교체 자재 등)을 대화형으로 친절하게 답변하라. "
    "답변은 아주 읽기 쉽게 마크다운과 순서번호(1., 2.)를 활용해 줄바꿈을 자주 하여 작성하라."
)


@router.post("/diagnose")
def diagnose_asset_failure(request: schemas.DiagnosticsRequest, db: Session = Depends(get_db)):
    asset = db.query(models.Asset).filter(models.Asset.id == request.assetId).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    maint_records = db.query(models.MaintenanceRecord).filter(models.MaintenanceRecord.asset_id == asset.id).all()
    records_str = ""
    for idx, r in enumerate(maint_records):
        cost_str = f"{float(r.cost):,.0f}원" if r.cost is not None else "비용 미기재"
        records_str += f"[{idx+1}] 날짜: {r.maintenance_date}, 유형: {r.maintenance_type.value}, 비용: {cost_str}, 설명: {r.description or ''}\n"

    last_user_msg = request.chatHistory[-1].content if request.chatHistory else ""

    # Build prompt
    prompt = (
        f"대상 기기: {asset.asset_name} (코드: {asset.asset_code}, 카테고리: {asset.category})\n"
        f"장비 상세 설명: {asset.description or '없음'}\n"
        f"과거 정비 이력 목록:\n{records_str or '없음'}\n\n"
    )

    # Append chat history
    prompt += "=== 대화 기록 ===\n"
    for msg in request.chatHistory[:-1]:
        prompt += f"{msg.role}: {msg.content}\n"
    prompt += f"정비사(사용자) 질문: {last_user_msg}\n"

    if not llm.is_configured():
        matched_records = [r for r in maint_records if r.description and any(w in r.description for w in last_user_msg.split())]
        if matched_records:
            reply = (
                f"과거 정비 이력에서 유사한 키워드가 포함된 {len(matched_records)}건의 사례를 발견했습니다.\n\n"
                f"**추천 조치 사항**:\n"
            )
            for r in matched_records[:2]:
                cost_str = f"{float(r.cost):,.0f}원" if r.cost is not None else "비용 미기재"
                reply += f"* {r.maintenance_date} 수리 이력: \"{r.description}\" (비용: {cost_str})\n"
            reply += "\n위 사례의 조치 내역을 먼저 검토해 주시기 바라며, 기본적으로 기기 전원 공급 장치와 단자 결합부 접촉 상태를 가장 먼저 확인하는 것을 권장합니다."
        else:
            reply = (
                f"안녕하세요. {asset.asset_name} 기기 정비 챗봇입니다. 현재 AI 서비스 점검 중으로 폴백 답변을 드립니다.\n\n"
                f"기종: {asset.category} ({asset.asset_code})\n"
                f"**기본 점검 가이드**:\n"
                f"1. 전원선 연결 상태 및 배전판 스위치가 켜져 있는지 확인하십시오.\n"
                f"2. 과거 수리 이력 중 수리 유형이 `{asset.status}` 상태와 연관이 깊은지 확인하십시오.\n"
                f"3. 증상이 지속되는 경우 제조사 서비스 센터 또는 전문 정비 부서로 이관을 권장합니다."
            )
        return StreamingResponse(iter([reply]), media_type="text/plain; charset=utf-8")

    def _stream():
        streamed_any = False
        try:
            for piece in llm.ask_text_stream(_DIAGNOSE_SYSTEM_PROMPT, prompt):
                streamed_any = True
                yield piece
        except Exception:
            logger.warning("AI 고장 진단 Q&A 호출 실패, 폴백 적용", exc_info=True)
            # 이미 일부 답변이 스트리밍된 뒤에 오류가 나면, 폴백 문구를 바로 이어붙이지 않고
            # 줄바꿈으로 분리해 두 내용이 한 문장처럼 뒤섞여 보이지 않게 한다.
            prefix = "\n\n---\n" if streamed_any else ""
            yield f"{prefix}AI 엔진 통신 중 오류가 발생하여 기본 점검 모드로 자동 전환되었습니다.\n\n기기의 입출력 단자 상태와 배선 상태를 우선적으로 육안 검사해 주시기 바랍니다."

    return StreamingResponse(_stream(), media_type="text/plain; charset=utf-8")
