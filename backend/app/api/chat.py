from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
import json, asyncio, random, string
from datetime import datetime

from app.database import get_db
from app.schemas import (
    ChatRequest, ChatResponse, EscalationRequest as EscalationRequestSchema,
    EscalationOut, FeedbackCreate
)
from app.services.chat_service import chat, get_agents_status, find_available_agent
from app.services.auth_service import get_current_user, get_user_by_email, require_agent
from app.models import (
    Conversation, Message, Shipment, Complaint, Feedback, RefundRequest, User,
    EscalationRequest as EscalationRequestModel   # SQLAlchemy model with alias
)

router = APIRouter(prefix="/chat", tags=["Chat"])


# ── Helper to extract user from token in streaming endpoint ─────────────────
async def _get_current_user_from_request(request: Request, db: AsyncSession) -> Optional[User]:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    token = auth_header.split(" ")[1]
    from jose import jwt
    from app.core.config import settings
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email = payload.get("sub")
        if email:
            user = await get_user_by_email(email, db)
            return user
    except:
        pass
    return None


# ── Send message ───────────────────────────────────────────────────────────────
@router.post("/", response_model=ChatResponse)
async def send_message(
    req: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    user_id = current_user.id if current_user else None
    result = await chat(req.session_id, req.message, db, user_id=user_id)
    return ChatResponse(**result)


# ── SSE streaming ──────────────────────────────────────────────────────────────
@router.get("/stream")
async def stream_message(
    request: Request,
    session_id: str,
    message: str,
    db: AsyncSession = Depends(get_db),
):
    """Stream bot response token by token via Server-Sent Events."""
    user = await _get_current_user_from_request(request, db)
    user_id = user.id if user else None

    result = await chat(session_id, message, db, user_id=user_id)
    reply = result["reply"]

    async def event_generator():
        words = reply.split(" ")
        for i, word in enumerate(words):
            chunk = word + (" " if i < len(words) - 1 else "")
            yield f"data: {json.dumps({'token': chunk, 'done': False})}\n\n"
            await asyncio.sleep(0.035)
        yield f"data: {json.dumps({'done': True, 'intent': result.get('intent'), 'suggestions': result.get('suggestions', []), 'action_data': result.get('action_data'), 'language': result.get('language', 'en'), 'message_id': result.get('message_id')})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ── History ────────────────────────────────────────────────────────────────────
@router.get("/history/{session_id}")
async def get_history(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    result = await db.execute(select(Conversation).where(Conversation.session_id == session_id))
    conv = result.scalar_one_or_none()
    if not conv:
        return {"session_id": session_id, "messages": [], "is_escalated": False, "language": "en"}
    if current_user and conv.user_id is not None and conv.user_id != current_user.id:
        return {"session_id": session_id, "messages": [], "is_escalated": False, "language": "en"}

    msgs = await db.execute(
        select(Message).where(Message.conversation_id == conv.id).order_by(Message.created_at)
    )
    return {
        "session_id":   session_id,
        "is_escalated": conv.is_escalated,
        "language":     conv.language,
        "messages": [
            {
                "id":         m.id,
                "role":       m.role,
                "content":    m.content,
                "intent":     m.intent.value if m.intent else None,
                "created_at": m.created_at.isoformat(),
            }
            for m in msgs.scalars().all()
        ],
    }


# ── Delete conversation ────────────────────────────────────────────────────────
@router.delete("/history/{session_id}")
async def delete_history(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    result = await db.execute(select(Conversation).where(Conversation.session_id == session_id))
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if current_user:
        if conv.user_id is not None and conv.user_id != current_user.id and not current_user.is_agent:
            raise HTTPException(status_code=403, detail="Not authorized")
    else:
        if conv.user_id is not None:
            raise HTTPException(status_code=403, detail="Not authorized")
    await db.delete(conv)
    await db.commit()
    return {"message": "Conversation deleted successfully", "session_id": session_id}


# ── Escalation endpoints ──────────────────────────────────────────────────────
@router.post("/escalate", response_model=EscalationOut)
async def escalate(
    req: EscalationRequestSchema,   # <-- Pydantic schema
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """User requests escalation to human agent. Creates a pending request."""
    result = await db.execute(select(Conversation).where(Conversation.session_id == req.session_id))
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    if conv.is_escalated:
        agent = await db.execute(select(User).where(User.id == conv.agent_id))
        agent_obj = agent.scalar_one_or_none()
        return EscalationOut(
            session_id=req.session_id,
            escalated=True,
            agent_name=agent_obj.name if agent_obj else "Agent",
            estimated_wait="Already connected",
            ticket_number="N/A"
        )
    
    # Check for existing pending escalation
    existing = await db.execute(
        select(EscalationRequestModel).where(
            and_(EscalationRequestModel.conversation_id == conv.id, EscalationRequestModel.status == "pending")
        )
    )
    if existing.scalar_one_or_none():
        return EscalationOut(
            session_id=req.session_id,
            escalated=False,
            agent_name="",
            estimated_wait="Pending...",
            ticket_number=""
        )
    
    # Create new escalation request
    ticket = "TKT" + "".join(random.choices(string.digits, k=8))
    esc_req = EscalationRequestModel(
        conversation_id=conv.id,
        user_id=current_user.id if current_user else None,
        status="pending"
    )
    db.add(esc_req)
    await db.commit()
    
    return EscalationOut(
        session_id=req.session_id,
        escalated=False,
        agent_name="Waiting for agent",
        estimated_wait="Pending",
        ticket_number=ticket
    )


@router.get("/escalation/status/{session_id}")
async def escalation_status(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Check if an escalation request has been accepted."""
    result = await db.execute(select(Conversation).where(Conversation.session_id == session_id))
    conv = result.scalar_one_or_none()
    if not conv:
        return {"escalated": False, "agent_name": None}
    
    if conv.is_escalated and conv.agent_id:
        agent = await db.execute(select(User).where(User.id == conv.agent_id))
        agent_obj = agent.scalar_one_or_none()
        return {"escalated": True, "agent_name": agent_obj.name if agent_obj else "Agent"}
    
    esc_req = await db.execute(
        select(EscalationRequestModel).where(
            and_(EscalationRequestModel.conversation_id == conv.id, EscalationRequestModel.status == "accepted")
        )
    )
    accepted = esc_req.scalar_one_or_none()
    if accepted:
        return {"escalated": True, "agent_name": "Agent"}
    
    return {"escalated": False, "agent_name": None}


@router.get("/escalation/pending")
async def pending_escalations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_agent),  # only agents
):
    """Agent endpoint: list all pending escalation requests with conversation details."""
    result = await db.execute(
        select(EscalationRequestModel, Conversation, User)
        .join(Conversation, EscalationRequestModel.conversation_id == Conversation.id)
        .outerjoin(User, Conversation.user_id == User.id)
        .where(EscalationRequestModel.status == "pending")
        .order_by(EscalationRequestModel.created_at)
    )
    rows = result.all()
    pending = []
    for esc, conv, user in rows:
        msg_result = await db.execute(
            select(Message).where(Message.conversation_id == conv.id).order_by(Message.created_at.desc()).limit(5)
        )
        last_messages = [{"role": m.role, "content": m.content, "created_at": m.created_at.isoformat()} for m in msg_result.scalars().all()]
        pending.append({
            "id": esc.id,
            "session_id": conv.session_id,
            "user_name": user.name if user else "Anonymous",
            "user_email": user.email if user else None,
            "created_at": esc.created_at.isoformat(),
            "last_tracking_number": conv.last_tracking_number,
            "last_messages": last_messages[::-1],
        })
    return {"pending": pending}


@router.post("/escalation/accept/{escalation_id}")
async def accept_escalation(
    escalation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    """Agent accepts an escalation. Marks conversation as escalated and adds system message."""
    result = await db.execute(
        select(EscalationRequestModel).where(EscalationRequestModel.id == escalation_id)
    )
    esc = result.scalar_one_or_none()
    if not esc:
        raise HTTPException(status_code=404, detail="Escalation request not found")
    if esc.status != "pending":
        raise HTTPException(status_code=400, detail="Already processed")
    
    esc.status = "accepted"
    esc.accepted_at = datetime.now()
    
    conv_result = await db.execute(select(Conversation).where(Conversation.id == esc.conversation_id))
    conv = conv_result.scalar_one()
    conv.is_escalated = True
    conv.agent_id = current_user.id
    conv.escalated_at = datetime.now()
    
    agent_msg = Message(
        conversation_id=conv.id,
        role="agent",
        content=f"🧑‍💼 **Agent {current_user.name} has joined the chat.**\n\nHello! I'm {current_user.name}. I can see your conversation history. How can I help you today?",
        language=conv.language,
    )
    db.add(agent_msg)
    
    await db.commit()
    
    return {"success": True, "session_id": conv.session_id, "agent_name": current_user.name}


# ── Agent status and heartbeat ────────────────────────────────────────────────
@router.get("/agents/status")
async def agents_status(db: AsyncSession = Depends(get_db)):
    agents = await get_agents_status(db)
    any_online = any(a["is_online"] for a in agents)
    return {
        "agents":     agents,
        "any_online": any_online,
        "total":      len(agents),
        "online":     sum(1 for a in agents if a["is_online"]),
    }


@router.post("/agents/heartbeat")
async def agent_heartbeat(agent_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).where(and_(User.id == agent_id, User.is_agent == True))
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    agent.is_online = True
    agent.last_seen = datetime.now()
    await db.commit()
    return {"status": "ok", "agent": agent.name, "last_seen": agent.last_seen.isoformat()}


@router.post("/agents/offline")
async def agent_offline(agent_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).where(and_(User.id == agent_id, User.is_agent == True))
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    agent.is_online = False
    agent.last_seen = datetime.now()
    await db.commit()
    return {"status": "offline"}


# ── QR Scan endpoints (unchanged) ─────────────────────────────────────────────
@router.get("/qr/shipment/{tracking_number}")
async def qr_shipment_details(tracking_number: str, db: AsyncSession = Depends(get_db)):
    """QR scanner calls this to get full shipment details for verification."""
    result = await db.execute(
        select(Shipment).where(Shipment.tracking_number == tracking_number.upper())
    )
    shipment = result.scalar_one_or_none()
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
    comp_result = await db.execute(
        select(Complaint)
        .where(Complaint.tracking_number == tracking_number.upper())
        .order_by(Complaint.created_at.desc())
        .limit(3)
    )
    complaints = comp_result.scalars().all()
    return {
        "tracking_number":    shipment.tracking_number,
        "status":             shipment.status.value,
        "origin":             shipment.origin,
        "destination":        shipment.destination,
        "current_location":   shipment.current_location,
        "estimated_delivery": shipment.estimated_delivery.isoformat() if shipment.estimated_delivery else None,
        "actual_delivery":    shipment.actual_delivery.isoformat() if shipment.actual_delivery else None,
        "sender_name":        shipment.sender_name,
        "receiver_name":      shipment.receiver_name,
        "weight_kg":          shipment.weight_kg,
        "notes":              shipment.notes,
        "created_at":         shipment.created_at.isoformat() if shipment.created_at else None,
        "complaints": [
            {
                "case_id":        c.case_id,
                "complaint_type": c.complaint_type.value if c.complaint_type else None,
                "status":         c.status.value if c.status else None,
            }
            for c in complaints
        ],
    }


@router.post("/qr/feedback")
async def qr_feedback(
    tracking_number:  str,
    rating:           int,
    delivery_speed:   int  = None,
    packaging:        int  = None,
    rider_behaviour:  int  = None,
    accuracy:         int  = None,
    comment:          str  = None,
    db: AsyncSession = Depends(get_db),
):
    if not 1 <= rating <= 5:
        raise HTTPException(status_code=400, detail="Rating must be 1–5")
    fb = Feedback(
        tracking_number = tracking_number.upper(),
        rating          = rating,
        delivery_speed  = delivery_speed,
        packaging       = packaging,
        rider_behaviour = rider_behaviour,
        accuracy        = accuracy,
        comment         = comment,
        source          = "qr",
    )
    db.add(fb)
    await db.commit()
    await db.refresh(fb)
    return {
        "success": True,
        "feedback_id": fb.id,
        "message": "Thank you for your feedback! It helps us improve our service.",
    }


@router.post("/qr/refund")
async def qr_refund(
    tracking_number: str,
    reason:          str,
    refund_type:     str = "full",
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Shipment).where(Shipment.tracking_number == tracking_number.upper())
    )
    shipment = result.scalar_one_or_none()
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
    refund = RefundRequest(
        tracking_number = tracking_number.upper(),
        reason          = reason,
        refund_type     = refund_type,
        status          = "pending",
    )
    db.add(refund)
    await db.commit()
    await db.refresh(refund)
    return {
        "success":    True,
        "refund_id":  refund.id,
        "status":     "pending",
        "message":    f"Your {refund_type} request has been submitted. Our team will review within 2–3 business days.",
    }

