"""LLM 연동 헬퍼 (Claude / Gemini).

자연어 검색, 유지보수 분석, 교체 추천, 보고서 생성, Q&A 등 AI 기능이
공통으로 사용하는 LLM 호출 래퍼를 제공한다.

`ANTHROPIC_API_KEY`가 설정되어 있으면 Claude를, 없고 `GEMINI_API_KEY`가
설정되어 있으면 Gemini를 사용한다. 둘 다 없으면 각 라우터가 규칙 기반
폴백으로 동작하도록 `is_configured()`를 노출한다.
"""

import json
from typing import Any, Optional

from .config import settings

_anthropic_client = None
_gemini_configured = False


def _select_provider() -> Optional[str]:
    if settings.ANTHROPIC_API_KEY:
        return "anthropic"
    if settings.GEMINI_API_KEY:
        return "gemini"
    return None


def is_configured() -> bool:
    return _select_provider() is not None


# ---------------------------------------------------------------------------
# Anthropic (Claude)
# ---------------------------------------------------------------------------

def _get_anthropic_client():
    global _anthropic_client
    if _anthropic_client is None:
        import anthropic
        _anthropic_client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    return _anthropic_client


def _anthropic_ask_text(system: str, user_message: str, max_tokens: int, effort: str) -> str:
    client = _get_anthropic_client()
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


def _anthropic_ask_json(system: str, user_message: str, json_schema: dict, max_tokens: int, effort: str) -> dict:
    client = _get_anthropic_client()
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


# ---------------------------------------------------------------------------
# Google Gemini
# ---------------------------------------------------------------------------

def _ensure_gemini_configured():
    global _gemini_configured
    if not _gemini_configured:
        import google.generativeai as genai
        genai.configure(api_key=settings.GEMINI_API_KEY)
        _gemini_configured = True


def _gemini_model(system: str):
    import google.generativeai as genai
    _ensure_gemini_configured()
    return genai.GenerativeModel(settings.GEMINI_MODEL, system_instruction=system)


def _gemini_ask_text(system: str, user_message: str, max_tokens: int) -> str:
    import google.generativeai as genai
    model = _gemini_model(system)
    response = model.generate_content(
        user_message,
        generation_config=genai.GenerationConfig(max_output_tokens=max_tokens),
    )
    return response.text


def _gemini_ask_json(system: str, user_message: str, json_schema: dict, max_tokens: int) -> dict:
    import google.generativeai as genai
    model = _gemini_model(system)
    schema_hint = json.dumps(json_schema, ensure_ascii=False)
    prompt = (
        f"{user_message}\n\n"
        f"아래 JSON 스키마에 맞는 JSON 객체만 응답하라 (다른 설명 텍스트 없이):\n{schema_hint}"
    )
    response = model.generate_content(
        prompt,
        generation_config=genai.GenerationConfig(
            max_output_tokens=max_tokens,
            response_mime_type="application/json",
        ),
    )
    return json.loads(response.text)


# ---------------------------------------------------------------------------
# 공개 API
# ---------------------------------------------------------------------------

def ask_text(system: str, user_message: str, max_tokens: int = 2048, effort: str = "medium") -> str:
    provider = _select_provider()
    if provider == "anthropic":
        return _anthropic_ask_text(system, user_message, max_tokens, effort)
    if provider == "gemini":
        return _gemini_ask_text(system, user_message, max_tokens)
    raise RuntimeError("No LLM provider configured")


def ask_json(
    system: str,
    user_message: str,
    json_schema: dict,
    max_tokens: int = 2048,
    effort: str = "medium",
) -> dict[str, Any]:
    provider = _select_provider()
    if provider == "anthropic":
        return _anthropic_ask_json(system, user_message, json_schema, max_tokens, effort)
    if provider == "gemini":
        return _gemini_ask_json(system, user_message, json_schema, max_tokens)
    raise RuntimeError("No LLM provider configured")
