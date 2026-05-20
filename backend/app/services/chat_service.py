# app/services/chat_service.py
"""
Chat Service — Orchestrates NLP pipeline, DB writes, action routing.
Manages per‑session ambiguity state so 1/2/3 selections work correctly.
Now supports per‑user chat isolation via user_id.
"""
import random
import string
import re
import logging
from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from app.models import (
    Conversation, Message, Shipment, Complaint, Pickup, User,
    ShipmentStatus, ComplaintStatus, ComplaintType, PickupStatus, IntentType,
)
from app.services.nlp_service import process_message

logger = logging.getLogger(__name__)

# In-memory store for pending ambiguity per session (lightweight, resets on restart)
_pending_ambiguity: dict = {}


def _gen_id(prefix: str, length: int = 8) -> str:
    return prefix + "".join(random.choices(string.digits, k=length))


def _extract_tracking_number_from_text(text: str) -> Optional[str]:
    match = re.search(r'\b([A-Z]{2,3}\d{8,12}|\d{10,14})\b', text.upper())
    return match.group(1) if match else None


def _extract_booking_id_from_text(text: str) -> Optional[str]:
    match = re.search(r'\b(BK\d{5,10})\b', text.upper())
    return match.group(1) if match else None


def _extract_time_slot_from_text(text: str) -> Optional[str]:
    lower = text.lower()
    if any(w in lower for w in ["morning", "subah", "صبح", "9", "9am"]):
        return "Morning (9 AM – 12 PM)"
    elif any(w in lower for w in ["afternoon", "dopahar", "دوپہر", "12", "12pm"]):
        return "Afternoon (12 PM – 5 PM)"
    elif any(w in lower for w in ["evening", "shaam", "شام", "5", "5pm", "6", "6pm"]):
        return "Evening (5 PM – 8 PM)"
    return None


# ── Conversation helpers ───────────────────────────────────────────────────────
async def get_or_create_conversation(
    session_id: str,
    db: AsyncSession,
    language: str = "en",
    user_id: Optional[int] = None,
) -> Conversation:
    """Get or create a conversation, linking it to the given user_id if provided."""
    result = await db.execute(select(Conversation).where(Conversation.session_id == session_id))
    conv = result.scalar_one_or_none()
    if not conv:
        conv = Conversation(
            session_id=session_id,
            language=language,
            user_id=user_id,          # <-- link conversation to user
        )
        db.add(conv)
        await db.commit()
        await db.refresh(conv)
    else:
        # If conversation exists but user_id is not set, update it
        if conv.user_id is None and user_id is not None:
            conv.user_id = user_id
            await db.commit()
    return conv


async def _load_history(conversation_id: int, db: AsyncSession, limit: int = 10) -> list:
    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    msgs = result.scalars().all()
    history = []
    for m in reversed(msgs):
        role = "user" if m.role == "user" else "assistant"
        history.append({"role": role, "content": m.content})
    return history


# ── Real agent lookup ─────────────────────────────────────────────────────────
async def find_available_agent(db: AsyncSession) -> Optional[User]:
    # Prefer online agents
    result = await db.execute(
        select(User)
        .where(and_(User.is_agent == True, User.is_active == True, User.is_online == True))
        .order_by(User.last_seen.desc())
        .limit(1)
    )
    agent = result.scalar_one_or_none()
    if agent:
        return agent
    # Fall back to any active agent
    result = await db.execute(
        select(User)
        .where(and_(User.is_agent == True, User.is_active == True))
        .order_by(User.id)
        .limit(1)
    )
    return result.scalar_one_or_none()


async def get_agents_status(db: AsyncSession) -> list:
    result = await db.execute(
        select(User).where(and_(User.is_agent == True, User.is_active == True))
    )
    agents = result.scalars().all()
    return [
        {
            "id":        a.id,
            "name":      a.name,
            "email":     a.email,
            "is_online": a.is_online,
            "last_seen": a.last_seen.isoformat() if a.last_seen else None,
        }
        for a in agents
    ]


