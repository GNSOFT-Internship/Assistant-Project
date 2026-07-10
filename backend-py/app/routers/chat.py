import json

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import auth, models
from ..database import get_db

router = APIRouter(prefix="/api/chat", tags=["chat"])


def _message_to_dto(m: models.ChatMessage) -> dict:
    try:
        assets = json.loads(m.assets) if m.assets else []
    except (TypeError, ValueError):
        assets = []
    return {
        "id": m.id,
        "role": m.role.value if m.role else None,
        "content": m.content,
        "assets": assets,
        "hasFilter": bool(m.has_filter),
        "createdAt": m.created_at,
    }


@router.get("/history")
def get_history(db: Session = Depends(get_db), current_user: dict = Depends(auth.get_current_user)):
    user_id = int(current_user["sub"])
    messages = (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.user_id == user_id)
        .order_by(models.ChatMessage.created_at)
        .all()
    )
    return {"success": True, "message": None, "data": [_message_to_dto(m) for m in messages]}


@router.delete("/history")
def clear_history(db: Session = Depends(get_db), current_user: dict = Depends(auth.get_current_user)):
    user_id = int(current_user["sub"])
    db.query(models.ChatMessage).filter(models.ChatMessage.user_id == user_id).delete()
    db.commit()
    return {"success": True, "message": "대화 기록을 삭제했습니다.", "data": None}
