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


def test_price_filter_is_recomputed_by_code_even_if_llm_picks_wrong_assets(client, admin_headers, monkeypatch):
    """LLM이 가격 조건과 무관한 잘못된 relevantAssetIds를 내놓아도, minPrice/maxPrice가 있으면
    코드가 실제 구매가를 기준으로 다시 계산해 정확한 결과를 반환해야 한다 (자기모순 답변 방지)."""
    cheap = client.post("/api/assets", json={**IT_ASSET, "assetCode": "TEST-QNA-CHEAP", "purchasePrice": 500000}, headers=admin_headers).json()["data"]
    expensive_a = client.post("/api/assets", json={**IT_ASSET, "assetCode": "TEST-QNA-EXP-A", "purchasePrice": 1610000}, headers=admin_headers).json()["data"]
    expensive_b = client.post("/api/assets", json={**IT_ASSET, "assetCode": "TEST-QNA-EXP-B", "purchasePrice": 1450000}, headers=admin_headers).json()["data"]

    from app import qna_logic

    monkeypatch.setattr(qna_logic.llm, "is_configured", lambda: True)
    monkeypatch.setattr(
        qna_logic.llm,
        "ask_json",
        lambda *args, **kwargs: {
            # LLM이 실제로 100만원이 넘는 자산 2건을 잘못 골라 넣은 상황을 재현한다.
            "answer": "100만원 이하인 IT 장비는 2건입니다.",
            "relevantAssetIds": [expensive_a["id"], expensive_b["id"]],
            "hasData": True,
            "hasFilter": True,
            "minPrice": None,
            "maxPrice": 1000000,
        },
    )

    data = _ask(client, admin_headers, "100만원 이하인 IT 장비 찾기")
    codes = {a["assetCode"] for a in data["assets"]}
    assert codes == {"TEST-QNA-CHEAP"}
    assert "1건" in data["answer"]


def test_category_field_ignored_when_it_does_not_match_any_real_category(client, admin_headers, monkeypatch):
    """LLM이 '노트북'처럼 실제 카테고리(예: 'IT 장비')가 아니라 제품명/키워드를 category에
    잘못 채워 넣으면, 그 값으로 재필터링해 원래 맞았던 relevantAssetIds 결과를 "없음"으로
    덮어써버리는 회귀를 막는다. category가 실제 DB 카테고리와 무관하면 무시하고 LLM이
    고른 relevantAssetIds를 그대로 신뢰해야 한다."""
    laptop = client.post(
        "/api/assets",
        json={**IT_ASSET, "assetCode": "TEST-QNA-LAPTOP", "purchaseDate": "2018-01-01"},
        headers=admin_headers,
    ).json()["data"]

    from app import qna_logic

    monkeypatch.setattr(qna_logic.llm, "is_configured", lambda: True)
    monkeypatch.setattr(
        qna_logic.llm,
        "ask_json",
        lambda *args, **kwargs: {
            "answer": "3년 이상 사용한 노트북은 1건입니다.",
            "relevantAssetIds": [laptop["id"]],
            "hasData": True,
            "hasFilter": True,
            "minPrice": None,
            "maxPrice": None,
            "category": "노트북",  # 실제 카테고리는 "IT 장비"이지 "노트북"이 아니다.
        },
    )

    data = _ask(client, admin_headers, "3년 이상 사용한 노트북 보여줘")
    codes = {a["assetCode"] for a in data["assets"]}
    assert codes == {"TEST-QNA-LAPTOP"}
    assert "없습니다" not in data["answer"]