# ── Action handlers ───────────────────────────────────────────────────────────
async def handle_track(tracking_number: str, db: AsyncSession, conversation: Optional[Conversation] = None) -> str:
    if not tracking_number and conversation and conversation.last_tracking_number:
        tracking_number = conversation.last_tracking_number
        reuse_note = f"\n🔁 I see you previously asked about `{tracking_number}` – here's the latest status:\n\n"
    else:
        reuse_note = ""

    result = await db.execute(
        select(Shipment).where(Shipment.tracking_number == tracking_number.upper())
    )
    shipment = result.scalar_one_or_none()

    if not shipment:
        return (
            f"❌ No shipment found for **`{tracking_number}`**.\n\n"
            "Possible reasons:\n"
            "• New bookings take 2–4 hours to appear\n"
            "• There may be a typo\n"
            "• The sender may have entered it incorrectly\n\n"
            "Tracking numbers look like `PK2024001234`. Please double‑check."
        )

    emoji = {
        ShipmentStatus.PENDING:          "🕐",
        ShipmentStatus.PICKED_UP:        "📦",
        ShipmentStatus.IN_TRANSIT:       "🚚",
        ShipmentStatus.OUT_FOR_DELIVERY: "🛵",
        ShipmentStatus.DELIVERED:        "✅",
        ShipmentStatus.FAILED:           "❌",
        ShipmentStatus.RETURNED:         "↩️",
    }.get(shipment.status, "📦")

    status_label = shipment.status.value.replace("_", " ").title()
    eta = (
        shipment.estimated_delivery.strftime("%d %b %Y")
        if shipment.estimated_delivery else "Not available"
    )
    lines = [
        f"{emoji} **Shipment Found!**{reuse_note}",
        f"**Tracking:** `{shipment.tracking_number}`",
        f"**Status:** {status_label}",
        f"**Route:** {shipment.origin} → {shipment.destination}",
        f"**Current Location:** {shipment.current_location or 'Updating…'}",
        f"**Est. Delivery:** {eta}",
        f"**Receiver:** {shipment.receiver_name}",
        f"**Weight:** {shipment.weight_kg} kg",
    ]
    if shipment.notes:
        lines.append(f"\n📝 *{shipment.notes}*")
    return "\n".join(lines)


async def handle_complaint(tracking_number: str, complaint_type: str, description: str, db: AsyncSession) -> str:
    case_id = _gen_id("CMP")
    c_type = ComplaintType.OTHER
    for ct in ComplaintType:
        if ct.value == complaint_type.upper():
            c_type = ct
            break

    complaint = Complaint(
        case_id=case_id,
        tracking_number=tracking_number.upper(),
        complaint_type=c_type,
        description=description,
        status=ComplaintStatus.OPEN,
    )
    db.add(complaint)
    await db.commit()

    return (
        f"✅ **Complaint Filed Successfully!**\n\n"
        f"**Case ID:** `{case_id}` *(save this for reference)*\n"
        f"**Tracking:** `{tracking_number.upper()}`\n"
        f"**Type:** {c_type.value.replace('_', ' ').title()}\n"
        f"**Status:** Open — Under Review\n\n"
        f"Our team will investigate and respond within **3–5 business days**. "
        f"For missing packages, we act within **24 hours**."
    )


async def handle_schedule_pickup(
    address: str, city: str, time_slot: str, pickup_date: datetime, db: AsyncSession,
    package_description: str = None, weight_kg: float = 1.0,
) -> str:
    booking_id = _gen_id("BK")
    pickup = Pickup(
        booking_id=booking_id,
        address=address, city=city,
        time_slot=time_slot, pickup_date=pickup_date,
        status=PickupStatus.SCHEDULED,
        package_description=package_description, weight_kg=weight_kg,
    )
    db.add(pickup)
    await db.commit()
    return (
        f"📅 **Pickup Scheduled!**\n\n"
        f"**Booking ID:** `{booking_id}` *(save this to cancel or reschedule)*\n"
        f"**Address:** {address}, {city}\n"
        f"**Date:** {pickup_date.strftime('%d %b %Y')}\n"
        f"**Slot:** {time_slot}\n"
        f"**Status:** Confirmed ✅\n\n"
        f"Our rider will arrive during your slot. Please keep your package ready."
    )


async def handle_cancel_pickup(booking_id: str, db: AsyncSession) -> str:
    result = await db.execute(select(Pickup).where(Pickup.booking_id == booking_id.upper()))
    pickup = result.scalar_one_or_none()
    if not pickup:
        return (
            f"❌ No pickup found with Booking ID **`{booking_id}`**.\n\n"
            "Booking IDs look like `BK20240001`. Please check and try again."
        )
    if pickup.status == PickupStatus.CANCELLED:
        return f"This pickup (`{booking_id}`) is already cancelled. Would you like to schedule a new one?"
    if pickup.status == PickupStatus.COMPLETED:
        return f"This pickup (`{booking_id}`) has already been completed and cannot be cancelled."
    pickup.status = PickupStatus.CANCELLED
    await db.commit()
    return (
        f"✅ **Pickup Cancelled**\n\n"
        f"Booking **`{booking_id}`** cancelled successfully.\n"
        f"To reschedule, just tell me your preferred date and time slot."
    )


