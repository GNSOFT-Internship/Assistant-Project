from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import models, auth
from .database import Base, engine, SessionLocal
from .routers import auth_router, assets, budgets, chat, dashboard, files, qna, ai, reports

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

app.include_router(auth_router.router)
app.include_router(assets.router, dependencies=_auth_dep)
app.include_router(budgets.router, dependencies=_auth_dep)
app.include_router(chat.router, dependencies=_auth_dep)
app.include_router(dashboard.router, dependencies=_auth_dep)
app.include_router(files.router, dependencies=_auth_dep)
app.include_router(qna.router, dependencies=_auth_dep)
app.include_router(ai.router, dependencies=_auth_dep)
app.include_router(reports.router, dependencies=_auth_dep)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    seed_initial_users()
    
    from .config import settings
    # JWT_SECRET 보안성 경고 검증
    if not settings.DEMO_MODE and settings.JWT_SECRET == "asset-management-secret-key-for-development":
        import warnings
        warnings.warn(
            "SECURITY WARNING: JWT_SECRET is set to the default development key. "
            "Please configure a secure JWT_SECRET in your production .env file to prevent token forgery.",
            UserWarning
        )
        print("\n" + "=" * 80)
        print("[WARNING] SECURITY RISK: Default JWT_SECRET is active in non-demo mode!")
        print("=" * 80 + "\n")


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


@app.get("/")
def read_root():
    return {"status": "Asset Management API is running"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8080)
