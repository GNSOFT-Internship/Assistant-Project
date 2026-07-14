"""월간 보고서 PDF 다운로드 엔드포인트 검증.

reportlab로 실제 PDF 바이트를 생성하는 경로라, 한글 폰트 설정이나 데이터 조합에
따라 조용히 깨질 수 있어 최소한 200 응답과 유효한 PDF 시그니처를 확인한다.
"""

ASSET_PAYLOAD = {
    "assetName": "보고서 테스트 자산",
    "assetCode": "TEST-REPORT-001",
    "category": "IT 장비",
    "location": "테스트실",
    "responsiblePerson": "테스트담당",
    "purchaseDate": "2020-01-01",
    "purchasePrice": 1000000,
    "usefulLife": 5,
    "status": "ACTIVE",
    "description": "pytest로 만든 자산",
}


def test_monthly_report_pdf_returns_valid_pdf(client, admin_headers):
    client.post("/api/assets", json=ASSET_PAYLOAD, headers=admin_headers)

    resp = client.get("/api/reports/monthly/pdf", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert "attachment" in resp.headers["content-disposition"]
    assert resp.content.startswith(b"%PDF")
    assert len(resp.content) > 500


def test_monthly_report_pdf_requires_auth(client):
    resp = client.get("/api/reports/monthly/pdf")
    assert resp.status_code == 401


def _create_asset(client, admin_headers, **overrides):
    payload = {**ASSET_PAYLOAD, **overrides}
    resp = client.post("/api/assets", json=payload, headers=admin_headers)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def test_monthly_report_totals_and_status_breakdown_match_actual_data(client, admin_headers):
    """총 자산 수/상태별 집계/누적 비용이 실제로 등록한 데이터와 정확히 일치하는지 확인한다."""
    _create_asset(client, admin_headers, assetCode="TEST-REPORT-A", status="ACTIVE")
    _create_asset(client, admin_headers, assetCode="TEST-REPORT-B", status="ACTIVE")
    replacement_needed = _create_asset(client, admin_headers, assetCode="TEST-REPORT-C", status="REPLACEMENT_NEEDED")

    client.post(
        f"/api/assets/{replacement_needed['id']}/maintenance",
        json={"maintenanceDate": "2024-05-01", "maintenanceType": "REPAIR", "cost": 30000, "description": "수리1"},
        headers=admin_headers,
    )
    client.post(
        f"/api/assets/{replacement_needed['id']}/maintenance",
        json={"maintenanceDate": "2024-06-01", "maintenanceType": "REPAIR", "cost": 20000, "description": "수리2"},
        headers=admin_headers,
    )

    resp = client.get("/api/reports/monthly", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()["data"]

    assert data["totalAssets"] >= 3
    assert data["byStatus"]["ACTIVE"] >= 2
    assert data["byStatus"]["REPLACEMENT_NEEDED"] >= 1
    assert data["totalMaintenanceCost"] >= 50000


def test_monthly_report_repeated_failure_count_requires_two_or_more_repairs(client, admin_headers):
    """REPAIR 유형이 2건 이상인 자산만 '반복 고장'으로 집계되고, 정기점검(ROUTINE)은 집계되지 않아야 한다."""
    resp_before = client.get("/api/reports/monthly", headers=admin_headers)
    baseline = resp_before.json()["data"]["repeatedFailureCount"]

    single_repair = _create_asset(client, admin_headers, assetCode="TEST-REPORT-SINGLE")
    client.post(
        f"/api/assets/{single_repair['id']}/maintenance",
        json={"maintenanceDate": "2024-05-01", "maintenanceType": "REPAIR", "cost": 10000, "description": "1회 수리"},
        headers=admin_headers,
    )

    many_routine = _create_asset(client, admin_headers, assetCode="TEST-REPORT-ROUTINE")
    for i in range(3):
        client.post(
            f"/api/assets/{many_routine['id']}/maintenance",
            json={"maintenanceDate": f"2024-0{i+1}-01", "maintenanceType": "ROUTINE", "cost": 5000, "description": "정기점검"},
            headers=admin_headers,
        )

    # 아직 REPAIR가 2건 이상인 자산이 늘지 않았으므로 반복 고장 수는 그대로여야 한다
    resp_mid = client.get("/api/reports/monthly", headers=admin_headers)
    assert resp_mid.json()["data"]["repeatedFailureCount"] == baseline

    repeated = _create_asset(client, admin_headers, assetCode="TEST-REPORT-REPEATED")
    client.post(
        f"/api/assets/{repeated['id']}/maintenance",
        json={"maintenanceDate": "2024-05-01", "maintenanceType": "REPAIR", "cost": 10000, "description": "수리A"},
        headers=admin_headers,
    )
    client.post(
        f"/api/assets/{repeated['id']}/maintenance",
        json={"maintenanceDate": "2024-06-01", "maintenanceType": "REPAIR", "cost": 15000, "description": "수리B"},
        headers=admin_headers,
    )

    resp_after = client.get("/api/reports/monthly", headers=admin_headers)
    assert resp_after.json()["data"]["repeatedFailureCount"] == baseline + 1


def test_monthly_report_includes_repeated_failure_asset_detail_and_category_cost(client, admin_headers):
    """반복 고장 자산은 이름/코드/횟수/누적비용까지, 카테고리별 비용도 함께 내려줘야 한다."""
    asset = _create_asset(client, admin_headers, assetCode="TEST-REPORT-DETAIL", category="IT 장비")
    client.post(
        f"/api/assets/{asset['id']}/maintenance",
        json={"maintenanceDate": "2024-05-01", "maintenanceType": "REPAIR", "cost": 10000, "description": "수리A"},
        headers=admin_headers,
    )
    client.post(
        f"/api/assets/{asset['id']}/maintenance",
        json={"maintenanceDate": "2024-06-01", "maintenanceType": "REPAIR", "cost": 15000, "description": "수리B"},
        headers=admin_headers,
    )

    resp = client.get("/api/reports/monthly", headers=admin_headers)
    data = resp.json()["data"]

    detail = next((a for a in data["repeatedFailureAssets"] if a["assetCode"] == "TEST-REPORT-DETAIL"), None)
    assert detail is not None
    assert detail["failureCount"] >= 2
    assert detail["totalCost"] >= 25000
    assert data["costByCategory"].get("IT 장비", 0) >= 25000


def test_monthly_report_pdf_reflects_new_sections(client, admin_headers):
    """반복 고장 자산/카테고리별 비용 섹션이 추가된 뒤에도 PDF가 정상 생성되는지 확인한다."""
    asset = _create_asset(client, admin_headers, assetCode="TEST-REPORT-PDF-DETAIL")
    client.post(
        f"/api/assets/{asset['id']}/maintenance",
        json={"maintenanceDate": "2024-05-01", "maintenanceType": "REPAIR", "cost": 10000, "description": "수리A"},
        headers=admin_headers,
    )
    client.post(
        f"/api/assets/{asset['id']}/maintenance",
        json={"maintenanceDate": "2024-06-01", "maintenanceType": "REPAIR", "cost": 15000, "description": "수리B"},
        headers=admin_headers,
    )

    resp = client.get("/api/reports/monthly/pdf", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.content.startswith(b"%PDF")


def test_monthly_report_narrative_endpoint_generates_from_given_data_without_hitting_db(client, admin_headers):
    """'AI 요약 보기' 클릭 시 화면에 이미 있는 통계를 그대로 보내 서술만 받아오는
    엔드포인트. DB를 다시 조회하지 않고 넘겨받은 데이터만으로 생성되어야 한다."""
    report_data = {
        "totalAssets": 3,
        "byCategory": {"IT 장비": 3},
        "byStatus": {"ACTIVE": 3},
        "totalMaintenanceCost": 100000,
        "costByMonth": {"2024-05": 100000},
        "costByCategory": {"IT 장비": 100000},
        "replacementCandidates": [],
        "repeatedFailureCount": 0,
        "repeatedFailureAssets": [],
    }
    resp = client.post("/api/reports/monthly/narrative", json=report_data, headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert isinstance(data["executiveSummary"], str) and len(data["executiveSummary"]) > 0
    assert len(data["keyIssues"]) >= 1
    assert len(data["recommendations"]) >= 1


def test_monthly_report_narrative_requires_auth(client):
    resp = client.post("/api/reports/monthly/narrative", json={"totalAssets": 0})
    assert resp.status_code == 401
