from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

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
from app.services.knowledge import InvalidOKFDocument, ingest_okf, ingest_upload

router = APIRouter()


def _ticket_ref(conversation: Conversation) -> str:
    if conversation.ticket_number:
        return f"EAPX-{conversation.ticket_number}"
    return "EAPX-" + conversation.id.replace("-", "")[:8].upper()


async def _next_ticket_number(db: AsyncSession) -> int:
    current = await db.scalar(select(func.max(Conversation.ticket_number)))
    return (current or 1000) + 1


async def _notify_manager(profile: AgentProfile, conversation: Conversation, answer, customer_message: str) -> None:
    # Legacy FastAPI stack no longer sends mail. Use the Next.js API + Nylas path.
    if not (answer.escalated and profile.manager_email):
        return
    print(
        f"[legacy-api] escalation for {_ticket_ref(conversation)} "
        f"to {profile.manager_email} (email delivery is handled by Next.js/Nylas)"
    )


def _apply_outcome(conversation: Conversation, profile: AgentProfile, answer) -> None:
    if getattr(answer, "resolved", False):
        conversation.status = "resolved"  # customer confirmed the issue is solved
        conversation.priority = "normal"
        conversation.assigned_to = profile.display_name
    elif answer.escalated:
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
    allowed = {"open", "resolved", "needs_human", "human_active", "closed"}
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
            ticket_number=await _next_ticket_number(db),
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


@router.get("/knowledge/graph")
async def knowledge_graph(db: AsyncSession = Depends(get_db)) -> dict:
    documents = list(
        await db.scalars(
            select(KnowledgeDocument).options(selectinload(KnowledgeDocument.chunks))
        )
    )
    nodes: list[dict] = []
    links: list[dict] = []
    sections = 0
    for document in documents:
        nodes.append(
            {
                "id": document.id,
                "label": document.title,
                "group": "concept",
                "type": document.type,
                "concept_id": document.concept_id,
                "tags": document.tags,
                "val": max(6, len(document.chunks) * 2),
            }
        )
        for chunk in sorted(document.chunks, key=lambda item: item.position):
            section_id = f"{document.id}:{chunk.position}"
            section_label = chunk.heading or f"{document.title} — part {chunk.position + 1}"
            nodes.append(
                {
                    "id": section_id,
                    "label": section_label,
                    "group": "section",
                    "type": document.type,
                    "concept_id": document.concept_id,
                    "val": 2,
                }
            )
            links.append({"source": document.id, "target": section_id, "kind": "section"})
            sections += 1

    def prefix(concept_id: str) -> str:
        return concept_id.split("/")[0].split("-")[0]

    for index, first in enumerate(documents):
        first_tags = set(first.tags or [])
        for second in documents[index + 1:]:
            if (first_tags & set(second.tags or [])) or prefix(first.concept_id) == prefix(second.concept_id):
                links.append({"source": first.id, "target": second.id, "kind": "related"})

    return {
        "nodes": nodes,
        "links": links,
        "stats": {"concepts": len(documents), "sections": sections, "links": len(links)},
    }


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


