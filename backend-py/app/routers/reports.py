import io
import logging
from datetime import date, datetime

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from sqlalchemy.orm import Session

from .. import llm, models
from ..database import get_db
from ..scoring import compute_replacement_metrics

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/reports", tags=["reports"])

_KOREAN_FONT = "HYGothic-Medium"
pdfmetrics.registerFont(UnicodeCIDFont(_KOREAN_FONT))


_REPORT_SCHEMA = {
    "type": "object",
    "properties": {
        "executiveSummary": {"type": "string", "description": "이번 달 자산/유지보수 현황에 대한 한국어 총평 3~4문장. 구체적 수치를 반드시 인용"},
        "keyIssues": {
            "type": "array",
            "items": {"type": "string"},
            "minItems": 3,
            "description": "주요 문제점 최소 3개 이상. 각 항목은 특정 자산명/코드, 금액, 비율 등 구체적 근거를 한 문장에 포함해야 함",
        },
        "recommendations": {
            "type": "array",
            "items": {"type": "string"},
            "minItems": 3,
            "description": "향후 관리 권장사항 최소 3개 이상. 각 항목은 관리자가 바로 실행 가능한 구체적 행동을 한 문장으로 제시",
        },
    },
    "required": ["executiveSummary", "keyIssues", "recommendations"],
    "additionalProperties": False,
}

_REPORT_SYSTEM_PROMPT = (
    "당신은 공공기관 자산관리 AI 보고서 작성자다. 아래 제공되는 자산 현황, 카테고리별/월별 유지보수 비용, "
    "반복 고장 자산 목록, 교체 추천 데이터를 바탕으로 월간 보고서에 들어갈 총평, 주요 문제점, 향후 관리 "
    "권장사항을 한국어로 작성한다. 주요 문제점과 권장사항은 각각 최소 3개 이상 작성하고, 뭉뚱그린 일반론이 "
    "아니라 실제로 제공된 자산명·코드·금액·비율을 근거로 구체적으로 서술한다. 관리자가 이 보고서만 보고 "
    "바로 다음 행동을 결정할 수 있을 정도로 실용적으로 작성한다."
)


def _build_report_data(db: Session) -> dict:
    today = date.today()
    all_assets = db.query(models.Asset).all()
    all_records = db.query(models.MaintenanceRecord).all()
    assets_by_id = {a.id: a for a in all_assets}

    by_category: dict = {}
    by_status: dict = {}
    for a in all_assets:
        by_category[a.category] = by_category.get(a.category, 0) + 1
        by_status[a.status.value] = by_status.get(a.status.value, 0) + 1

    records_by_asset: dict = {}
    for r in all_records:
        records_by_asset.setdefault(r.asset_id, []).append(r)

    total_maintenance_cost = sum(float(r.cost) if r.cost is not None else 0.0 for r in all_records)
    cost_by_month: dict = {}
    cost_by_category: dict = {}
    for r in all_records:
        cost = float(r.cost) if r.cost is not None else 0.0
        month_key = f"{r.maintenance_date.year}-{r.maintenance_date.month:02d}"
        cost_by_month[month_key] = cost_by_month.get(month_key, 0.0) + cost
        asset = assets_by_id.get(r.asset_id)
        if asset:
            cost_by_category[asset.category] = cost_by_category.get(asset.category, 0.0) + cost

    replacement_candidates = []
    for a in all_assets:
        records = records_by_asset.get(a.id, [])
        metrics = compute_replacement_metrics(a, records, today=today)
        replacement_candidates.append({
            "assetName": a.asset_name,
            "assetCode": a.asset_code,
            "usedYears": metrics["usedYears"],
            "usefulLife": a.useful_life,
            "repairRatio": metrics["repairRatio"],
            "score": metrics["score"],
        })
    replacement_candidates.sort(key=lambda r: r["score"], reverse=True)
    top_candidates = replacement_candidates[:5]

    failure_count_by_asset: dict = {}
    failure_cost_by_asset: dict = {}
    for r in all_records:
        if r.maintenance_type == models.MaintenanceType.REPAIR:
            failure_count_by_asset[r.asset_id] = failure_count_by_asset.get(r.asset_id, 0) + 1
            failure_cost_by_asset[r.asset_id] = failure_cost_by_asset.get(r.asset_id, 0.0) + (
                float(r.cost) if r.cost is not None else 0.0
            )
    repeated_failure_ids = [aid for aid, cnt in failure_count_by_asset.items() if cnt >= 2]
    repeated_failure_assets = []
    for aid in repeated_failure_ids:
        asset = assets_by_id.get(aid)
        if not asset:
            continue
        repeated_failure_assets.append({
            "assetName": asset.asset_name,
            "assetCode": asset.asset_code,
            "failureCount": failure_count_by_asset[aid],
            "totalCost": failure_cost_by_asset.get(aid, 0.0),
        })
    repeated_failure_assets.sort(key=lambda x: x["failureCount"], reverse=True)

    return {
        "generatedAt": datetime.now().isoformat(),
        "totalAssets": len(all_assets),
        "byCategory": by_category,
        "byStatus": by_status,
        "totalMaintenanceCost": total_maintenance_cost,
        "costByMonth": cost_by_month,
        "costByCategory": cost_by_category,
        "replacementCandidates": top_candidates,
        "repeatedFailureCount": len(repeated_failure_ids),
        "repeatedFailureAssets": repeated_failure_assets[:10],
    }


