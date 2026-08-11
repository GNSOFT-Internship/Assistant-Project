"""카테고리별 교체 우선순위 중요도(0~100점) 기능 테스트.

conftest.py가 GN_API_KEY=""로 테스트를 돌리므로 AI는 항상 미설정 상태이고,
새 카테고리는 항상 기본값(50.0, source=DEFAULT)으로 산정된다. AI 응답 자체를
검증하는 것이 아니라, 자산 등록 시 카테고리 중요도가 자동으로 생기는지 /
관리자가 직접 값을 덮어쓸 수 있는지 / 그 값이 교체 추천 점수에 반영되는지를 검증한다.
"""

ASSET_PAYLOAD = {
    "assetName": "테스트 NAS",
    "category": "테스트카테고리-NAS",
    "location": "서버실",
    "responsiblePerson": "테스트담당",
    "purchaseDate": "2020-01-01",
    "purchasePrice": 1000000,
    "usefulLife": 5,
    "status": "ACTIVE",
    "description": "",
}


def _create_asset(client, admin_headers, **overrides):
    payload = {**ASSET_PAYLOAD, **overrides}
    resp = client.post("/api/assets", json=payload, headers=admin_headers)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def test_new_category_gets_default_importance_on_asset_creation(client, admin_headers):
    _create_asset(client, admin_headers, category="테스트카테고리-정수기")

    resp = client.get("/api/assets/category-importance", headers=admin_headers)
    assert resp.status_code == 200
    rows = {r["category"]: r for r in resp.json()["data"]}
    assert "테스트카테고리-정수기" in rows
    assert rows["테스트카테고리-정수기"]["score"] == 50.0
    assert rows["테스트카테고리-정수기"]["source"] == "DEFAULT"


def test_existing_category_is_not_recomputed(client, admin_headers):
    _create_asset(client, admin_headers, category="테스트카테고리-공유")
    _create_asset(client, admin_headers, category="테스트카테고리-공유")

    resp = client.get("/api/assets/category-importance", headers=admin_headers)
    rows = [r for r in resp.json()["data"] if r["category"] == "테스트카테고리-공유"]
    assert len(rows) == 1


def test_admin_can_override_category_importance(client, admin_headers):
    _create_asset(client, admin_headers, category="테스트카테고리-override")

    resp = client.put(
        "/api/assets/category-importance",
        json={"category": "테스트카테고리-override", "score": 95},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["score"] == 95.0
    assert resp.json()["data"]["source"] == "MANUAL"

    listed = client.get("/api/assets/category-importance", headers=admin_headers).json()["data"]
    row = next(r for r in listed if r["category"] == "테스트카테고리-override")
    assert row["score"] == 95.0
    assert row["source"] == "MANUAL"


def test_non_admin_cannot_override_category_importance(client, admin_headers, user_headers):
    _create_asset(client, admin_headers, category="테스트카테고리-권한")

    resp = client.put(
        "/api/assets/category-importance",
        json={"category": "테스트카테고리-권한", "score": 10},
        headers=user_headers,
    )
    assert resp.status_code == 403


def test_higher_category_importance_increases_replacement_score(client, admin_headers):
    """같은 조건(사용기간/수리비/유지보수 없음)의 두 자산 중, 카테고리 중요도를
    95점으로 올린 쪽이 그대로 50점인 쪽보다 교체 우선순위 점수가 높아야 한다."""
    asset_low = _create_asset(
        client, admin_headers, category="테스트카테고리-낮음",
        purchaseDate="2024-01-01",
    )
    asset_high = _create_asset(
        client, admin_headers, category="테스트카테고리-높음",
        purchaseDate="2024-01-01",
    )
    resp = client.put(
        "/api/assets/category-importance",
        json={"category": "테스트카테고리-높음", "score": 95},
        headers=admin_headers,
    )
    assert resp.status_code == 200

    resp = client.post("/api/ai/replacement-recommendation", json={}, headers=admin_headers)
    assert resp.status_code == 200
    recs = {r["assetId"]: r for r in resp.json()["data"]["recommendations"]}
    assert recs[asset_high["id"]]["score"] > recs[asset_low["id"]]["score"]
