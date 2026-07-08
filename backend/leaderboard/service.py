"""Leaderboard domain — business logic only."""
from __future__ import annotations

from azure.cosmos.exceptions import CosmosResourceNotFoundError

from database import get_container


def _fmt(stats: dict) -> dict:
    played  = stats.get("played") or 0
    won     = stats.get("won") or 0
    win_pct = round((won / played) * 100) if played else 0
    return {
        "played":     played,
        "won":        won,
        "win_pct":    win_pct,
        "streak":     stats.get("streak") or 0,
        "max_streak": stats.get("max_streak") or 0,
        "best_time":  stats.get("best_time"),
    }


def _sort_key(sort_by: str):
    def key(r: dict):
        played = r.get("played") or 0
        won    = r.get("won") or 0
        if sort_by == "win_pct":
            return -(won * 100 // played) if played else 0
        if sort_by == "best_time":
            return r.get("best_time") or 999_999
        if sort_by == "played":
            return -played
        if sort_by == "streak":
            return -(r.get("max_streak") or 0)
        return -won  # default: wins
    return key


def get_leaderboard(
    limit      : int       = 10,
    word_length: int | None = None,
    sort_by    : str       = "wins",
) -> list[dict]:
    if word_length is not None:
        rows = list(get_container("user_stats_by_length").query_items(
            query="SELECT * FROM c WHERE c.word_length = @wl",
            parameters=[{"name": "@wl", "value": word_length}],
            enable_cross_partition_query=True,
        ))
    else:
        rows = list(get_container("user_stats").query_items(
            query="SELECT * FROM c",
            enable_cross_partition_query=True,
        ))

    rows.sort(key=_sort_key(sort_by))
    return [
        {"rank": rank, "username": r.get("username", ""), **_fmt(r)}
        for rank, r in enumerate(rows[:limit], start=1)
    ]


def get_user_stats(username: str, word_length: int | None = None) -> dict | None:
    empty = {"username": username, "played": 0, "won": 0, "win_pct": 0,
             "streak": 0, "max_streak": 0, "best_time": None}

    if word_length is not None:
        try:
            stats = get_container("user_stats_by_length").read_item(
                item=f"{username}_{word_length}", partition_key=username
            )
            return {"username": username, **_fmt(stats)}
        except CosmosResourceNotFoundError:
            return empty
    else:
        try:
            stats = get_container("user_stats").read_item(
                item=username, partition_key=username
            )
            return {"username": username, **_fmt(stats)}
        except CosmosResourceNotFoundError:
            return empty