def _build_fallback_narrative(report_data: dict) -> dict:
    top_category_cost = max(report_data["costByCategory"].items(), key=lambda kv: kv[1], default=None)
    top_repeat_assets = report_data["repeatedFailureAssets"][:3]
    top_candidate = report_data["replacementCandidates"][0] if report_data["replacementCandidates"] else None

    key_issues = []
    for asset in top_repeat_assets:
        key_issues.append(
            f"{asset['assetName']}({asset['assetCode']})은 이번 기간 {asset['failureCount']}회 반복 고장으로 "
            f"누적 수리비 {asset['totalCost']:,.0f}원이 발생했습니다."
        )
    if top_category_cost:
        key_issues.append(
            f"'{top_category_cost[0]}' 카테고리의 유지보수 비용이 {top_category_cost[1]:,.0f}원으로 전체 카테고리 중 가장 높습니다."
        )
    if top_candidate:
        key_issues.append(
            f"{top_candidate['assetName']}({top_candidate['assetCode']})은 사용 {top_candidate['usedYears']}/"
            f"{top_candidate['usefulLife']}년, 수리비율 {top_candidate['repairRatio'] * 100:.0f}%로 교체 우선순위 1위입니다."
        )
    if not key_issues:
        key_issues.append("이번 기간 반복 고장이나 카테고리별 비용 편중이 특별히 발견되지 않았습니다.")

    recommendations = [
        "정기 점검 주기를 단축하고 노후 장비 예산을 우선 편성하는 것을 권장합니다.",
    ]
    if top_repeat_assets:
        names = ", ".join(f"{a['assetName']}({a['assetCode']})" for a in top_repeat_assets)
        recommendations.append(f"반복 고장 자산({names})은 수리 대신 교체 여부를 우선 검토하는 것을 권장합니다.")
    if top_category_cost:
        recommendations.append(f"'{top_category_cost[0]}' 카테고리는 예방 정비 계획을 별도로 수립하는 것을 권장합니다.")
    if len(recommendations) < 3:
        recommendations.append("다음 분기 예산 수립 시 교체 추천 상위 자산을 우선순위에 반영하는 것을 권장합니다.")

    return {
        "executiveSummary": (
            f"총 {report_data['totalAssets']}개 자산을 관리 중이며, 누적 유지보수 비용은 "
            f"{report_data['totalMaintenanceCost']:,.0f}원입니다. 반복 고장 자산은 {report_data['repeatedFailureCount']}건입니다."
        ),
        "keyIssues": key_issues,
        "recommendations": recommendations,
    }


def _ensure_min_items(items: list, minimum: int, extra_pool: list) -> list:
    result = list(items or [])
    for candidate in extra_pool:
        if len(result) >= minimum:
            break
        if candidate not in result:
            result.append(candidate)
    return result


