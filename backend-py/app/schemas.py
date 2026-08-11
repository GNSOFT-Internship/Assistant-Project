from datetime import date, datetime
from typing import Optional, List, Any

from pydantic import BaseModel, Field, field_validator


def _strip_category_value(value: str) -> str:
    # category는 자유 문자열이라 엑셀 업로드 등에서 앞뒤 공백이 섞여 들어오기 쉽다.
    # "NAS"와 "NAS "가 DB상 다른 값으로 취급되면 카테고리별 필터/그룹핑은 물론
    # category_importance 캐시(카테고리명을 키로 씀)까지 쓸데없이 갈라지므로 여기서 통일한다.
    stripped = value.strip()
    if not stripped:
        raise ValueError("카테고리를 입력해주세요.")
    return stripped


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
    category: str
    location: Optional[str] = None
    responsiblePerson: Optional[str] = None
    purchaseDate: str
    purchasePrice: float = Field(gt=0)
    usefulLife: int = Field(gt=0)
    status: Optional[str] = "ACTIVE"
    description: Optional[str] = None

    _validate_purchase_date = field_validator("purchaseDate")(_validate_not_future_iso_date)
    _strip_category = field_validator("category")(_strip_category_value)


class AssetDTO(BaseModel):
    id: int
    assetName: str
    assetCode: int
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


class CategoryImportanceUpdateRequest(BaseModel):
    category: str
    score: float = Field(ge=0, le=100)
    reason: Optional[str] = None

    _strip_category = field_validator("category")(_strip_category_value)


class CategoryImportanceAiRecomputeRequest(BaseModel):
    category: str

    _strip_category = field_validator("category")(_strip_category_value)


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
    topReplacementNeeded: list[dict] = Field(default_factory=list)
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
    allocatedAmount: float = Field(ge=0)


class QnAResponse(BaseModel):
    answer: str
    sourceData: List[Any] = []
    hasData: bool = False


class WorkOrderResponse(BaseModel):
    id: int
    maintenanceRecordId: int
    title: str
    steps: List[str]
    requiredTools: Optional[List[str]] = None
    safetyPrecautions: Optional[List[str]] = None
    estimatedTime: Optional[str] = None
    createdAt: Optional[datetime] = None


class BudgetSimulationRequest(BaseModel):
    totalBudget: float = Field(gt=0)


class CategoryAllocation(BaseModel):
    category: str
    allocatedAmount: float
    ratio: float
    reason: str


class BudgetSimulationResponse(BaseModel):
    allocations: List[CategoryAllocation]
    totalAllocated: float
    summary: str


class BudgetForecastItem(BaseModel):
    month: int
    amount: float
    reason: str


class BudgetForecastResponse(BaseModel):
    forecastYear: int
    monthlyForecast: List[BudgetForecastItem]
    rationale: str


class ProcurementSpecResponse(BaseModel):
    title: str
    specifications: str  # 기술 규격 사양서 마크다운
    rfp: str             # 제안요청서(RFP) 마크다운
    budgetEstimate: float
    rationale: str


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class DiagnosticsRequest(BaseModel):
    assetId: int
    chatHistory: List[ChatMessage]
