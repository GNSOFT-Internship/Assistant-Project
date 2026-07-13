"""AI 엔드포인트는 gn-cab API의 분당 호출 제한을 넘지 않도록 서버단에서
요청 수를 제한해야 한다."""

from app import rate_limit


def test_ai_rate_limit_blocks_after_threshold(client, admin_headers):
    for _ in range(rate_limit._MAX_REQUESTS):
        resp = client.get("/api/ai/maintenance-analysis", headers=admin_headers)
        assert resp.status_code == 200

    resp = client.get("/api/ai/maintenance-analysis", headers=admin_headers)
    assert resp.status_code == 429
    assert "잠시 후" in resp.json()["detail"]


def test_ai_rate_limit_does_not_affect_non_ai_endpoints(client, admin_headers):
    for _ in range(rate_limit._MAX_REQUESTS):
        client.get("/api/ai/maintenance-analysis", headers=admin_headers)

    resp = client.get("/api/assets", headers=admin_headers)
    assert resp.status_code == 200
