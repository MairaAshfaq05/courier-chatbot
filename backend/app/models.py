from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, Text, ForeignKey, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class ShipmentStatus(str, enum.Enum):
    PENDING          = "PENDING"
    PICKED_UP        = "PICKED_UP"
    IN_TRANSIT       = "IN_TRANSIT"
    OUT_FOR_DELIVERY = "OUT_FOR_DELIVERY"
    DELIVERED        = "DELIVERED"
    FAILED           = "FAILED"
    RETURNED         = "RETURNED"


class ComplaintStatus(str, enum.Enum):
    OPEN          = "OPEN"
    INVESTIGATING = "INVESTIGATING"
    RESOLVED      = "RESOLVED"
    CLOSED        = "CLOSED"


class ComplaintType(str, enum.Enum):
    DELAY      = "DELAY"
    DAMAGE     = "DAMAGE"
    MISSING    = "MISSING"
    WRONG_ITEM = "WRONG_ITEM"
    OTHER      = "OTHER"


class PickupStatus(str, enum.Enum):
    SCHEDULED = "SCHEDULED"
    CONFIRMED = "CONFIRMED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class IntentType(str, enum.Enum):
    TRACK           = "TRACK"
    COMPLAIN        = "COMPLAIN"
    SCHEDULE_PICKUP = "SCHEDULE_PICKUP"
    MODIFY_PICKUP   = "MODIFY_PICKUP"
    CANCEL_PICKUP   = "CANCEL_PICKUP"
    ESCALATE        = "ESCALATE"
    FAQ             = "FAQ"
    GREETING        = "GREETING"
    UNKNOWN         = "UNKNOWN"


