ASSET_PAYLOAD = {
    "assetName": "테스트 노트북",
    "assetCode": "TEST-ASSET-001",
    "category": "IT 장비",
    "location": "테스트실",
    "responsiblePerson": "테스트담당",
    "purchaseDate": "2020-01-01",
    "purchasePrice": 1000000,
    "usefulLife": 5,
    "status": "ACTIVE",
    "description": "pytest로 만든 자산",
}


def _create_asset(client, admin_headers, **overrides):
    payload = {**ASSET_PAYLOAD, **overrides}
    resp = client.post("/api/assets", json=payload, headers=admin_headers)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def test_create_and_get_asset(client, admin_headers):
    asset = _create_asset(client, admin_headers)
    assert asset["assetCode"] == "TEST-ASSET-001"
    assert asset["status"] == "ACTIVE"

    resp = client.get(f"/api/assets/{asset['id']}", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["data"]["assetName"] == "테스트 노트북"


def test_create_asset_logs_history(client, admin_headers):
    asset = _create_asset(client, admin_headers, assetCode="TEST-ASSET-002")

    resp = client.get(f"/api/assets/{asset['id']}/history", headers=admin_headers)
    assert resp.status_code == 200
    logs = resp.json()["data"]["items"]
    assert len(logs) == 1
    assert logs[0]["action"] == "CREATE"
    assert logs[0]["changedBy"] == "admin"


def test_update_asset_logs_only_changed_fields(client, admin_headers):
    asset = _create_asset(client, admin_headers, assetCode="TEST-ASSET-003")

    updated = {**ASSET_PAYLOAD, "assetCode": "TEST-ASSET-003", "location": "새 위치"}
    resp = client.put(f"/api/assets/{asset['id']}", json=updated, headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["data"]["location"] == "새 위치"

    history = client.get(f"/api/assets/{asset['id']}/history", headers=admin_headers).json()["data"]["items"]
    update_entry = next(h for h in history if h["action"] == "UPDATE")
    assert "location" in update_entry["changes"]
    assert update_entry["changes"]["location"]["old"] == "테스트실"
    assert update_entry["changes"]["location"]["new"] == "새 위치"


def test_delete_asset(client, admin_headers):
    asset = _create_asset(client, admin_headers, assetCode="TEST-ASSET-004")
    resp = client.delete(f"/api/assets/{asset['id']}", headers=admin_headers)
    assert resp.status_code == 200

    resp = client.get(f"/api/assets/{asset['id']}", headers=admin_headers)
    assert resp.status_code == 404


MAINTENANCE_PAYLOAD = {
    "maintenanceDate": "2024-05-01",
    "maintenanceType": "REPAIR",
    "cost": 30000,
    "description": "테스트 수리",
    "technician": "김테스트",
    "failureType": "테스트고장",
}


def test_add_update_delete_maintenance_record_and_history(client, admin_headers):
    asset = _create_asset(client, admin_headers, assetCode="TEST-ASSET-005")
    asset_id = asset["id"]

    add_resp = client.post(
        f"/api/assets/{asset_id}/maintenance", json=MAINTENANCE_PAYLOAD, headers=admin_headers
    )
    assert add_resp.status_code == 200
    record = add_resp.json()["data"]
    assert record["cost"] == 30000

    list_resp = client.get(f"/api/assets/{asset_id}/maintenance", headers=admin_headers)
    assert len(list_resp.json()["data"]["items"]) == 1

    update_payload = {**MAINTENANCE_PAYLOAD, "cost": 50000, "description": "수정된 설명"}
    update_resp = client.put(
        f"/api/assets/{asset_id}/maintenance/{record['id']}", json=update_payload, headers=admin_headers
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["data"]["cost"] == 50000

    delete_resp = client.delete(f"/api/assets/{asset_id}/maintenance/{record['id']}", headers=admin_headers)
    assert delete_resp.status_code == 200
    assert client.get(f"/api/assets/{asset_id}/maintenance", headers=admin_headers).json()["data"]["items"] == []

    history = client.get(f"/api/assets/{asset_id}/history", headers=admin_headers).json()["data"]["items"]
    actions = [h["action"] for h in history if "maintenance_record" in (h["changes"] or {})]
    assert actions.count("CREATE") == 1
    assert actions.count("UPDATE") == 1
    assert actions.count("DELETE") == 1


def test_update_maintenance_record_not_found_returns_404(client, admin_headers):
    asset = _create_asset(client, admin_headers, assetCode="TEST-ASSET-006")
    resp = client.put(
        f"/api/assets/{asset['id']}/maintenance/999999", json=MAINTENANCE_PAYLOAD, headers=admin_headers
    )
    assert resp.status_code == 404


def test_create_asset_rejects_negative_price(client, admin_headers):
    payload = {**ASSET_PAYLOAD, "assetCode": "TEST-ASSET-007", "purchasePrice": -100}
    resp = client.post("/api/assets", json=payload, headers=admin_headers)
    assert resp.status_code == 422


def test_create_asset_rejects_zero_useful_life(client, admin_headers):
    payload = {**ASSET_PAYLOAD, "assetCode": "TEST-ASSET-008", "usefulLife": 0}
    resp = client.post("/api/assets", json=payload, headers=admin_headers)
    assert resp.status_code == 422


def test_create_asset_rejects_future_purchase_date(client, admin_headers):
    payload = {**ASSET_PAYLOAD, "assetCode": "TEST-ASSET-009", "purchaseDate": "2999-01-01"}
    resp = client.post("/api/assets", json=payload, headers=admin_headers)
    assert resp.status_code == 422


def test_add_maintenance_record_rejects_negative_cost(client, admin_headers):
    asset = _create_asset(client, admin_headers, assetCode="TEST-ASSET-010")
    payload = {**MAINTENANCE_PAYLOAD, "cost": -500}
    resp = client.post(f"/api/assets/{asset['id']}/maintenance", json=payload, headers=admin_headers)
    assert resp.status_code == 422


def test_add_maintenance_record_rejects_future_date(client, admin_headers):
    asset = _create_asset(client, admin_headers, assetCode="TEST-ASSET-011")
    payload = {**MAINTENANCE_PAYLOAD, "maintenanceDate": "2999-01-01"}
    resp = client.post(f"/api/assets/{asset['id']}/maintenance", json=payload, headers=admin_headers)
    assert resp.status_code == 422


def test_export_assets_returns_xlsx(client, admin_headers):
    _create_asset(client, admin_headers, assetCode="TEST-ASSET-012")
    resp = client.get("/api/assets/export", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.headers["content-type"] == (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert "attachment" in resp.headers["content-disposition"]
    assert len(resp.content) > 0


def test_export_assets_respects_search_filter(client, admin_headers):
    _create_asset(client, admin_headers, assetCode="TEST-ASSET-013", assetName="유니크검색어자산")
    resp = client.get("/api/assets/export?search=유니크검색어자산", headers=admin_headers)
    assert resp.status_code == 200
    assert len(resp.content) > 0


def test_get_all_assets_sorts_by_purchase_price(client, admin_headers):
    _create_asset(client, admin_headers, assetCode="TEST-ASSET-014", purchasePrice=500000)
    _create_asset(client, admin_headers, assetCode="TEST-ASSET-015", purchasePrice=100000)
    _create_asset(client, admin_headers, assetCode="TEST-ASSET-016", purchasePrice=900000)

    resp = client.get(
        "/api/assets?search=TEST-ASSET-01&pageSize=10&sortBy=purchasePrice&sortOrder=asc",
        headers=admin_headers,
    )
    assert resp.status_code == 200
    items = resp.json()["data"]["items"]
    codes = [i["assetCode"] for i in items if i["assetCode"] in ("TEST-ASSET-014", "TEST-ASSET-015", "TEST-ASSET-016")]
    assert codes == ["TEST-ASSET-015", "TEST-ASSET-014", "TEST-ASSET-016"]

    resp_desc = client.get(
        "/api/assets?search=TEST-ASSET-01&pageSize=10&sortBy=purchasePrice&sortOrder=desc",
        headers=admin_headers,
    )
    items_desc = resp_desc.json()["data"]["items"]
    codes_desc = [i["assetCode"] for i in items_desc if i["assetCode"] in ("TEST-ASSET-014", "TEST-ASSET-015", "TEST-ASSET-016")]
    assert codes_desc == ["TEST-ASSET-016", "TEST-ASSET-014", "TEST-ASSET-015"]
