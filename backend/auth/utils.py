from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from config import settings


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def _make_token(payload: dict, expires_delta: timedelta) -> str:
    data = payload.copy()
    data["exp"] = datetime.now(timezone.utc) + expires_delta
    return jwt.encode(data, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def make_access_token(username: str, token_version: int = 0) -> str:
    return _make_token(
        {"sub": username, "type": "access", "tv": token_version},
        timedelta(hours=settings.ACCESS_TOKEN_EXPIRE_HOURS),
    )


def make_reset_token(username: str) -> str:
    return _make_token(
        {"sub": username, "type": "reset"},
        timedelta(minutes=settings.RESET_TOKEN_EXPIRE_MINUTES),
    )


def decode_token(token: str, expected_type: str) -> str:
    """Decode a JWT and return the username, or raise jwt.InvalidTokenError."""
    payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    if payload.get("type") != expected_type:
        raise jwt.InvalidTokenError("Wrong token type.")
    return payload["sub"]


def decode_access_token(token: str) -> tuple[str, int]:
    """Decode an access token, return (username, token_version)."""
    payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    if payload.get("type") != "access":
        raise jwt.InvalidTokenError("Wrong token type.")
    return payload["sub"], payload.get("tv", 0)
