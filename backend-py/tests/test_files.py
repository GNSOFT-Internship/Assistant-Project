import io
import os

from app.routers.files import _safe_stored_filename

ASSET_PAYLOAD = {
    "assetName": "테스트 파일업로드 자산",
    "category": "IT 장비",
    "location": "테스트실",
    "responsiblePerson": "테스트담당",
    "purchaseDate": "2020-01-01",
    "purchasePrice": 1000000,
    "usefulLife": 5,
    "status": "ACTIVE",
    "description": "pytest로 만든 자산",
}


def _maintenance_csv(asset_code):
    return (
        "자산코드,정비일,정비유형,비용,설명,담당자,고장유형\n"
        f"{asset_code},2026-05-01,수리,30000,테스트 수리 A,김테스트,테스트고장\n"
    )


def _upload_csv(client, admin_headers, csv_content, filename="test_upload.csv"):
    files = {"file": (filename, io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    resp = client.post("/api/files/upload", files=files, headers=admin_headers)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["id"]


def test_upload_process_reports_unmatched_asset_code(client, admin_headers):
    asset = client.post("/api/assets", json=ASSET_PAYLOAD, headers=admin_headers).json()["data"]
    unmatched_code = asset["assetCode"] + 9999
    csv_content = (
        "자산코드,정비일,정비유형,비용,설명,담당자,고장유형\n"
        f"{asset['assetCode']},2026-05-01,수리,30000,테스트 수리 A,김테스트,테스트고장\n"
        f"{unmatched_code},2026-05-02,수리,20000,오탈자 코드 테스트,이테스트,없음\n"
    )
    file_id = _upload_csv(client, admin_headers, csv_content)

    process_resp = client.post(f"/api/files/{file_id}/process", headers=admin_headers)
    assert process_resp.status_code == 200
    summary = process_resp.json()["data"]["extractedSummary"]

    assert summary["kind"] == "maintenance_records"
    assert summary["validRows"] == 2
    assert summary["unmatchedAssetCodes"] == [unmatched_code]

    rows_by_code = {r["assetCode"]: r for r in summary["records"]}
    assert rows_by_code[asset["assetCode"]]["assetExists"] is True
    assert rows_by_code[unmatched_code]["assetExists"] is False


def test_apply_only_creates_records_for_matched_assets(client, admin_headers):
    asset = client.post("/api/assets", json=ASSET_PAYLOAD, headers=admin_headers).json()["data"]
    file_id = _upload_csv(client, admin_headers, _maintenance_csv(asset["assetCode"]))
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
    file_id = _upload_csv(client, admin_headers, _maintenance_csv(asset["assetCode"]))
    client.post(f"/api/files/{file_id}/process", headers=admin_headers)
    client.post(f"/api/files/{file_id}/apply", headers=admin_headers)

    history = client.get(f"/api/assets/{asset['id']}/history", headers=admin_headers).json()["data"]["items"]
    create_entry = next(h for h in history if h["action"] == "CREATE" and "source" in (h["changes"] or {}))
    assert "엑셀 업로드" in create_entry["changes"]["source"]["new"]
    assert create_entry["changes"]["maintenance_record"]["new"] == "1건 등록됨"


def test_unapply_removes_exactly_the_created_records(client, admin_headers):
    asset = client.post("/api/assets", json=ASSET_PAYLOAD, headers=admin_headers).json()["data"]
    file_id = _upload_csv(client, admin_headers, _maintenance_csv(asset["assetCode"]))
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


def test_batch_upload_and_batch_apply(client, admin_headers):
    # 1. 자산 생성
    asset = client.post("/api/assets", json=ASSET_PAYLOAD, headers=admin_headers).json()["data"]
    csv_content = _maintenance_csv(asset["assetCode"])

    # 2. 다중 파일 업로드 API 호출
    files = [
        ("files", ("batch_1.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")),
        ("files", ("batch_2.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv"))
    ]
    resp = client.post("/api/files/batch-upload", files=files, headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert len(data) == 2
    file_ids = [f["id"] for f in data]

    # 3. 비동기 백그라운드 처리가 테스트 환경에서 완료될 수 있도록 순차 파싱
    for fid in file_ids:
        client.post(f"/api/files/{fid}/process", headers=admin_headers)

    # 4. 일괄 적용 API 호출
    apply_resp = client.post("/api/files/batch-apply", json={"fileIds": file_ids}, headers=admin_headers)
    assert apply_resp.status_code == 200
    apply_data = apply_resp.json()["data"]
    assert apply_data["successCount"] == 2
    assert apply_data["totalRecordsCreated"] == 2

    # 유지보수 기록 건수 확인 (각 파일당 1건씩 총 2건 등록 완료 확인)
    maintenance = client.get(f"/api/assets/{asset['id']}/maintenance", headers=admin_headers).json()["data"]["items"]
    assert len(maintenance) == 2


def test_safe_stored_filename_strips_path_traversal_segments():
    """업로드 원본 파일명에 '../'가 섞여 있어도(예: 악의적으로 조작된 파일명),
    저장 경로가 UPLOAD_DIRECTORY 밖으로 벗어날 수 없어야 한다."""
    malicious = "../../../../etc/passwd"
    stored = _safe_stored_filename(malicious)
    assert "/" not in stored
    assert ".." not in stored
    assert stored.endswith("_passwd")

    # os.path.join과 결합해도 UPLOAD_DIRECTORY 밖으로 나가지 않는지 최종 확인
    joined = os.path.normpath(os.path.join("uploads", stored))
    assert joined.startswith("uploads")


def test_reprocessing_an_applied_file_is_rejected(client, admin_headers):
    """적용된 파일을 재분석하면 appliedMaintenanceRecordIds가 담긴 extracted_data가
    통째로 덮어써져, 이후 적용취소가 지울 대상을 못 찾고 재적용 시 중복 생성으로
    이어지는 버그가 있었다. 재분석 자체를 막아 원천 차단한다."""
    asset = client.post("/api/assets", json=ASSET_PAYLOAD, headers=admin_headers).json()["data"]
    file_id = _upload_csv(client, admin_headers, _maintenance_csv(asset["assetCode"]))
    client.post(f"/api/files/{file_id}/process", headers=admin_headers)
    client.post(f"/api/files/{file_id}/apply", headers=admin_headers)

    reprocess_resp = client.post(f"/api/files/{file_id}/process", headers=admin_headers)
    assert reprocess_resp.status_code == 400

    # 재분석이 거부됐으니 재적용 시도도 "이미 적용됨"으로 막혀야지, 중복 생성되면 안 된다
    reapply_resp = client.post(f"/api/files/{file_id}/apply", headers=admin_headers)
    assert reapply_resp.status_code == 400


def test_unapply_fails_loudly_when_tracking_info_is_missing(client, admin_headers, db_session):
    """과거 버그(또는 데이터 이관 등)로 applied=True인데 appliedMaintenanceRecordIds
    추적 정보 자체가 사라진 상태라면, 0건 삭제로 조용히 "성공" 처리해 실제 존재하는
    유지보수 기록을 고아로 방치하지 말고 명확히 에러를 내야 한다."""
    from app import models

    asset = client.post("/api/assets", json=ASSET_PAYLOAD, headers=admin_headers).json()["data"]
    file_id = _upload_csv(client, admin_headers, _maintenance_csv(asset["assetCode"]))
    client.post(f"/api/files/{file_id}/process", headers=admin_headers)
    client.post(f"/api/files/{file_id}/apply", headers=admin_headers)

    # 추적 정보가 유실된 상태를 직접 재현한다 (재분석 재현이 이제 막혔으므로 DB를 직접 조작)
    file_upload = db_session.query(models.FileUpload).filter(models.FileUpload.id == file_id).first()
    file_upload.extracted_data = '{"kind": "maintenance_records", "records": []}'
    db_session.commit()

    unapply_resp = client.post(f"/api/files/{file_id}/unapply", headers=admin_headers)
    assert unapply_resp.status_code == 409


def test_unknown_file_id_returns_404_not_400(client, admin_headers):
    """존재하지 않는 file_id는 요청 자체가 잘못된 게 아니라 리소스가 없는 것이므로,
    자산/유지보수 API와 동일하게 400이 아니라 404를 반환해야 한다."""
    assert client.post("/api/files/999999/process", headers=admin_headers).status_code == 404
    assert client.post("/api/files/999999/apply", headers=admin_headers).status_code == 404
    assert client.post("/api/files/999999/unapply", headers=admin_headers).status_code == 404
    assert client.delete("/api/files/999999", headers=admin_headers).status_code == 404


def _make_asset_registration_excel(rows):
    import pandas as pd

    df = pd.DataFrame(rows)
    buffer = io.BytesIO()
    df.to_excel(buffer, index=False)
    buffer.seek(0)
    return buffer


def _upload_asset_registration_excel(client, admin_headers, rows):
    buffer = _make_asset_registration_excel(rows)
    files = {"file": ("assets.xlsx", buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    resp = client.post("/api/files/upload", files=files, headers=admin_headers)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["id"]


def test_asset_registration_excel_is_auto_detected_and_applies_creates_assets(client, admin_headers):
    """자산 등록용 엑셀(자산명/카테고리/... 컬럼)을 업로드하면, 유지보수 내역 업로드와
    같은 드롭존/파이프라인을 타면서도 컬럼 구성만 보고 자동으로 자산 등록으로 처리돼야 한다.
    자산번호는 더 이상 엑셀에서 받지 않고 서버가 자동 채번한다."""
    file_id = _upload_asset_registration_excel(client, admin_headers, [
        {
            "자산명": "업로드 자동판별 프린터", "카테고리": "IT 장비",
            "위치": "1층", "담당자": "홍길동", "구매일": "2022-01-15",
            "구매가": 500000, "내용연수(년)": 5, "상태": "ACTIVE", "설명": None,
        },
    ])

    process_resp = client.post(f"/api/files/{file_id}/process", headers=admin_headers)
    assert process_resp.status_code == 200
    summary = process_resp.json()["data"]["extractedSummary"]
    assert summary["kind"] == "asset_registration"
    assert summary["validRows"] == 1
    assert summary["rows"][0]["assetName"] == "업로드 자동판별 프린터"

    apply_resp = client.post(f"/api/files/{file_id}/apply", headers=admin_headers)
    assert apply_resp.status_code == 200
    assert apply_resp.json()["data"]["extractedSummary"]["appliedAssetCount"] == 1

    resp = client.get("/api/assets?search=업로드 자동판별 프린터", headers=admin_headers)
    items = resp.json()["data"]["items"]
    assert any(i["assetName"] == "업로드 자동판별 프린터" and isinstance(i["assetCode"], int) for i in items)


def test_asset_registration_apply_creates_assets_with_sequential_codes(client, admin_headers):
    """한 엑셀 안의 여러 신규 자산 행은 각각 서버가 채번한 서로 다른 자산번호를 받는다."""
    file_id = _upload_asset_registration_excel(client, admin_headers, [
        {
            "자산명": "일괄등록 자산 A", "카테고리": "IT 장비",
            "위치": "1층", "담당자": "홍길동", "구매일": "2022-01-15",
            "구매가": 500000, "내용연수(년)": 5, "상태": "ACTIVE", "설명": None,
        },
        {
            "자산명": "일괄등록 자산 B", "카테고리": "IT 장비",
            "위치": "1층", "담당자": "홍길동", "구매일": "2022-01-15",
            "구매가": 300000, "내용연수(년)": 4, "상태": "ACTIVE", "설명": None,
        },
    ])
    client.post(f"/api/files/{file_id}/process", headers=admin_headers)

    apply_resp = client.post(f"/api/files/{file_id}/apply", headers=admin_headers)
    assert apply_resp.status_code == 200
    assert apply_resp.json()["data"]["extractedSummary"]["appliedAssetCount"] == 2

    resp = client.get("/api/assets?search=일괄등록", headers=admin_headers)
    items = sorted(resp.json()["data"]["items"], key=lambda i: i["assetCode"])
    assert len(items) == 2
    assert items[1]["assetCode"] == items[0]["assetCode"] + 1


def test_asset_registration_unapply_is_rejected(client, admin_headers):
    """등록된 자산은 다른 자산과 동일하게 취급돼야 하므로, 파일 적용 취소로 무더기
    삭제되지 않게 명시적으로 막는다."""
    file_id = _upload_asset_registration_excel(client, admin_headers, [
        {
            "자산명": "적용취소 테스트", "카테고리": "IT 장비",
            "위치": "1층", "담당자": "홍길동", "구매일": "2022-01-15",
            "구매가": 500000, "내용연수(년)": 5, "상태": "ACTIVE", "설명": None,
        },
    ])
    client.post(f"/api/files/{file_id}/process", headers=admin_headers)
    client.post(f"/api/files/{file_id}/apply", headers=admin_headers)

    unapply_resp = client.post(f"/api/files/{file_id}/unapply", headers=admin_headers)
    assert unapply_resp.status_code == 400


def test_maintenance_csv_recognizes_unified_asset_number_column(client, admin_headers):
    """유지보수 내역서도 자산 등록용 엑셀과 같은 "자산번호" 컬럼명을 쓸 수 있어야 한다
    (예전 "자산코드" 컬럼명도 하위 호환으로 계속 인식된다 — 위 CSV_CONTENT 테스트가 그걸 검증)."""
    asset = client.post("/api/assets", json=ASSET_PAYLOAD, headers=admin_headers).json()["data"]
    csv_content = (
        "자산번호,정비일,정비유형,비용,설명\n"
        f"{asset['assetCode']},2026-05-01,수리,30000,통일된 컬럼명 테스트\n"
    )
    files = {"file": ("unified_column.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    upload_resp = client.post("/api/files/upload", files=files, headers=admin_headers)
    assert upload_resp.status_code == 200, upload_resp.text
    file_id = upload_resp.json()["data"]["id"]

    process_resp = client.post(f"/api/files/{file_id}/process", headers=admin_headers)
    assert process_resp.status_code == 200
    summary = process_resp.json()["data"]["extractedSummary"]
    assert summary["kind"] == "maintenance_records"
    assert summary["validRows"] == 1
    assert summary["records"][0]["assetExists"] is True
