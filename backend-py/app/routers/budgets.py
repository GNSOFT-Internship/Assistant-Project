from fastapi import APIRouter, Depends
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import auth, models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/budgets", tags=["budgets"])


def budget_to_dto(b: models.Budget) -> dict:
    return {
        "id": b.id,
        "year": b.year,
        "month": b.month,
        "allocatedAmount": float(b.allocated_amount),
    }


@router.get("")
def get_all_budgets(db: Session = Depends(get_db)):
    budgets = (
        db.query(models.Budget)
        .order_by(models.Budget.year.desc(), models.Budget.month.desc())
        .all()
    )
    return {"success": True, "message": None, "data": [budget_to_dto(b) for b in budgets]}


@router.put("/{year}/{month}")
def set_budget(
    year: int,
    month: int,
    request: schemas.BudgetRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(auth.require_admin),
):
    budget = (
        db.query(models.Budget)
        .filter(models.Budget.year == year, models.Budget.month == month)
        .first()
    )
    if budget is None:
        budget = models.Budget(year=year, month=month, allocated_amount=request.allocatedAmount)
        db.add(budget)
        try:
            db.commit()
        except IntegrityError:
            # 같은 연/월에 대한 저장 요청이 동시에 두 번 들어와(예: 두 관리자가 같은 순간 저장)
            # 유니크 제약(uq_budget_year_month)에 걸린 경우, 500으로 실패시키는 대신
            # 그새 다른 요청이 만든 행을 다시 조회해 업데이트로 전환한다.
            db.rollback()
            budget = (
                db.query(models.Budget)
                .filter(models.Budget.year == year, models.Budget.month == month)
                .first()
            )
            budget.allocated_amount = request.allocatedAmount
            db.commit()
    else:
        budget.allocated_amount = request.allocatedAmount
        db.commit()

    db.refresh(budget)
    return {"success": True, "message": "Budget saved", "data": budget_to_dto(budget)}


@router.delete("/{year}/{month}")
def delete_budget(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(auth.require_admin),
):
    budget = (
        db.query(models.Budget)
        .filter(models.Budget.year == year, models.Budget.month == month)
        .first()
    )
    if budget is not None:
        db.delete(budget)
        db.commit()
    return {"success": True, "message": "Budget deleted", "data": None}
