import enum

from sqlalchemy import (
    Column,
    BigInteger,
    String,
    Text,
    Boolean,
    DECIMAL,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
)
from sqlalchemy.sql import func

from .database import Base


class UserRole(str, enum.Enum):
    ADMIN = "ADMIN"
    USER = "USER"


class User(Base):
    # 기존 Java 엔티티(@Table(name="app_user"))와 동일한 테이블명을 사용한다.
    # docs/schema.sql 문서상의 `user` 테이블명과는 다르지만, 실제 런타임에서
    # 동작하던 스키마 기준으로 통일했다 (MySQL 예약어 충돌 회피 목적도 있음).
    __tablename__ = "app_user"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False)
    password = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), nullable=False)
    email = Column(String(100), nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class AssetStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    REPLACEMENT_NEEDED = "REPLACEMENT_NEEDED"
    UNDER_MAINTENANCE = "UNDER_MAINTENANCE"


class Asset(Base):
    __tablename__ = "asset"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    asset_name = Column(String(200), nullable=False)
    asset_code = Column(String(50), unique=True, nullable=False)
    category = Column(String(100), nullable=False)
    location = Column(String(200), nullable=True)
    responsible_person = Column(String(100), nullable=True)
    purchase_date = Column(Date, nullable=False)
    purchase_price = Column(DECIMAL(15, 2), nullable=False)
    useful_life = Column(Integer, nullable=False)
    status = Column(Enum(AssetStatus), nullable=False, default=AssetStatus.ACTIVE)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class MaintenanceType(str, enum.Enum):
    ROUTINE = "ROUTINE"
    REPAIR = "REPAIR"
    REPLACEMENT = "REPLACEMENT"
    INSPECTION = "INSPECTION"


class MaintenanceRecord(Base):
    __tablename__ = "maintenance_record"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    asset_id = Column(BigInteger, ForeignKey("asset.id", ondelete="CASCADE"), nullable=False)
    maintenance_date = Column(Date, nullable=False)
    maintenance_type = Column(Enum(MaintenanceType), nullable=False)
    cost = Column(DECIMAL(15, 2), nullable=True)
    description = Column(Text, nullable=True)
    technician = Column(String(100), nullable=True)
    failure_type = Column(String(200), nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class FileType(str, enum.Enum):
    EXCEL = "EXCEL"
    CSV = "CSV"
    PDF = "PDF"


class UploadStatus(str, enum.Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class FileUpload(Base):
    __tablename__ = "file_upload"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    filename = Column(String(255), nullable=True)
    original_filename = Column(String(255), nullable=True)
    file_type = Column(Enum(FileType), nullable=True)
    file_path = Column(String(500), nullable=True)
    status = Column(Enum(UploadStatus), default=UploadStatus.PENDING)
    extracted_data = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    applied = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
