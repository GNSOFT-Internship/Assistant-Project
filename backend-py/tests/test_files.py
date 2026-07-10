import io

ASSET_PAYLOAD = {
    "assetName": "테스트 파일업로드 자산",
    "assetCode": "TEST-FILE-001",
    "category": "IT 장비",
    "location": "테스트실",
    "responsiblePerson": "테스트담당",
    "purchaseDate": "2020-01-01",
    "purchasePrice": 1000000,
    "usefulLife": 5,
    "status": "ACTIVE",
    "description": "pytest로 만든 자산",
}

CSV_CONTENT = (
    "자산코드,정비일,정비유형,비용,설명,담당자,고장유형\n"
    "TEST-FILE-001,2026-05-01,수리,30000,테스트 수리 A,김테스트,테스트고장\n"
    "TEST-FILE-999,2026-05-02,수리,20000,오탈자 코드 테스트,이테스트,없음\n"
)


def _upload_csv(client, admin_headers):
    files = {"file": ("test_upload.csv", io.BytesIO(CSV_CONTENT.encode("utf-8")), "text/csv")}
    resp = client.post("/api/files/upload", files=files, headers=admin_headers)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["id"]


def test_upload_process_reports_unmatched_asset_code(client, admin_headers):
    client.post("/api/assets", json=ASSET_PAYLOAD, headers=admin_headers)
    file_id = _upload_csv(client, admin_headers)

    process_resp = client.post(f"/api/files/{file_id}/process", headers=admin_headers)
    assert process_resp.status_code == 200
    summary = process_resp.json()["data"]["extractedSummary"]

    assert summary["kind"] == "maintenance_records"
    assert summary["validRows"] == 2
    assert summary["unmatchedAssetCodes"] == ["TEST-FILE-999"]

    rows_by_code = {r["assetCode"]: r for r in summary["records"]}
    assert rows_by_code["TEST-FILE-001"]["assetExists"] is True
    assert rows_by_code["TEST-FILE-999"]["assetExists"] is False


def test_apply_only_creates_records_for_matched_assets(client, admin_headers):
    asset = client.post("/api/assets", json=ASSET_PAYLOAD, headers=admin_headers).json()["data"]
    file_id = _upload_csv(client, admin_headers)
    client.post(f"/api/files/{file_id}/process", headers=admin_headers)

    apply_resp = client.post(f"/api/files/{file_id}/apply", headers=admin_headers)
    assert apply_resp.status_code == 200
    assert apply_resp.json()["data"]["extractedSummary"]["appliedRecordCount"] == 1
    assert apply_resp.json()["data"]["applied"] is True

    maintenance = client.get(f"/api/assets/{asset['id']}/maintenance", headers=admin_headers).json()["data"]["items"]
    assert len(maintenance) == 1
    assert maintenance[0]["description"] == "테스트 수리 A"

    # 같은 자산으로는 두 번 적용할 수 없다
    second_apply = client.post(f"/api/files/{file_id}/apply", headers=admin_headers)
    assert second_apply.status_code == 400


def test_apply_logs_history_grouped_by_asset(client, admin_headers):
    asset = client.post("/api/assets", json=ASSET_PAYLOAD, headers=admin_headers).json()["data"]
    file_id = _upload_csv(client, admin_headers)
    client.post(f"/api/files/{file_id}/process", headers=admin_headers)
    client.post(f"/api/files/{file_id}/apply", headers=admin_headers)

    history = client.get(f"/api/assets/{asset['id']}/history", headers=admin_headers).json()["data"]["items"]
    create_entry = next(h for h in history if h["action"] == "CREATE" and "source" in (h["changes"] or {}))
    assert "엑셀 업로드" in create_entry["changes"]["source"]["new"]
    assert create_entry["changes"]["maintenance_record"]["new"] == "1건 등록됨"


def test_unapply_removes_exactly_the_created_records(client, admin_headers):
    asset = client.post("/api/assets", json=ASSET_PAYLOAD, headers=admin_headers).json()["data"]
    file_id = _upload_csv(client, admin_headers)
    client.post(f"/api/files/{file_id}/process", headers=admin_headers)
    client.post(f"/api/files/{file_id}/apply", headers=admin_headers)

    assert len(client.get(f"/api/assets/{asset['id']}/maintenance", headers=admin_headers).json()["data"]["items"]) == 1

    unapply_resp = client.post(f"/api/files/{file_id}/unapply", headers=admin_headers)
    assert unapply_resp.status_code == 200
    assert unapply_resp.json()["data"]["applied"] is False

    assert client.get(f"/api/assets/{asset['id']}/maintenance", headers=admin_headers).json()["data"]["items"] == []

    # applied가 아닌 파일은 다시 unapply할 수 없다
    second_unapply = client.post(f"/api/files/{file_id}/unapply", headers=admin_headers)
    assert second_unapply.status_code == 400

    # 취소 후에는 다시 적용할 수 있다
    reapply = client.post(f"/api/files/{file_id}/apply", headers=admin_headers)
    assert reapply.status_code == 200
    assert reapply.json()["data"]["extractedSummary"]["appliedRecordCount"] == 1
