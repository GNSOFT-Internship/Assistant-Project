import os
import sys
from pathlib import Path

# 앱의 어떤 모듈보다도 먼저 실행되어야 한다: config.py가 import 시점에
# os.getenv("DATABASE_URL")을 읽어 전역 Settings를 만들기 때문에, 여기서
# 실제 MySQL 대신 테스트 전용 SQLite 파일을 가리키도록 먼저 지정한다.
_TEST_DB_PATH = Path(__file__).parent / "test.db"
if _TEST_DB_PATH.exists():
    try:
        _TEST_DB_PATH.unlink()
    except PermissionError:
        pass

_TEST_UPLOAD_DIR = Path(__file__).parent / "test_uploads"

os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB_PATH}"
os.environ["UPLOAD_DIRECTORY"] = str(_TEST_UPLOAD_DIR)
os.environ.setdefault("JWT_SECRET", "test-secret-key")
os.environ["GN_API_KEY"] = ""

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event

from app.database import get_db, engine, SessionLocal
from app.main import app


@pytest.fixture(scope="session")
def _app_client():
    """세션 전체에서 한 번만 테이블 생성 + 초기 계정 시딩(lifespan startup)을 수행한다."""
    with TestClient(app) as c:
        yield c
    engine.dispose()
    try:
        if _TEST_DB_PATH.exists():
            _TEST_DB_PATH.unlink()
    except PermissionError:
        pass  # Windows에서 파일 핸들이 늦게 풀리는 경우가 있음 — 다음 실행 시 정리됨
    if _TEST_UPLOAD_DIR.exists():
        import shutil
        shutil.rmtree(_TEST_UPLOAD_DIR, ignore_errors=True)


@pytest.fixture()
def client(_app_client):
    """테스트 함수마다 격리된 트랜잭션에서 실행되고, 끝나면 전부 롤백된다.

    라우터가 내부적으로 db.commit()을 호출해도 실제로는 SAVEPOINT만
    커밋되고, 바깥쪽 트랜잭션은 테스트가 끝난 뒤 롤백되므로 테스트 간
    데이터가 섞이지 않는다.
    """
    connection = engine.connect()
    outer_tx = connection.begin()
    session = SessionLocal(bind=connection)
    nested = connection.begin_nested()

    @event.listens_for(session, "after_transaction_end")
    def _restart_savepoint(sess, transaction):
        nonlocal nested
        if transaction.nested and not transaction._parent.nested:
            nested = connection.begin_nested()

    def _override_get_db():
        try:
            yield session
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db
    try:
        yield _app_client
    finally:
        app.dependency_overrides.pop(get_db, None)
        session.close()
        outer_tx.rollback()
        connection.close()


@pytest.fixture(autouse=True)
def _reset_login_lockout():
    """로그인 실패 카운터는 DB가 아니라 프로세스 메모리에 있어서 트랜잭션
    롤백으로는 안 지워진다. 테스트끼리 영향 안 주도록 매번 비워준다."""
    from app.routers import auth_router
    auth_router._failed_attempts.clear()
    yield
    auth_router._failed_attempts.clear()


@pytest.fixture()
def admin_headers(client):
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    token = resp.json()["data"]["token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def user_headers(client):
    resp = client.post("/api/auth/login", json={"username": "user", "password": "user123"})
    token = resp.json()["data"]["token"]
    return {"Authorization": f"Bearer {token}"}
