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
# 테스트는 admin/admin123 계정 로그인에 의존하므로(admin_headers 픽스처)
# 자동 시드를 명시적으로 켠다. user/user123은 앱이 더 이상 자동으로
# 만들지 않아서, user_headers 픽스처가 필요할 때 직접 만든다.
os.environ.setdefault("SEED_DEFAULT_USERS", "true")
# starlette TestClient가 보내는 요청의 request.client.host는 실제 IP가 아니라
# "testclient" 고정 문자열이므로, X-Real-IP 기반 테스트가 동작하려면 이 값도
# 신뢰 프록시 목록에 포함되어야 한다.
os.environ.setdefault("TRUSTED_PROXY_IPS", "127.0.0.1,::1,testclient")

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


@pytest.fixture(autouse=True)
def _reset_ai_rate_limit():
    """AI 요청 제한도 프로세스 메모리 기반이라, 테스트가 몰아서 여러 번
    AI 엔드포인트를 호출해도 429로 실패하지 않도록 매번 비워준다."""
    from app import rate_limit
    rate_limit._timestamps.clear()
    rate_limit._timestamps_by_ip.clear()
    yield
    rate_limit._timestamps.clear()
    rate_limit._timestamps_by_ip.clear()


@pytest.fixture()
def db_session(client):
    """client 픽스처가 라우터에 주입해둔 것과 동일한 세션을 테스트에서도 직접 써야 할 때
    (예: 방어 로직을 검증하기 위해 일부러 비정상 데이터 상태를 만들어야 하는 경우) 사용한다."""
    from app.database import get_db
    from app.main import app

    override = app.dependency_overrides[get_db]
    session = next(override())
    yield session


@pytest.fixture()
def admin_headers(client):
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    token = resp.json()["data"]["token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def user_headers(client, db_session):
    """앱은 이제 admin 계정만 자동 시딩한다(운영자가 삭제한 user 계정이 재시작마다
    되살아나던 문제 때문). 일반 사용자 권한 테스트에 필요한 user/user123 계정은
    테스트 스스로 만든다."""
    from app import models, auth

    if db_session.query(models.User).filter(models.User.username == "user").first() is None:
        db_session.add(models.User(
            username="user",
            password=auth.hash_password("user123"),
            role=models.UserRole.USER,
            email="user@example.com",
        ))
        db_session.commit()

    resp = client.post("/api/auth/login", json={"username": "user", "password": "user123"})
    token = resp.json()["data"]["token"]
    return {"Authorization": f"Bearer {token}"}
