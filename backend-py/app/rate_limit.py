import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

from .client_ip import get_client_ip

_WINDOW_SECONDS = 60
# gn-cab API 키 자체가 분당 30회로 제한되어 있어(문서 기준), 워커 프로세스당
# 이보다 여유 있게 낮춰 잡아 여러 사용자가 동시에 AI 버튼을 연타해도
# 429/과금 폭주 없이 서버단에서 먼저 걸러낸다. (in-memory라 워커 수만큼
# 실제 상한이 늘어나는 점은 감안한 근사치)
_MAX_REQUESTS = 15
# 위 전체 상한과 별개로, 특정 IP 한 곳이 이 공유 한도를 혼자 다 써버려서
# 다른 사용자의 AI 기능이 막히는 것을 막기 위한 IP별 개별 상한.
_MAX_REQUESTS_PER_IP = 8

_lock = threading.Lock()
_timestamps: deque = deque()
_timestamps_by_ip: dict[str, deque] = defaultdict(deque)


def check_ai_rate_limit(request: Request) -> None:
    now = time.monotonic()
    ip = get_client_ip(request)
    with _lock:
        while _timestamps and now - _timestamps[0] > _WINDOW_SECONDS:
            _timestamps.popleft()
        if len(_timestamps) >= _MAX_REQUESTS:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="AI 요청이 많아 잠시 후 다시 시도해주세요.",
            )

        ip_bucket = _timestamps_by_ip[ip]
        while ip_bucket and now - ip_bucket[0] > _WINDOW_SECONDS:
            ip_bucket.popleft()
        if len(ip_bucket) >= _MAX_REQUESTS_PER_IP:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="AI 요청이 많아 잠시 후 다시 시도해주세요.",
            )

        _timestamps.append(now)
        ip_bucket.append(now)
