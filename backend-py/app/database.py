from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from .config import settings

# MariaDB의 max_connections이 30으로 제한되어 있어, uvicorn 워커를 여러 개 띄워도
# (워커 수 * (pool_size + max_overflow))가 그 한도를 넘지 않도록 보수적으로 설정한다.
# SQLite(테스트)는 이 파라미터들을 지원하지 않으므로 MySQL/MariaDB에만 적용한다.
_engine_kwargs = {"pool_pre_ping": True}
if settings.DATABASE_URL.startswith("mysql"):
    _engine_kwargs.update(pool_size=3, max_overflow=5)

engine = create_engine(settings.DATABASE_URL, **_engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
