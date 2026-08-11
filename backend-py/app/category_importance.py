"""자산 카테고리별 "중요도" 점수 관리.

교체 우선순위 점수(scoring.py)는 원래 사용기간·수리비·유지보수 횟수만 봤는데,
이러면 NAS(데이터 저장소)와 정수기처럼 업무 중요도가 전혀 다른 장비가 똑같은
기준으로 채점된다. 이 모듈은 카테고리(자유 문자열이라 고정 목록이 없음)별로
"업무 중요도"를 0~100점으로 매겨 DB(category_importance)에 캐싱한다.

- 새 카테고리가 처음 등록되면 AI(gn-cab Qwen)에게 한 번만 물어보고 캐싱한다
  (같은 카테고리의 자산이 몇 개든 재사용하므로 자산 등록 때마다 AI를 부르지 않는다).
- AI 미설정/호출 실패 시에는 중립값(DEFAULT_IMPORTANCE_SCORE)으로 폴백한다.
- 관리자는 화면에서 언제든 값을 직접 덮어쓸 수 있다(source=MANUAL로 표시되고,
  이후 AI가 다시 값을 덮어쓰지 않는다 - set_manual_importance 참고).
"""

import logging

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import llm, models

logger = logging.getLogger(__name__)

DEFAULT_IMPORTANCE_SCORE = 50.0

# 점수를 안정적으로 매기도록 구체적인 판단 기준과 앵커(기준점) 예시를 프롬프트에
# 박아둔다. 앵커 없이 "0~100점을 매겨라"만 주면 같은 카테고리에도 매번 다른
# 점수가 나오기 쉬워서, 등급대별 대표 사례를 예시로 주고 근거도 함께 요구한다.
_IMPORTANCE_SYSTEM_PROMPT = """당신은 공공기관 시설·자산 관리 전문가입니다. 주어진 자산 카테고리(장비 종류) 하나가
고장나거나 교체가 늦어질 경우 조직의 업무에 미치는 영향("중요도")을 0~100점으로 평가합니다.

평가 기준(모두 고려해 종합 판단):
1. 가용성 영향 — 멈추면 몇 명/몇 개 부서의 업무가 즉시 중단되는가 (다수 의존 vs 개인 사용)
2. 데이터/자산 유실 위험 — 고장 시 데이터나 기록이 영구 손실될 수 있는가
3. 대체 난이도 — 고장 즉시 다른 장비나 수단으로 임시 대체 가능한가, 아니면 대체 불가능한가
4. 복구 소요 시간/비용 — 교체·수리에 걸리는 시간과 비용이 업무 공백을 얼마나 늘리는가
5. 보안/규정 영향 — 방화벽, 접근 통제 장비처럼 보안 사고로 직결되는가

점수대 기준(앵커):
- 90~100 (핵심 인프라): 서버, NAS, 스토리지, 코어 네트워크 장비(라우터/스위치), 방화벽 —
  다운되면 조직 전체 업무가 멈추거나 데이터가 유실될 수 있음
- 70~89 (중요 공유 장비): 부서 공용 프린터/복합기, 백업 장비, UPS, 회의실 화상장비 —
  다수가 의존하지만 단기간 대체 가능
- 40~69 (일반 업무 장비): 개인 PC/노트북, 모니터, 일반 사무기기 —
  개인 업무에 영향을 주지만 조직 전체로는 영향이 제한적
- 10~39 (편의/대체 용이): 정수기, 커피머신, 냉장고, 일반 가구 —
  없어도 업무 자체는 지속 가능, 대체나 임시 조달이 쉬움
- 0~9 (거의 영향 없음): 장식품, 소모성 비품 등

카테고리명만으로 판단이 애매하면 가장 보수적으로(중간값 쪽으로) 추정하되,
근거는 화면 표 한 줄에 그대로 들어가야 하므로 반드시 40자 이내의 간결한
한 문장으로 제시하세요 (마침표 포함 40자 이내, 부연 설명 없이 핵심만)."""

_IMPORTANCE_SCHEMA = {
    "type": "object",
    "properties": {
        "score": {"type": "number", "description": "0~100 사이 중요도 점수 (정수 또는 소수)"},
        "reason": {"type": "string", "description": "이 점수를 준 근거를 40자 이내로 간결하게 (한국어)"},
    },
    "required": ["score", "reason"],
}

_REASON_MAX_LENGTH = 40


def _ask_ai_for_importance(category: str) -> tuple[float, str]:
    result = llm.ask_json(
        _IMPORTANCE_SYSTEM_PROMPT,
        f"카테고리: {category}",
        _IMPORTANCE_SCHEMA,
        max_tokens=512,
        effort="low",
    )
    score = float(result.get("score", DEFAULT_IMPORTANCE_SCORE))
    score = min(max(score, 0.0), 100.0)
    reason = str(result.get("reason") or "").strip()
    # 프롬프트로 길이를 요청해도 모델이 가끔 넘길 수 있어, 화면이 깨지지 않도록
    # 최종 안전장치로 한 번 더 자른다.
    if len(reason) > _REASON_MAX_LENGTH:
        reason = reason[: _REASON_MAX_LENGTH - 1].rstrip() + "…"
    return score, reason


def get_or_create_category(db: Session, name: str) -> models.Category:
    """카테고리 이름으로 category 테이블 행을 반환한다. 없으면 새로 만든다.

    ensure_category_importance와 동일하게, 호출자가 이후 commit하는 것을 전제로
    flush만 하며 동시 요청으로 인한 unique 제약 충돌은 재조회로 흡수한다."""
    existing = db.query(models.Category).filter(models.Category.name == name).first()
    if existing is not None:
        return existing

    record = models.Category(name=name)
    db.add(record)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        existing = db.query(models.Category).filter(models.Category.name == name).first()
        if existing is not None:
            return existing
        raise
    return record


