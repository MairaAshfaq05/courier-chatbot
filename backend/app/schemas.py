from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime
from app.models import ShipmentStatus, ComplaintType, ComplaintStatus, PickupStatus, IntentType


# ── Auth Schemas ──────────────────────────────────────
class UserCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    phone: Optional[str] = None
    password: str = Field(..., min_length=6)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    phone: Optional[str]
    is_agent: bool
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ── Chat Schemas ──────────────────────────────────────
class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    session_id: str = Field(..., min_length=8, max_length=64)
    language: Optional[str] = "auto"


class ChatResponse(BaseModel):
    reply: str
    intent: Optional[str] = None
    session_id: str
    language: str = "en"
    suggestions: Optional[List[str]] = None
    action_data: Optional[dict] = None


class MessageOut(BaseModel):
    id: int
    role: str
    content: str
    intent: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class ConversationOut(BaseModel):
    id: int
    session_id: str
    is_escalated: bool
    language: str
    created_at: datetime
    messages: List[MessageOut] = []

    class Config:
        from_attributes = True


# ── Shipment Schemas ──────────────────────────────────
class ShipmentOut(BaseModel):
    tracking_number: str
    status: ShipmentStatus
    origin: Optional[str]
    destination: Optional[str]
    current_location: Optional[str]
    estimated_delivery: Optional[datetime]
    sender_name: Optional[str]
    receiver_name: Optional[str]
    weight_kg: float
    notes: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# ── Complaint Schemas ─────────────────────────────────
class ComplaintCreate(BaseModel):
    tracking_number: str
    complaint_type: ComplaintType
    description: str = Field(..., min_length=10)


class ComplaintOut(BaseModel):
    case_id: str
    tracking_number: str
    complaint_type: ComplaintType
    description: str
    status: ComplaintStatus
    created_at: datetime

    class Config:
        from_attributes = True


# ── Pickup Schemas ────────────────────────────────────
class PickupCreate(BaseModel):
    address: str
    city: str
    time_slot: str
    pickup_date: datetime
    package_description: Optional[str] = None
    weight_kg: float = 1.0


class PickupOut(BaseModel):
    booking_id: str
    address: str
    city: str
    time_slot: str
    pickup_date: datetime
    status: PickupStatus
    package_description: Optional[str]
    weight_kg: float
    created_at: datetime

    class Config:
        from_attributes = True


# ── Feedback Schemas ──────────────────────────────────
class FeedbackCreate(BaseModel):
    conversation_id: Optional[int] = None
    message_id: Optional[int] = None
    rating: int = Field(..., ge=1, le=5)
    comment: Optional[str] = None


class FeedbackOut(BaseModel):
    id: int
    rating: int
    comment: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# ── Analytics Schemas ─────────────────────────────────
class IntentStat(BaseModel):
    intent: str
    count: int
    percentage: float


class DailyMessageStat(BaseModel):
    date: str
    total_messages: int
    bot_messages: int
    user_messages: int


class AnalyticsSummary(BaseModel):
    total_conversations: int
    total_messages: int
    total_complaints: int
    total_pickups: int
    avg_feedback_rating: float
    escalation_rate: float
    intent_breakdown: List[IntentStat]
    daily_messages: List[DailyMessageStat]
    complaint_type_breakdown: List[dict]
    language_breakdown: List[dict]


# ── Escalation ────────────────────────────────────────
class EscalationRequest(BaseModel):
    session_id: str
    reason: Optional[str] = "User requested human agent"


class EscalationOut(BaseModel):
    session_id: str
    escalated: bool
    agent_name: str
    estimated_wait: str
    ticket_number: str