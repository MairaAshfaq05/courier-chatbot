# app/api/__init__.py
from app.api.chat import router as chat_router
from app.api.analytics import router as analytics_router
from app.api.routes import (
    auth_router,
    shipment_router,
    complaint_router,
    pickup_router,
    feedback_router,
)

__all__ = [
    "chat_router",
    "analytics_router",
    "auth_router",
    "shipment_router",
    "complaint_router",
    "pickup_router",
    "feedback_router",
]