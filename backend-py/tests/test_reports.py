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
