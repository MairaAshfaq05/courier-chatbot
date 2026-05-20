"""
Analytics Service — All queries hit the real PostgreSQL database.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, cast, Date, case
from datetime import datetime, timedelta
from app.models import Conversation, Message, Complaint, Pickup, Feedback, IntentType


async def get_analytics_summary(db: AsyncSession, days: int = 30) -> dict:
    since = datetime.now() - timedelta(days=days)

    # ── Totals ─────────────────────────────────────────────────────────────────
    total_conv       = (await db.execute(select(func.count()).select_from(Conversation))).scalar() or 0
    total_msg        = (await db.execute(select(func.count()).select_from(Message))).scalar() or 0
    total_complaints = (await db.execute(select(func.count()).select_from(Complaint))).scalar() or 0
    total_pickups    = (await db.execute(select(func.count()).select_from(Pickup))).scalar() or 0

    # ── Average feedback rating ────────────────────────────────────────────────
    avg_rating_raw = (await db.execute(select(func.avg(Feedback.rating)))).scalar()
    avg_rating     = round(float(avg_rating_raw), 2) if avg_rating_raw else 0.0

    # ── Escalation rate ────────────────────────────────────────────────────────
    escalated = (
        await db.execute(
            select(func.count())
            .select_from(Conversation)
            .where(Conversation.is_escalated == True)
        )
    ).scalar() or 0
    escalation_rate = round((escalated / total_conv * 100) if total_conv > 0 else 0.0, 1)

    # ── Intent breakdown (user messages only) ─────────────────────────────────
    intent_rows = (
        await db.execute(
            select(Message.intent, func.count().label("cnt"))
            .where(Message.role == "user", Message.intent.isnot(None))
            .group_by(Message.intent)
            .order_by(func.count().desc())
        )
    ).all()
    total_intents = sum(r.cnt for r in intent_rows) or 1
    intent_breakdown = [
        {
            "intent":     r.intent.value if r.intent else "unknown",
            "count":      r.cnt,
            "percentage": round(r.cnt / total_intents * 100, 1),
        }
        for r in intent_rows
    ]

    # ── Daily messages (last N days) ─────────────────────────────────────────
    # Use case() expression to count bot messages — works across PostgreSQL versions
    daily_rows = (
        await db.execute(
            select(
                cast(Message.created_at, Date).label("day"),
                func.count().label("total"),
                func.sum(
                    case((Message.role == "bot", 1), else_=0)
                ).label("bot_count"),
            )
            .where(Message.created_at >= since)
            .group_by(cast(Message.created_at, Date))
            .order_by(cast(Message.created_at, Date))
        )
    ).all()

    daily_messages = []
    for row in daily_rows:
        total_c = int(row.total or 0)
        bot_c   = int(row.bot_count or 0)
        daily_messages.append({
            "date":           str(row.day),
            "total_messages": total_c,
            "bot_messages":   bot_c,
            "user_messages":  total_c - bot_c,
        })

    # ── Complaint type breakdown ───────────────────────────────────────────────
    complaint_rows = (
        await db.execute(
            select(Complaint.complaint_type, func.count().label("cnt"))
            .group_by(Complaint.complaint_type)
            .order_by(func.count().desc())
        )
    ).all()
    complaint_breakdown = [
        {"type": r.complaint_type.value if r.complaint_type else "other", "count": r.cnt}
        for r in complaint_rows
    ]

    # ── Complaint status breakdown ─────────────────────────────────────────────
    complaint_status_rows = (
        await db.execute(
            select(Complaint.status, func.count().label("cnt"))
            .group_by(Complaint.status)
        )
    ).all()
    complaint_status_breakdown = [
        {"status": r.status.value if r.status else "open", "count": r.cnt}
        for r in complaint_status_rows
    ]

    # ── Language breakdown ─────────────────────────────────────────────────────
    lang_rows = (
        await db.execute(
            select(Conversation.language, func.count().label("cnt"))
            .group_by(Conversation.language)
            .order_by(func.count().desc())
        )
    ).all()
    lang_map   = {"en": "English", "ur": "Urdu", "roman_ur": "Roman Urdu"}
    language_breakdown = [
        {
            "language":      r.language or "en",
            "language_name": lang_map.get(r.language or "en", r.language or "en"),
            "count":         r.cnt,
        }
        for r in lang_rows
    ]

    # ── Pickup status breakdown ────────────────────────────────────────────────
    pickup_rows = (
        await db.execute(
            select(Pickup.status, func.count().label("cnt"))
            .group_by(Pickup.status)
        )
    ).all()
    pickup_breakdown = [
        {"status": r.status.value if r.status else "scheduled", "count": r.cnt}
        for r in pickup_rows
    ]

    # ── Feedback distribution (1–5 stars) ─────────────────────────────────────
    feedback_rows = (
        await db.execute(
            select(Feedback.rating, func.count().label("cnt"))
            .group_by(Feedback.rating)
            .order_by(Feedback.rating)
        )
    ).all()
    feedback_dist = [{"rating": r.rating, "count": r.cnt} for r in feedback_rows]

    # ── Top cities by pickup ───────────────────────────────────────────────────
    city_rows = (
        await db.execute(
            select(Pickup.city, func.count().label("cnt"))
            .group_by(Pickup.city)
            .order_by(func.count().desc())
            .limit(8)
        )
    ).all()
    top_cities = [{"city": r.city, "count": r.cnt} for r in city_rows]

    # ── Recent complaints (last 5) ─────────────────────────────────────────────
    recent_complaint_rows = (
        await db.execute(
            select(
                Complaint.case_id,
                Complaint.complaint_type,
                Complaint.status,
                Complaint.tracking_number,
                Complaint.created_at,
            )
            .order_by(Complaint.created_at.desc())
            .limit(5)
        )
    ).all()
    recent_complaints = [
        {
            "case_id":         r.case_id,
            "complaint_type":  r.complaint_type.value if r.complaint_type else "other",
            "status":          r.status.value if r.status else "open",
            "tracking_number": r.tracking_number,
            "created_at":      r.created_at.isoformat() if r.created_at else None,
        }
        for r in recent_complaint_rows
    ]

    # ── Resolution rate ────────────────────────────────────────────────────────
    resolved_count = next(
        (r["count"] for r in complaint_status_breakdown if r["status"] in ("resolved", "closed")),
        0,
    )
    resolution_rate = round((resolved_count / total_complaints * 100) if total_complaints > 0 else 0.0, 1)

    return {
        # Totals
        "total_conversations": total_conv,
        "total_messages":      total_msg,
        "total_complaints":    total_complaints,
        "total_pickups":       total_pickups,
        # Rates
        "avg_feedback_rating": avg_rating,
        "escalation_rate":     escalation_rate,
        "resolution_rate":     resolution_rate,
        # Breakdowns
        "intent_breakdown":            intent_breakdown,
        "daily_messages":              daily_messages,
        "complaint_type_breakdown":    complaint_breakdown,
        "complaint_status_breakdown":  complaint_status_breakdown,
        "language_breakdown":          language_breakdown,
        "pickup_breakdown":            pickup_breakdown,
        "feedback_distribution":       feedback_dist,
        "top_cities":                  top_cities,
        "recent_complaints":           recent_complaints,
    }