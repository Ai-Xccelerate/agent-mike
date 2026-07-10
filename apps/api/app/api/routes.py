from __future__ import annotations

import json
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import get_db
from app.models import AgentProfile, Conversation, KnowledgeDocument, Message
from app.schemas import (
    AgentProfileOut,
    AgentProfileUpdate,
    ChatRequest,
    ChatResponse,
    ConversationOut,
    DashboardStats,
    KnowledgeDocumentOut,
    KnowledgeIngestRequest,
    MessageOut,
)
from app.services.agent import run_agent
from app.services.agentmail import reply_to_email, send_email, verify_webhook
from app.services.knowledge import InvalidOKFDocument, ingest_okf, ingest_upload

router = APIRouter()


def _clean_email_text(text: str) -> str:
    text = re.sub(r"\[image:[^\]]*\]", "", text)  # drop inline image placeholders
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)  # collapse long blank runs
    return text.strip()


def _ticket_ref(conversation_id: str) -> str:
    return "EAPX-" + conversation_id.replace("-", "")[:8].upper()


async def _notify_manager(profile: AgentProfile, conversation: Conversation, answer, customer_message: str) -> None:
    if not (answer.escalated and profile.manager_email):
        return
    ref = _ticket_ref(conversation.id)
    who = conversation.customer_name
    if conversation.customer_email:
        who += f" <{conversation.customer_email}>"
    note = (
        f"Agent Mike escalated a support conversation and needs a human to respond.\n\n"
        f"**Ticket:** {ref}\n"
        f"**Reference ID:** {conversation.id}\n"
        f"**Channel:** {conversation.channel}\n"
        f"**Customer:** {who}\n"
        f"**Reason:** {answer.reason or 'Escalation'}\n\n"
        f"**Customer's message:**\n{customer_message}\n\n"
        f"**Mike's reply to the customer:**\n{answer.text}\n\n"
        f"Please review and respond on ticket {ref}."
    )
    subject = f"[Escalation {ref}] {conversation.subject[:60]}"
    await send_email(profile.manager_email, subject, note)


def _apply_outcome(conversation: Conversation, profile: AgentProfile, answer) -> None:
    if answer.escalated:
        conversation.status = "needs_human"
        conversation.priority = getattr(answer, "priority", "high")  # high=handoff, normal=follow-up
        conversation.assigned_to = profile.manager_name  # follow-up owner
    else:
        conversation.status = "open"
        conversation.priority = "normal"
        conversation.assigned_to = profile.display_name


async def get_profile(db: AsyncSession) -> AgentProfile:
    profile = await db.scalar(select(AgentProfile).limit(1))
    if not profile:
        profile = AgentProfile()
        db.add(profile)
        await db.commit()
        await db.refresh(profile)
    return profile


@router.get("/agent", response_model=AgentProfileOut)
async def read_agent(db: AsyncSession = Depends(get_db)) -> AgentProfile:
    return await get_profile(db)


@router.patch("/agent", response_model=AgentProfileOut)
async def update_agent(
    payload: AgentProfileUpdate, db: AsyncSession = Depends(get_db)
) -> AgentProfile:
    profile = await get_profile(db)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(profile, key, value)
    profile.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(profile)
    return profile


