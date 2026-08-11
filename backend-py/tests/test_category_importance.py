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


def test_admin_can_set_custom_reason_when_overriding_importance(client, admin_headers):
    _create_asset(client, admin_headers, category="테스트카테고리-근거")

    resp = client.put(
        "/api/assets/category-importance",
        json={"category": "테스트카테고리-근거", "score": 80, "reason": "핵심 서버실 장비라 중요"},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["reason"] == "핵심 서버실 장비라 중요"

    listed = client.get("/api/assets/category-importance", headers=admin_headers).json()["data"]
    row = next(r for r in listed if r["category"] == "테스트카테고리-근거")
    assert row["reason"] == "핵심 서버실 장비라 중요"


def test_overriding_importance_without_reason_falls_back_to_default_text(client, admin_headers):
    _create_asset(client, admin_headers, category="테스트카테고리-근거없음")

    resp = client.put(
        "/api/assets/category-importance",
        json={"category": "테스트카테고리-근거없음", "score": 70},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert "관리자" in resp.json()["data"]["reason"]


def test_ai_recompute_fails_when_ai_not_configured(client, admin_headers):
    """테스트 환경은 GN_API_KEY=""라 AI가 항상 미설정 상태이므로, 재산정 요청은
    명확한 에러로 실패해야 한다(조용히 기본값으로 대체되면 안 됨)."""
    _create_asset(client, admin_headers, category="테스트카테고리-AI재산정불가")

    resp = client.post(
        "/api/assets/category-importance/ai-recompute",
        json={"category": "테스트카테고리-AI재산정불가"},
        headers=admin_headers,
    )
    assert resp.status_code == 400


def test_ai_recompute_overrides_manual_value_and_ignores_it(client, admin_headers, monkeypatch):
    """관리자가 이미 MANUAL로 지정해둔 값이 있어도, AI 재산정은 그 값을 참고하지 않고
    새로 산정한 점수/근거로 덮어써야 한다."""
    _create_asset(client, admin_headers, category="테스트카테고리-AI덮어쓰기")
    client.put(
        "/api/assets/category-importance",
        json={"category": "테스트카테고리-AI덮어쓰기", "score": 10, "reason": "관리자가 낮게 설정함"},
        headers=admin_headers,
    )

    from app import category_importance as category_importance_module

    monkeypatch.setattr(category_importance_module.llm, "is_configured", lambda: True)
    monkeypatch.setattr(
        category_importance_module.llm,
        "ask_json",
        lambda *args, **kwargs: {"score": 88, "reason": "AI가 새로 산정한 근거"},
    )

    resp = client.post(
        "/api/assets/category-importance/ai-recompute",
        json={"category": "테스트카테고리-AI덮어쓰기"},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["score"] == 88.0
    assert data["reason"] == "AI가 새로 산정한 근거"
    assert data["source"] == "AI"


def test_ai_recompute_truncates_overly_long_reason(client, admin_headers, monkeypatch):
    """근거는 표 한 줄에 들어가야 하므로, 프롬프트로 40자 이내를 요청해도 모델이
    넘겨 보내는 경우를 대비해 서버에서 한 번 더 잘라야 한다."""
    _create_asset(client, admin_headers, category="테스트카테고리-긴근거")

    from app import category_importance as category_importance_module

    long_reason = "이 카테고리는 " + "매우 " * 30 + "중요합니다"
    monkeypatch.setattr(category_importance_module.llm, "is_configured", lambda: True)
    monkeypatch.setattr(
        category_importance_module.llm,
        "ask_json",
        lambda *args, **kwargs: {"score": 60, "reason": long_reason},
    )

    resp = client.post(
        "/api/assets/category-importance/ai-recompute",
        json={"category": "테스트카테고리-긴근거"},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert len(resp.json()["data"]["reason"]) <= 40


def test_deleting_last_asset_in_category_removes_orphaned_category(client, admin_headers):
    """카테고리를 참조하는 자산이 하나도 안 남으면 category_importance/category 행도
    함께 정리되어야, 자산이 하나도 없는 카테고리가 화면에 계속 남지 않는다."""
    asset = _create_asset(client, admin_headers, category="테스트카테고리-고아")

    resp = client.get("/api/assets/category-importance", headers=admin_headers)
    categories = {r["category"] for r in resp.json()["data"]}
    assert "테스트카테고리-고아" in categories

    del_resp = client.delete(f"/api/assets/{asset['id']}", headers=admin_headers)
    assert del_resp.status_code == 200

    resp = client.get("/api/assets/category-importance", headers=admin_headers)
    categories = {r["category"] for r in resp.json()["data"]}
    assert "테스트카테고리-고아" not in categories


def test_deleting_asset_keeps_category_when_other_assets_remain(client, admin_headers):
    """같은 카테고리를 쓰는 다른 자산이 남아있으면 카테고리를 지우면 안 된다."""
    asset1 = _create_asset(client, admin_headers, category="테스트카테고리-공유삭제")
    _create_asset(client, admin_headers, category="테스트카테고리-공유삭제")

    client.delete(f"/api/assets/{asset1['id']}", headers=admin_headers)

    resp = client.get("/api/assets/category-importance", headers=admin_headers)
    categories = {r["category"] for r in resp.json()["data"]}
    assert "테스트카테고리-공유삭제" in categories


def test_changing_asset_category_removes_old_orphaned_category(client, admin_headers):
    """자산의 카테고리를 바꿔서 옛 카테고리를 쓰는 자산이 하나도 안 남으면,
    옛 카테고리도 함께 정리되어야 한다."""
    asset = _create_asset(client, admin_headers, category="테스트카테고리-이전")

    updated_payload = {**ASSET_PAYLOAD, "category": "테스트카테고리-이후"}
    resp = client.put(f"/api/assets/{asset['id']}", json=updated_payload, headers=admin_headers)
    assert resp.status_code == 200

    resp = client.get("/api/assets/category-importance", headers=admin_headers)
    categories = {r["category"] for r in resp.json()["data"]}
    assert "테스트카테고리-이전" not in categories
    assert "테스트카테고리-이후" in categories


def test_changing_asset_category_keeps_old_category_when_shared(client, admin_headers):
    """다른 자산이 여전히 옛 카테고리를 쓰고 있으면 카테고리 변경으로 지워지면 안 된다."""
    asset1 = _create_asset(client, admin_headers, category="테스트카테고리-공유이전")
    _create_asset(client, admin_headers, category="테스트카테고리-공유이전")

    updated_payload = {**ASSET_PAYLOAD, "category": "테스트카테고리-공유이후"}
    resp = client.put(f"/api/assets/{asset1['id']}", json=updated_payload, headers=admin_headers)
    assert resp.status_code == 200

    resp = client.get("/api/assets/category-importance", headers=admin_headers)
    categories = {r["category"] for r in resp.json()["data"]}
    assert "테스트카테고리-공유이전" in categories
    assert "테스트카테고리-공유이후" in categories


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
