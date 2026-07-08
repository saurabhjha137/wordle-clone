"""Game domain — business logic only, no HTTP concerns."""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from azure.cosmos.exceptions import CosmosResourceNotFoundError

from database import get_container
from models import User
from game.words import cipher_word, get_daily_word, get_random_word


class DuplicateDailyError(Exception):
    pass


ACHIEVEMENT_DEFS: dict[str, dict] = {
    "first_win": {
        "code": "first_win",
        "name": "First Win",
        "description": "Win your first ranked game.",
    },
    "win_streak_3": {
        "code": "win_streak_3",
        "name": "Hat Trick",
        "description": "Win 3 ranked games in a row.",
    },
    "speed_solver": {
        "code": "speed_solver",
        "name": "Speed Solver",
        "description": "Win a ranked game in under 30 seconds.",
    },
    "perfect_game": {
        "code": "perfect_game",
        "name": "Perfect Game",
        "description": "Win a ranked game on the first guess.",
    },
    "seven_letter_master": {
        "code": "seven_letter_master",
        "name": "7-Letter Master",
        "description": "Win a ranked 7-letter game.",
    },
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Word delivery ─────────────────────────────────────────────────────────

def get_ciphered_word(length: int) -> str:
    return cipher_word(get_random_word(length))


# ── Stat helpers ──────────────────────────────────────────────────────────

def _get_or_create_stats(username: str) -> dict:
    c = get_container("user_stats")
    try:
        return c.read_item(item=username, partition_key=username)
    except CosmosResourceNotFoundError:
        doc = {"id": username, "username": username,
               "played": 0, "won": 0, "streak": 0, "max_streak": 0, "last_won": None}
        c.create_item(doc)
        return doc


def _get_or_create_stats_by_length(username: str, word_length: int) -> dict:
    c = get_container("user_stats_by_length")
    item_id = f"{username}_{word_length}"
    try:
        return c.read_item(item=item_id, partition_key=username)
    except CosmosResourceNotFoundError:
        doc = {"id": item_id, "username": username, "word_length": word_length,
               "played": 0, "won": 0, "best_time": None,
               "streak": 0, "max_streak": 0, "last_won": None}
        c.create_item(doc)
        return doc


def _update_streak(stats: dict, won: bool) -> None:
    today = date.today().isoformat()
    last_won = stats.get("last_won")
    if won:
        if last_won is None:
            stats["streak"] = 1
        elif last_won == today:
            pass  # already won today — preserve streak
        else:
            try:
                delta = (date.today() - date.fromisoformat(last_won)).days
                stats["streak"] = (stats.get("streak") or 0) + 1 if delta == 1 else 1
            except ValueError:
                stats["streak"] = 1
        stats["max_streak"] = max(stats.get("max_streak") or 0, stats.get("streak") or 0)
        stats["last_won"]   = today
    else:
        stats["streak"] = 0


# ── Achievements ──────────────────────────────────────────────────────────

def _has_achievement(username: str, code: str) -> bool:
    try:
        get_container("user_achievements").read_item(
            item=f"{username}_{code}", partition_key=username
        )
        return True
    except CosmosResourceNotFoundError:
        return False


def _unlock_achievement(username: str, code: str) -> dict:
    defn = ACHIEVEMENT_DEFS[code]
    doc = {
        "id":          f"{username}_{code}",
        "username":    username,
        "code":        code,
        "name":        defn["name"],
        "description": defn["description"],
        "unlocked_at": _now(),
    }
    get_container("user_achievements").create_item(doc)
    return {"code": code, "name": defn["name"], "description": defn["description"]}


def _check_and_award_achievements(
    username: str,
    won: bool,
    guesses: int,
    time_taken: int,
    word_length: int,
    stats: dict,
) -> list[dict]:
    if not won:
        return []
    newly: list[dict] = []
    checks = [
        ("first_win",           True),
        ("speed_solver",        time_taken < 30),
        ("perfect_game",        guesses == 1),
        ("seven_letter_master", word_length == 7),
        ("win_streak_3",        (stats.get("streak") or 0) >= 3),
    ]
    for code, condition in checks:
        if condition and not _has_achievement(username, code):
            try:
                newly.append(_unlock_achievement(username, code))
            except Exception:
                pass  # don't fail the submit if achievement write fails
    return newly


# ── Daily challenge ───────────────────────────────────────────────────────

def get_daily_challenge(username: str, word_length: int) -> dict:
    today = date.today().isoformat()
    word  = get_daily_word(word_length)
    item_id = f"{username}_{today}_{word_length}"
    already_played = False
    try:
        get_container("daily_submissions").read_item(item=item_id, partition_key=username)
        already_played = True
    except CosmosResourceNotFoundError:
        pass
    return {
        "date":           today,
        "word_length":    word_length,
        "cipher":         cipher_word(word),
        "already_played": already_played,
    }


def _record_daily_submission(username: str, today: str, word_length: int, result_id: str) -> None:
    get_container("daily_submissions").create_item({
        "id":             f"{username}_{today}_{word_length}",
        "username":       username,
        "date":           today,
        "word_length":    word_length,
        "game_result_id": result_id,
    })


# ── Submit result ─────────────────────────────────────────────────────────

def submit_game(
    *,
    user        : User,
    word_length : int,
    guesses     : int,
    won         : bool,
    time_taken  : int,
    room_id     : str | None,
    mode        : str = "ranked",
    is_daily    : bool = False,
    daily_date  : str | None = None,
) -> dict:
    ranked = mode == "ranked"
    today  = date.today().isoformat()
    date_for_daily = daily_date or today

    # Prevent duplicate ranked daily submissions
    if is_daily and ranked:
        item_id = f"{user.username}_{date_for_daily}_{word_length}"
        try:
            get_container("daily_submissions").read_item(item=item_id, partition_key=user.username)
            raise DuplicateDailyError(
                f"Already submitted today's {word_length}-letter daily challenge."
            )
        except CosmosResourceNotFoundError:
            pass  # expected — not yet submitted

    # Persist game record
    result_id = str(uuid.uuid4())
    get_container("game_results").create_item({
        "id":          result_id,
        "username":    user.username,
        "word_length": word_length,
        "guesses":     guesses,
        "won":         won,
        "time_taken":  time_taken,
        "room_id":     room_id,
        "mode":        mode,
        "is_daily":    is_daily,
        "daily_date":  date_for_daily if is_daily else None,
        "played_at":   _now(),
    })

    # Keep room participant status in sync when game was played via a room
    if room_id:
        try:
            from room.service import update_room_participant_from_game
            update_room_participant_from_game(
                room_id    = room_id,
                username   = user.username,
                won        = won,
                guesses    = guesses,
                time_taken = time_taken,
            )
        except Exception:
            pass  # room state update must never fail the game submit

    # Mark daily submission
    if is_daily and ranked:
        try:
            _record_daily_submission(user.username, date_for_daily, word_length, result_id)
        except Exception:
            pass

    # Practice games don't count toward leaderboard
    if not ranked:
        return {"played": 0, "won": 0, "streak": 0, "ranked": False, "new_achievements": []}

    # Update global stats
    stats = _get_or_create_stats(user.username)
    stats["played"] = (stats.get("played") or 0) + 1
    if won:
        stats["won"] = (stats.get("won") or 0) + 1
    _update_streak(stats, won)
    get_container("user_stats").upsert_item(stats)

    # Update per-length stats
    by_len = _get_or_create_stats_by_length(user.username, word_length)
    by_len["played"] = (by_len.get("played") or 0) + 1
    if won:
        by_len["won"] = (by_len.get("won") or 0) + 1
        bt = by_len.get("best_time")
        if bt is None or time_taken < bt:
            by_len["best_time"] = time_taken
    _update_streak(by_len, won)
    get_container("user_stats_by_length").upsert_item(by_len)

    # Award achievements
    new_achievements = _check_and_award_achievements(
        user.username, won, guesses, time_taken, word_length, stats
    )

    return {
        "played":           stats.get("played", 0),
        "won":              stats.get("won", 0),
        "streak":           stats.get("streak", 0),
        "ranked":           True,
        "new_achievements": new_achievements,
    }


# ── Game history ──────────────────────────────────────────────────────────

def get_game_history(username: str, limit: int = 20) -> list[dict]:
    results = list(get_container("game_results").query_items(
        query=f"SELECT TOP {limit} * FROM c ORDER BY c.played_at DESC",
        partition_key=username,
    ))
    return [
        {
            "id":          r["id"],
            "played_at":   r["played_at"],
            "word_length": r["word_length"],
            "won":         r["won"],
            "guesses":     r["guesses"],
            "time_taken":  r["time_taken"],
            "mode":        r.get("mode", "ranked"),
            "is_daily":    r.get("is_daily", False),
            "room_id":     r.get("room_id"),
        }
        for r in results
    ]


# ── User achievements ─────────────────────────────────────────────────────

def get_user_achievements(username: str) -> list[dict]:
    docs = list(get_container("user_achievements").query_items(
        query="SELECT * FROM c ORDER BY c.unlocked_at ASC",
        partition_key=username,
    ))
    return [
        {
            "code":        d["code"],
            "name":        d["name"],
            "description": d["description"],
            "unlocked_at": d["unlocked_at"],
        }
        for d in docs
    ]
