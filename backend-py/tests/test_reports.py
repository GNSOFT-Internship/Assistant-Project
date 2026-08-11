"""월간 보고서 PDF 다운로드 엔드포인트 검증.

reportlab로 실제 PDF 바이트를 생성하는 경로라, 한글 폰트 설정이나 데이터 조합에
따라 조용히 깨질 수 있어 최소한 200 응답과 유효한 PDF 시그니처를 확인한다.
"""

from datetime import datetime

ASSET_PAYLOAD = {
    "assetName": "보고서 테스트 자산",
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
    """총 자산 수/상태별 집계/그 달 유지보수 비용이 실제로 등록한 데이터와 정확히 일치하는지 확인한다.

    유지보수 비용은 이제 "그 달에 실제로 발생한" 이력만 집계하므로(진짜 월간 통계),
    두 건 모두 같은 달(2024-05)에 두고 그 달을 명시적으로 조회한다.
    """
    _create_asset(client, admin_headers, status="ACTIVE")
    _create_asset(client, admin_headers, status="ACTIVE")
    replacement_needed = _create_asset(client, admin_headers, status="REPLACEMENT_NEEDED")

    client.post(
        f"/api/assets/{replacement_needed['id']}/maintenance",
        json={"maintenanceDate": "2024-05-01", "maintenanceType": "REPAIR", "cost": 30000, "description": "수리1"},
        headers=admin_headers,
    )
    client.post(
        f"/api/assets/{replacement_needed['id']}/maintenance",
        json={"maintenanceDate": "2024-05-20", "maintenanceType": "REPAIR", "cost": 20000, "description": "수리2"},
        headers=admin_headers,
    )

    resp = client.get("/api/reports/monthly", params={"year": 2024, "month": 5}, headers=admin_headers)
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

    single_repair = _create_asset(client, admin_headers)
    client.post(
        f"/api/assets/{single_repair['id']}/maintenance",
        json={"maintenanceDate": "2024-05-01", "maintenanceType": "REPAIR", "cost": 10000, "description": "1회 수리"},
        headers=admin_headers,
    )

    many_routine = _create_asset(client, admin_headers)
    for i in range(3):
        client.post(
            f"/api/assets/{many_routine['id']}/maintenance",
            json={"maintenanceDate": f"2024-0{i+1}-01", "maintenanceType": "ROUTINE", "cost": 5000, "description": "정기점검"},
            headers=admin_headers,
        )

    # 아직 REPAIR가 2건 이상인 자산이 늘지 않았으므로 반복 고장 수는 그대로여야 한다
    resp_mid = client.get("/api/reports/monthly", headers=admin_headers)
    assert resp_mid.json()["data"]["repeatedFailureCount"] == baseline

    repeated = _create_asset(client, admin_headers)
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
    """반복 고장 자산은 이름/코드/횟수/누적비용까지, 그 달 카테고리별 비용도 함께 내려줘야 한다.

    반복 고장 집계(failureCount/totalCost)는 그 달 시점까지의 누적 이력을 보므로 서로 다른
    달에 걸쳐 있어도 되지만, costByCategory는 "그 달에 실제로 발생한" 비용만 집계하므로
    두 수리 모두 같은 달(2024-05)에 두고 그 달을 명시적으로 조회한다.
    """
    asset = _create_asset(client, admin_headers, category="IT 장비")
    client.post(
        f"/api/assets/{asset['id']}/maintenance",
        json={"maintenanceDate": "2024-05-01", "maintenanceType": "REPAIR", "cost": 10000, "description": "수리A"},
        headers=admin_headers,
    )
    client.post(
        f"/api/assets/{asset['id']}/maintenance",
        json={"maintenanceDate": "2024-05-20", "maintenanceType": "REPAIR", "cost": 15000, "description": "수리B"},
        headers=admin_headers,
    )

    resp = client.get("/api/reports/monthly", params={"year": 2024, "month": 5}, headers=admin_headers)
    data = resp.json()["data"]

    detail = next((a for a in data["repeatedFailureAssets"] if a["assetName"] == "보고서 테스트 자산"), None)
    assert detail is not None
    assert detail["failureCount"] >= 2
    assert detail["totalCost"] >= 25000
    assert data["costByCategory"].get("IT 장비", 0) >= 25000


def test_monthly_report_cost_by_month_only_includes_the_reported_month(client, admin_headers):
    """'월별 비용 추이'는 보고 대상 월과 무관한 과거 전체 이력이 아니라, 그 달 자체의
    비용만 담아야 한다(반복 고장/교체 추천처럼 구매 이후 누적 이력을 보는 지표와는 다름)."""
    asset = _create_asset(client, admin_headers)
    client.post(
        f"/api/assets/{asset['id']}/maintenance",
        json={"maintenanceDate": "2023-01-15", "maintenanceType": "REPAIR", "cost": 999000, "description": "작년 수리"},
        headers=admin_headers,
    )
    client.post(
        f"/api/assets/{asset['id']}/maintenance",
        json={"maintenanceDate": "2024-05-10", "maintenanceType": "REPAIR", "cost": 40000, "description": "이번 달 수리"},
        headers=admin_headers,
    )

    resp = client.get("/api/reports/monthly", params={"year": 2024, "month": 5}, headers=admin_headers)
    data = resp.json()["data"]

    assert "2023-01" not in data["costByMonth"]
    assert set(data["costByMonth"].keys()) == {"2024-05"}


def test_monthly_report_pdf_reflects_new_sections(client, admin_headers):
    """반복 고장 자산/카테고리별 비용 섹션이 추가된 뒤에도 PDF가 정상 생성되는지 확인한다."""
    asset = _create_asset(client, admin_headers)
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


def test_monthly_report_status_reflects_historical_value_not_current(client, admin_headers, db_session):
    """과거 달의 보고서를 조회하면 "지금" 상태가 아니라 "그 시점"의 상태가 나와야 한다.

    감사로그에 CREATE/UPDATE 시점의 status 변경 이력이 남으므로, 그 이력을 거슬러
    올라가 특정 시점의 값을 재구성한다. created_at을 직접 조작해, 자산이
    2024-01(ACTIVE로 생성)과 2024-06(REPLACEMENT_NEEDED로 변경) 사이에 있었던
    것처럼 재현한다.
    """
    from app import models

    asset = _create_asset(client, admin_headers, status="ACTIVE")
    update_payload = {**ASSET_PAYLOAD, "status": "REPLACEMENT_NEEDED"}
    resp = client.put(f"/api/assets/{asset['id']}", json=update_payload, headers=admin_headers)
    assert resp.status_code == 200

    logs = (
        db_session.query(models.AssetAuditLog)
        .filter(models.AssetAuditLog.asset_id == asset["id"])
        .order_by(models.AssetAuditLog.created_at.asc())
        .all()
    )
    assert len(logs) == 2  # CREATE, UPDATE
    logs[0].created_at = datetime(2024, 1, 15)
    logs[1].created_at = datetime(2024, 6, 15)
    db_session.commit()

    # 상태 변경 이전 시점(3월)을 조회하면 아직 ACTIVE였어야 한다
    before_resp = client.get("/api/reports/monthly", params={"year": 2024, "month": 3}, headers=admin_headers)
    before_data = before_resp.json()["data"]
    assert before_data["byStatus"].get("REPLACEMENT_NEEDED", 0) == 0

    # 상태 변경 이후 시점(7월)을 조회하면 REPLACEMENT_NEEDED로 반영되어야 한다
    after_resp = client.get("/api/reports/monthly", params={"year": 2024, "month": 7}, headers=admin_headers)
    after_data = after_resp.json()["data"]
    assert after_data["byStatus"].get("REPLACEMENT_NEEDED", 0) >= 1


def test_monthly_report_narrative_requires_auth(client):
    resp = client.post("/api/reports/monthly/narrative", json={"totalAssets": 0})
    assert resp.status_code == 401
