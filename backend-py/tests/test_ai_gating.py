"""유지보수 분석의 AI 서술과 보고서의 AI 요약은 매번 자동으로 LLM을
호출하지 않고, includeAi=true를 명시했을 때만 생성되어야 한다."""

ASSET_PAYLOAD = {
    "assetName": "AI 게이팅 테스트 자산",
    "assetCode": "TEST-GATE-001",
    "category": "IT 장비",
    "location": "테스트실",
    "responsiblePerson": "테스트담당",
    "purchaseDate": "2020-01-01",
    "purchasePrice": 1000000,
    "usefulLife": 5,
    "status": "ACTIVE",
    "description": "게이팅 테스트용",
}

MAINTENANCE_PAYLOAD = {
    "maintenanceDate": "2024-05-01",
    "maintenanceType": "REPAIR",
    "cost": 30000,
    "description": "게이팅 테스트 수리",
}


def _seed_one_maintenance_record(client, admin_headers):
    asset = client.post("/api/assets", json=ASSET_PAYLOAD, headers=admin_headers).json()["data"]
    client.post(f"/api/assets/{asset['id']}/maintenance", json=MAINTENANCE_PAYLOAD, headers=admin_headers)


def test_maintenance_analysis_skips_ai_by_default(client, admin_headers):
    _seed_one_maintenance_record(client, admin_headers)
    resp = client.get("/api/ai/maintenance-analysis", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["aiAnalysis"] is None
    # 통계/차트 데이터는 AI 없이도 그대로 내려온다
    assert data["statistics"]["totalRecords"] >= 1


def test_maintenance_analysis_includes_ai_when_requested(client, admin_headers):
    _seed_one_maintenance_record(client, admin_headers)
    resp = client.get("/api/ai/maintenance-analysis?includeAi=true", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["aiAnalysis"] is not None
    assert isinstance(data["aiAnalysis"], str) and len(data["aiAnalysis"]) > 0


def test_monthly_report_skips_ai_narrative_by_default(client, admin_headers):
    resp = client.get("/api/reports/monthly", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["executiveSummary"] is None
    assert data["keyIssues"] is None
    assert data["recommendations"] is None
    # 통계 데이터는 그대로 내려온다
    assert "totalAssets" in data


def test_monthly_report_includes_ai_narrative_when_requested(client, admin_headers):
    resp = client.get("/api/reports/monthly?includeAi=true", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["executiveSummary"] is not None
    assert isinstance(data["keyIssues"], list)
    assert isinstance(data["recommendations"], list)