def _generate_narrative(report_data: dict) -> dict:
    fallback = _build_fallback_narrative(report_data)
    if not llm.is_configured():
        fallback["executiveSummary"] += " (AI 서술 생성을 사용하려면 GN_API_KEY를 설정하세요.)"
        return fallback

    try:
        candidates_text = "\n".join(
            f"- {c['assetName']}({c['assetCode']}): 사용 {c['usedYears']}/{c['usefulLife']}년, "
            f"수리비율 {c['repairRatio'] * 100:.0f}%, 점수 {c['score']}"
            for c in report_data["replacementCandidates"]
        )
        repeat_text = "\n".join(
            f"- {a['assetName']}({a['assetCode']}): 고장 {a['failureCount']}회, 누적 수리비 {a['totalCost']:,.0f}원"
            for a in report_data["repeatedFailureAssets"]
        ) or "없음"
        category_cost_text = ", ".join(
            f"{k}: {v:,.0f}원" for k, v in report_data["costByCategory"].items()
        ) or "없음"
        user_message = (
            f"자산 현황: 총 {report_data['totalAssets']}건, 카테고리별 {report_data['byCategory']}, "
            f"상태별 {report_data['byStatus']}\n"
            f"누적 유지보수 비용: {report_data['totalMaintenanceCost']:,.0f}원\n"
            f"월별 비용: {report_data['costByMonth']}\n"
            f"카테고리별 유지보수 비용: {category_cost_text}\n"
            f"반복 고장 자산 목록 (2회 이상):\n{repeat_text}\n"
            f"교체 추천 상위 목록:\n{candidates_text}"
        )
        # 최소 3개 이상 + 구체적 근거를 요구하는 만큼, 딥씽킹 모델의 사고 과정이 길어 답변이 잘리지 않도록 여유 있게 배정한다.
        result = llm.ask_json(_REPORT_SYSTEM_PROMPT, user_message, _REPORT_SCHEMA, max_tokens=8000, effort="high")
        result["keyIssues"] = _ensure_min_items(result.get("keyIssues"), 3, fallback["keyIssues"])
        result["recommendations"] = _ensure_min_items(result.get("recommendations"), 3, fallback["recommendations"])
        return result
    except Exception:
        logger.warning("월간 보고서 AI 서술 생성 실패, 규칙 기반 문구 유지", exc_info=True)
        return fallback


@router.get("/monthly")
def get_monthly_report(db: Session = Depends(get_db), includeAi: bool = False):
    report_data = _build_report_data(db)
    narrative = _generate_narrative(report_data) if includeAi else {
        "executiveSummary": None,
        "keyIssues": None,
        "recommendations": None,
    }
    return {
        "success": True,
        "message": None,
        "data": {**report_data, **narrative},
    }