def test_keyword_and_used_years_are_recomputed_by_code_not_left_to_llm_judgment(client, admin_headers, monkeypatch):
    """'3년 이상 사용한 노트북'처럼 카테고리보다 구체적인 제품 키워드+사용기간 조건은,
    LLM이 keyword/minUsedYears를 채워주면 코드가 자산명/사용기간을 기준으로 정확히
    재계산해야 한다. 그렇지 않으면 "노트북"이 카테고리 전체(IT 장비)로 뭉뚱그려져
    노트북이 아닌 다른 IT 장비까지 결과에 섞이는 회귀가 생긴다."""
    old_laptop = client.post(
        "/api/assets",
        json={**IT_ASSET, "assetName": "노트북 LG Gram", "assetCode": "TEST-QNA-LAPTOP-OLD", "purchaseDate": "2018-01-01"},
        headers=admin_headers,
    ).json()["data"]
    new_laptop = client.post(
        "/api/assets",
        json={**IT_ASSET, "assetName": "노트북 삼성 갤럭시북", "assetCode": "TEST-QNA-LAPTOP-NEW", "purchaseDate": "2025-06-01"},
        headers=admin_headers,
    ).json()["data"]
    old_server = client.post(
        "/api/assets",
        json={**IT_ASSET, "assetName": "서버 Dell PowerEdge", "assetCode": "TEST-QNA-SERVER-OLD", "purchaseDate": "2018-01-01"},
        headers=admin_headers,
    ).json()["data"]

    from app import qna_logic

    monkeypatch.setattr(qna_logic.llm, "is_configured", lambda: True)
    monkeypatch.setattr(
        qna_logic.llm,
        "ask_json",
        lambda *args, **kwargs: {
            # LLM이 노트북/서버를 구분하지 못하고 IT 장비 전체를 relevantAssetIds에 담아온
            # 상황을 재현한다. keyword/minUsedYears가 채워져 있으면 코드가 이를 무시하고
            # 정확히 재계산해야 한다.
            "answer": "3년 이상 사용한 노트북은 여러 대입니다.",
            "relevantAssetIds": [old_laptop["id"], new_laptop["id"], old_server["id"]],
            "hasData": True,
            "hasFilter": True,
            "minPrice": None,
            "maxPrice": None,
            "category": None,
            "keyword": "노트북",
            "minUsedYears": 3,
            "maxUsedYears": None,
        },
    )

    data = _ask(client, admin_headers, "3년 이상 사용한 노트북 보여줘")
    codes = {a["assetCode"] for a in data["assets"]}
    assert codes == {"TEST-QNA-LAPTOP-OLD"}
    assert "1건" in data["answer"]


def test_price_filter_combined_with_category_excludes_other_categories(client, admin_headers, monkeypatch):
    """가격 조건과 카테고리 조건이 함께 걸린 질문("100만원 이하인 IT 장비")에서, 가격만
    코드로 재계산하고 카테고리 조건을 놓치면 IT가 아닌 저가 자산까지 섞여 나오는 회귀를 막는다."""
    cheap_it = client.post("/api/assets", json={**IT_ASSET, "assetCode": "TEST-QNA-CHEAP-IT", "purchasePrice": 500000, "category": "IT 장비"}, headers=admin_headers).json()["data"]
    cheap_office = client.post("/api/assets", json={**IT_ASSET, "assetCode": "TEST-QNA-CHEAP-OFFICE", "purchasePrice": 400000, "category": "사무기기"}, headers=admin_headers).json()["data"]

    from app import qna_logic

    monkeypatch.setattr(qna_logic.llm, "is_configured", lambda: True)
    monkeypatch.setattr(
        qna_logic.llm,
        "ask_json",
        lambda *args, **kwargs: {
            "answer": "100만원 이하인 IT 장비는 1건입니다.",
            "relevantAssetIds": [],
            "hasData": True,
            "hasFilter": True,
            "minPrice": None,
            "maxPrice": 1000000,
            "category": "IT 장비",
        },
    )

    data = _ask(client, admin_headers, "100만원 이하인 IT 장비 찾기")
    codes = {a["assetCode"] for a in data["assets"]}
    assert codes == {"TEST-QNA-CHEAP-IT"}
    assert "TEST-QNA-CHEAP-OFFICE" not in codes
