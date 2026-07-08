from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import schemas
from ..database import get_db
from ..qna_logic import answer_question

router = APIRouter(prefix="/api/qa", tags=["qna"])


@router.post("/ask")
def ask_question(request: schemas.QnARequest, db: Session = Depends(get_db)):
    result = answer_question(db, request.question)
    return {"success": True, "message": None, "data": result}