async def handle_reschedule_pickup(booking_id: str, new_date: datetime, new_time_slot: str, db: AsyncSession) -> str:
    result = await db.execute(select(Pickup).where(Pickup.booking_id == booking_id.upper()))
    pickup = result.scalar_one_or_none()
    if not pickup:
        return (
            f"❌ No pickup found with Booking ID **`{booking_id}`**.\n\n"
            "Booking IDs look like `BK20240001`. Please check and try again."
        )
    if pickup.status == PickupStatus.CANCELLED:
        return f"This pickup (`{booking_id}`) is cancelled and cannot be rescheduled. Would you like to book a new one?"
    if pickup.status == PickupStatus.COMPLETED:
        return f"This pickup (`{booking_id}`) has already been completed. Thank you for using our service!"
    pickup.pickup_date = new_date
    pickup.time_slot = new_time_slot
    pickup.updated_at = datetime.now()
    await db.commit()
    return (
        f"✅ **Pickup Rescheduled!**\n\n"
        f"**Booking ID:** `{booking_id}`\n"
        f"**New Date:** {new_date.strftime('%d %b %Y')}\n"
        f"**New Time Slot:** {new_time_slot}\n\n"
        f"Our rider will arrive during the updated slot. Please keep your package ready."
    )


async def handle_escalation(session_id: str, db: AsyncSession, language: str = "en") -> dict:
    result = await db.execute(select(Conversation).where(Conversation.session_id == session_id))
    conv = result.scalar_one_or_none()
    agent = await find_available_agent(db)
    ticket = _gen_id("TKT")

    if conv:
        conv.is_escalated = True
        conv.escalated_at = datetime.now()
        if agent:
            conv.agent_id = agent.id
        await db.commit()

    agent_name = agent.name if agent else "Support Team"
    agent_online = agent.is_online if agent else False
    wait_time = "2–5 minutes" if agent_online else "5–15 minutes (agent will be notified)"

    msgs = {
        "ur": (
            f"🧑‍💼 **لائیو ایجنٹ سے جوڑ رہا ہوں…**\n\n"
            f"**ٹکٹ:** `{ticket}`\n"
            f"**ایجنٹ:** {agent_name}\n"
            f"**اسٹیٹس:** {'آن لائن ✅' if agent_online else 'آف لائن — نوٹیفائی کیا جا رہا ہے'}\n"
            f"**انتظار:** {wait_time}\n\n"
            f"براہ کرم ہولڈ کریں — {agent_name} جلد آپ سے رابطہ کریں گے۔"
        ),
        "roman_ur": (
            f"🧑‍💼 **Live agent se connect kar raha hoon…**\n\n"
            f"**Ticket:** `{ticket}`\n"
            f"**Agent:** {agent_name}\n"
            f"**Status:** {'Online ✅' if agent_online else 'Offline — notify ho rahe hain'}\n"
            f"**Wait:** {wait_time}\n\n"
            f"Please hold — {agent_name} abhi aapke saath baat karenge."
        ),
        "en": (
            f"🧑‍💼 **Connecting you to a Live Agent…**\n\n"
            f"**Ticket:** `{ticket}`\n"
            f"**Agent:** {agent_name}\n"
            f"**Status:** {'Online ✅' if agent_online else 'Offline — will be notified'}\n"
            f"**Est. Wait:** {wait_time}\n"
            f"**Hours:** Sat–Thu, 9 AM–9 PM\n\n"
            f"Please hold — {agent_name} will join this chat shortly."
        ),
    }
    reply = msgs.get(language, msgs["en"])
    return {
        "reply":        reply,
        "agent_name":   agent_name,
        "agent_online": agent_online,
        "ticket":       ticket,
    }


