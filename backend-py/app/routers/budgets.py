from fastapi import APIRouter, Depends
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
