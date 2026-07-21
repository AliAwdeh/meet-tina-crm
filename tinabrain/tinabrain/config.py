from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[1] / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    tinabrain_host: str = Field(default="0.0.0.0", alias="TINABRAIN_HOST")
    tinabrain_port: int = Field(default=8010, alias="TINABRAIN_PORT")
    tinabrain_env: str = Field(default="development", alias="TINABRAIN_ENV")

    cpm_api_base_url: str = Field(default="http://localhost:3001/api/v1", alias="CPM_API_BASE_URL")
    cpm_api_key: str = Field(default="change-me", alias="CPM_API_KEY")
    cpm_callback_secret: str = Field(default="change-me", alias="CPM_CALLBACK_SECRET")
    tinabrain_inbound_api_key: str = Field(default="", alias="TINABRAIN_INBOUND_API_KEY")

    openai_api_key: str = Field(default="change-me", alias="OPENAI_API_KEY")
    tinabrain_model: str = Field(default="gpt-4.1-mini", alias="TINABRAIN_MODEL")
    tinabrain_temperature: float = Field(default=0.2, alias="TINABRAIN_TEMPERATURE")
    tinabrain_max_tool_rounds: int = Field(default=4, alias="TINABRAIN_MAX_TOOL_ROUNDS")
    tinabrain_auto_callback: bool = Field(default=True, alias="TINABRAIN_AUTO_CALLBACK")

    tinabrain_n8n_mode: str = Field(default="off", alias="TINABRAIN_N8N_MODE")
    tinabrain_n8n_webhook_url: str = Field(default="", alias="TINABRAIN_N8N_WEBHOOK_URL")
    tinabrain_n8n_api_key: str = Field(default="", alias="TINABRAIN_N8N_API_KEY")
    tinabrain_n8n_timeout_seconds: int = Field(default=60, alias="TINABRAIN_N8N_TIMEOUT_SECONDS")

    @property
    def cpm_base_url(self) -> str:
        return self.cpm_api_base_url.rstrip("/")

    @property
    def n8n_mode(self) -> str:
        mode = self.tinabrain_n8n_mode.strip().lower()
        return mode if mode in {"off", "always", "tool"} else "off"


@lru_cache
def get_settings() -> Settings:
    return Settings()