# ── Main chat entry point ─────────────────────────────────────────────────────
async def chat(
    session_id: str,
    user_text: str,
    db: AsyncSession,
    user_id: Optional[int] = None,
) -> dict:
    # 1. Get/create conversation (with user_id linkage)
    conv = await get_or_create_conversation(session_id, db, user_id=user_id)

    # 2. Load history for Groq context
    history = await _load_history(conv.id, db, limit=10)

    # 3. Get pending ambiguity for this session
    pending = _pending_ambiguity.get(session_id)

    # 4. NLP pipeline (pass pending ambiguity)
    nlp = process_message(user_text, conversation_history=history, pending_ambiguity=pending)

    # 5. Update/clear pending ambiguity
    if nlp.get("ambiguity"):
        _pending_ambiguity[session_id] = nlp["ambiguity"]
    else:
        _pending_ambiguity.pop(session_id, None)

    # 6. Update conversation language
    if conv.language != nlp["language"]:
        conv.language = nlp["language"]
        await db.commit()

    # 7. Resolve intent enum
    intent_enum = IntentType.UNKNOWN
    try:
        intent_enum = IntentType(nlp["intent"])
    except ValueError:
        pass

    # 8. Save user message
    user_msg = Message(
        conversation_id=conv.id, role="user", content=user_text,
        intent=intent_enum, confidence=nlp["confidence"], language=nlp["language"],
    )
    db.add(user_msg)
    await db.commit()

    # 9. Update conversation memory (tracking number)
    tracking_num = _extract_tracking_number_from_text(user_text)
    if tracking_num:
        conv.last_tracking_number = tracking_num
        await db.commit()

    # 10. If this was an option selection response, skip action handlers
    if nlp["source"] == "option_select":
        reply = nlp["reply"]
        suggestions = nlp["suggestions"]
        action_data = None
        intent = nlp["intent"]
        lang = nlp["language"]
    else:
        # ── Action routing for normal intents ─────────────────────────────────
        intent = nlp["intent"]
        entities = nlp["entities"]
        reply = nlp["reply"]
        action_data = None
        lang = nlp["language"]

        def _prompt(en, ru, ur):
            return {"en": en, "roman_ur": ru, "ur": ur}.get(lang, en)

        if intent == "TRACK":
            tracking_provided = entities.get("tracking_number", "")
            if tracking_provided:
                reply = await handle_track(tracking_provided, db)
                action_data = {"tracking_number": tracking_provided}
            elif conv.last_tracking_number:
                reply = await handle_track("", db, conversation=conv)
                action_data = {"tracking_number": conv.last_tracking_number}
            # else keep NLP's reply (prompt for number)

        elif intent == "COMPLAIN":
            if "tracking_number" in entities:
                c_type = entities.get("complaint_type", "OTHER")
                reply = await handle_complaint(entities["tracking_number"], c_type, user_text, db)
            # else keep NLP's prompt for number

        elif intent == "SCHEDULE_PICKUP":
            if "time_slot" in entities:
                pickup_date = datetime.now() + timedelta(days=1)
                reply = await handle_schedule_pickup(
                    address="Customer address (please confirm in next message)",
                    city="Lahore", time_slot=entities["time_slot"],
                    pickup_date=pickup_date, db=db,
                )
            # else keep NLP's prompt for address/time slot

        elif intent == "CANCEL_PICKUP":
            if "booking_id" in entities:
                reply = await handle_cancel_pickup(entities["booking_id"], db)
            # else keep NLP's prompt for booking ID

        elif intent == "MODIFY_PICKUP":
            booking_id = entities.get("booking_id", "")
            new_time = entities.get("time_slot", "")
            if booking_id and new_time:
                new_date = datetime.now() + timedelta(days=1)
                reply = await handle_reschedule_pickup(booking_id, new_date, new_time, db)
                action_data = {"booking_id": booking_id, "new_time_slot": new_time}
            elif booking_id:
                # Store that we are waiting for a new time slot
                _pending_ambiguity[session_id] = {
                    "type": "reschedule",
                    "booking_id": booking_id,
                    "step": "awaiting_new_time"
                }
                prompts = {
                    "ur": "آپ کا نیا پک اپ ٹائم سلاٹ بتائیں (صبح، دوپہر، یا شام)۔",
                    "roman_ur": "Apna naya pickup time slot batayein (subah, dopahar, ya shaam).",
                    "en": "Please provide your new preferred time slot (Morning, Afternoon, or Evening)."
                }
                reply = prompts.get(lang, prompts["en"])
            else:
                prompts = {
                    "ur": "براہ کرم اپنا **بکنگ آئی ڈی** دیں (مثلاً `BK20240001`) تاکہ میں پک اپ ری شیڈول کر سکوں۔",
                    "roman_ur": "Apna **Booking ID** share karein (e.g. BK20240001) – main pickup reschedule kar doonga.",
                    "en": "Please provide your **Booking ID** (e.g. BK20240001) to reschedule the pickup."
                }
                reply = prompts.get(lang, prompts["en"])

        elif intent == "ESCALATE":
            esc = await handle_escalation(session_id, db, lang)
            reply = esc["reply"]
            action_data = {
                "escalated":    True,
                "agent_name":   esc["agent_name"],
                "agent_online": esc["agent_online"],
                "ticket":       esc["ticket"],
            }

        # For all other intents (FAQ, GREETING, UNKNOWN) keep the original NLP reply

        suggestions = nlp["suggestions"]

    # 11. Save bot message
    bot_msg = Message(
        conversation_id=conv.id, role="bot", content=reply,
        intent=intent_enum, confidence=nlp["confidence"], language=nlp["language"],
    )
    db.add(bot_msg)
    await db.commit()
    await db.refresh(bot_msg)

    return {
        "reply":       reply,
        "intent":      intent,
        "session_id":  session_id,
        "language":    nlp["language"],
        "suggestions": suggestions,
        "action_data": action_data,
        "message_id":  bot_msg.id,
        "source":      nlp["source"],
        "is_ambiguous": bool(nlp.get("ambiguity")),
    }