from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    JWT_SECRET: str                           # required — no default; app refuses to start without it
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_HOURS: int = 720      # 30 days
    RESET_TOKEN_EXPIRE_MINUTES: int = 15
    ROOT_USER: str = "admin"

    @field_validator("JWT_SECRET")
    @classmethod
    def jwt_secret_strength(cls, v: str) -> str:
        if len(v.encode()) < 32:
            raise ValueError(
                "JWT_SECRET must be at least 32 bytes. "
                "Set it in backend/.env — see .env.example."
            )
        return v


settings = Settings()
