"""AI 엔드포인트는 gn-cab API의 분당 호출 제한을 넘지 않도록 서버단에서
요청 수를 제한해야 한다. 전체 공유 상한(_MAX_REQUESTS)과, 한 IP가 그 공유
한도를 혼자 다 써버리지 못하게 막는 IP별 상한(_MAX_REQUESTS_PER_IP) 두 개가
함께 동작해야 한다."""

from app import rate_limit


def test_ai_rate_limit_blocks_single_ip_after_per_ip_threshold(client, admin_headers):
    """같은 IP에서 계속 요청하면, 전체 상한(15)보다 먼저 IP별 상한(8)에 걸려야 한다."""
    for _ in range(rate_limit._MAX_REQUESTS_PER_IP):
        resp = client.get("/api/ai/maintenance-analysis", headers=admin_headers)
        assert resp.status_code == 200

    resp = client.get("/api/ai/maintenance-analysis", headers=admin_headers)
    assert resp.status_code == 429
    assert "잠시 후" in resp.json()["detail"]


def test_ai_rate_limit_blocks_after_global_threshold_across_ips(client, admin_headers):
    """서로 다른 IP(X-Real-IP)에서 나눠 요청해 개별 IP 상한은 넘지 않아도,
    전체 합산이 공유 상한(15)을 넘으면 그 다음부터는 어떤 IP든 차단되어야 한다."""
    per_ip = rate_limit._MAX_REQUESTS_PER_IP
    total = rate_limit._MAX_REQUESTS
    ip_index = 0
    sent = 0
    while sent < total:
        ip_index += 1
        batch = min(per_ip, total - sent)
        headers = {**admin_headers, "X-Real-IP": f"10.0.0.{ip_index}"}
        for _ in range(batch):
            resp = client.get("/api/ai/maintenance-analysis", headers=headers)
            assert resp.status_code == 200
            sent += 1

    # 전체 상한을 채운 뒤에는 지금까지 한 번도 쓰지 않은 새 IP로도 차단되어야 한다
    # (이 제한은 gn-cab API 키 자체의 공유 예산을 보호하기 위한 것이라 IP와 무관).
    resp = client.get("/api/ai/maintenance-analysis", headers={**admin_headers, "X-Real-IP": "10.0.0.250"})
    assert resp.status_code == 429


def test_ai_rate_limit_does_not_affect_non_ai_endpoints(client, admin_headers):
    for _ in range(rate_limit._MAX_REQUESTS_PER_IP):
        client.get("/api/ai/maintenance-analysis", headers=admin_headers)

    resp = client.get("/api/assets", headers=admin_headers)
    assert resp.status_code == 200
