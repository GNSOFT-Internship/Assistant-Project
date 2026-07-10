"""LLM 연동 헬퍼 (NVIDIA NIM / Gemini).

자연어 검색, 유지보수 분석, 교체 추천, 보고서 생성, Q&A 등 AI 기능이
공통으로 사용하는 LLM 호출 래퍼를 제공한다.

`NVIDIA_API_KEY`가 설정되어 있으면 NVIDIA NIM(OpenAI 호환 엔드포인트)을 통해
meta/llama-3.1-70b-instruct 등의 모델을 사용하고,
없고 `GEMINI_API_KEY`가 설정되어 있으면 Gemini를 사용한다.
둘 다 없으면 각 라우터가 규칙 기반 폴백으로 동작하도록 `is_configured()`를
노출한다.
"""

import json
from typing import Any, Optional

from .config import settings

_NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"

_nvidia_client = None
_gemini_configured = False


def _select_provider() -> Optional[str]:
    if settings.NVIDIA_API_KEY:
        return "nvidia"
    if settings.GEMINI_API_KEY:
        return "gemini"
    return None


def is_configured() -> bool:
    return _select_provider() is not None


# ---------------------------------------------------------------------------
# NVIDIA NIM (OpenAI 호환 엔드포인트)
# ---------------------------------------------------------------------------

def _get_nvidia_client():
    global _nvidia_client
    if _nvidia_client is None:
        from openai import OpenAI
        _nvidia_client = OpenAI(api_key=settings.NVIDIA_API_KEY, base_url=_NVIDIA_BASE_URL)
    return _nvidia_client


def _nvidia_ask_text(system: str, user_message: str, max_tokens: int) -> str:
    client = _get_nvidia_client()
    response = client.chat.completions.create(
        model=settings.NVIDIA_MODEL,
        max_tokens=max_tokens,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user_message},
        ],
    )
    return response.choices[0].message.content or ""


def _nvidia_ask_json(system: str, user_message: str, json_schema: dict, max_tokens: int) -> dict:
    client = _get_nvidia_client()
    # nvext.guided_json은 모델에 따라 무시될 수 있어(예: meta/llama-3.1-70b-instruct는
    # 스키마를 강제하지 않고 일반 산문으로 응답), Gemini와 동일하게 프롬프트에 스키마를
    # 명시해 요청하고 응답 텍스트를 JSON으로 파싱하는 방식을 사용한다.
    schema_hint = json.dumps(json_schema, ensure_ascii=False)
    prompt = (
        f"{user_message}\n\n"
        f"아래 JSON 스키마에 맞는 JSON 객체만 응답하라 (다른 설명 텍스트나 마크다운 코드블록 없이):\n{schema_hint}"
    )
    response = client.chat.completions.create(
        model=settings.NVIDIA_MODEL,
        max_tokens=max_tokens,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
    )
    content = (response.choices[0].message.content or "").strip()
    if content.startswith("```"):
        content = content.strip("`")
        if content.lower().startswith("json"):
            content = content[4:]
        content = content.strip()
    return json.loads(content)


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
    if provider == "nvidia":
        return _nvidia_ask_text(system, user_message, max_tokens)
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
    if provider == "nvidia":
        return _nvidia_ask_json(system, user_message, json_schema, max_tokens)
    if provider == "gemini":
        return _gemini_ask_json(system, user_message, json_schema, max_tokens)
    raise RuntimeError("No LLM provider configured")