# ── User ──────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"
    id              = Column(Integer, primary_key=True, index=True)
    name            = Column(String(100), nullable=False)
    email           = Column(String(255), unique=True, index=True, nullable=False)
    phone           = Column(String(20), nullable=True)
    hashed_password = Column(String(255), nullable=False)
    is_active       = Column(Boolean, default=True)
    is_agent        = Column(Boolean, default=False)
    is_online       = Column(Boolean, default=False)
    last_seen       = Column(DateTime(timezone=True), nullable=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    conversations = relationship("Conversation", back_populates="user",      foreign_keys="Conversation.user_id")
    complaints    = relationship("Complaint",    back_populates="user",      foreign_keys="Complaint.user_id")
    pickups       = relationship("Pickup",       back_populates="user")
    feedbacks     = relationship("Feedback",     back_populates="user")


# ── Shipment ───────────────────────────────────────────
class Shipment(Base):
    __tablename__ = "shipments"
    id                = Column(Integer, primary_key=True, index=True)
    tracking_number   = Column(String(20), unique=True, index=True, nullable=False)
    sender_name       = Column(String(100))
    receiver_name     = Column(String(100))
    origin            = Column(String(200))
    destination       = Column(String(200))
    status            = Column(Enum(ShipmentStatus), default=ShipmentStatus.PENDING)
    weight_kg         = Column(Float, default=1.0)
    estimated_delivery = Column(DateTime(timezone=True), nullable=True)
    actual_delivery   = Column(DateTime(timezone=True), nullable=True)
    current_location  = Column(String(200), nullable=True)
    notes             = Column(Text, nullable=True)
    created_at        = Column(DateTime(timezone=True), server_default=func.now())
    updated_at        = Column(DateTime(timezone=True), onupdate=func.now())

    complaints = relationship("Complaint", back_populates="shipment")


# ── Complaint ──────────────────────────────────────────
class Complaint(Base):
    __tablename__ = "complaints"
    id               = Column(Integer, primary_key=True, index=True)
    case_id          = Column(String(20), unique=True, index=True, nullable=False)
    user_id          = Column(Integer, ForeignKey("users.id"), nullable=True)
    shipment_id      = Column(Integer, ForeignKey("shipments.id"), nullable=True)
    tracking_number  = Column(String(20), nullable=False)
    complaint_type   = Column(Enum(ComplaintType), default=ComplaintType.OTHER)
    description      = Column(Text, nullable=False)
    status           = Column(Enum(ComplaintStatus), default=ComplaintStatus.OPEN)
    assigned_agent_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    resolution_notes = Column(Text, nullable=True)
    created_at       = Column(DateTime(timezone=True), server_default=func.now())
    updated_at       = Column(DateTime(timezone=True), onupdate=func.now())

    user     = relationship("User",     back_populates="complaints", foreign_keys=[user_id])
    shipment = relationship("Shipment", back_populates="complaints")


# ── Pickup ─────────────────────────────────────────────
class Pickup(Base):
    __tablename__ = "pickups"
    id                  = Column(Integer, primary_key=True, index=True)
    booking_id          = Column(String(20), unique=True, index=True, nullable=False)
    user_id             = Column(Integer, ForeignKey("users.id"), nullable=True)
    address             = Column(Text, nullable=False)
    city                = Column(String(100), nullable=False)
    time_slot           = Column(String(50), nullable=False)
    pickup_date         = Column(DateTime(timezone=True), nullable=False)
    status              = Column(Enum(PickupStatus), default=PickupStatus.SCHEDULED)
    package_description = Column(Text, nullable=True)
    weight_kg           = Column(Float, default=1.0)
    created_at          = Column(DateTime(timezone=True), server_default=func.now())
    updated_at          = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", back_populates="pickups")


# ── Conversation (added memory columns) ─────────────────
class Conversation(Base):
    __tablename__ = "conversations"
    id           = Column(Integer, primary_key=True, index=True)
    session_id   = Column(String(64), unique=True, index=True, nullable=False)
    user_id      = Column(Integer, ForeignKey("users.id"), nullable=True)
    is_escalated = Column(Boolean, default=False)
    escalated_at = Column(DateTime(timezone=True), nullable=True)
    agent_id     = Column(Integer, ForeignKey("users.id"), nullable=True)
    language     = Column(String(10), default="en")

    # ── New memory columns ────────────────────────────────
    last_tracking_number = Column(String(20), nullable=True)
    last_booking_id      = Column(String(20), nullable=True)
    last_case_id         = Column(String(20), nullable=True)

    created_at   = Column(DateTime(timezone=True), server_default=func.now())
    updated_at   = Column(DateTime(timezone=True), onupdate=func.now())

    user     = relationship("User",    back_populates="conversations", foreign_keys=[user_id])
    messages = relationship("Message", back_populates="conversation",  cascade="all, delete-orphan")
    feedbacks = relationship("Feedback", back_populates="conversation")
    escalation_requests = relationship("EscalationRequest", back_populates="conversation", cascade="all, delete-orphan")

class Message(Base):
    __tablename__ = "messages"
    id              = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=False)
    role            = Column(String(10), nullable=False)
    content         = Column(Text, nullable=False)
    intent          = Column(Enum(IntentType), nullable=True)
    confidence      = Column(Float, nullable=True)
    language        = Column(String(10), default="en")
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    conversation = relationship("Conversation", back_populates="messages")


# ── Feedback ───────────────────────────────────────────
class Feedback(Base):
    __tablename__ = "feedbacks"
    id              = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=True)
    message_id      = Column(Integer, ForeignKey("messages.id"), nullable=True)
    user_id         = Column(Integer, ForeignKey("users.id"), nullable=True)
    tracking_number = Column(String(20), nullable=True)
    rating          = Column(Integer, nullable=False)
    delivery_speed  = Column(Integer, nullable=True)
    packaging       = Column(Integer, nullable=True)
    rider_behaviour = Column(Integer, nullable=True)
    accuracy        = Column(Integer, nullable=True)
    comment         = Column(Text, nullable=True)
    source          = Column(String(20), default="chat")
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    conversation = relationship("Conversation", back_populates="feedbacks")
    user         = relationship("User",         back_populates="feedbacks")


# ── Refund Request ─────────────────────────────────────
class RefundRequest(Base):
    __tablename__ = "refund_requests"
    id              = Column(Integer, primary_key=True, index=True)
    tracking_number = Column(String(20), nullable=False, index=True)
    user_id         = Column(Integer, ForeignKey("users.id"), nullable=True)
    reason          = Column(Text, nullable=False)
    refund_type     = Column(String(20), default="full")
    status          = Column(String(20), default="pending")
    amount          = Column(Float, nullable=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

class EscalationRequest(Base):
    __tablename__ = "escalation_requests"
    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    status = Column(String(20), default="pending")  # pending, accepted, closed
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    accepted_at = Column(DateTime(timezone=True), nullable=True)
    conversation = relationship("Conversation", back_populates="escalation_requests")