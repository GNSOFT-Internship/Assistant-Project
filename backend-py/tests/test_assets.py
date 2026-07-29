import io

import pandas as pd

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


def test_asset_categories_endpoint_reflects_actual_data_not_a_hardcoded_list(client, admin_headers):
    # category는 자유 문자열 컬럼이라 엑셀 일괄 등록 등으로 임의의 값이 들어올 수 있다.
    # 프론트엔드 필터/등록 폼의 카테고리 목록은 이 엔드포인트가 내려주는 실제 값을 써야 한다.
    _create_asset(client, admin_headers, assetCode="TEST-ASSET-CAT-1", category="드론")
    resp = client.get("/api/assets/categories", headers=admin_headers)
    assert resp.status_code == 200
    assert "드론" in resp.json()["data"]


def test_maintenance_total_cost_reflects_all_records_not_just_the_returned_page(client, admin_headers):
    # totalCost는 pageSize로 잘린 items가 아니라 그 자산의 전체 유지보수 기록 합계여야 한다.
    asset = _create_asset(client, admin_headers, assetCode="TEST-ASSET-006")
    asset_id = asset["id"]

    for cost in (30000, 50000, 70000):
        payload = {**MAINTENANCE_PAYLOAD, "cost": cost}
        resp = client.post(f"/api/assets/{asset_id}/maintenance", json=payload, headers=admin_headers)
        assert resp.status_code == 200

    resp = client.get(f"/api/assets/{asset_id}/maintenance", params={"pageSize": 1}, headers=admin_headers)
    data = resp.json()["data"]
    assert len(data["items"]) == 1
    assert data["total"] == 3
    assert data["totalCost"] == 150000


def test_update_maintenance_record_not_found_returns_404(client, admin_headers):
    asset = _create_asset(client, admin_headers, assetCode="TEST-ASSET-006")
    resp = client.put(
        f"/api/assets/{asset['id']}/maintenance/999999", json=MAINTENANCE_PAYLOAD, headers=admin_headers
    )
    assert resp.status_code == 404


def test_delete_maintenance_record_not_found_returns_404(client, admin_headers):
    """존재하지 않는 유지보수 기록을 삭제 시도하면, 조용히 성공 처리하지 말고 다른
    수정/조회 API처럼 404를 반환해야 한다 (삭제 안 됐는데 "삭제됨"으로 오인하는 것 방지)."""
    asset = _create_asset(client, admin_headers, assetCode="TEST-ASSET-DEL-404")
    resp = client.delete(f"/api/assets/{asset['id']}/maintenance/999999", headers=admin_headers)
    assert resp.status_code == 404


def test_delete_maintenance_record_unknown_asset_returns_404(client, admin_headers):
    resp = client.delete("/api/assets/999999/maintenance/1", headers=admin_headers)
    assert resp.status_code == 404


def test_get_asset_history_unknown_asset_returns_404(client, admin_headers):
    """자산 유지보수 이력 조회(get_asset_maintenance_history)와 동일하게, 감사 로그
    조회(get_asset_history)도 존재하지 않는 자산 id면 빈 목록이 아니라 404여야 한다."""
    resp = client.get("/api/assets/999999/history", headers=admin_headers)
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


def _make_import_excel(rows):
    df = pd.DataFrame(rows)
    buffer = io.BytesIO()
    df.to_excel(buffer, index=False)
    buffer.seek(0)
    return buffer


