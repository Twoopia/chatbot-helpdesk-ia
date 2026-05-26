from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List
import uuid


class Message(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    role: str
    content: str
    timestamp: datetime = Field(default_factory=datetime.now)
    source: str = "ai"


class ChatRequest(BaseModel):
    message: str
    session_id: str


class ChatResponse(BaseModel):
    id: str
    message: str
    session_id: str
    timestamp: str
    source: str


class Session(BaseModel):
    session_id: str
    created_at: str
    updated_at: str
    message_count: int
    title: Optional[str] = None


class FAQItem(BaseModel):
    id: str
    category: str
    question: str
    keywords: List[str]
    answer: str
    helpful_count: int = 0


class FAQSearchResult(BaseModel):
    item: FAQItem
    score: float
