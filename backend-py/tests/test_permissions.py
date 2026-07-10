import io

ASSET_PAYLOAD = {
    "assetName": "권한 테스트 자산",
    "assetCode": "TEST-PERM-001",
    "category": "IT 장비",
    "location": "테스트실",
    "responsiblePerson": "테스트담당",
    "purchaseDate": "2020-01-01",
    "purchasePrice": 1000000,
    "usefulLife": 5,
    "status": "ACTIVE",
    "description": "권한 테스트용",
}

MAINTENANCE_PAYLOAD = {
    "maintenanceDate": "2024-05-01",
    "maintenanceType": "REPAIR",
    "cost": 30000,
    "description": "권한 테스트 수리",
}


def test_user_can_read_assets(client, user_headers):
    resp = client.get("/api/assets", headers=user_headers)
    assert resp.status_code == 200


def test_user_cannot_create_asset(client, user_headers):
    resp = client.post("/api/assets", json=ASSET_PAYLOAD, headers=user_headers)
    assert resp.status_code == 403


def test_user_cannot_update_or_delete_asset(client, admin_headers, user_headers):
    asset = client.post("/api/assets", json=ASSET_PAYLOAD, headers=admin_headers).json()["data"]

    update_resp = client.put(f"/api/assets/{asset['id']}", json=ASSET_PAYLOAD, headers=user_headers)
    assert update_resp.status_code == 403

    delete_resp = client.delete(f"/api/assets/{asset['id']}", headers=user_headers)
    assert delete_resp.status_code == 403


def test_user_cannot_add_update_delete_maintenance_record(client, admin_headers, user_headers):
    asset = client.post("/api/assets", json=ASSET_PAYLOAD, headers=admin_headers).json()["data"]
    asset_id = asset["id"]

    add_resp = client.post(f"/api/assets/{asset_id}/maintenance", json=MAINTENANCE_PAYLOAD, headers=user_headers)
    assert add_resp.status_code == 403

    # admin이 만든 기록에 대해서도 user는 수정/삭제할 수 없다
    record = client.post(
        f"/api/assets/{asset_id}/maintenance", json=MAINTENANCE_PAYLOAD, headers=admin_headers
    ).json()["data"]

    update_resp = client.put(
        f"/api/assets/{asset_id}/maintenance/{record['id']}", json=MAINTENANCE_PAYLOAD, headers=user_headers
    )
    assert update_resp.status_code == 403

    delete_resp = client.delete(f"/api/assets/{asset_id}/maintenance/{record['id']}", headers=user_headers)
    assert delete_resp.status_code == 403

    # user 요청이 거부된 뒤에도 기록은 그대로 남아있어야 한다
    still_there = client.get(f"/api/assets/{asset_id}/maintenance", headers=admin_headers).json()["data"]
    assert len(still_there) == 1


def test_user_can_read_but_not_write_budget(client, user_headers):
    read_resp = client.get("/api/budgets", headers=user_headers)
    assert read_resp.status_code == 200

    write_resp = client.put("/api/budgets/2026/1", json={"allocatedAmount": 100000}, headers=user_headers)
    assert write_resp.status_code == 403

    delete_resp = client.delete("/api/budgets/2026/1", headers=user_headers)
    assert delete_resp.status_code == 403


def test_admin_can_write_budget(client, admin_headers):
    resp = client.put("/api/budgets/2026/1", json={"allocatedAmount": 100000}, headers=admin_headers)
    assert resp.status_code == 200


def test_user_can_read_but_not_write_files(client, user_headers):
    read_resp = client.get("/api/files", headers=user_headers)
    assert read_resp.status_code == 200

    files = {"file": ("test.csv", io.BytesIO(b"a,b\n1,2\n"), "text/csv")}
    upload_resp = client.post("/api/files/upload", files=files, headers=user_headers)
    assert upload_resp.status_code == 403


def test_user_cannot_process_apply_or_delete_existing_file(client, admin_headers, user_headers):
    files = {"file": ("test.csv", io.BytesIO(b"a,b\n1,2\n"), "text/csv")}
    file_id = client.post("/api/files/upload", files=files, headers=admin_headers).json()["data"]["id"]

    assert client.post(f"/api/files/{file_id}/process", headers=user_headers).status_code == 403
    assert client.post(f"/api/files/{file_id}/apply", headers=user_headers).status_code == 403
    assert client.delete(f"/api/files/{file_id}", headers=user_headers).status_code == 403
