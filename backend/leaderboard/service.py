"""Leaderboard domain — business logic only."""
from __future__ import annotations

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from models import User, UserStats, UserStatsByLength


def _fmt(stats_row) -> dict:
    """Shared dict builder for both stats table types."""
    played = stats_row.played or 0
    won    = stats_row.won    or 0
    win_pct = round((won / played) * 100) if played else 0
    return {
        "played"    : played,
        "won"       : won,
        "win_pct"   : win_pct,
        "streak"    : stats_row.streak    or 0,
        "max_streak": stats_row.max_streak or 0,
        "best_time" : getattr(stats_row, "best_time", None),
    }


def _sort_expr(model, sort_by: str):
    """Return an ORDER BY expression for the given sort key."""
    if sort_by == "win_pct":
        return (
            case(
                (model.played > 0, model.won * 100 / model.played),
                else_=0,
            ).desc()
        )
    if sort_by == "best_time":
        if not hasattr(model, "best_time"):
            return model.won.desc()  # best_time only exists on per-length table
        return func.coalesce(model.best_time, 999999).asc()
    if sort_by == "played":
        return model.played.desc()
    if sort_by == "streak":
        return model.max_streak.desc()
    # default: wins
    return model.won.desc()


def get_leaderboard(
    db         : Session,
    limit      : int  = 10,
    word_length: int | None = None,
    sort_by    : str  = "wins",
) -> list[dict]:
    if word_length is not None:
        order = _sort_expr(UserStatsByLength, sort_by)
        rows = (
            db.query(User, UserStatsByLength)
            .join(UserStatsByLength, User.id == UserStatsByLength.user_id)
            .filter(UserStatsByLength.word_length == word_length)
            .order_by(order)
            .limit(limit)
            .all()
        )
    else:
        order = _sort_expr(UserStats, sort_by)
        rows = (
            db.query(User, UserStats)
            .join(UserStats, User.id == UserStats.user_id)
            .order_by(order)
            .limit(limit)
            .all()
        )

    result = []
    for rank, (user, stats) in enumerate(rows, start=1):
        result.append({"rank": rank, "username": user.username, **_fmt(stats)})
    return result


def get_user_stats(db: Session, username: str, word_length: int | None = None) -> dict | None:
    user = db.query(User).filter(User.username == username).first()
    if not user:
        return None

    if word_length is not None:
        stats = db.query(UserStatsByLength).filter(
            UserStatsByLength.user_id == user.id,
            UserStatsByLength.word_length == word_length,
        ).first()
        if not stats:
            return {"username": username, "played": 0, "won": 0, "win_pct": 0,
                    "streak": 0, "max_streak": 0, "best_time": None}
        return {"username": username, **_fmt(stats)}

    stats = db.query(UserStats).filter(UserStats.user_id == user.id).first()
    if not stats:
        return {"username": username, "played": 0, "won": 0, "win_pct": 0,
                "streak": 0, "max_streak": 0, "best_time": None}
    return {"username": username, **_fmt(stats)}
