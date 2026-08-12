import logging

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import models, auth, rate_limit
from .database import Base, engine, SessionLocal
from .routers import auth_router, assets, budgets, chat, dashboard, files, qna, ai, reports

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = FastAPI(title="Asset Management API (Python)")

# 인증은 쿠키가 아닌 Authorization 헤더(Bearer 토큰) 기반이므로
# allow_credentials=True + allow_origins("*") 조합(브라우저에서 거부되는 조합)을 쓰지 않는다.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 로그인(/api/auth/login)을 제외한 모든 API는 로그인해야 호출 가능하다.
# 프론트엔드가 토큰을 헤더에 실어 보내더라도 서버가 검증하지 않으면
# 의미가 없으므로, 라우터 단위로 인증 의존성을 강제한다.
_auth_dep = [Depends(auth.get_current_user)]
# AI를 실제로 호출하는 라우터에는 인증에 더해 요청 제한을 함께 건다.
_ai_dep = _auth_dep + [Depends(rate_limit.check_ai_rate_limit)]

app.include_router(auth_router.router)
app.include_router(assets.router, dependencies=_auth_dep)
app.include_router(budgets.router, dependencies=_auth_dep)
app.include_router(chat.router, dependencies=_auth_dep)
app.include_router(dashboard.router, dependencies=_auth_dep)
app.include_router(files.router, dependencies=_auth_dep)
app.include_router(qna.router, dependencies=_ai_dep)
app.include_router(ai.router, dependencies=_ai_dep)
app.include_router(reports.router, dependencies=_ai_dep)


_DEFAULT_JWT_SECRET = "asset-management-secret-key-for-development"


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)

    from .config import settings
    # 이 기본값은 GitHub 공개 저장소에 그대로 노출되어 있으므로, DEMO_MODE 여부와
    # 무관하게(DEMO_MODE는 대시보드 데모 데이터 표시 여부와만 관련된 별개의 설정이다)
    # 이 값을 그대로 쓰는 배포는 누구나 관리자 토큰을 위조할 수 있어 절대 허용하지 않는다.
    # 과거에는 "DEMO_MODE=false일 때만" 경고만 출력했는데, 운영 서버의 .env가
    # DEMO_MODE=true로 남아있으면 이 검증 자체가 통째로 건너뛰어지는 문제가 있었다.
    if settings.JWT_SECRET == _DEFAULT_JWT_SECRET:
        raise RuntimeError(
            "SECURITY: JWT_SECRET이 공개 저장소에 노출된 기본 개발용 값으로 설정되어 있습니다. "
            ".env 파일에 고유한 JWT_SECRET을 반드시 설정한 뒤 다시 시작하세요."
        )

    if settings.SEED_DEFAULT_USERS:
        seed_initial_users()
    else:
        _reject_if_default_credentials_active()


def seed_initial_users():
    db = SessionLocal()
    try:
        if db.query(models.User).filter(models.User.username == "admin").first() is None:
            admin = models.User(
                username="admin",
                password=auth.hash_password("admin123"),
                role=models.UserRole.ADMIN,
                email="admin@example.com",
            )
            db.add(admin)
            db.commit()
            print("Admin user created: admin / admin123")

        if db.query(models.User).filter(models.User.username == "user").first() is None:
            user = models.User(
                username="user",
                password=auth.hash_password("user123"),
                role=models.UserRole.USER,
                email="user@example.com",
            )
            db.add(user)
            db.commit()
            print("User created: user / user123")
    finally:
        db.close()


def _reject_if_default_credentials_active():
    """SEED_DEFAULT_USERS=false(운영 기본값)인데도 admin 계정 비밀번호가
    여전히 공개 저장소에 노출된 기본값(admin123)이면 기동을 막는다.
    이 계정으로 로그인하면 누구나 자산/예산/파일을 마음대로 변경할 수 있는
    관리자 권한을 얻으므로, JWT_SECRET 검증과 동일한 수준으로 취급한다."""
    db = SessionLocal()
    try:
        admin = db.query(models.User).filter(models.User.username == "admin").first()
        if admin is not None and auth.verify_password("admin123", admin.password):
            raise RuntimeError(
                "SECURITY: 기본 관리자 계정(admin/admin123)의 비밀번호가 아직 그대로입니다. "
                "관리자 비밀번호를 변경한 뒤 다시 시작하거나, 개발/데모 환경이라면 "
                ".env에 SEED_DEFAULT_USERS=true를 명시적으로 설정하세요."
            )
    finally:
        db.close()


@app.get("/")
def read_root():
    return {"status": "Asset Management API is running"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8080)
