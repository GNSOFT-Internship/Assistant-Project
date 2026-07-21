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
    UniqueConstraint,
)
from sqlalchemy.sql import func

from .database import Base

# SQLite는 BIGINT 기본 키에 rowid 자동증가를 부여하지 않고 정확히
# "INTEGER PRIMARY KEY"일 때만 지원한다. MySQL(운영)에서는 그대로 BIGINT를
# 쓰고 SQLite(테스트)에서만 INTEGER를 쓰도록 해서 두 환경 모두에서
# autoincrement가 정상 동작하게 한다.
BigIntegerPK = BigInteger().with_variant(Integer, "sqlite")


class UserRole(str, enum.Enum):
    ADMIN = "ADMIN"
    USER = "USER"


class User(Base):
    # 기존 Java 엔티티(@Table(name="app_user"))와 동일한 테이블명을 사용한다.
    # docs/schema.sql 문서상의 `user` 테이블명과는 다르지만, 실제 런타임에서
    # 동작하던 스키마 기준으로 통일했다 (MySQL 예약어 충돌 회피 목적도 있음).
    __tablename__ = "app_user"

    id = Column(BigIntegerPK, primary_key=True, autoincrement=True)
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

    id = Column(BigIntegerPK, primary_key=True, autoincrement=True)
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

    id = Column(BigIntegerPK, primary_key=True, autoincrement=True)
    asset_id = Column(BigInteger, ForeignKey("asset.id", ondelete="CASCADE"), nullable=False, index=True)
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

    id = Column(BigIntegerPK, primary_key=True, autoincrement=True)
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


class AuditAction(str, enum.Enum):
    CREATE = "CREATE"
    UPDATE = "UPDATE"
    DELETE = "DELETE"


class AssetAuditLog(Base):
    __tablename__ = "asset_audit_log"

    # asset_id는 자산이 삭제된 뒤에도 이력이 남아야 하므로 FK를 걸지 않는다.
    id = Column(BigIntegerPK, primary_key=True, autoincrement=True)
    asset_id = Column(BigInteger, nullable=False, index=True)
    asset_code = Column(String(50), nullable=True)
    action = Column(Enum(AuditAction), nullable=False)
    changed_by = Column(String(50), nullable=True)
    changes = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class ChatRole(str, enum.Enum):
    USER = "USER"
    AI = "AI"


class ChatMessage(Base):
    """AI 어시스턴트 대화 기록. 계정별로 남겨서 탭을 이동하거나 새로고침해도
    다시 질문할 필요 없이 이전 대화를 이어볼 수 있게 한다."""
    __tablename__ = "chat_message"

    id = Column(BigIntegerPK, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(Enum(ChatRole), nullable=False)
    content = Column(Text, nullable=False)
    assets = Column(Text, nullable=True)  # AI 답변에 연관된 자산 목록(JSON), 없으면 null
    has_filter = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now(), index=True)


class Budget(Base):
    __tablename__ = "budget"
    __table_args__ = (UniqueConstraint("year", "month", name="uq_budget_year_month"),)

    id = Column(BigIntegerPK, primary_key=True, autoincrement=True)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    allocated_amount = Column(DECIMAL(15, 2), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class WorkOrder(Base):
    __tablename__ = "work_order"

    id = Column(BigIntegerPK, primary_key=True, autoincrement=True)
    maintenance_record_id = Column(BigInteger, ForeignKey("maintenance_record.id", ondelete="CASCADE"), nullable=False, unique=True)
    title = Column(String(255), nullable=False)
    steps = Column(Text, nullable=False)  # JSON array string
    required_tools = Column(Text, nullable=True)  # JSON array string
    safety_precautions = Column(Text, nullable=True)  # JSON array string
    estimated_time = Column(String(100), nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class AssetReplacementReason(Base):
    """교체 우선순위 추천 사유(AI 생성 텍스트) 캐시.

    metrics_hash가 마지막 생성 시점과 동일하면(=근거 수치가 안 바뀌었으면) AI를
    다시 호출하지 않고 저장된 reason을 재사용한다."""
    __tablename__ = "asset_replacement_reason"

    asset_id = Column(BigInteger, ForeignKey("asset.id", ondelete="CASCADE"), primary_key=True)
    metrics_hash = Column(String(64), nullable=False)
    reason = Column(Text, nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
