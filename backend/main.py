"""Wordleee FastAPI application entry point.

Startup sequence
----------------
1. Create all SQLAlchemy tables (SQLite for dev, swap DATABASE_URL for prod).
2. Mount CORS — only allows the Vite dev origins; the admin endpoint is
   intentionally left out of cross-origin access.
3. Register all domain routers with their prefixes.
"""
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from database import Base, engine
from admin.router       import router as admin_router
from auth.router        import router as auth_router
from game.router        import router as game_router
from leaderboard.router import router as leaderboard_router
from room.router        import router as room_router

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title       = "Wordleee API",
    description = "Backend for Wordleee Elite — auth, game, rooms, leaderboard.",
    version     = "1.0.0",
)

_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
]
# CORS_ORIGIN env var lets the deploy script inject the production frontend URL
# e.g. https://wordleclonesaurabhjha137.z13.web.core.windows.net
if _extra := os.getenv("CORS_ORIGIN"):
    _CORS_ORIGINS.append(_extra.rstrip("/"))

app.add_middleware(
    CORSMiddleware,
    allow_origins     = _CORS_ORIGINS,
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)


@app.exception_handler(ValidationError)
async def pydantic_validation_handler(request: Request, exc: ValidationError):
    errors = {e["loc"][-1]: e["msg"] for e in exc.errors()}
    return JSONResponse(status_code=422, content={"errors": errors})


# Register routers
app.include_router(auth_router)
app.include_router(game_router)
app.include_router(room_router)
app.include_router(leaderboard_router)
app.include_router(admin_router)


@app.get("/api/health", tags=["health"])
def health():
    return {"status": "ok", "version": app.version}
