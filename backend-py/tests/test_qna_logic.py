"""LLM API 키가 없을 때(테스트 환경 기본값) qna_logic이 쓰는 규칙 기반
폴백 답변을 검증한다. 실제 Gemini/Claude 호출은 하지 않으므로 결정론적이다.
"""

IT_ASSET = {
    "assetName": "폴백 테스트 노트북",
    "assetCode": "TEST-QNA-001",
    "category": "IT 장비",
    "location": "테스트실",
    "responsiblePerson": "테스트담당",
    "purchaseDate": "2020-01-01",
    "purchasePrice": 2000000,
    "usefulLife": 5,
    "status": "ACTIVE",
    "description": "폴백 로직 테스트용",
}

REPLACEMENT_NEEDED_ASSET = {
    **IT_ASSET,
    "assetName": "폴백 테스트 교체대상",
    "assetCode": "TEST-QNA-002",
    "status": "REPLACEMENT_NEEDED",
}


def _ask(client, admin_headers, question):
    resp = client.post("/api/qa/ask", json={"question": question}, headers=admin_headers)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def test_fallback_notebook_keyword(client, admin_headers):
    client.post("/api/assets", json=IT_ASSET, headers=admin_headers)
    data = _ask(client, admin_headers, "노트북 몇 대 있어?")
    assert "IT 장비는 총" in data["answer"]
    assert data["hasFilter"] is True
    assert any(a["assetCode"] == "TEST-QNA-001" for a in data["assets"])


def test_fallback_price_keyword(client, admin_headers):
    client.post("/api/assets", json=IT_ASSET, headers=admin_headers)
    data = _ask(client, admin_headers, "100만원 이상 비싸게 산 자산 알려줘")
    assert "100만원 이상인 자산" in data["answer"]
    assert data["hasFilter"] is True
    assert any(a["assetCode"] == "TEST-QNA-001" for a in data["assets"])


def test_fallback_replacement_keyword(client, admin_headers):
    client.post("/api/assets", json=REPLACEMENT_NEEDED_ASSET, headers=admin_headers)
    data = _ask(client, admin_headers, "교체가 필요한 자산이 있나요?")
    assert "교체나 조치가 필요한 자산" in data["answer"]
    assert data["hasFilter"] is True
    assert any(a["assetCode"] == "TEST-QNA-002" for a in data["assets"])


def test_fallback_generic_question_has_no_filter(client, admin_headers):
    client.post("/api/assets", json=IT_ASSET, headers=admin_headers)
    data = _ask(client, admin_headers, "안녕하세요 오늘 날씨 어때요")
    assert data["hasFilter"] is False
    assert data["assets"] == []
