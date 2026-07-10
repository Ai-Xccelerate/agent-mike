from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Agent Mike API"
    api_prefix: str = "/api/v1"
    database_url: str = "sqlite+aiosqlite:///./mike.db"
    anthropic_api_key: str | None = None
    claude_model: str = "claude-sonnet-4-5"
    agentmail_api_key: str | None = None
    agentmail_inbox_id: str | None = None
    agentmail_webhook_secret: str | None = None
    cors_origins: list[str] | str = ["http://localhost:3000"]
    knowledge_path: str = "../../knowledge"
    demo_mode: bool = True

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @field_validator("database_url")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        if value.startswith("postgres://"):
            return value.replace("postgres://", "postgresql+asyncpg://", 1)
        if value.startswith("postgresql://"):
            return value.replace("postgresql://", "postgresql+asyncpg://", 1)
        return value

    @field_validator("cors_origins")
    @classmethod
    def split_origins(cls, value: list[str] | str) -> list[str]:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
