import logging
from datetime import date

from sqlalchemy.orm import Session

from . import llm, models
from .routers.assets import asset_to_dto
from .scoring import calc_used_years

logger = logging.getLogger(__name__)


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


def _build_context(assets: list, records: list) -> str:
    today = date.today()

    records_by_asset: dict[int, list] = {}
    for r in records:
        records_by_asset.setdefault(r.asset_id, []).append(r)

    lines = []
    for a in assets:
        asset_records = records_by_asset.get(a.id, [])
        total_cost = sum(float(r.cost) if r.cost is not None else 0.0 for r in asset_records)
        used_years = calc_used_years(a.purchase_date, today)
        lines.append(
            f"id={a.id} | {a.asset_name} | 카테고리={a.category} | 위치={a.location} | "
            f"담당자={a.responsible_person} | 구매일={a.purchase_date} | 사용기간={used_years}년 | "
            f"내용연수={a.useful_life}년 | 구매가={float(a.purchase_price):.0f} | 상태={a.status.value} | "
            f"유지보수횟수={len(asset_records)} | 누적수리비={total_cost:.0f}"
        )
        # 각 자산의 개별 유지보수 이력(정비유형/비용/설명/고장유형)까지 포함해야
        # "하드디스크를 교체한 장비" 같이 특정 정비 내용을 근거로 하는 질문에
        # AI가 실제 이력을 인용해 답할 수 있다.
        for r in asset_records:
            record_cost = float(r.cost) if r.cost is not None else 0.0
            lines.append(
                f"  - id={a.id}의 이력: {r.maintenance_date} | {r.maintenance_type.value} | "
                f"비용={record_cost:.0f} | 설명={r.description or '-'} | "
                f"고장유형={r.failure_type or '-'} | 기술자={r.technician or '-'}"
            )

    return "\n".join(lines)


_ANSWER_SCHEMA = {
    "type": "object",
    "properties": {
        "answer": {
            "type": "string",
            "description": (
                "질문에 대한 한국어 답변. hasFilter가 false면 구체적인 수치와 근거를 포함해 자유롭게 "
                "서술한다. hasFilter가 true면 해당 자산 목록은 별도 표로 이미 표시되므로, 답변은 "
                "몇 건이 해당하는지와 공통 특징(예: 대부분 IT 장비, 평균 사용기간 등)만 2~3문장으로 "
                "간결하게 요약하고 자산명을 하나하나 나열하지 않는다."
            ),
        },
        "relevantAssetIds": {
            "type": "array",
            "items": {"type": "integer"},
            "description": (
                "hasFilter가 true일 때만 채우는, 답변의 근거가 된 구체적 자산 id 목록. "
                "hasFilter가 false면 빈 배열로 둔다."
            ),
        },
        "hasData": {"type": "boolean", "description": "질문에 답할 수 있는 데이터가 있었는지 여부"},
        "hasFilter": {
            "type": "boolean",
            "description": (
                "질문이 조건에 맞는 자산 '목록'을 찾는 것이면 true. 조건은 긍정형('3년 이상 사용한 "
                "노트북', '유지보수 4건 이상인 장비')뿐 아니라 부정/결여형('수리 이력이 없는 장비', "
                "'고장난 적 없는 자산', '점검을 안 받은 장비')도 포함한다. "
                "'총 자산 수는?', '평균 비용은?' 같은 단순 통계/개수/일반 질문이면 false."
            ),
        },
        "minPrice": {
            "type": ["number", "null"],
            "description": (
                "질문에 '~원 이상', '~만원 이상', '~보다 비싼' 같은 최소 구매가 조건이 있으면 그 금액을 "
                "원 단위로 환산해 반환한다 (예: '100만원 이상' → 1000000). 조건이 없으면 null."
            ),
        },
        "maxPrice": {
            "type": ["number", "null"],
            "description": (
                "질문에 '~원 이하', '~만원 이하', '~보다 싼/저렴한' 같은 최대 구매가 조건이 있으면 그 "
                "금액을 원 단위로 환산해 반환한다 (예: '100만원 이하' → 1000000). 조건이 없으면 null."
            ),
        },
        "category": {
            "type": ["string", "null"],
            "description": (
                "질문에 'IT 장비', '사무기기', '설비', '전기설비', '안전설비', '보안장비', '가구', "
                "'측정장비' 같은 카테고리 조건이 있으면 그 카테고리명(부분 일치), 없으면 null. "
                "minPrice/maxPrice와 함께 쓰일 때 정확도를 위해 반드시 채운다."
            ),
        },
    },
    "required": ["answer", "relevantAssetIds", "hasData", "hasFilter", "minPrice", "maxPrice", "category"],
    "additionalProperties": False,
}

