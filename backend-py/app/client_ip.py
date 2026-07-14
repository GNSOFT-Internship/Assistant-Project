"""요청의 실제 클라이언트 IP를 판별한다.

배포 환경에서는 nginx가 리버스 프록시로 앞단에 있고(`proxy_set_header X-Real-IP
$remote_addr;`), 백엔드는 항상 127.0.0.1에서 오는 요청만 본다. 이 사실을 모르고
`request.client.host`를 그대로 쓰면 모든 사용자가 똑같은 "IP"(nginx 자신의
루프백 주소)로 취급되어, 로그인 실패 잠금이나 IP별 요청 제한이 사실상 전체
사용자에게 공유되는 하나의 카운터가 되어버린다 (한 사용자의 실수로 전체가
잠기는 등). nginx는 신뢰할 수 있는 유일한 프록시이므로 그 헤더를 신뢰한다.
"""

from fastapi import Request


def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-real-ip") or request.headers.get("x-forwarded-for")
    if forwarded:
        # X-Forwarded-For는 "클라이언트, 프록시1, 프록시2, ..." 형태의 체인일 수 있으므로
        # 맨 앞(최초 클라이언트)만 사용한다.
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
