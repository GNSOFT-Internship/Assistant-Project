from datetime import datetime
from typing import Optional, List, Any

from pydantic import BaseModel


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
    purchasePrice: float
    usefulLife: int
    status: Optional[str] = "ACTIVE"
    description: Optional[str] = None


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


class QnAResponse(BaseModel):
    answer: str
    sourceData: List[Any] = []
    hasData: bool = False
