"""Claude(Anthropic) API 연동 헬퍼.

자연어 검색, 유지보수 분석, 교체 추천, 보고서 생성, Q&A 등 AI 기능이
공통으로 사용하는 LLM 호출 래퍼를 제공한다. API 키가 설정되지 않은 경우
(개발 환경 등) 각 라우터가 규칙 기반 폴백으로 동작할 수 있도록
`is_configured()`를 노출한다.
"""

import json
from typing import Any, Optional

import anthropic

from .config import settings

_client: Optional[anthropic.Anthropic] = None


def is_configured() -> bool:
    return bool(settings.ANTHROPIC_API_KEY)


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    return _client


def ask_text(system: str, user_message: str, max_tokens: int = 2048, effort: str = "medium") -> str:
    """LLM에게 자유 텍스트 응답을 요청한다."""
    client = _get_client()
    response = client.messages.create(
        model=settings.ANTHROPIC_MODEL,
        max_tokens=max_tokens,
        system=system,
        thinking={"type": "adaptive"},
        output_config={"effort": effort},
        messages=[{"role": "user", "content": user_message}],
    )
    for block in response.content:
        if block.type == "text":
            return block.text
    return ""


def ask_json(
    system: str,
    user_message: str,
    json_schema: dict,
    max_tokens: int = 2048,
    effort: str = "medium",
) -> dict[str, Any]:
    """LLM에게 지정된 JSON 스키마에 맞는 구조화된 응답을 요청한다."""
    client = _get_client()
    response = client.messages.create(
        model=settings.ANTHROPIC_MODEL,
        max_tokens=max_tokens,
        system=system,
        thinking={"type": "adaptive"},
        output_config={
            "effort": effort,
            "format": {"type": "json_schema", "schema": json_schema},
        },
        messages=[{"role": "user", "content": user_message}],
    )
    for block in response.content:
        if block.type == "text":
            return json.loads(block.text)
    return {}
