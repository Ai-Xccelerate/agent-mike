from __future__ import annotations

import asyncio
import html
import re

import markdown as markdown_lib
from agentmail import AgentMail
from svix.webhooks import Webhook

from app.config import settings


def verify_webhook(payload: bytes, headers: dict[str, str]) -> bool:
    if not settings.agentmail_webhook_secret:
        return settings.demo_mode
    try:
        Webhook(settings.agentmail_webhook_secret).verify(payload, headers)
    except Exception:
        return False
    return True


def _to_html(text: str) -> str:
    # Escape first so any raw HTML/script in Mike's output or a customer's message
    # cannot be injected into the outgoing email; markdown syntax still renders.
    body = markdown_lib.markdown(html.escape(text), extensions=["extra", "sane_lists"])
    return (
        '<div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; '
        'line-height: 1.6; color: #1a1a1a;">'
        f"{body}"
        "</div>"
    )


def _to_plain(text: str) -> str:
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)  # bold
    text = re.sub(r"__(.+?)__", r"\1", text)
    text = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"\1", text)  # italic
    text = re.sub(r"^\s{0,3}#{1,6}\s*", "", text, flags=re.MULTILINE)  # headings
    text = re.sub(r"\[([^\]]+)\]\((https?://[^)]+)\)", r"\1 (\2)", text)  # links
    return text.strip()


def _configured() -> bool:
    return not settings.demo_mode and bool(settings.agentmail_api_key) and bool(settings.agentmail_inbox_id)


async def reply_to_email(message_id: str, text: str, cc: list[str] | None = None) -> str | None:
    if not _configured():
        return None
    client = AgentMail(api_key=settings.agentmail_api_key)
    kwargs: dict = {
        "inbox_id": settings.agentmail_inbox_id,
        "message_id": message_id,
        "text": _to_plain(text),
        "html": _to_html(text),
    }
    if cc:
        kwargs["cc"] = cc
    reply = await asyncio.to_thread(lambda: client.inboxes.messages.reply(**kwargs))
    return getattr(reply, "message_id", None)


async def send_email(to: str, subject: str, text: str) -> str | None:
    if not _configured():
        return None
    client = AgentMail(api_key=settings.agentmail_api_key)
    sent = await asyncio.to_thread(
        lambda: client.inboxes.messages.send(
            inbox_id=settings.agentmail_inbox_id,
            to=[to],
            subject=subject,
            text=_to_plain(text),
            html=_to_html(text),
        )
    )
    return getattr(sent, "message_id", None)
