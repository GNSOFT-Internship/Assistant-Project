from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from .. import models, schemas, auth
from ..database import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login")
def login(request: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == request.username).first()

    if user is None:
        return JSONResponse(status_code=401, content={"success": False, "message": "User not found", "data": None})

    if not auth.verify_password(request.password, user.password):
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid password", "data": None})

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