@router.get("/conversations", response_model=list[ConversationOut])
async def list_conversations(
    conversation_status: str | None = None,
    channel: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> list[Conversation]:
    statement = select(Conversation).options(selectinload(Conversation.messages))
    if conversation_status:
        statement = statement.where(Conversation.status == conversation_status)
    if channel:
        statement = statement.where(Conversation.channel == channel)
    statement = statement.order_by(Conversation.updated_at.desc()).limit(100)
    return list((await db.scalars(statement)).unique())


@router.get("/conversations/{conversation_id}", response_model=ConversationOut)
async def get_conversation(
    conversation_id: str, db: AsyncSession = Depends(get_db)
) -> Conversation:
    conversation = await db.scalar(
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .where(Conversation.id == conversation_id)
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


@router.patch("/conversations/{conversation_id}/status", response_model=ConversationOut)
async def set_conversation_status(
    conversation_id: str,
    conversation_status: str,
    db: AsyncSession = Depends(get_db),
) -> Conversation:
    allowed = {"open", "resolved", "needs_human", "human_active"}
    if conversation_status not in allowed:
        raise HTTPException(status_code=422, detail=f"Status must be one of {sorted(allowed)}")
    conversation = await get_conversation(conversation_id, db)
    conversation.status = conversation_status
    if conversation_status == "human_active":
        conversation.assigned_to = (await get_profile(db)).manager_name
    conversation.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return conversation


@router.delete("/conversations/{conversation_id}", status_code=204)
async def delete_conversation(
    conversation_id: str, db: AsyncSession = Depends(get_db)
) -> None:
    conversation = await db.get(Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    await db.delete(conversation)
    await db.commit()


@router.post("/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest, db: AsyncSession = Depends(get_db)) -> ChatResponse:
    profile = await get_profile(db)
    conversation: Conversation | None = None
    history: list[Message] = []
    if payload.conversation_id:
        conversation = await db.scalar(
            select(Conversation)
            .options(selectinload(Conversation.messages))
            .where(Conversation.id == payload.conversation_id)
        )
        if conversation:
            history = list(conversation.messages)
    if not conversation:
        conversation = Conversation(
            channel="chat",
            customer_name=payload.customer_name,
            customer_email=str(payload.customer_email) if payload.customer_email else None,
            subject=payload.message[:90],
        )
        db.add(conversation)
        await db.flush()

    db.add(
        Message(
            conversation_id=conversation.id,
            sender_type="customer",
            sender_name=payload.customer_name,
            body=payload.message,
        )
    )
    answer = await run_agent(db, profile, payload.message, history)
    mike_message = Message(
        conversation_id=conversation.id,
        sender_type="agent",
        sender_name=profile.display_name,
        body=answer.text,
        citations=answer.citations,
        metadata_json={"confidence": answer.confidence, "reason": answer.reason},
    )
    db.add(mike_message)
    conversation.confidence = answer.confidence
    _apply_outcome(conversation, profile, answer)
    conversation.summary = payload.message[:240]
    conversation.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(mike_message)
    # Chat has no email thread to copy the manager on, so send an internal follow-up
    # to the support manager with the ticket reference when Mike escalates.
    try:
        await _notify_manager(profile, conversation, answer, payload.message)
    except Exception:  # noqa: BLE001 - never fail the chat on a notification error
        pass
    return ChatResponse(
        conversation_id=conversation.id,
        message=MessageOut.model_validate(mike_message),
        status=conversation.status,
        confidence=answer.confidence,
        escalated=answer.escalated,
    )


@router.get("/knowledge", response_model=list[KnowledgeDocumentOut])
async def list_knowledge(db: AsyncSession = Depends(get_db)) -> list[KnowledgeDocumentOut]:
    documents = list(
        await db.scalars(
            select(KnowledgeDocument)
            .options(selectinload(KnowledgeDocument.chunks))
            .order_by(KnowledgeDocument.ingested_at.desc())
        )
    )
    return [
        KnowledgeDocumentOut.model_validate(document).model_copy(
            update={"chunk_count": len(document.chunks)}
        )
        for document in documents
    ]


@router.post("/knowledge/ingest", response_model=KnowledgeDocumentOut, status_code=201)
async def ingest_knowledge(
    payload: KnowledgeIngestRequest, db: AsyncSession = Depends(get_db)
) -> KnowledgeDocumentOut:
    try:
        document = await ingest_okf(db, payload.content, payload.concept_id, payload.source_path)
    except InvalidOKFDocument as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return KnowledgeDocumentOut.model_validate(document).model_copy(
        update={"chunk_count": len(document.chunks)}
    )


@router.post("/knowledge/ingest-files")
async def ingest_knowledge_files(
    files: list[UploadFile] = File(...), db: AsyncSession = Depends(get_db)
) -> list[dict]:
    results: list[dict] = []
    for upload in files:
        raw = await upload.read()
        try:
            document = await ingest_upload(db, upload.filename or "document", raw)
            results.append(
                {
                    "filename": upload.filename,
                    "ok": True,
                    "document": KnowledgeDocumentOut.model_validate(document)
                    .model_copy(update={"chunk_count": len(document.chunks)})
                    .model_dump(mode="json"),
                }
            )
        except InvalidOKFDocument as exc:
            results.append({"filename": upload.filename, "ok": False, "error": str(exc)})
        except Exception as exc:  # noqa: BLE001 - surface any per-file failure without aborting the batch
            results.append({"filename": upload.filename, "ok": False, "error": f"Could not process file: {exc}"})
    return results


@router.delete("/knowledge/{document_id}", status_code=204)
async def delete_knowledge(document_id: str, db: AsyncSession = Depends(get_db)) -> None:
    document = await db.get(KnowledgeDocument, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Knowledge document not found")
    await db.delete(document)
    await db.commit()


@router.get("/dashboard", response_model=DashboardStats)
async def dashboard(db: AsyncSession = Depends(get_db)) -> DashboardStats:
    open_count = await db.scalar(
        select(func.count()).select_from(Conversation).where(Conversation.status == "open")
    ) or 0
    needs_human = await db.scalar(
        select(func.count()).select_from(Conversation).where(Conversation.status == "needs_human")
    ) or 0
    resolved = await db.scalar(
        select(func.count()).select_from(Conversation).where(Conversation.status == "resolved")
    ) or 0
    total = await db.scalar(select(func.count()).select_from(Conversation)) or 0
    average = await db.scalar(select(func.avg(Conversation.confidence))) or 0
    autonomous = max(total - needs_human, 0)
    return DashboardStats(
        open_conversations=open_count,
        resolved_today=resolved,
        needs_human=needs_human,
        auto_resolution_rate=round(autonomous / total * 100, 1) if total else 0,
        avg_confidence=round(float(average) * 100, 1),
    )


@router.post("/webhooks/agentmail", status_code=status.HTTP_202_ACCEPTED)
async def agentmail_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    raw = await request.body()
    if not verify_webhook(raw, dict(request.headers)):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")
    try:
        event = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON") from exc
    message_data = event.get("message") or event.get("data", {}).get("message") or event.get("data") or event

    configured_inbox = (settings.agentmail_inbox_id or "").strip().lower()
    if configured_inbox:
        target_inbox = str(message_data.get("inbox_id") or "").strip().lower()
        recipients = message_data.get("to") or []
        recipient_text = (" ".join(recipients) if isinstance(recipients, list) else str(recipients)).lower()
        if target_inbox != configured_inbox and configured_inbox not in recipient_text:
            return {"accepted": True, "ignored": f"Not addressed to {settings.agentmail_inbox_id}"}

    message_id = str(message_data.get("message_id") or message_data.get("id") or "")
    thread_id = str(message_data.get("thread_id") or message_id)
    sender = str(message_data.get("from") or "Unknown customer")
    subject = str(message_data.get("subject") or "Email support request")
    body = _clean_email_text(str(
        message_data.get("extracted_text")
        or message_data.get("text")
        or message_data.get("preview")
        or ""
    ))
    if not message_id or not body:
        return {"accepted": True, "ignored": "Event did not contain an inbound message"}

    profile = await get_profile(db)
    conversation = await db.scalar(
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .where(Conversation.external_thread_id == thread_id)
    )
    history: list[Message] = list(conversation.messages) if conversation else []
    if conversation and any(
        item.metadata_json.get("external_message_id") == message_id for item in conversation.messages
    ):
        return {"accepted": True, "duplicate": True, "conversation_id": conversation.id}
    if not conversation:
        conversation = Conversation(
            channel="email",
            customer_name=sender.split("<", 1)[0].strip(' "') or sender,
            customer_email=sender,
            subject=subject,
            external_thread_id=thread_id,
        )
        db.add(conversation)
        await db.flush()
    db.add(
        Message(
            conversation_id=conversation.id,
            sender_type="customer",
            sender_name=sender,
            body=body,
            metadata_json={"external_message_id": message_id},
        )
    )
    answer = await run_agent(db, profile, body, history)
    db.add(
        Message(
            conversation_id=conversation.id,
            sender_type="agent",
            sender_name=profile.display_name,
            body=answer.text,
            citations=answer.citations,
            metadata_json={"confidence": answer.confidence, "reason": answer.reason},
        )
    )
    conversation.confidence = answer.confidence
    _apply_outcome(conversation, profile, answer)
    conversation.summary = body[:240]
    await db.commit()

    # Email conversations get Mike's reply sent back to the sender — whether it is an
    # answer, a clarifying question, or an acknowledgement that a human will follow up.
    delivery_id = None
    delivery_error = None
    if profile.auto_reply:
        try:
            # On escalation, copy the support manager into the loop on the reply thread.
            cc = [profile.manager_email] if (answer.escalated and profile.manager_email) else None
            delivery_id = await reply_to_email(message_id, answer.text, cc=cc)
        except Exception as exc:  # noqa: BLE001 - never fail the webhook on a send error
            delivery_error = str(exc)
    return {
        "accepted": True,
        "conversation_id": conversation.id,
        "escalated": answer.escalated,
        "delivery_id": delivery_id,
        "delivery_error": delivery_error,
    }
