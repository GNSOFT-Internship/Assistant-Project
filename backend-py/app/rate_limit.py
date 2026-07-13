import threading
import time
from collections import deque

from fastapi import HTTPException, status

_WINDOW_SECONDS = 60
# gn-cab API 키 자체가 분당 30회로 제한되어 있어(문서 기준), 워커 프로세스당
# 이보다 여유 있게 낮춰 잡아 여러 사용자가 동시에 AI 버튼을 연타해도
# 429/과금 폭주 없이 서버단에서 먼저 걸러낸다. (in-memory라 워커 수만큼
# 실제 상한이 늘어나는 점은 감안한 근사치)
_MAX_REQUESTS = 15

_lock = threading.Lock()
_timestamps: deque = deque()


def check_ai_rate_limit() -> None:
    now = time.monotonic()
    with _lock:
        while _timestamps and now - _timestamps[0] > _WINDOW_SECONDS:
            _timestamps.popleft()
        if len(_timestamps) >= _MAX_REQUESTS:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="AI 요청이 많아 잠시 후 다시 시도해주세요.",
            )
        _timestamps.append(now)
