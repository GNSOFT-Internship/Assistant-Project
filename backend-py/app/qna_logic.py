from datetime import date

from sqlalchemy.orm import Session

from . import models


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


def answer_question(db: Session, question: str) -> dict:
    all_assets = db.query(models.Asset).all()
    q = question.lower()

    if "자산" in q or "목록" in q or "전체" in q:
        return {
            "answer": f"총 {len(all_assets)} 개의 자산이 등록되어 있습니다.",
            "sourceData": _to_source_data(all_assets),
            "hasData": True,
        }

    if "노트북" in q or "pc" in q or "컴퓨터" in q:
        it_assets = [a for a in all_assets if "it" in a.category.lower()]
        return {
            "answer": f"IT 장비는 총 {len(it_assets)} 개 있습니다.",
            "sourceData": _to_source_data(it_assets),
            "hasData": True,
        }

    if "가격" in q or "비가" in q or "비싸" in q:
        expensive = [a for a in all_assets if float(a.purchase_price) > 1000000]
        return {
            "answer": f"100 만원 이상인 자산은 총 {len(expensive)} 개 있습니다.",
            "sourceData": _to_source_data(expensive),
            "hasData": True,
        }

    if "상태" in q or "고장" in q or "교체" in q:
        problematic = [
            a for a in all_assets
            if a.status in (models.AssetStatus.REPLACEMENT_NEEDED, models.AssetStatus.INACTIVE)
        ]
        return {
            "answer": f"교체나 조치가 필요한 자산은 총 {len(problematic)} 개 있습니다.",
            "sourceData": _to_source_data(problematic),
            "hasData": True,
        }

    if "사용" in q or "연" in q or "기간" in q:
        today = date.today()
        old_assets = [
            a for a in all_assets
            if a.purchase_date and (today.year - a.purchase_date.year) >= 5
        ]
        return {
            "answer": f"5 년 이상 사용한 자산은 총 {len(old_assets)} 개 있습니다.",
            "sourceData": _to_source_data(old_assets),
            "hasData": True,
        }

    if "카테고리" in q or "종류" in q:
        by_category: dict = {}
        for a in all_assets:
            by_category[a.category] = by_category.get(a.category, 0) + 1
        answer_lines = ["카테고리별 자산 수:"]
        for cat, count in by_category.items():
            answer_lines.append(f"- {cat}: {count}개")
        return {
            "answer": "\n".join(answer_lines),
            "sourceData": [by_category],
            "hasData": True,
        }

    return {
        "answer": "해당하는 데이터를 찾을 수 없습니다. 다른 질문을 해주세요.",
        "sourceData": [],
        "hasData": False,
    }
