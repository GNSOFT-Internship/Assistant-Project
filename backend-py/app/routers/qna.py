import json

from fastapi import APIRouter, Depends
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session

from .. import auth, models, schemas
from ..database import get_db
from ..qna_logic import answer_question

router = APIRouter(prefix="/api/qa", tags=["qna"])


@router.post("/ask")
def ask_question(
    request: schemas.QnARequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(auth.get_current_user),
):
    result = answer_question(db, request.question)

    user_id = int(current_user["sub"])
    db.add(models.ChatMessage(user_id=user_id, role=models.ChatRole.USER, content=request.question))
    db.add(models.ChatMessage(
        user_id=user_id,
        role=models.ChatRole.AI,
        content=result.get("answer", ""),
        assets=(
            json.dumps(jsonable_encoder(result.get("assets", [])), ensure_ascii=False)
            if result.get("assets") else None
        ),
        has_filter=bool(result.get("hasFilter", False)),
    ))
    db.commit()

    return {"success": True, "message": None, "data": result}
