"""LLM 연동 헬퍼 (사내 GPU 서버 Qwen3.5 전용).

자연어 검색, 유지보수 분석, 교체 추천, 보고서 생성, Q&A 등 AI 기능이
공통으로 사용하는 사내 Qwen3.5 LLM 호출 래퍼를 제공한다.
"""

import hashlib
import json
import time
from typing import Any, Optional

from .config import settings

_GN_BASE_URL = "https://llm.gn-soft.co.kr/gncab/v1"

_gn_client = None

# ---------------------------------------------------------------------------
# 동일 요청(system+user_message+schema+effort)에 대한 짧은 TTL 캐시.
# 자산/예산 데이터가 그대로인 채 같은 화면을 반복 조회할 때 매번 GPU 서버를
# 다시 호출하지 않도록 한다. 실제 데이터가 바뀌면 프롬프트 내용도 바뀌므로
# 캐시 키가 달라져 자동으로 무효화된다.
# ---------------------------------------------------------------------------
_CACHE_TTL_SECONDS = 300
_CACHE_MAX_ENTRIES = 200
_response_cache: dict[str, tuple[float, Any]] = {}


def _cache_key(*parts: Any) -> str:
    raw = "||".join(str(p) for p in parts)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _cache_get(key: str) -> Any:
    entry = _response_cache.get(key)
    if entry is None:
        return None
    cached_at, value = entry
    if time.time() - cached_at > _CACHE_TTL_SECONDS:
        _response_cache.pop(key, None)
        return None
    return value


def _cache_set(key: str, value: Any) -> None:
    if len(_response_cache) >= _CACHE_MAX_ENTRIES:
        oldest_key = min(_response_cache, key=lambda k: _response_cache[k][0])
        _response_cache.pop(oldest_key, None)
    _response_cache[key] = (time.time(), value)


def _select_provider() -> Optional[str]:
    if settings.GN_API_KEY:
        return "gn"
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


def _gn_ask_text_stream(system: str, user_message: str, max_tokens: int, effort: str):
    client = _get_gn_client()
    model, tokens = _select_gn_model_and_tokens(effort, max_tokens)
    stream = client.chat.completions.create(
        model=model,
        max_tokens=tokens,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user_message},
        ],
        stream=True,
    )
    for chunk in stream:
        delta = chunk.choices[0].delta
        content = getattr(delta, "content", None)
        if content:
            yield content


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
# 공개 API
# ---------------------------------------------------------------------------

def ask_text(system: str, user_message: str, max_tokens: int = 2048, effort: str = "medium") -> str:
    provider = _select_provider()
    if provider != "gn":
        raise RuntimeError("No LLM provider configured")

    key = _cache_key("text", system, user_message, max_tokens, effort)
    cached = _cache_get(key)
    if cached is not None:
        return cached

    result = _gn_ask_text(system, user_message, max_tokens, effort)
    _cache_set(key, result)
    return result


def ask_text_stream(system: str, user_message: str, max_tokens: int = 2048, effort: str = "medium"):
    """토큰 단위로 흘려보내는 스트리밍 버전. 대화형 챗봇처럼 체감 속도가 중요한 곳에서 사용한다."""
    provider = _select_provider()
    if provider != "gn":
        raise RuntimeError("No LLM provider configured")
    yield from _gn_ask_text_stream(system, user_message, max_tokens, effort)


def ask_json(
    system: str,
    user_message: str,
    json_schema: dict,
    max_tokens: int = 2048,
    effort: str = "medium",
) -> dict[str, Any]:
    provider = _select_provider()
    if provider != "gn":
        raise RuntimeError("No LLM provider configured")

    key = _cache_key("json", system, user_message, json.dumps(json_schema, sort_keys=True), max_tokens, effort)
    cached = _cache_get(key)
    if cached is not None:
        return cached

    result = _gn_ask_json(system, user_message, json_schema, max_tokens, effort)
    _cache_set(key, result)
    return result
