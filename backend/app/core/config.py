from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:password@localhost:5432/courier_chatbot"
    SECRET_KEY: str = "123"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080
    REDIS_URL: str = "redis://localhost:6379"
    ENVIRONMENT: str = "development"
    CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://localhost:3000"]
    GROQ_API_KEY: str = ""   # Add this line

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"     # Prevents errors from extra env variables


# Create a single instance to import
settings = Settings()