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


def test_dashboard_top_replacement_needed_only_includes_that_status_sorted_by_score(client, admin_headers):
    # ACTIVE 자산은 "교체 필요" 상태가 아니므로 우선순위 목록에 나타나면 안 된다.
    client.post("/api/assets", json=ASSET_PAYLOAD, headers=admin_headers)

    low_priority = {
        **ASSET_PAYLOAD,
        "assetCode": "TEST-DASH-002",
        "assetName": "낮은 우선순위 자산",
        "purchaseDate": "2024-01-01",
        "usefulLife": 10,
        "status": "REPLACEMENT_NEEDED",
    }
    high_priority = {
        **ASSET_PAYLOAD,
        "assetCode": "TEST-DASH-003",
        "assetName": "높은 우선순위 자산",
        "purchaseDate": "2010-01-01",
        "usefulLife": 3,
        "status": "REPLACEMENT_NEEDED",
    }
    client.post("/api/assets", json=low_priority, headers=admin_headers)
    client.post("/api/assets", json=high_priority, headers=admin_headers)

    resp = client.get("/api/dashboard", headers=admin_headers)
    assert resp.status_code == 200
    top = resp.json()["data"]["topReplacementNeeded"]

    assert len(top) == 2
    assert [t["assetCode"] for t in top] == ["TEST-DASH-003", "TEST-DASH-002"]
    assert top[0]["score"] >= top[1]["score"]
