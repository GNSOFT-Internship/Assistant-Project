"""LLM 연동 헬퍼 (사내 GPU 서버 Qwen3.5 / Gemini).

자연어 검색, 유지보수 분석, 교체 추천, 보고서 생성, Q&A 등 AI 기능이
공통으로 사용하는 LLM 호출 래퍼를 제공한다.

`GN_API_KEY`가 설정되어 있으면 사내 GPU 서버의 Qwen3.5 (OpenAI 호환 엔드포인트)를 사용하고,
없고 `GEMINI_API_KEY`가 설정되어 있으면 Gemini를 사용한다.
둘 다 없으면 각 라우터가 규칙 기반 폴백으로 동작하도록 `is_configured()`를
노출한다.
"""

import json
from typing import Any, Optional

from .config import settings

_GN_BASE_URL = "https://llm.gn-soft.co.kr/gncab/v1"

_gn_client = None
_gemini_configured = False


def _select_provider() -> Optional[str]:
    if settings.GN_API_KEY:
        return "gn"
    if settings.GEMINI_API_KEY:
        return "gemini"
    return None


def is_configured() -> bool:
    return _select_provider() is not None


# ---------------------------------------------------------------------------
# 사내 GPU 서버 Qwen3.5 (OpenAI 호환 엔드포인트)
# ---------------------------------------------------------------------------

def _get_gn_client():
    global _gn_client
    if _gn_client is None:
        from openai import OpenAI
        _gn_client = OpenAI(api_key=settings.GN_API_KEY, base_url=_GN_BASE_URL)
    return _gn_client


def _select_gn_model_and_tokens(effort: str, max_tokens: int) -> tuple[str, int]:
    """effort가 'high'일 경우 딥씽킹 모델(qwen35-think)을 선택하고 max_tokens를 넉넉하게 보장합니다."""
    if effort == "high":
        # qwen35-think 모델은 생각 과정도 max_tokens를 소모하므로 최소 4000 이상 보장
        return "qwen35-think", max(max_tokens, 4000)
    return settings.GN_MODEL, max_tokens


def _gn_ask_text(system: str, user_message: str, max_tokens: int, effort: str) -> str:
    client = _get_gn_client()
    model, tokens = _select_gn_model_and_tokens(effort, max_tokens)
    response = client.chat.completions.create(
        model=model,
        max_tokens=tokens,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user_message},
        ],
    )
    # reasoning_content가 있는 경우 로깅하거나 디버깅용으로 확인할 수 있습니다.
    message_obj = response.choices[0].message
    if hasattr(message_obj, "reasoning_content") and message_obj.reasoning_content:
        print(f"[Qwen Thinking Process]: {message_obj.reasoning_content}")
    return message_obj.content or ""


def _gn_ask_json(system: str, user_message: str, json_schema: dict, max_tokens: int, effort: str) -> dict:
    client = _get_gn_client()
    model, tokens = _select_gn_model_and_tokens(effort, max_tokens)
    
    schema_hint = json.dumps(json_schema, ensure_ascii=False)
    prompt = (
        f"{user_message}\n\n"
        f"아래 JSON 스키마에 맞는 JSON 객체만 응답하라 (다른 설명 텍스트 없이):\n{schema_hint}"
    )
    
    response = client.chat.completions.create(
        model=model,
        max_tokens=tokens,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
    )
    
    message_obj = response.choices[0].message
    if hasattr(message_obj, "reasoning_content") and message_obj.reasoning_content:
        print(f"[Qwen Thinking Process]: {message_obj.reasoning_content}")
        
    return json.loads(message_obj.content or "{}")


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
    if provider == "gn":
        return _gn_ask_text(system, user_message, max_tokens, effort)
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
    if provider == "gn":
        return _gn_ask_json(system, user_message, json_schema, max_tokens, effort)
    if provider == "gemini":
        return _gemini_ask_json(system, user_message, json_schema, max_tokens)
    raise RuntimeError("No LLM provider configured")
