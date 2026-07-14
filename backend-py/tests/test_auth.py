def test_login_success(client):
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["username"] == "admin"
    assert body["data"]["role"] == "ADMIN"
    assert body["data"]["token"]


def test_login_wrong_password(client):
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
    assert resp.status_code == 401
    assert resp.json()["success"] is False


def test_login_unknown_user(client):
    resp = client.post("/api/auth/login", json={"username": "nobody", "password": "x"})
    assert resp.status_code == 401


def test_login_lockout_after_repeated_failures(client):
    for _ in range(5):
        resp = client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
        assert resp.status_code == 401

    locked_resp = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert locked_resp.status_code == 429


def test_login_lockout_uses_x_real_ip_not_shared_proxy_address(client):
    """nginx 뒤에서는 request.client.host가 항상 nginx 자신의 주소라, 그걸
    그대로 쓰면 모든 사용자가 같은 잠금 카운터를 공유하게 된다(한 사람의 실수로
    전체가 잠김). X-Real-IP 헤더로 실제 클라이언트를 구분해야 한다."""
    for _ in range(5):
        resp = client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "wrong"},
            headers={"X-Real-IP": "203.0.113.1"},
        )
        assert resp.status_code == 401

    # 같은 X-Real-IP는 잠겨야 한다.
    locked_resp = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "admin123"},
        headers={"X-Real-IP": "203.0.113.1"},
    )
    assert locked_resp.status_code == 429

    # 다른 X-Real-IP(다른 실제 사용자)는 영향을 받지 않아야 한다.
    other_ip_resp = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "admin123"},
        headers={"X-Real-IP": "203.0.113.2"},
    )
    assert other_ip_resp.status_code == 200


def test_protected_endpoint_requires_token(client):
    resp = client.get("/api/assets")
    assert resp.status_code == 401


def test_protected_endpoint_rejects_bad_token(client):
    resp = client.get("/api/assets", headers={"Authorization": "Bearer not-a-real-token"})
    assert resp.status_code == 401


def test_protected_endpoint_accepts_valid_token(client, admin_headers):
    resp = client.get("/api/assets", headers=admin_headers)
    assert resp.status_code == 200
