from datetime import date, datetime
from typing import Optional, List, Any

from pydantic import BaseModel, Field, field_validator


def _validate_not_future_iso_date(value: str) -> str:
    try:
        parsed = date.fromisoformat(value)
    except (TypeError, ValueError):
        raise ValueError("올바른 날짜 형식(YYYY-MM-DD)이 아닙니다.")
    if parsed > date.today():
        raise ValueError("미래 날짜는 입력할 수 없습니다.")
    return value


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    username: str
    role: str


class AssetRequest(BaseModel):
    assetName: str
    assetCode: str
    category: str
    location: Optional[str] = None
    responsiblePerson: Optional[str] = None
    purchaseDate: str
    purchasePrice: float = Field(gt=0)
    usefulLife: int = Field(gt=0)
    status: Optional[str] = "ACTIVE"
    description: Optional[str] = None

    _validate_purchase_date = field_validator("purchaseDate")(_validate_not_future_iso_date)


class AssetDTO(BaseModel):
    id: int
    assetName: str
    assetCode: str
    category: str
    location: Optional[str] = None
    responsiblePerson: Optional[str] = None
    purchaseDate: Optional[str] = None
    purchasePrice: float
    usefulLife: int
    status: str
    description: Optional[str] = None
    createdAt: Optional[datetime] = None
    updatedAt: Optional[datetime] = None


class MaintenanceRecordRequest(BaseModel):
    maintenanceDate: str
    maintenanceType: str
    cost: Optional[float] = Field(default=None, ge=0)
    description: Optional[str] = None
    technician: Optional[str] = None
    failureType: Optional[str] = None

    _validate_maintenance_date = field_validator("maintenanceDate")(_validate_not_future_iso_date)


class DashboardData(BaseModel):
    currentMonthMaintenanceCost: float
    newFailureCount: int
    operationRate: float
    budgetConsumptionRate: float
    totalAssets: int
    activeAssets: int
    replacementNeededAssets: int
    isSimulated: bool


class FileUploadResponse(BaseModel):
    id: int
    filename: Optional[str] = None
    originalFilename: Optional[str] = None
    fileType: Optional[str] = None
    status: Optional[str] = None
    applied: Optional[bool] = None


class QnARequest(BaseModel):
    question: str


class BudgetRequest(BaseModel):
    allocatedAmount: float


class QnAResponse(BaseModel):
    answer: str
    sourceData: List[Any] = []
    hasData: bool = False
