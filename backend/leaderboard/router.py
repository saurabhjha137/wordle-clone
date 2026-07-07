from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user
from models import User
from schemas import LeaderboardResponse, UserStatsResponse
from leaderboard import service

# User/get_current_user still used by /me and /{username} endpoints

router = APIRouter(prefix="/api/leaderboard", tags=["leaderboard"])

VALID_SORT = {"wins", "win_pct", "best_time", "played", "streak"}


@router.get(
    "",
    response_model=LeaderboardResponse,
    summary="Leaderboard with optional word-length filter and sort (public)",
)
def get_leaderboard(
    limit      : int          = Query(default=10, ge=1, le=50),
    word_length: int | None   = Query(default=None, ge=3, le=7),
    sort_by    : str          = Query(default="wins"),
    db         : Session      = Depends(get_db),
):
    if sort_by not in VALID_SORT:
        from fastapi import HTTPException as _HTTPException
        raise _HTTPException(400, detail=f"sort_by must be one of: {', '.join(sorted(VALID_SORT))}")
    entries = service.get_leaderboard(db, limit=limit, word_length=word_length, sort_by=sort_by)
    return {"total": len(entries), "entries": entries}


@router.get(
    "/me",
    response_model=UserStatsResponse,
    summary="Your own stats",
)
def get_my_stats(
    word_length: int | None = Query(default=None, ge=3, le=7),
    db         : Session    = Depends(get_db),
    user       : User       = Depends(get_current_user),
):
    stats = service.get_user_stats(db, user.username, word_length=word_length)
    if not stats:
        return {
            "username": user.username,
            "played": 0, "won": 0, "win_pct": 0,
            "streak": 0, "max_streak": 0, "best_time": None,
        }
    return stats


@router.get(
    "/{username}",
    response_model=UserStatsResponse,
    summary="Stats for any player",
)
def get_user_stats(
    username   : str,
    word_length: int | None = Query(default=None, ge=3, le=7),
    db         : Session    = Depends(get_db),
    _          : User       = Depends(get_current_user),
):
    stats = service.get_user_stats(db, username, word_length=word_length)
    if not stats:
        raise HTTPException(status_code=404, detail=f"No stats found for '{username}'.")
    return stats
