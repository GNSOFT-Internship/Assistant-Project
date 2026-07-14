"""get_client_ip이 nginx가 실제로 보내는 X-Real-IP/X-Forwarded-For 헤더를
request.client.host보다 우선해서 신뢰하는지 검증한다."""

from unittest.mock import MagicMock

from app.client_ip import get_client_ip


def _request(headers: dict, client_host: str = "127.0.0.1"):
    req = MagicMock()
    req.headers = headers
    req.client.host = client_host
    return req


def test_prefers_x_real_ip_over_client_host():
    req = _request({"x-real-ip": "203.0.113.5"})
    assert get_client_ip(req) == "203.0.113.5"


def test_falls_back_to_x_forwarded_for_first_entry():
    req = _request({"x-forwarded-for": "203.0.113.9, 10.0.0.1"})
    assert get_client_ip(req) == "203.0.113.9"


def test_falls_back_to_request_client_host_when_no_headers():
    req = _request({}, client_host="192.168.1.1")
    assert get_client_ip(req) == "192.168.1.1"