def test_import_assets_excel_creates_rows_and_logs_audit(client, admin_headers):
    buffer = _make_import_excel([
        {
            "자산번호": "IMPORT-001", "자산명": "가져오기 프린터", "카테고리": "IT 장비",
            "위치": "1층", "담당자": "홍길동", "구매일": "2022-01-15",
            "구매가": 500000, "내용연수(년)": 5, "상태": "ACTIVE", "설명": "import test",
        },
        {
            "자산번호": "IMPORT-002", "자산명": "가져오기 모니터", "카테고리": "IT 장비",
            "위치": "2층", "담당자": "김철수", "구매일": "2023-03-01",
            "구매가": 300000, "내용연수(년)": 4, "상태": "ACTIVE", "설명": None,
        },
    ])

    resp = client.post(
        "/api/assets/import",
        files={"file": ("assets.xlsx", buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=admin_headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["created"] == 2
    assert data["failed"] == []

    resp2 = client.get("/api/assets?search=IMPORT-00", headers=admin_headers)
    codes = [i["assetCode"] for i in resp2.json()["data"]["items"]]
    assert "IMPORT-001" in codes
    assert "IMPORT-002" in codes

    created = next(i for i in resp2.json()["data"]["items"] if i["assetCode"] == "IMPORT-001")
    history = client.get(f"/api/assets/{created['id']}/history", headers=admin_headers).json()["data"]["items"]
    assert history[0]["action"] == "CREATE"
    assert history[0]["changedBy"] == "admin"


def test_import_assets_excel_reports_errors_without_blocking_valid_rows(client, admin_headers):
    _create_asset(client, admin_headers, assetCode="IMPORT-DUP")

    buffer = _make_import_excel([
        {
            "자산번호": "IMPORT-DUP", "자산명": "중복 자산", "카테고리": "IT 장비",
            "위치": "1층", "담당자": "홍길동", "구매일": "2022-01-15",
            "구매가": 500000, "내용연수(년)": 5, "상태": "ACTIVE", "설명": None,
        },
        {
            "자산번호": "IMPORT-OK", "자산명": "정상 자산", "카테고리": "IT 장비",
            "위치": "1층", "담당자": "홍길동", "구매일": "2022-01-15",
            "구매가": 500000, "내용연수(년)": 5, "상태": "ACTIVE", "설명": None,
        },
    ])

    resp = client.post(
        "/api/assets/import",
        files={"file": ("assets.xlsx", buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=admin_headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["created"] == 1
    assert len(data["failed"]) == 1
    assert data["failed"][0]["row"] == 2

    resp2 = client.get("/api/assets?search=IMPORT-OK", headers=admin_headers)
    codes = [i["assetCode"] for i in resp2.json()["data"]["items"]]
    assert "IMPORT-OK" in codes


def test_import_assets_excel_validation_errors_are_korean(client, admin_headers):
    """pydantic 원본 오류(영문 기술 메시지)를 그대로 노출하면 엑셀만 보는 사용자가
    이해하기 어려우므로, 필드명과 사유를 한국어 문구로 바꿔서 반환해야 한다."""
    buffer = _make_import_excel([
        {
            "자산번호": "IMPORT-BADPRICE", "자산명": "구매가 오류", "카테고리": "IT 장비",
            "위치": "1층", "담당자": "홍길동", "구매일": "2022-01-15",
            "구매가": 0, "내용연수(년)": 5, "상태": "ACTIVE", "설명": None,
        },
    ])

    resp = client.post(
        "/api/assets/import",
        files={"file": ("assets.xlsx", buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=admin_headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["created"] == 0
    assert len(data["failed"]) == 1
    error = data["failed"][0]["error"]
    assert "validation error" not in error.lower()
    assert "구매가" in error


def test_import_assets_excel_requires_admin(client, user_headers):
    buffer = _make_import_excel([{
        "자산번호": "IMPORT-FORBIDDEN", "자산명": "권한 테스트", "카테고리": "IT 장비",
        "위치": "1층", "담당자": "홍길동", "구매일": "2022-01-15",
        "구매가": 500000, "내용연수(년)": 5, "상태": "ACTIVE", "설명": None,
    }])
    resp = client.post(
        "/api/assets/import",
        files={"file": ("assets.xlsx", buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=user_headers,
    )
    assert resp.status_code == 403


def test_global_audit_log_lists_across_assets(client, admin_headers):
    a1 = _create_asset(client, admin_headers, assetCode="AUDIT-001")
    a2 = _create_asset(client, admin_headers, assetCode="AUDIT-002")

    resp = client.get("/api/assets/audit-logs?pageSize=200", headers=admin_headers)
    assert resp.status_code == 200
    items = resp.json()["data"]["items"]
    codes = {i["assetCode"] for i in items}
    assert "AUDIT-001" in codes
    assert "AUDIT-002" in codes
    assert all(i["action"] in ("CREATE", "UPDATE", "DELETE") for i in items)


def test_global_audit_log_filters_by_action(client, admin_headers):
    _create_asset(client, admin_headers, assetCode="AUDIT-FILTER-001")

    resp = client.get("/api/assets/audit-logs?action=CREATE&pageSize=200", headers=admin_headers)
    items = resp.json()["data"]["items"]
    assert any(i["assetCode"] == "AUDIT-FILTER-001" for i in items)
    assert all(i["action"] == "CREATE" for i in items)


def test_global_audit_log_requires_admin(client, user_headers):
    resp = client.get("/api/assets/audit-logs", headers=user_headers)
    assert resp.status_code == 403


def test_global_audit_log_search_matches_asset_name_only_not_code(client, admin_headers):
    """감사 로그의 search는 자산코드가 아니라 자산명으로만 매칭되어야 한다."""
    _create_asset(client, admin_headers, assetName="검색용 테스트 노트북", assetCode="AUDIT-SEARCH-001")
    _create_asset(client, admin_headers, assetName="전혀 다른 프린터", assetCode="AUDIT-SEARCH-002")

    resp = client.get("/api/assets/audit-logs?search=테스트 노트북&pageSize=200", headers=admin_headers)
    assert resp.status_code == 200
    items = resp.json()["data"]["items"]
    codes = {i["assetCode"] for i in items}
    assert "AUDIT-SEARCH-001" in codes
    assert "AUDIT-SEARCH-002" not in codes

    # 자산코드로는 매칭되지 않아야 한다 (자산명 검색만 지원).
    resp_code_search = client.get("/api/assets/audit-logs?search=AUDIT-SEARCH-002&pageSize=200", headers=admin_headers)
    codes_from_code_search = {i["assetCode"] for i in resp_code_search.json()["data"]["items"]}
    assert "AUDIT-SEARCH-002" not in codes_from_code_search


def test_global_audit_log_includes_asset_name(client, admin_headers):
    _create_asset(client, admin_headers, assetName="이름표시 테스트 자산", assetCode="AUDIT-NAME-001")
    resp = client.get("/api/assets/audit-logs?pageSize=200", headers=admin_headers)
    items = resp.json()["data"]["items"]
    match = next(i for i in items if i["assetCode"] == "AUDIT-NAME-001")
    assert match["assetName"] == "이름표시 테스트 자산"