def _build_pdf(report_data: dict, narrative: dict) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=20 * mm, bottomMargin=20 * mm)
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle("KoTitle", parent=styles["Title"], fontName=_KOREAN_FONT, fontSize=18)
    heading_style = ParagraphStyle("KoHeading", parent=styles["Heading2"], fontName=_KOREAN_FONT, fontSize=13, spaceBefore=10, spaceAfter=6)
    body_style = ParagraphStyle("KoBody", parent=styles["BodyText"], fontName=_KOREAN_FONT, fontSize=10, leading=15)

    elements = [
        Paragraph("공공시설 자산관리 월간 보고서", title_style),
        Paragraph(f"생성일: {report_data['generatedAt'][:19].replace('T', ' ')}", body_style),
        Spacer(1, 8 * mm),
        Paragraph("1. 요약", heading_style),
        Paragraph(narrative.get("executiveSummary", ""), body_style),
        Spacer(1, 4 * mm),
        Paragraph("2. 자산 현황", heading_style),
    ]

    status_table_data = [["상태", "건수"]] + [[k, str(v)] for k, v in report_data["byStatus"].items()]
    category_table_data = [["카테고리", "건수"]] + [[k, str(v)] for k, v in report_data["byCategory"].items()]

    def styled_table(data):
        table = Table(data, hAlign="LEFT", colWidths=[70 * mm, 40 * mm])
        table.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, -1), _KOREAN_FONT),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2d3748")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f7fafc")]),
        ]))
        return table

    elements.append(Paragraph(f"총 자산: {report_data['totalAssets']}건", body_style))
    elements.append(Spacer(1, 2 * mm))
    elements.append(styled_table(status_table_data))
    elements.append(Spacer(1, 4 * mm))
    elements.append(styled_table(category_table_data))
    elements.append(Spacer(1, 4 * mm))

    elements.append(Paragraph("3. 유지보수 비용 분석", heading_style))
    elements.append(Paragraph(f"누적 유지보수 비용: {report_data['totalMaintenanceCost']:,.0f}원", body_style))
    month_table_data = [["연월", "비용"]] + [
        [k, f"{v:,.0f}원"] for k, v in sorted(report_data["costByMonth"].items())
    ]
    if len(month_table_data) > 1:
        elements.append(Spacer(1, 2 * mm))
        elements.append(styled_table(month_table_data))
    elements.append(Spacer(1, 4 * mm))

    category_cost_table_data = [["카테고리", "유지보수 비용"]] + [
        [k, f"{v:,.0f}원"] for k, v in sorted(report_data["costByCategory"].items(), key=lambda kv: kv[1], reverse=True)
    ]
    if len(category_cost_table_data) > 1:
        elements.append(Paragraph("카테고리별 유지보수 비용 비교", body_style))
        elements.append(Spacer(1, 2 * mm))
        elements.append(styled_table(category_cost_table_data))
        elements.append(Spacer(1, 4 * mm))

    elements.append(Paragraph("4. 반복 고장 자산", heading_style))
    repeat_table_data = [["자산명", "자산번호", "고장횟수", "누적 수리비"]] + [
        [a["assetName"], a["assetCode"], f"{a['failureCount']}회", f"{a['totalCost']:,.0f}원"]
        for a in report_data["repeatedFailureAssets"]
    ]
    if len(repeat_table_data) > 1:
        table = Table(repeat_table_data, hAlign="LEFT", colWidths=[50 * mm, 30 * mm, 25 * mm, 30 * mm])
        table.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, -1), _KOREAN_FONT),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2d3748")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f7fafc")]),
        ]))
        elements.append(table)
    else:
        elements.append(Paragraph("이번 기간 2회 이상 반복 고장이 발생한 자산이 없습니다.", body_style))
    elements.append(Spacer(1, 4 * mm))

    elements.append(Paragraph("5. 교체 우선순위 추천", heading_style))
    candidate_table_data = [["자산명", "자산번호", "사용/내용연수", "수리비율", "점수"]] + [
        [c["assetName"], c["assetCode"], f"{c['usedYears']}/{c['usefulLife']}년", f"{c['repairRatio'] * 100:.0f}%", str(c["score"])]
        for c in report_data["replacementCandidates"]
    ]
    if len(candidate_table_data) > 1:
        table = Table(candidate_table_data, hAlign="LEFT", colWidths=[45 * mm, 25 * mm, 30 * mm, 25 * mm, 20 * mm])
        table.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, -1), _KOREAN_FONT),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2d3748")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f7fafc")]),
        ]))
        elements.append(table)
    elements.append(Spacer(1, 4 * mm))

    elements.append(Paragraph("6. 주요 문제점", heading_style))
    for issue in narrative.get("keyIssues", []):
        elements.append(Paragraph(f"- {issue}", body_style))
    elements.append(Spacer(1, 4 * mm))

    elements.append(Paragraph("7. 향후 관리 권장사항", heading_style))
    for rec in narrative.get("recommendations", []):
        elements.append(Paragraph(f"- {rec}", body_style))

    doc.build(elements)
    return buffer.getvalue()


@router.get("/monthly/pdf")
def get_monthly_report_pdf(db: Session = Depends(get_db)):
    report_data = _build_report_data(db)
    narrative = _generate_narrative(report_data)
    pdf_bytes = _build_pdf(report_data, narrative)
    filename = f"asset-report-{date.today().isoformat()}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
