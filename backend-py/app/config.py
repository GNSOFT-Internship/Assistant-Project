import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


class Settings:
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "mysql+pymysql://asset:assetpass@127.0.0.1:3306/asset_management?charset=utf8mb4",
    )
    JWT_SECRET: str = os.getenv("JWT_SECRET", "asset-management-secret-key-for-development")
    JWT_ALGORITHM: str = "HS256"
    # 관리자 권한 회수/계정 삭제/비밀번호 변경을 해도 이미 발급된 JWT는 무효화할
    # 방법이 없다 (role이 DB가 아니라 토큰 안에만 있음). 이 앱은 사용자 관리를
    # DB 직접 수정으로만 하고 있어 완전한 토큰 무효화(버전 관리 등) 인프라를
    # 넣을 실익이 크지 않으므로, 대신 만료 시간을 짧게 잡아 노출 창을 줄인다.
    JWT_EXPIRATION_SECONDS: int = int(os.getenv("JWT_EXPIRATION_SECONDS", "7200"))
    UPLOAD_DIRECTORY: str = os.getenv("UPLOAD_DIRECTORY", "./uploads")
    DEMO_MODE: bool = os.getenv("DEMO_MODE", "true").lower() == "true"
    GN_API_KEY: str = os.getenv("GN_API_KEY", "")
    GN_MODEL: str = os.getenv("GN_MODEL", "qwen35")

    # admin/admin123, user/user123 기본 계정을 자동 생성/유지할지 여부.
    # 개발·데모 환경에서만 true로 켜고, 운영 배포에서는 반드시 false(기본값)로 두어
    # 기본 비밀번호가 그대로 남아있으면 기동이 실패하도록 한다.
    SEED_DEFAULT_USERS: bool = os.getenv("SEED_DEFAULT_USERS", "false").lower() == "true"

    # X-Real-IP / X-Forwarded-For 헤더를 신뢰할 "직전 홉(peer)"의 주소 목록.
    # 이 목록에 없는 곳에서 직접 들어온 요청은 헤더를 무시하고 TCP 연결의
    # 실제 소스 IP만 사용한다 (배포 시 nginx 컨테이너/호스트의 IP를 추가해야 함).
    TRUSTED_PROXY_IPS: set = set(
        ip.strip()
        for ip in os.getenv("TRUSTED_PROXY_IPS", "127.0.0.1,::1").split(",")
        if ip.strip()
    )

    # 업로드 파일(엑셀/PDF/배치 업로드) 하나당 허용하는 최대 크기.
    # systemd MemoryMax는 프로세스 메모리만 제한할 뿐, 디스크에 그대로 쌓이는
    # 파일 용량이나 엑셀 압축 해제 과정에서 잠깐 메모리에 올라가는 양은 막지
    # 못하므로, 업로드를 받는 시점에 서버가 직접 상한을 강제한다.
    MAX_UPLOAD_SIZE_MB: int = int(os.getenv("MAX_UPLOAD_SIZE_MB", "20"))
    MAX_UPLOAD_SIZE_BYTES: int = MAX_UPLOAD_SIZE_MB * 1024 * 1024


settings = Settings()
