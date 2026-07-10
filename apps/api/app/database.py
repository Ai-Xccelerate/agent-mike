from collections.abc import AsyncIterator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

TICKET_START = 1000


class Base(DeclarativeBase):
    pass


engine = create_async_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session


async def _ensure_ticket_numbers(connection) -> None:
    """Additive migration (no Alembic): add conversations.ticket_number if missing
    and backfill existing rows sequentially by creation order."""
    dialect = connection.dialect.name
    if dialect == "postgresql":
        await connection.execute(
            text("ALTER TABLE conversations ADD COLUMN IF NOT EXISTS ticket_number INTEGER")
        )
    else:
        cols = (await connection.execute(text("PRAGMA table_info(conversations)"))).fetchall()
        if "ticket_number" not in {row[1] for row in cols}:
            await connection.execute(text("ALTER TABLE conversations ADD COLUMN ticket_number INTEGER"))

    missing = (
        await connection.execute(
            text("SELECT id FROM conversations WHERE ticket_number IS NULL ORDER BY created_at")
        )
    ).fetchall()
    if not missing:
        return
    current = (
        await connection.execute(text("SELECT COALESCE(MAX(ticket_number), :start) FROM conversations"), {"start": TICKET_START})
    ).scalar() or TICKET_START
    for (conversation_id,) in missing:
        current += 1
        await connection.execute(
            text("UPDATE conversations SET ticket_number = :n WHERE id = :id"),
            {"n": current, "id": conversation_id},
        )


async def create_schema() -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
        await _ensure_ticket_numbers(connection)

