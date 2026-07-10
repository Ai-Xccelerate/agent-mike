from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def new_id() -> str:
    return str(uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AgentProfile(Base):
    __tablename__ = "agent_profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(120), default="Mike")
    display_name: Mapped[str] = mapped_column(String(120), default="Agent Mike")
    email: Mapped[str] = mapped_column(String(255), default="mike@agentmail.to")
    role: Mapped[str] = mapped_column(
        Text,
        default="Level 1 product support specialist for trained products and solutions.",
    )
    tone: Mapped[str] = mapped_column(
        Text,
        default="Warm, concise, practical, and honest about uncertainty.",
    )
    manager_name: Mapped[str] = mapped_column(String(120), default="Support Manager")
    manager_email: Mapped[str] = mapped_column(String(255), default="manager@example.com")
    auto_reply: Mapped[bool] = mapped_column(Boolean, default=True)
    confidence_threshold: Mapped[float] = mapped_column(Float, default=0.72)
    max_agent_turns: Mapped[int] = mapped_column(Integer, default=3)
    guardrails: Mapped[list] = mapped_column(
        JSON,
        default=lambda: [
            "Never invent product behavior or policies.",
            "Never request passwords, secrets, or full payment card details.",
            "Escalate billing disputes, security incidents, legal threats, and account deletion.",
            "Use only the supplied knowledge when making product-specific claims.",
        ],
    )
    escalation_terms: Mapped[list] = mapped_column(
        JSON,
        default=lambda: [
            "refund",
            "chargeback",
            "lawyer",
            "breach",
            "security incident",
            "delete my account",
            "cancel subscription",
        ],
    )
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    channel: Mapped[str] = mapped_column(String(20), default="chat")
    customer_name: Mapped[str] = mapped_column(String(120), default="Website visitor")
    customer_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    subject: Mapped[str] = mapped_column(String(300), default="Support conversation")
    status: Mapped[str] = mapped_column(String(30), default="open")
    priority: Mapped[str] = mapped_column(String(20), default="normal")
    assigned_to: Mapped[str] = mapped_column(String(120), default="Mike")
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    external_thread_id: Mapped[str | None] = mapped_column(String(512), nullable=True, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    messages: Mapped[list[Message]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan", order_by="Message.created_at"
    )


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"))
    sender_type: Mapped[str] = mapped_column(String(20))
    sender_name: Mapped[str] = mapped_column(String(120))
    body: Mapped[str] = mapped_column(Text)
    citations: Mapped[list] = mapped_column(JSON, default=list)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    conversation: Mapped[Conversation] = relationship(back_populates="messages")


class KnowledgeDocument(Base):
    __tablename__ = "knowledge_documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    concept_id: Mapped[str] = mapped_column(String(500), unique=True, index=True)
    type: Mapped[str] = mapped_column(String(120))
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    resource: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    tags: Mapped[list] = mapped_column(JSON, default=list)
    source_path: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    body: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), default="ready")
    checksum: Mapped[str] = mapped_column(String(64))
    source_timestamp: Mapped[str | None] = mapped_column(String(80), nullable=True)
    ingested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    chunks: Mapped[list[KnowledgeChunk]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )


class KnowledgeChunk(Base):
    __tablename__ = "knowledge_chunks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    document_id: Mapped[str] = mapped_column(
        ForeignKey("knowledge_documents.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(Integer)
    heading: Mapped[str | None] = mapped_column(String(500), nullable=True)
    content: Mapped[str] = mapped_column(Text)

    document: Mapped[KnowledgeDocument] = relationship(back_populates="chunks")

