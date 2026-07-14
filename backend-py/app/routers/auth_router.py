from collections import defaultdict
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from .. import models, schemas, auth
from ..client_ip import get_client_ip
from ..database import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])

# 단일 프로세스(uvicorn worker 1개) 배포를 전제로 한 인메모리 무차별 대입 방지.
# 재시작 시 초기화되지만, 이 프로젝트 규모에서는 별도 저장소 없이 충분하다.
_LOCKOUT_THRESHOLD = 5
_LOCKOUT_WINDOW = timedelta(minutes=10)
_failed_attempts: dict[str, list[datetime]] = defaultdict(list)


def _client_ip(request: Request) -> str:
    return get_client_ip(request)


def _is_locked(ip: str) -> bool:
    now = datetime.now()
    recent = [t for t in _failed_attempts[ip] if now - t < _LOCKOUT_WINDOW]
    _failed_attempts[ip] = recent
    return len(recent) >= _LOCKOUT_THRESHOLD


def _record_failure(ip: str):
    _failed_attempts[ip].append(datetime.now())


def _clear_failures(ip: str):
    _failed_attempts.pop(ip, None)


@router.post("/login")
def login(request: schemas.LoginRequest, http_request: Request, db: Session = Depends(get_db)):
    ip = _client_ip(http_request)

    if _is_locked(ip):
        return JSONResponse(
            status_code=429,
            content={
                "success": False,
                "message": "로그인 시도가 너무 많습니다. 10분 후 다시 시도해주세요.",
                "data": None,
            },
        )

    user = db.query(models.User).filter(models.User.username == request.username).first()

    if user is None or not auth.verify_password(request.password, user.password):
        _record_failure(ip)
        return JSONResponse(
            status_code=401,
            content={"success": False, "message": "아이디 또는 비밀번호가 올바르지 않습니다.", "data": None},
        )

    _clear_failures(ip)
    token = auth.create_access_token(user.id, user.username, user.role.value)

    return {
        "success": True,
        "message": None,
        "data": {
            "token": token,
            "username": user.username,
            "role": user.role.value,
        },
    }
