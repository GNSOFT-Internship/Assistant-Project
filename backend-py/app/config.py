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
    JWT_EXPIRATION_SECONDS: int = int(os.getenv("JWT_EXPIRATION_SECONDS", "86400"))
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


settings = Settings()
