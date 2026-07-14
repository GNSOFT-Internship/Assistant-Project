"""JWT_SECRET이 공개 저장소에 노출된 기본값으로 남아있으면, DEMO_MODE 설정과
무관하게 서버 기동 자체를 막아야 한다 (과거에는 DEMO_MODE=true일 때 이 검증이
통째로 건너뛰어져 실제 운영 서버에도 그대로 배포된 적이 있었다)."""

import pytest

from app import main
from app.config import settings


def test_startup_rejects_default_jwt_secret_even_in_demo_mode(monkeypatch):
    monkeypatch.setattr(settings, "JWT_SECRET", main._DEFAULT_JWT_SECRET)
    monkeypatch.setattr(settings, "DEMO_MODE", True)
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        main.on_startup()


def test_startup_rejects_default_jwt_secret_outside_demo_mode(monkeypatch):
    monkeypatch.setattr(settings, "JWT_SECRET", main._DEFAULT_JWT_SECRET)
    monkeypatch.setattr(settings, "DEMO_MODE", False)
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        main.on_startup()


def test_startup_allows_custom_jwt_secret(monkeypatch):
    monkeypatch.setattr(settings, "JWT_SECRET", "a-real-custom-secret")
    main.on_startup()  # 예외 없이 정상 기동되어야 한다
