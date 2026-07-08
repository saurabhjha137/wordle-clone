"""Wordleee FastAPI application entry point."""
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from limiter import limiter

from database import ensure_containers
from admin.router       import router as admin_router
from auth.router        import router as auth_router
from game.router        import router as game_router
from leaderboard.router import router as leaderboard_router
from room.router        import router as room_router
from config import settings

ensure_containers()


def _seed_admin():
    """Ensure the root admin account exists on every cold start."""
    from database import get_container
    from auth.utils import hash_password
    from azure.cosmos.exceptions import CosmosResourceNotFoundError
    from datetime import datetime, timezone

    admin_pw = os.getenv("ADMIN_PASSWORD", "Admin@2025!")
    username = settings.ROOT_USER
    users = get_container("users")
    now = datetime.now(timezone.utc).isoformat()

    try:
        doc = users.read_item(item=username, partition_key=username)
        if not doc.get("is_admin"):
            doc["is_admin"] = True
            doc["updated_at"] = now
            users.upsert_item(doc)
    except CosmosResourceNotFoundError:
        users.create_item({
            "id":           username,
            "username":     username,
            "password_hash": hash_password(admin_pw),
            "email":        None,
            "secret_q1":    "Recovery phrase 1",
            "secret_a1":    hash_password("adminrecovery1"),
            "secret_q2":    "Recovery phrase 2",
            "secret_a2":    hash_password("adminrecovery2"),
            "is_admin":     True,
            "created_at":   now,
            "updated_at":   now,
        })
    except Exception as exc:
        import sys
        print(f"[main] Warning: admin seed failed: {exc}", file=sys.stderr)


_seed_admin()

app = FastAPI(
    title       = "Wordleee API",
    description = "Backend for Wordleee Elite — auth, game, rooms, leaderboard.",
    version     = "1.0.0",
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
]
if _extra := os.getenv("CORS_ORIGIN"):
    _CORS_ORIGINS.append(_extra.rstrip("/"))

app.add_middleware(
    CORSMiddleware,
    allow_origins     = _CORS_ORIGINS,
    allow_credentials = True,
    allow_methods     = ["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers     = ["Authorization", "Content-Type", "Accept"],
)


@app.exception_handler(ValidationError)
async def pydantic_validation_handler(request: Request, exc: ValidationError):
    errors = {e["loc"][-1]: e["msg"] for e in exc.errors()}
    return JSONResponse(status_code=422, content={"errors": errors})


app.include_router(auth_router)
app.include_router(game_router)
app.include_router(room_router)
app.include_router(leaderboard_router)
app.include_router(admin_router)


@app.get("/api/health", tags=["health"])
def health():
    return {"status": "ok", "version": app.version}
