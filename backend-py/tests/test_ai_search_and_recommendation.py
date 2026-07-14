"""자연어 검색, 교체 우선순위 추천, 고장 유형별 자산 조회 엔드포인트 검증.

테스트 환경은 GN_API_KEY가 비어 있어 항상 규칙 기반 폴백 경로를 타지만,
그 경로 자체가 실제로 올바른 필터링/정렬 결과를 내는지는 별도로 검증되어야 한다.
"""

ASSET_PAYLOAD = {
    "assetName": "자연어검색 테스트 노트북",
    "assetCode": "TEST-SEARCH-001",
    "category": "IT 장비",
    "location": "테스트실",
    "responsiblePerson": "테스트담당",
    "purchaseDate": "2020-01-01",
    "purchasePrice": 1000000,
    "usefulLife": 5,
    "status": "ACTIVE",
    "description": "pytest로 만든 자산",
}

MAINTENANCE_PAYLOAD = {
    "maintenanceDate": "2024-05-01",
    "maintenanceType": "REPAIR",
    "cost": 30000,
    "description": "테스트 수리",
    "failureType": "전원고장",
}


def _create_asset(client, admin_headers, **overrides):
    payload = {**ASSET_PAYLOAD, **overrides}
    resp = client.post("/api/assets", json=payload, headers=admin_headers)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def test_natural_language_search_empty_query_returns_all_assets(client, admin_headers):
    _create_asset(client, admin_headers)
    resp = client.post("/api/ai/natural-language-search", json={"query": ""}, headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["hasFilter"] is False
    assert any(a["assetCode"] == "TEST-SEARCH-001" for a in data["assets"])


def test_natural_language_search_keyword_fallback_filters_by_name(client, admin_headers):
    _create_asset(client, admin_headers, assetName="자연어검색 테스트 노트북", assetCode="TEST-SEARCH-002")
    _create_asset(client, admin_headers, assetName="전혀 다른 프린터", assetCode="TEST-SEARCH-003")

    resp = client.post("/api/ai/natural-language-search", json={"query": "노트북"}, headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    codes = {a["assetCode"] for a in data["assets"]}
    assert "TEST-SEARCH-002" in codes
    assert "TEST-SEARCH-003" not in codes


def test_natural_language_search_price_condition_is_applied_by_code(client, admin_headers, monkeypatch):
    """가격 조건(minPrice/maxPrice)은 LLM이 숫자만 추출하고, 실제 비교는 코드가 확정적으로
    수행해야 한다. LLM이 조건과 무관한 explanation을 내놔도 결과는 정확해야 한다."""
    cheap = _create_asset(client, admin_headers, assetCode="TEST-SEARCH-CHEAP", purchasePrice=500000)
    expensive = _create_asset(client, admin_headers, assetCode="TEST-SEARCH-EXP", purchasePrice=1610000)

    from app.routers import ai as ai_router

    monkeypatch.setattr(ai_router.llm, "is_configured", lambda: True)
    monkeypatch.setattr(
        ai_router.llm,
        "ask_json",
        lambda *args, **kwargs: {
            "category": None, "location": None, "keyword": None,
            "minUsedYears": None, "maxUsedYears": None,
            "minPrice": None, "maxPrice": 1000000,
            "statusFilter": None, "failureKeyword": None, "minFailureCount": None,
            "minMaintenanceCount": None, "noRepairHistory": None, "noMaintenanceHistory": None,
            "explanation": "100만원 이하인 자산을 찾았습니다.",
        },
    )

    resp = client.post("/api/ai/natural-language-search", json={"query": "100만원 이하인 자산"}, headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    codes = {a["assetCode"] for a in data["assets"]}
    assert "TEST-SEARCH-CHEAP" in codes
    assert "TEST-SEARCH-EXP" not in codes
    assert data["hasFilter"] is True


def test_replacement_recommendation_without_budget_returns_top_five(client, admin_headers):
    for i in range(7):
        asset = _create_asset(client, admin_headers, assetCode=f"TEST-REC-{i:03d}", purchasePrice=100000)
        client.post(
            f"/api/assets/{asset['id']}/maintenance",
            json={**MAINTENANCE_PAYLOAD, "cost": 10000 * (i + 1)},
            headers=admin_headers,
        )

    resp = client.post("/api/ai/replacement-recommendation", json={}, headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert len(data["recommendations"]) <= 5
    scores = [r["score"] for r in data["recommendations"]]
    assert scores == sorted(scores, reverse=True)


def test_replacement_recommendation_respects_budget_cap(client, admin_headers):
    asset = _create_asset(client, admin_headers, assetCode="TEST-REC-BUDGET", purchasePrice=500000)
    client.post(f"/api/assets/{asset['id']}/maintenance", json=MAINTENANCE_PAYLOAD, headers=admin_headers)

    resp = client.post("/api/ai/replacement-recommendation", json={"budget": 100000}, headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["totalRecommendedCost"] <= 100000
    for rec in data["recommendations"]:
        assert rec["purchasePrice"] <= 100000


def test_failure_assets_returns_occurrence_counts_sorted_desc(client, admin_headers):
    asset_a = _create_asset(client, admin_headers, assetCode="TEST-FAIL-A")
    asset_b = _create_asset(client, admin_headers, assetCode="TEST-FAIL-B")

    client.post(f"/api/assets/{asset_a['id']}/maintenance", json=MAINTENANCE_PAYLOAD, headers=admin_headers)
    client.post(
        f"/api/assets/{asset_a['id']}/maintenance",
        json={**MAINTENANCE_PAYLOAD, "maintenanceDate": "2024-06-01"},
        headers=admin_headers,
    )
    client.post(f"/api/assets/{asset_b['id']}/maintenance", json=MAINTENANCE_PAYLOAD, headers=admin_headers)

    resp = client.get(
        "/api/ai/maintenance-analysis/failure-assets",
        params={"failureType": "전원고장"},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    by_code = {item["assetCode"]: item["occurrenceCount"] for item in data}
    assert by_code["TEST-FAIL-A"] == 2
    assert by_code["TEST-FAIL-B"] == 1
    assert data[0]["assetCode"] == "TEST-FAIL-A"  # 발생 횟수 내림차순 정렬


def test_failure_assets_respects_month_range_filter(client, admin_headers):
    asset = _create_asset(client, admin_headers, assetCode="TEST-FAIL-RANGE")
    client.post(
        f"/api/assets/{asset['id']}/maintenance",
        json={**MAINTENANCE_PAYLOAD, "maintenanceDate": "2023-01-15"},
        headers=admin_headers,
    )
    client.post(
        f"/api/assets/{asset['id']}/maintenance",
        json={**MAINTENANCE_PAYLOAD, "maintenanceDate": "2024-05-15"},
        headers=admin_headers,
    )

    resp = client.get(
        "/api/ai/maintenance-analysis/failure-assets",
        params={"failureType": "전원고장", "startMonth": "2024-01", "endMonth": "2024-12"},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert len(data) == 1
    assert data[0]["occurrenceCount"] == 1
