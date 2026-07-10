from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class AgentProfileBase(BaseModel):
    name: str
    display_name: str
    email: str
    role: str
    tone: str
    manager_name: str
    manager_email: str
    auto_reply: bool
    confidence_threshold: float = Field(ge=0, le=1)
    max_agent_turns: int = Field(ge=1, le=10)
    guardrails: list[str]
    escalation_terms: list[str]


class AgentProfileOut(AgentProfileBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    updated_at: datetime


class AgentProfileUpdate(BaseModel):
    name: str | None = None
    display_name: str | None = None
    email: str | None = None
    role: str | None = None
    tone: str | None = None
    manager_name: str | None = None
    manager_email: str | None = None
    auto_reply: bool | None = None
    confidence_threshold: float | None = Field(default=None, ge=0, le=1)
    max_agent_turns: int | None = Field(default=None, ge=1, le=10)
    guardrails: list[str] | None = None
    escalation_terms: list[str] | None = None


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    sender_type: str
    sender_name: str
    body: str
    citations: list[dict]
    created_at: datetime


class ConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    channel: str
    customer_name: str
    customer_email: str | None
    subject: str
    status: str
    priority: str
    assigned_to: str
    confidence: float | None
    summary: str | None
    created_at: datetime
    updated_at: datetime
    messages: list[MessageOut] = []


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=10000)
    conversation_id: str | None = None
    customer_name: str = "Website visitor"
    customer_email: EmailStr | None = None


class ChatResponse(BaseModel):
    conversation_id: str
    message: MessageOut
    status: str
    confidence: float
    escalated: bool


class KnowledgeIngestRequest(BaseModel):
    content: str = Field(min_length=1)
    concept_id: str
    source_path: str | None = None


class KnowledgeDocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    concept_id: str
    type: str
    title: str
    description: str | None
    resource: str | None
    tags: list[str]
    status: str
    source_timestamp: str | None
    ingested_at: datetime
    chunk_count: int = 0


class DashboardStats(BaseModel):
    open_conversations: int
    resolved_today: int
    needs_human: int
    auto_resolution_rate: float
    avg_confidence: float

