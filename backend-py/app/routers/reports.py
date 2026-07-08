import io
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

router = APIRouter(prefix="/api/reports", tags=["reports"])

_KOREAN_FONT = "HYGothic-Medium"
pdfmetrics.registerFont(UnicodeCIDFont(_KOREAN_FONT))


_REPORT_SCHEMA = {
    "type": "object",
    "properties": {
        "executiveSummary": {"type": "string", "description": "이번 달 자산/유지보수 현황에 대한 한국어 총평 2~3문장"},
        "keyIssues": {
            "type": "array",
            "items": {"type": "string"},
            "description": "주요 문제점 목록 (각 항목은 한 문장)",
        },
        "recommendations": {
            "type": "array",
            "items": {"type": "string"},
            "description": "향후 관리 권장사항 목록 (각 항목은 한 문장)",
        },
    },
    "required": ["executiveSummary", "keyIssues", "recommendations"],
    "additionalProperties": False,
}

_REPORT_SYSTEM_PROMPT = (
    "당신은 공공기관 자산관리 AI 보고서 작성자다. 아래 제공되는 자산 현황, 유지보수 비용, 교체 추천 데이터를 "
    "바탕으로 월간 보고서에 들어갈 총평, 주요 문제점, 향후 관리 권장사항을 한국어로 작성한다. "
    "수치를 구체적으로 인용하고, 관리자가 바로 실행할 수 있는 조언을 제공한다."
)


def _build_report_data(db: Session) -> dict:
    today = date.today()
    all_assets = db.query(models.Asset).all()
    all_records = db.query(models.MaintenanceRecord).all()

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
    for r in all_records:
        key = f"{r.maintenance_date.year}-{r.maintenance_date.month:02d}"
        cost_by_month[key] = cost_by_month.get(key, 0.0) + (float(r.cost) if r.cost is not None else 0.0)

    replacement_candidates = []
    for a in all_assets:
        records = records_by_asset.get(a.id, [])
        used_years = today.year - a.purchase_date.year
        price = float(a.purchase_price)
        repair_cost = sum(float(r.cost) if r.cost is not None else 0.0 for r in records)
        repair_ratio = (repair_cost / price) if price > 0 else 0.0
        score = (used_years / max(a.useful_life, 1)) * 40 + repair_ratio * 40 + min(len(records), 10) * 2
        if a.status == models.AssetStatus.REPLACEMENT_NEEDED:
            score += 20
        replacement_candidates.append({
            "assetName": a.asset_name,
            "assetCode": a.asset_code,
            "usedYears": used_years,
            "usefulLife": a.useful_life,
            "repairRatio": repair_ratio,
            "score": round(score, 1),
        })
    replacement_candidates.sort(key=lambda r: r["score"], reverse=True)
    top_candidates = replacement_candidates[:5]

    failure_count_by_asset: dict = {}
    for r in all_records:
        if r.maintenance_type == models.MaintenanceType.REPAIR:
            failure_count_by_asset[r.asset_id] = failure_count_by_asset.get(r.asset_id, 0) + 1
    repeated_failures = [
        (aid, cnt) for aid, cnt in failure_count_by_asset.items() if cnt >= 2
    ]

    return {
        "generatedAt": datetime.now().isoformat(),
        "totalAssets": len(all_assets),
        "byCategory": by_category,
        "byStatus": by_status,
        "totalMaintenanceCost": total_maintenance_cost,
        "costByMonth": cost_by_month,
        "replacementCandidates": top_candidates,
        "repeatedFailureCount": len(repeated_failures),
    }


def _generate_narrative(report_data: dict) -> dict:
    fallback = {
        "executiveSummary": (
            f"총 {report_data['totalAssets']}개 자산을 관리 중이며, 누적 유지보수 비용은 "
            f"{report_data['totalMaintenanceCost']:,.0f}원입니다."
        ),
        "keyIssues": [f"반복 고장이 발생한 자산이 {report_data['repeatedFailureCount']}건 있습니다."],
        "recommendations": ["정기 점검 주기를 단축하고 노후 장비 예산을 우선 편성하는 것을 권장합니다."],
    }
    if not llm.is_configured():
        fallback["executiveSummary"] += " (AI 서술 생성을 사용하려면 ANTHROPIC_API_KEY를 설정하세요.)"
        return fallback

    try:
        candidates_text = "\n".join(
            f"- {c['assetName']}: 사용 {c['usedYears']}/{c['usefulLife']}년, "
            f"수리비율 {c['repairRatio'] * 100:.0f}%, 점수 {c['score']}"
            for c in report_data["replacementCandidates"]
        )
        user_message = (
            f"자산 현황: 총 {report_data['totalAssets']}건, 카테고리별 {report_data['byCategory']}, "
            f"상태별 {report_data['byStatus']}\n"
            f"누적 유지보수 비용: {report_data['totalMaintenanceCost']:,.0f}원\n"
            f"월별 비용: {report_data['costByMonth']}\n"
            f"반복 고장 자산 수: {report_data['repeatedFailureCount']}\n"
            f"교체 추천 상위 목록:\n{candidates_text}"
        )
        return llm.ask_json(_REPORT_SYSTEM_PROMPT, user_message, _REPORT_SCHEMA, effort="high")
    except Exception:
        return fallback


@router.get("/monthly")
def get_monthly_report(db: Session = Depends(get_db)):
    report_data = _build_report_data(db)
    narrative = _generate_narrative(report_data)
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

    elements.append(Paragraph("4. 교체 우선순위 추천", heading_style))
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

    elements.append(Paragraph("5. 주요 문제점", heading_style))
    for issue in narrative.get("keyIssues", []):
        elements.append(Paragraph(f"- {issue}", body_style))
    elements.append(Spacer(1, 4 * mm))

    elements.append(Paragraph("6. 향후 관리 권장사항", heading_style))
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
