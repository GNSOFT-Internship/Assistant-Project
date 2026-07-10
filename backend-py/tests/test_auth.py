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


def test_protected_endpoint_requires_token(client):
    resp = client.get("/api/assets")
    assert resp.status_code == 401


def test_protected_endpoint_rejects_bad_token(client):
    resp = client.get("/api/assets", headers={"Authorization": "Bearer not-a-real-token"})
    assert resp.status_code == 401


def test_protected_endpoint_accepts_valid_token(client, admin_headers):
    resp = client.get("/api/assets", headers=admin_headers)
    assert resp.status_code == 200
