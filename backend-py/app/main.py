from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import models, auth
from .database import Base, engine, SessionLocal
from .routers import auth_router, assets, dashboard, files, qna, ai

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

app.include_router(auth_router.router)
app.include_router(assets.router)
app.include_router(dashboard.router)
app.include_router(files.router)
app.include_router(qna.router)
app.include_router(ai.router)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    seed_initial_users()


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
