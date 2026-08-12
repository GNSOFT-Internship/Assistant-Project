"""요청의 실제 클라이언트 IP를 판별한다.

배포 환경에서는 nginx가 리버스 프록시로 앞단에 있고(`proxy_set_header X-Real-IP
$remote_addr;`), 백엔드는 항상 127.0.0.1에서 오는 요청만 본다. 이 사실을 모르고
`request.client.host`를 그대로 쓰면 모든 사용자가 똑같은 "IP"(nginx 자신의
루프백 주소)로 취급되어, 로그인 실패 잠금이나 IP별 요청 제한이 사실상 전체
사용자에게 공유되는 하나의 카운터가 되어버린다 (한 사용자의 실수로 전체가
잠기는 등). 그렇다고 이 헤더를 무조건 신뢰하면, nginx를 거치지 않고 백엔드에
직접 접근할 수 있는 경로(방화벽/포트 설정 실수 등)가 하나라도 있을 경우 누구나
X-Real-IP를 위조해 로그인 잠금·AI 요청 제한을 우회하거나 타인의 IP로 위장할 수
있다. 따라서 이 헤더는 실제 TCP 연결의 상대(peer)가 `TRUSTED_PROXY_IPS`에 등록된
"신뢰하는 프록시"일 때만 믿고, 그 외에는 TCP 연결의 소스 IP를 그대로 사용한다.
"""

from fastapi import Request

from .config import settings


def get_client_ip(request: Request) -> str:
    peer_ip = request.client.host if request.client else None

    if peer_ip in settings.TRUSTED_PROXY_IPS:
        forwarded = request.headers.get("x-real-ip") or request.headers.get("x-forwarded-for")
        if forwarded:
            # X-Forwarded-For는 "클라이언트, 프록시1, 프록시2, ..." 형태의 체인일 수 있으므로
            # 맨 앞(최초 클라이언트)만 사용한다.
            return forwarded.split(",")[0].strip()

    return peer_ip or "unknown"