def ensure_category_importance(db: Session, category: str) -> models.CategoryImportance:
    """카테고리 중요도 레코드를 반환한다. 없으면 AI로 산정(실패/미설정 시 기본값)해서 새로 만든다.

    호출자가 이후 자신의 트랜잭션을 commit하는 것을 전제로 flush만 한다
    (자산 생성 흐름 중간에 끼어 호출되는 경우가 많아 여기서 임의로 commit하지 않는다)."""
    category_row = get_or_create_category(db, category)
    existing = (
        db.query(models.CategoryImportance)
        .filter(models.CategoryImportance.category_id == category_row.id)
        .first()
    )
    if existing is not None:
        return existing

    score = DEFAULT_IMPORTANCE_SCORE
    reason = "AI 미설정으로 기본값(중립) 적용"
    source = models.ImportanceSource.DEFAULT

    if llm.is_configured():
        try:
            score, reason = _ask_ai_for_importance(category)
            source = models.ImportanceSource.AI
        except Exception:
            logger.warning("카테고리 중요도 AI 산정 실패, 기본값 적용: %s", category, exc_info=True)
            reason = "AI 호출 실패로 기본값(중립) 적용"

    record = models.CategoryImportance(
        category_id=category_row.id, importance_score=score, reason=reason, source=source,
    )
    db.add(record)
    try:
        db.flush()
    except IntegrityError:
        # 동시 요청이 같은 카테고리를 먼저 만들었을 수 있다 (unique 제약 위반).
        db.rollback()
        existing = (
            db.query(models.CategoryImportance)
            .filter(models.CategoryImportance.category_id == category_row.id)
            .first()
        )
        if existing is not None:
            return existing
        raise
    return record


def get_importance_score(db: Session, category: str) -> float:
    """스코어링에서 쓰는 조회용 헬퍼. 없으면 즉석에서 만들고(self-healing) 커밋까지 한다."""
    category_row = db.query(models.Category).filter(models.Category.name == category).first()
    if category_row is not None:
        existing = (
            db.query(models.CategoryImportance)
            .filter(models.CategoryImportance.category_id == category_row.id)
            .first()
        )
        if existing is not None:
            return float(existing.importance_score)

    # 새로 만드는 경우: 호출자가 커밋하지 않을 수도 있는 읽기 경로(추천/보고서 조회)에서
    # 온 것일 수 있으므로, 여기서 직접 커밋해 다음 조회부터는 캐시가 재사용되게 한다.
    record = ensure_category_importance(db, category)
    db.commit()
    db.refresh(record)
    return float(record.importance_score)


def delete_category_if_orphaned(db: Session, category_id: int) -> bool:
    """category_id를 참조하는 자산이 하나도 남아있지 않으면, category_importance와
    category 행까지 함께 정리한다 (자산 삭제나 카테고리 변경으로 고아가 된 카테고리).

    호출자가 자산 쪽 변경(삭제/카테고리 변경)을 이미 커밋한 뒤에 불러야 정확한
    개수를 센다. 정리했으면 True, 아직 자산이 남아있어 그대로 뒀으면 False."""
    remaining = db.query(models.Asset).filter(models.Asset.category_id == category_id).count()
    if remaining > 0:
        return False

    db.query(models.CategoryImportance).filter(
        models.CategoryImportance.category_id == category_id
    ).delete()
    db.query(models.Category).filter(models.Category.id == category_id).delete()
    db.commit()
    return True


def set_manual_importance(
    db: Session, category: str, score: float, changed_by: str = None, reason: str = None,
) -> models.CategoryImportance:
    """관리자가 화면에서 직접 값(및 근거)을 덮어쓴다. 이후 AI가 자동으로 재계산하지 않는다.

    reason을 비워두면 "관리자가 직접 설정"이라는 기본 문구가 들어간다."""
    score = min(max(float(score), 0.0), 100.0)
    category_row = get_or_create_category(db, category)
    record = (
        db.query(models.CategoryImportance)
        .filter(models.CategoryImportance.category_id == category_row.id)
        .first()
    )
    if record is None:
        record = models.CategoryImportance(category_id=category_row.id, importance_score=score)
        db.add(record)
    else:
        record.importance_score = score
    record.source = models.ImportanceSource.MANUAL
    reason = (reason or "").strip()
    record.reason = reason or (f"관리자({changed_by})가 직접 설정" if changed_by else "관리자가 직접 설정")
    db.commit()
    db.refresh(record)
    return record


def recompute_ai_importance(db: Session, category: str) -> models.CategoryImportance:
    """관리자가 이미 지정한 값(MANUAL)이 있어도 무시하고, AI에게 새로 물어봐서
    점수/근거를 덮어쓴다. AI가 설정되어 있지 않으면 ValueError를 던진다."""
    if not llm.is_configured():
        raise ValueError("AI가 설정되어 있지 않아 재산정할 수 없습니다.")

    score, reason = _ask_ai_for_importance(category)

    category_row = get_or_create_category(db, category)
    record = (
        db.query(models.CategoryImportance)
        .filter(models.CategoryImportance.category_id == category_row.id)
        .first()
    )
    if record is None:
        record = models.CategoryImportance(category_id=category_row.id)
        db.add(record)
    record.importance_score = score
    record.reason = reason
    record.source = models.ImportanceSource.AI
    db.commit()
    db.refresh(record)
    return record
