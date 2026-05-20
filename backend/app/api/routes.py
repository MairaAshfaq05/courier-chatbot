from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.schemas import (
    UserCreate, UserLogin, Token, UserOut,
    ShipmentOut, ComplaintCreate, ComplaintOut,
    PickupCreate, PickupOut, FeedbackCreate, FeedbackOut,
)
from app.services.auth_service import (
    hash_password, authenticate_user, create_access_token,
    require_user,
)
from app.models import User, Shipment, Complaint, Pickup, Feedback, PickupStatus, RefundRequest
from typing import List
import random, string


# ── Auth ──────────────────────────────────────────────────────────────────────
auth_router = APIRouter(prefix="/auth", tags=["Auth"])


@auth_router.post("/register", response_model=Token)
async def register(data: UserCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        name            = data.name,
        email           = data.email,
        phone           = data.phone,
        hashed_password = hash_password(data.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    token = create_access_token({"sub": user.email})
    return Token(access_token=token, user=UserOut.model_validate(user))


@auth_router.post("/login", response_model=Token)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    user = await authenticate_user(data.email, data.password, db)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token({"sub": user.email})
    return Token(access_token=token, user=UserOut.model_validate(user))


@auth_router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(require_user)):
    return current_user


# ── Shipments ─────────────────────────────────────────────────────────────────
shipment_router = APIRouter(prefix="/shipments", tags=["Shipments"])


@shipment_router.get("/{tracking_number}", response_model=ShipmentOut)
async def get_shipment(tracking_number: str, db: AsyncSession = Depends(get_db)):
    result   = await db.execute(
        select(Shipment).where(Shipment.tracking_number == tracking_number.upper())
    )
    shipment = result.scalar_one_or_none()
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
    return shipment


# ── Complaints ────────────────────────────────────────────────────────────────
complaint_router = APIRouter(prefix="/complaints", tags=["Complaints"])


@complaint_router.post("/", response_model=ComplaintOut)
async def create_complaint(data: ComplaintCreate, db: AsyncSession = Depends(get_db)):
    case_id   = "CMP" + "".join(random.choices(string.digits, k=8))
    complaint = Complaint(
        case_id         = case_id,
        tracking_number = data.tracking_number.upper(),
        complaint_type  = data.complaint_type,
        description     = data.description,
    )
    db.add(complaint)
    await db.commit()
    await db.refresh(complaint)
    return complaint


@complaint_router.get("/case/{case_id}", response_model=ComplaintOut)
async def get_complaint(case_id: str, db: AsyncSession = Depends(get_db)):
    result    = await db.execute(select(Complaint).where(Complaint.case_id == case_id.upper()))
    complaint = result.scalar_one_or_none()
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")
    return complaint


@complaint_router.get("/", response_model=List[ComplaintOut])
async def list_complaints(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Complaint).order_by(Complaint.created_at.desc()).limit(50))
    return result.scalars().all()


# ── Pickups ───────────────────────────────────────────────────────────────────
pickup_router = APIRouter(prefix="/pickups", tags=["Pickups"])


@pickup_router.post("/", response_model=PickupOut)
async def create_pickup(data: PickupCreate, db: AsyncSession = Depends(get_db)):
    booking_id = "BK" + "".join(random.choices(string.digits, k=8))
    pickup     = Pickup(
        booking_id          = booking_id,
        address             = data.address,
        city                = data.city,
        time_slot           = data.time_slot,
        pickup_date         = data.pickup_date,
        package_description = data.package_description,
        weight_kg           = data.weight_kg,
    )
    db.add(pickup)
    await db.commit()
    await db.refresh(pickup)
    return pickup


@pickup_router.get("/{booking_id}", response_model=PickupOut)
async def get_pickup(booking_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Pickup).where(Pickup.booking_id == booking_id.upper()))
    pickup = result.scalar_one_or_none()
    if not pickup:
        raise HTTPException(status_code=404, detail="Pickup not found")
    return pickup


@pickup_router.delete("/{booking_id}")
async def cancel_pickup(booking_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Pickup).where(Pickup.booking_id == booking_id.upper()))
    pickup = result.scalar_one_or_none()
    if not pickup:
        raise HTTPException(status_code=404, detail="Pickup not found")
    pickup.status = PickupStatus.CANCELLED
    await db.commit()
    return {"message": f"Pickup {booking_id} cancelled"}


# ── Feedback ──────────────────────────────────────────────────────────────────
feedback_router = APIRouter(prefix="/feedback", tags=["Feedback"])


@feedback_router.post("/", response_model=FeedbackOut)
async def submit_feedback(data: FeedbackCreate, db: AsyncSession = Depends(get_db)):
    fb = Feedback(
        conversation_id = data.conversation_id,
        message_id      = data.message_id,
        rating          = data.rating,
        comment         = data.comment,
        source          = "chat",
    )
    db.add(fb)
    await db.commit()
    await db.refresh(fb)
    return fb


# ── Refunds ───────────────────────────────────────────────────────────────────
refund_router = APIRouter(prefix="/refunds", tags=["Refunds"])


@refund_router.get("/{tracking_number}")
async def get_refund_status(tracking_number: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(RefundRequest)
        .where(RefundRequest.tracking_number == tracking_number.upper())
        .order_by(RefundRequest.created_at.desc())
        .limit(1)
    )
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="No refund request found")
    return {
        "id":              req.id,
        "tracking_number": req.tracking_number,
        "reason":          req.reason,
        "refund_type":     req.refund_type,
        "status":          req.status,
        "created_at":      req.created_at.isoformat() if req.created_at else None,
    }