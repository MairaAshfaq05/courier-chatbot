from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.core.config import settings
from app.database import create_tables
from app.api.chat import router as chat_router
from app.api.analytics import router as analytics_router
from app.api.routes import (
    auth_router, shipment_router, complaint_router,
    pickup_router, feedback_router, refund_router,
)

limiter = Limiter(key_func=get_remote_address)

@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_tables()
    yield

app = FastAPI(
    title="AI Courier Chatbot API",
    description="Backend for AI-Powered Courier Customer Support Chatbot",
    version="1.0.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(chat_router)
app.include_router(analytics_router)
app.include_router(shipment_router)
app.include_router(complaint_router)
app.include_router(pickup_router)
app.include_router(feedback_router)
app.include_router(refund_router)

@app.get("/")
async def root():
    return {"message": "AI Courier Chatbot API", "version": "1.0.0", "docs": "/docs"}

@app.get("/health")
async def health():
    return {"status": "healthy"}