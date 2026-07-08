import os
from dotenv import load_dotenv

load_dotenv()


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


settings = Settings()
