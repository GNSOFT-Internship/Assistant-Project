"""예산 배정 CRUD(GET/PUT/DELETE /api/budgets) 엔드포인트 검증.

예산 관리 페이지가 직접 의존하는 핵심 저장/삭제 로직인데도 지금까지
테스트가 전혀 없었다."""


def test_set_budget_creates_new_entry(client, admin_headers):
    resp = client.put("/api/budgets/2026/5", json={"allocatedAmount": 300000}, headers=admin_headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["year"] == 2026
    assert data["month"] == 5
    assert data["allocatedAmount"] == 300000

    listed = client.get("/api/budgets", headers=admin_headers).json()["data"]
    assert any(b["year"] == 2026 and b["month"] == 5 and b["allocatedAmount"] == 300000 for b in listed)


def test_set_budget_updates_existing_entry_without_duplicating(client, admin_headers):
    client.put("/api/budgets/2026/6", json={"allocatedAmount": 100000}, headers=admin_headers)
    resp = client.put("/api/budgets/2026/6", json={"allocatedAmount": 250000}, headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["data"]["allocatedAmount"] == 250000

    listed = client.get("/api/budgets", headers=admin_headers).json()["data"]
    matches = [b for b in listed if b["year"] == 2026 and b["month"] == 6]
    assert len(matches) == 1
    assert matches[0]["allocatedAmount"] == 250000


def test_set_budget_requires_admin(client, user_headers):
    resp = client.put("/api/budgets/2026/7", json={"allocatedAmount": 100000}, headers=user_headers)
    assert resp.status_code == 403


def test_delete_budget_removes_entry(client, admin_headers):
    client.put("/api/budgets/2026/8", json={"allocatedAmount": 50000}, headers=admin_headers)
    resp = client.delete("/api/budgets/2026/8", headers=admin_headers)
    assert resp.status_code == 200

    listed = client.get("/api/budgets", headers=admin_headers).json()["data"]
    assert not any(b["year"] == 2026 and b["month"] == 8 for b in listed)


def test_delete_nonexistent_budget_is_noop(client, admin_headers):
    resp = client.delete("/api/budgets/1999/1", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["success"] is True


def test_delete_budget_requires_admin(client, admin_headers, user_headers):
    client.put("/api/budgets/2026/9", json={"allocatedAmount": 50000}, headers=admin_headers)
    resp = client.delete("/api/budgets/2026/9", headers=user_headers)
    assert resp.status_code == 403

    listed = client.get("/api/budgets", headers=admin_headers).json()["data"]
    assert any(b["year"] == 2026 and b["month"] == 9 for b in listed)


def test_get_all_budgets_sorted_desc(client, admin_headers):
    client.put("/api/budgets/2025/1", json={"allocatedAmount": 10000}, headers=admin_headers)
    client.put("/api/budgets/2026/3", json={"allocatedAmount": 20000}, headers=admin_headers)
    client.put("/api/budgets/2026/1", json={"allocatedAmount": 30000}, headers=admin_headers)

    listed = client.get("/api/budgets", headers=admin_headers).json()["data"]
    pairs = [(b["year"], b["month"]) for b in listed]
    assert pairs == sorted(pairs, reverse=True)


def test_get_all_budgets_requires_auth(client):
    resp = client.get("/api/budgets")
    assert resp.status_code == 401


def test_set_budget_rejects_negative_amount(client, admin_headers):
    resp = client.put("/api/budgets/2026/10", json={"allocatedAmount": -1}, headers=admin_headers)
    assert resp.status_code == 422
