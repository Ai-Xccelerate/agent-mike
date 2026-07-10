from pathlib import Path

from sqlalchemy import select

from app.config import settings
from app.database import SessionLocal
from app.models import AgentProfile
from app.services.knowledge import ingest_okf


async def seed_database() -> None:
    async with SessionLocal() as db:
        if not await db.scalar(select(AgentProfile).limit(1)):
            db.add(AgentProfile())
            await db.commit()
        bundle_path = Path(settings.knowledge_path)
        if bundle_path.exists():
            for path in sorted(bundle_path.rglob("*.md")):
                if path.name in {"index.md", "log.md"}:
                    continue
                concept_id = path.relative_to(bundle_path).with_suffix("").as_posix()
                await ingest_okf(
                    db,
                    path.read_text(encoding="utf-8"),
                    concept_id,
                    source_path=str(path),
                )
