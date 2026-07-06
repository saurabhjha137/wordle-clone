"""Game domain — business logic only, no HTTP concerns."""
from __future__ import annotations

from datetime import date, timezone

from sqlalchemy.orm import Session

from models import GameResult, Room, RoomParticipant, User, UserStats, UserStatsByLength
from game.words import cipher_word, get_random_word


# ── Word delivery ─────────────────────────────────────────────────────────

def get_ciphered_word(length: int) -> str:
    """Pick a random word and return it XOR-ciphered. Plaintext never leaves this function."""
    return cipher_word(get_random_word(length))


# ── Stat helpers ──────────────────────────────────────────────────────────

def _get_or_create_stats_by_length(db: Session, user_id: int, word_length: int) -> UserStatsByLength:
    stats = db.query(UserStatsByLength).filter(
        UserStatsByLength.user_id == user_id,
        UserStatsByLength.word_length == word_length,
    ).first()
    if not stats:
        stats = UserStatsByLength(user_id=user_id, word_length=word_length, played=0, won=0, streak=0, max_streak=0)
        db.add(stats)
        db.flush()
    return stats


def _get_or_create_stats(db: Session, user_id: int) -> UserStats:
    stats = db.query(UserStats).filter(UserStats.user_id == user_id).first()
    if not stats:
        stats = UserStats(user_id=user_id, played=0, won=0, streak=0, max_streak=0)
        db.add(stats)
        db.flush()  # write defaults to DB so column values are integers, not None
    return stats


def _update_streak(stats: UserStats, won: bool) -> None:
    today = date.today()
    if won:
        if stats.last_won is None:
            stats.streak = 1
        elif stats.last_won == today:
            pass  # already won today, preserve streak
        elif (today - stats.last_won).days == 1:
            stats.streak += 1  # consecutive day
        else:
            stats.streak = 1   # gap — restart streak
        stats.max_streak = max(stats.max_streak, stats.streak)
        stats.last_won = today
    else:
        stats.streak = 0


# ── Submit result ─────────────────────────────────────────────────────────

def submit_game(
    *,
    db         : Session,
    user       : User,
    word_length: int,
    guesses    : int,
    won        : bool,
    time_taken : int,
    room_id    : str | None,
) -> UserStats:
    """
    Persist a GameResult and update UserStats atomically.
    Returns the updated UserStats so the caller can build a response.
    """
    # Persist the individual game record (target word stored ciphered)
    result = GameResult(
        user_id     = user.id,
        word_length = word_length,
        target_word = cipher_word(get_random_word(word_length)),  # cipher only — plaintext discarded
        guesses     = guesses,
        won         = won,
        time_taken  = time_taken,
        room_id     = room_id,
    )
    db.add(result)

    # Update global aggregate stats
    stats = _get_or_create_stats(db, user.id)
    stats.played += 1
    if won:
        stats.won += 1
    _update_streak(stats, won)

    # Update per-word-length stats (includes best winning time)
    by_len = _get_or_create_stats_by_length(db, user.id, word_length)
    by_len.played += 1
    if won:
        by_len.won += 1
        if by_len.best_time is None or time_taken < by_len.best_time:
            by_len.best_time = time_taken
    _update_streak(by_len, won)

    db.commit()
    db.refresh(stats)
    return stats
