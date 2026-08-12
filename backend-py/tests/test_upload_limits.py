"""업로드 크기 상한(MAX_UPLOAD_SIZE_BYTES)이 실제로 강제되는지 검증한다.

/api/files/upload, /api/files/batch-upload, /api/assets/import 세 경로 모두
파일을 디스크나 메모리에 무제한으로 흘려보내지 않고, 상한을 넘으면 413으로
즉시 거부해야 한다 (디스크/메모리 고갈 DoS 방지)."""

import io
import os

from app.config import settings


def test_upload_rejects_file_over_limit_and_cleans_up_partial_file(client, admin_headers, monkeypatch):
    monkeypatch.setattr(settings, "MAX_UPLOAD_SIZE_BYTES", 10)

    before = set(os.listdir(settings.UPLOAD_DIRECTORY)) if os.path.isdir(settings.UPLOAD_DIRECTORY) else set()

    files = {"file": ("too_big.csv", io.BytesIO(b"x" * 100), "text/csv")}
    resp = client.post("/api/files/upload", files=files, headers=admin_headers)

    assert resp.status_code == 413, resp.text

    after = set(os.listdir(settings.UPLOAD_DIRECTORY)) if os.path.isdir(settings.UPLOAD_DIRECTORY) else set()
    assert after == before, "거부된 업로드의 partial 파일이 디스크에 남아있으면 안 된다"


def test_batch_upload_rejects_file_over_limit(client, admin_headers, monkeypatch):
    monkeypatch.setattr(settings, "MAX_UPLOAD_SIZE_BYTES", 10)

    files = [("files", ("too_big.csv", io.BytesIO(b"x" * 100), "text/csv"))]
    resp = client.post("/api/files/batch-upload", files=files, headers=admin_headers)

    assert resp.status_code == 413, resp.text


def test_import_assets_excel_rejects_file_over_limit(client, admin_headers, monkeypatch):
    monkeypatch.setattr(settings, "MAX_UPLOAD_SIZE_BYTES", 10)

    files = {"file": ("too_big.xlsx", io.BytesIO(b"x" * 100), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    resp = client.post("/api/assets/import", files=files, headers=admin_headers)

    assert resp.status_code == 413, resp.text


def test_upload_within_limit_still_succeeds(client, admin_headers):
    files = {"file": ("small.csv", io.BytesIO(b"a,b\n1,2\n"), "text/csv")}
    resp = client.post("/api/files/upload", files=files, headers=admin_headers)

    assert resp.status_code == 200, resp.text
