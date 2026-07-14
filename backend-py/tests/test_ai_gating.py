"""유지보수 분석의 AI 서술과 보고서의 AI 요약은 매번 자동으로 LLM을
호출하지 않고, includeAi=true를 명시했을 때만 생성되어야 한다."""

ASSET_PAYLOAD = {
    "assetName": "AI 게이팅 테스트 자산",
    "assetCode": "TEST-GATE-001",
    "category": "IT 장비",
    "location": "테스트실",
    "responsiblePerson": "테스트담당",
    "purchaseDate": "2020-01-01",
    "purchasePrice": 1000000,
    "usefulLife": 5,
    "status": "ACTIVE",
    "description": "게이팅 테스트용",
}

MAINTENANCE_PAYLOAD = {
    "maintenanceDate": "2024-05-01",
    "maintenanceType": "REPAIR",
    "cost": 30000,
    "description": "게이팅 테스트 수리",
}


def _seed_one_maintenance_record(client, admin_headers):
    asset = client.post("/api/assets", json=ASSET_PAYLOAD, headers=admin_headers).json()["data"]
    client.post(f"/api/assets/{asset['id']}/maintenance", json=MAINTENANCE_PAYLOAD, headers=admin_headers)


def test_maintenance_analysis_skips_ai_by_default(client, admin_headers):
    _seed_one_maintenance_record(client, admin_headers)
    resp = client.get("/api/ai/maintenance-analysis", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["aiAnalysis"] is None
    # 통계/차트 데이터는 AI 없이도 그대로 내려온다
    assert data["statistics"]["totalRecords"] >= 1


def test_maintenance_analysis_includes_ai_when_requested(client, admin_headers):
    _seed_one_maintenance_record(client, admin_headers)
    resp = client.get("/api/ai/maintenance-analysis?includeAi=true", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["aiAnalysis"] is not None


def test_maintenance_analysis_average_cost_is_a_whole_won_amount(client, admin_headers):
    """averageCost = totalCost / totalRecords는 나눗셈 결과라 소수점이 남을 수 있는데,
    원화 금액이라 정수여야 한다. 프론트엔드 toLocaleString()이 소수점까지 그대로
    표시해버리는 걸(예: "192,947.368원") 막기 위해 서버에서 반올림해서 내려야 한다."""
    asset = client.post("/api/assets", json=ASSET_PAYLOAD, headers=admin_headers).json()["data"]
    # 3건으로 나누면 나누어떨어지지 않는 금액으로 구성한다 (10000/3 = 3333.33...).
    for cost in (10000, 20000, 30000):
        client.post(
            f"/api/assets/{asset['id']}/maintenance",
            json={**MAINTENANCE_PAYLOAD, "cost": cost, "maintenanceDate": "2024-06-01"},
            headers=admin_headers,
        )
    resp = client.get("/api/ai/maintenance-analysis", headers=admin_headers)
    average_cost = resp.json()["data"]["statistics"]["averageCost"]
    assert average_cost == int(average_cost)


def test_maintenance_analysis_ai_text_respects_selected_range(client, admin_headers):
    """전체 기간에 기록이 많아도, 범위를 좁히면 AI 서술은 그 범위 건수만 반영해야 한다."""
    asset = client.post("/api/assets", json=ASSET_PAYLOAD, headers=admin_headers).json()["data"]
    asset_id = asset["id"]
    # 범위 밖(2023년)에 3건, 범위 안(2024-05)에 1건을 심는다.
    for month in ("2023-01-15", "2023-03-15", "2023-06-15"):
        client.post(
            f"/api/assets/{asset_id}/maintenance",
            json={**MAINTENANCE_PAYLOAD, "maintenanceDate": month},
            headers=admin_headers,
        )
    client.post(f"/api/assets/{asset_id}/maintenance", json=MAINTENANCE_PAYLOAD, headers=admin_headers)

    resp = client.get(
        "/api/ai/maintenance-analysis?startMonth=2024-05&endMonth=2024-05&includeAi=true",
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    # 상단 통계 카드는 의도적으로 전체 기간 기준이라 4건 전부 잡힌다.
    assert data["statistics"]["totalRecords"] == 4
    # 하지만 AI 서술은 선택 범위(2024-05)의 1건만 반영해야 한다.
    assert "1건" in data["aiAnalysis"]
    assert "4건" not in data["aiAnalysis"]


def test_monthly_report_skips_ai_narrative_by_default(client, admin_headers):
    resp = client.get("/api/reports/monthly", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["executiveSummary"] is None
    assert data["keyIssues"] is None
    assert data["recommendations"] is None
    # 통계 데이터는 그대로 내려온다
    assert "totalAssets" in data


def test_monthly_report_includes_ai_narrative_when_requested(client, admin_headers):
    resp = client.get("/api/reports/monthly?includeAi=true", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["executiveSummary"] is not None
    assert isinstance(data["keyIssues"], list)
    assert isinstance(data["recommendations"], list)


def test_get_or_create_work_order(client, admin_headers):
    asset = client.post("/api/assets", json=ASSET_PAYLOAD, headers=admin_headers).json()["data"]
    record = client.post(f"/api/assets/{asset['id']}/maintenance", json=MAINTENANCE_PAYLOAD, headers=admin_headers).json()["data"]

    resp = client.get(f"/api/ai/work-orders/{record['id']}", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "title" in data
    assert "steps" in data
    assert isinstance(data["steps"], list)
    assert len(data["steps"]) > 0

    resp2 = client.get(f"/api/ai/work-orders/{record['id']}", headers=admin_headers)
    assert resp2.status_code == 200
    assert resp2.json()["id"] == data["id"]


def test_get_budget_forecast(client, admin_headers):
    resp = client.get("/api/ai/budgets/forecast", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "forecastYear" in data
    assert "monthlyForecast" in data
    assert len(data["monthlyForecast"]) == 12
    assert "rationale" in data


def test_simulate_budget(client, admin_headers):
    resp = client.post("/api/ai/budgets/simulate", json={"totalBudget": 50000000.0}, headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "allocations" in data
    assert len(data["allocations"]) > 0
    assert "totalAllocated" in data
    assert "summary" in data


def test_simulate_budget_never_exceeds_total_budget(client, admin_headers):
    """반올림(만원 단위) 등으로 배분 합계가 상한액을 넘지 않도록 클램프되어야 한다."""
    total_budget = 1234567.0
    resp = client.post("/api/ai/budgets/simulate", json={"totalBudget": total_budget}, headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["totalAllocated"] <= total_budget
    assert sum(a["allocatedAmount"] for a in data["allocations"]) <= total_budget


def test_generate_procurement_spec(client, admin_headers):
    asset = client.post("/api/assets", json=ASSET_PAYLOAD, headers=admin_headers).json()["data"]
    resp = client.get(f"/api/ai/procurement-spec/{asset['id']}", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "title" in data
    assert "specifications" in data
    assert "rfp" in data
    assert "budgetEstimate" in data
    assert "rationale" in data


def test_generate_procurement_spec_pdf(client, admin_headers):
    asset = client.post("/api/assets", json=ASSET_PAYLOAD, headers=admin_headers).json()["data"]
    spec = client.get(f"/api/ai/procurement-spec/{asset['id']}", headers=admin_headers).json()
    resp = client.post(f"/api/ai/procurement-spec/{asset['id']}/pdf", json=spec, headers=admin_headers)
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content[:5] == b"%PDF-"


def test_generate_procurement_spec_pdf_404_for_missing_asset(client, admin_headers):
    spec = {
        "title": "테스트",
        "specifications": "사양",
        "rfp": "제안요청서",
        "budgetEstimate": 1000000,
        "rationale": "근거",
    }
    resp = client.post("/api/ai/procurement-spec/999999/pdf", json=spec, headers=admin_headers)
    assert resp.status_code == 404


def test_diagnose_asset_failure(client, admin_headers):
    asset = client.post("/api/assets", json=ASSET_PAYLOAD, headers=admin_headers).json()["data"]
    payload = {
        "assetId": asset["id"],
        "chatHistory": [
            {"role": "user", "content": "화면 전원이 켜지지 않아요. E-02 에러코드가 뜹니다."}
        ]
    }
    resp = client.post("/api/ai/diagnose", json=payload, headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "reply" in data
    assert len(data["reply"]) > 0


def test_diagnose_asset_failure_with_null_cost_record_does_not_crash(client, admin_headers):
    """cost가 없는(None) 유지보수 기록이 있어도 비용 포맷팅에서 500이 나면 안 된다."""
    asset = client.post("/api/assets", json=ASSET_PAYLOAD, headers=admin_headers).json()["data"]
    client.post(
        f"/api/assets/{asset['id']}/maintenance",
        json={
            "maintenanceDate": "2024-05-01",
            "maintenanceType": "INSPECTION",
            "description": "비용 미기재 점검",
        },
        headers=admin_headers,
    )
    payload = {
        "assetId": asset["id"],
        "chatHistory": [{"role": "user", "content": "이 장비 점검 이력 알려줘"}],
    }
    resp = client.post("/api/ai/diagnose", json=payload, headers=admin_headers)
    assert resp.status_code == 200