_SYSTEM_PROMPT = (
    "당신은 공공기관 자산관리 시스템의 AI 어시스턴트다. 아래 제공되는 자산 및 유지보수 데이터를 "
    "근거로 관리자의 질문에 답한다. 데이터에 없는 내용은 추측하지 말고 모른다고 답한다. "
    "금액은 원화 기준으로 표기하고, 가능하면 구체적인 자산명과 수치를 인용한다. "
    "질문이 조건에 맞는 자산 목록을 찾는 것이면(긍정형이든 '이력이 없는', '~하지 않은' 같은 "
    "부정/결여형 조건이든) hasFilter를 true로 하고 relevantAssetIds에 해당 자산들의 id를 모두 "
    "넣는다. 이때 해당 자산 목록은 화면에 표로 별도 표시되므로, answer 텍스트에는 자산명을 "
    "일일이 나열하지 말고 몇 건인지와 공통 특징만 간결히 요약한다. 단순 통계/개수/일반 질문이면 "
    "hasFilter를 false로 하고 relevantAssetIds는 빈 배열로 둔다. "
    "질문에 구매가 관련 이상/이하 조건이 있으면 minPrice/maxPrice에 원 단위 금액으로, 카테고리 "
    "조건이 있으면 category에도 반드시 채워 넣는다 (relevantAssetIds만으로 가격/카테고리 비교를 "
    "직접 판단하지 말 것 — 실제 비교는 별도 로직이 정확히 수행하므로, 여기서는 조건 자체를 "
    "정확히 추출하면 된다)."
)


def answer_question(db: Session, question: str) -> dict:
    all_assets = db.query(models.Asset).all()

    if not llm.is_configured():
        return _fallback_answer(db, question, all_assets)

    all_records = db.query(models.MaintenanceRecord).all()
    context = _build_context(all_assets, all_records)
    user_message = f"[자산 데이터]\n{context}\n\n[질문]\n{question}"

    try:
        result = llm.ask_json(_SYSTEM_PROMPT, user_message, _ANSWER_SCHEMA, effort="medium")
    except Exception:
        logger.warning("Q&A LLM 호출 실패, 규칙 기반 폴백으로 전환", exc_info=True)
        return _fallback_answer(db, question, all_assets)

    has_filter = bool(result.get("hasFilter", False))
    relevant_ids = set(result.get("relevantAssetIds", []))
    relevant_assets = [a for a in all_assets if a.id in relevant_ids] if has_filter else []
    answer = result.get("answer", "답변을 생성하지 못했습니다.")

    min_price = result.get("minPrice")
    max_price = result.get("maxPrice")
    category = result.get("category")
    if category:
        # "노트북"처럼 카테고리가 아니라 제품명/키워드를 category에 잘못 채워 넣는 경우,
        # 실제 DB 카테고리 값과 무관한 문자열로 재필터링하면 원래 맞았던 relevantAssetIds
        # 결과까지 "없음"으로 덮어써버린다. 실제 존재하는 카테고리와 매치될 때만 신뢰한다.
        real_categories = {a.category for a in all_assets if a.category}
        if not any(category.lower() in c.lower() for c in real_categories):
            category = None
    if has_filter and (min_price is not None or max_price is not None or category):
        # 가격/카테고리 비교는 LLM이 텍스트만 보고 직접 판단하면 계산 실수(예: 카테고리 조건을
        # 놓치거나 가격을 잘못 비교해 자기모순적 답변)가 나올 수 있으므로, 조건 자체만 LLM에게서
        # 받고 실제 비교는 코드에서 전체 자산을 대상으로 확정적으로 재계산한다.
        relevant_assets = [
            a for a in all_assets
            if (min_price is None or float(a.purchase_price) >= min_price)
            and (max_price is None or float(a.purchase_price) <= max_price)
            and (not category or category.lower() in (a.category or "").lower())
        ]
        answer = (
            f"조건에 맞는 자산은 총 {len(relevant_assets)}건입니다."
            if relevant_assets
            else "조건에 맞는 자산이 없습니다."
        )

    return {
        "answer": answer,
        "sourceData": _to_source_data(relevant_assets or all_assets),
        "assets": [asset_to_dto(a) for a in relevant_assets],
        "hasData": bool(result.get("hasData", True)),
        "hasFilter": has_filter,
    }


def _fallback_answer(db: Session, question: str, all_assets) -> dict:
    """LLM 미설정 시 사용하는 규칙 기반 폴백."""
    q = question.lower()

    if "노트북" in q or "pc" in q or "컴퓨터" in q:
        it_assets = [a for a in all_assets if "it" in a.category.lower()]
        return {
            "answer": f"IT 장비는 총 {len(it_assets)}개 있습니다.",
            "sourceData": _to_source_data(it_assets),
            "assets": [asset_to_dto(a) for a in it_assets],
            "hasData": True,
            "hasFilter": True,
        }

    if "가격" in q or "비싸" in q:
        expensive = [a for a in all_assets if float(a.purchase_price) > 1000000]
        return {
            "answer": f"100만원 이상인 자산은 총 {len(expensive)}개 있습니다.",
            "sourceData": _to_source_data(expensive),
            "assets": [asset_to_dto(a) for a in expensive],
            "hasData": True,
            "hasFilter": True,
        }

    if "상태" in q or "고장" in q or "교체" in q:
        problematic = [a for a in all_assets if a.status in (models.AssetStatus.REPLACEMENT_NEEDED, models.AssetStatus.INACTIVE)]
        return {
            "answer": f"교체나 조치가 필요한 자산은 총 {len(problematic)}개 있습니다.",
            "sourceData": _to_source_data(problematic),
            "assets": [asset_to_dto(a) for a in problematic],
            "hasData": True,
            "hasFilter": True,
        }

    return {
        "answer": f"총 {len(all_assets)}개의 자산이 등록되어 있습니다. (AI 기능을 사용하려면 GN_API_KEY를 설정하세요.)",
        "sourceData": _to_source_data(all_assets),
        "assets": [],
        "hasData": True,
        "hasFilter": False,
    }
