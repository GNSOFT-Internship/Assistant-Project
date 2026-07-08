from datetime import date

from sqlalchemy.orm import Session

from . import llm, models


def _to_source_data(assets):
    return [
        {
            "id": a.id,
            "name": a.asset_name,
            "category": a.category,
            "price": float(a.purchase_price) if a.purchase_price is not None else 0.0,
        }
        for a in assets
    ]


def _build_context(db: Session) -> str:
    today = date.today()
    assets = db.query(models.Asset).all()
    records = db.query(models.MaintenanceRecord).all()

    records_by_asset: dict[int, list] = {}
    for r in records:
        records_by_asset.setdefault(r.asset_id, []).append(r)

    lines = []
    for a in assets:
        asset_records = records_by_asset.get(a.id, [])
        total_cost = sum(float(r.cost) if r.cost is not None else 0.0 for r in asset_records)
        used_years = today.year - a.purchase_date.year
        lines.append(
            f"id={a.id} | {a.asset_name} | 카테고리={a.category} | 위치={a.location} | "
            f"담당자={a.responsible_person} | 구매일={a.purchase_date} | 사용기간={used_years}년 | "
            f"내용연수={a.useful_life}년 | 구매가={float(a.purchase_price):.0f} | 상태={a.status.value} | "
            f"유지보수횟수={len(asset_records)} | 누적수리비={total_cost:.0f}"
        )

    return "\n".join(lines)


_ANSWER_SCHEMA = {
    "type": "object",
    "properties": {
        "answer": {"type": "string", "description": "질문에 대한 한국어 답변. 구체적인 수치와 근거를 포함한다."},
        "relevantAssetIds": {
            "type": "array",
            "items": {"type": "integer"},
            "description": "답변 근거로 사용된 자산의 id 목록",
        },
        "hasData": {"type": "boolean", "description": "질문에 답할 수 있는 데이터가 있었는지 여부"},
    },
    "required": ["answer", "relevantAssetIds", "hasData"],
    "additionalProperties": False,
}

_SYSTEM_PROMPT = (
    "당신은 공공기관 자산관리 시스템의 AI 어시스턴트다. 아래 제공되는 자산 및 유지보수 데이터를 "
    "근거로 관리자의 질문에 답한다. 데이터에 없는 내용은 추측하지 말고 모른다고 답한다. "
    "금액은 원화 기준으로 표기하고, 가능하면 구체적인 자산명과 수치를 인용한다."
)


def answer_question(db: Session, question: str) -> dict:
    all_assets = db.query(models.Asset).all()

    if not llm.is_configured():
        return _fallback_answer(db, question, all_assets)

    context = _build_context(db)
    user_message = f"[자산 데이터]\n{context}\n\n[질문]\n{question}"

    try:
        result = llm.ask_json(_SYSTEM_PROMPT, user_message, _ANSWER_SCHEMA, effort="medium")
    except Exception:
        return _fallback_answer(db, question, all_assets)

    relevant_ids = set(result.get("relevantAssetIds", []))
    relevant_assets = [a for a in all_assets if a.id in relevant_ids] or all_assets

    return {
        "answer": result.get("answer", "답변을 생성하지 못했습니다."),
        "sourceData": _to_source_data(relevant_assets),
        "hasData": bool(result.get("hasData", True)),
    }


def _fallback_answer(db: Session, question: str, all_assets) -> dict:
    """LLM 미설정 시 사용하는 규칙 기반 폴백."""
    q = question.lower()

    if "노트북" in q or "pc" in q or "컴퓨터" in q:
        it_assets = [a for a in all_assets if "it" in a.category.lower()]
        return {"answer": f"IT 장비는 총 {len(it_assets)}개 있습니다.", "sourceData": _to_source_data(it_assets), "hasData": True}

    if "가격" in q or "비싸" in q:
        expensive = [a for a in all_assets if float(a.purchase_price) > 1000000]
        return {"answer": f"100만원 이상인 자산은 총 {len(expensive)}개 있습니다.", "sourceData": _to_source_data(expensive), "hasData": True}

    if "상태" in q or "고장" in q or "교체" in q:
        problematic = [a for a in all_assets if a.status in (models.AssetStatus.REPLACEMENT_NEEDED, models.AssetStatus.INACTIVE)]
        return {"answer": f"교체나 조치가 필요한 자산은 총 {len(problematic)}개 있습니다.", "sourceData": _to_source_data(problematic), "hasData": True}

    return {
        "answer": f"총 {len(all_assets)}개의 자산이 등록되어 있습니다. (AI 기능을 사용하려면 ANTHROPIC_API_KEY를 설정하세요.)",
        "sourceData": _to_source_data(all_assets),
        "hasData": True,
    }
