from datetime import datetime

ASSET_PAYLOAD = {
    "assetName": "대시보드 테스트 자산",
    "assetCode": "TEST-DASH-001",
    "category": "IT 장비",
    "location": "테스트실",
    "responsiblePerson": "테스트담당",
    "purchaseDate": "2020-01-01",
    "purchasePrice": 1000000,
    "usefulLife": 5,
    "status": "ACTIVE",
    "description": "대시보드 테스트용",
}


def test_dashboard_not_simulated_when_real_budget_exists(client, admin_headers):
    client.post("/api/assets", json=ASSET_PAYLOAD, headers=admin_headers)
    now = datetime.now()
    client.put(
        f"/api/budgets/{now.year}/{now.month}",
        json={"allocatedAmount": 300000},
        headers=admin_headers,
    )

    resp = client.get("/api/dashboard", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["hasBudgetData"] is True
    assert data["isSimulated"] is False
    # 이번 달 유지보수 비용이 0이므로 소진율도 0(실제 값)이어야 하고,
    # DEMO_MODE의 임의 기본값(45.0)이 섞여 있으면 안 된다.
    assert data["budgetConsumptionRate"] == 0.0


def test_dashboard_marks_simulated_when_no_budget_set(client, admin_headers):
    client.post("/api/assets", json=ASSET_PAYLOAD, headers=admin_headers)

    resp = client.get("/api/dashboard", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["hasBudgetData"] is False
    # 예산이 아예 없어 임의 기본값을 쓰는 경우에만 시뮬레이션으로 표시한다.
    assert data["isSimulated"] is True
    assert data["budgetConsumptionRate"] == 45.0
