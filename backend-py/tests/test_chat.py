def test_ask_persists_user_and_ai_messages(client, admin_headers):
    resp = client.post("/api/qa/ask", json={"question": "총 자산 수는 얼마인가요?"}, headers=admin_headers)
    assert resp.status_code == 200

    history = client.get("/api/chat/history", headers=admin_headers).json()["data"]
    assert len(history) == 2
    assert history[0]["role"] == "USER"
    assert history[0]["content"] == "총 자산 수는 얼마인가요?"
    assert history[1]["role"] == "AI"
    assert history[1]["content"] == resp.json()["data"]["answer"]


def test_history_survives_across_requests_like_a_tab_switch(client, admin_headers):
    client.post("/api/qa/ask", json={"question": "첫 번째 질문"}, headers=admin_headers)
    client.post("/api/qa/ask", json={"question": "두 번째 질문"}, headers=admin_headers)

    history = client.get("/api/chat/history", headers=admin_headers).json()["data"]
    questions = [m["content"] for m in history if m["role"] == "USER"]
    assert questions == ["첫 번째 질문", "두 번째 질문"]


def test_history_is_isolated_per_user(client, admin_headers, user_headers):
    client.post("/api/qa/ask", json={"question": "admin 질문"}, headers=admin_headers)
    client.post("/api/qa/ask", json={"question": "user 질문"}, headers=user_headers)

    admin_history = client.get("/api/chat/history", headers=admin_headers).json()["data"]
    user_history = client.get("/api/chat/history", headers=user_headers).json()["data"]

    assert [m["content"] for m in admin_history if m["role"] == "USER"] == ["admin 질문"]
    assert [m["content"] for m in user_history if m["role"] == "USER"] == ["user 질문"]


def test_clear_history_only_removes_current_users_messages(client, admin_headers, user_headers):
    client.post("/api/qa/ask", json={"question": "admin 질문"}, headers=admin_headers)
    client.post("/api/qa/ask", json={"question": "user 질문"}, headers=user_headers)

    clear_resp = client.delete("/api/chat/history", headers=admin_headers)
    assert clear_resp.status_code == 200

    assert client.get("/api/chat/history", headers=admin_headers).json()["data"] == []
    assert len(client.get("/api/chat/history", headers=user_headers).json()["data"]) == 2


def test_history_requires_auth(client):
    resp = client.get("/api/chat/history")
    assert resp.status_code == 401
