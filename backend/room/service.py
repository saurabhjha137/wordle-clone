"""Room domain — business logic only, no HTTP concerns."""
from __future__ import annotations

from datetime import timezone

from sqlalchemy.orm import Session

from models import GameResult, Room, RoomParticipant, User, UserStats
from game.service import _get_or_create_stats, _get_or_create_stats_by_length, _update_streak
from game.words import cipher_word, get_random_word


# ── Room creation ─────────────────────────────────────────────────────────

def create_room(
    *,
    db         : Session,
    admin      : User,
    name       : str,
    word_length: int,
    time_limit : int,
    max_players: int,
) -> Room:
    """Create a room. Backend picks the word; it is stored ciphered."""
    word = get_random_word(word_length)
    room = Room(
        name        = name,
        created_by  = admin.id,
        word_length = word_length,
        time_limit  = time_limit,
        cipher_word = cipher_word(word),
        max_players = max_players,
        status      = "waiting",
    )
    db.add(room)
    db.commit()
    db.refresh(room)
    return room


# ── Listing ───────────────────────────────────────────────────────────────

def list_rooms(db: Session) -> list[Room]:
    return (
        db.query(Room)
        .filter(Room.status.in_(["waiting", "active"]))
        .order_by(Room.created_at.desc())
        .all()
    )


def get_room_or_404(db: Session, room_id: str) -> Room:
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Room not found.")
    return room


# ── Participation ─────────────────────────────────────────────────────────

def join_room(*, db: Session, room: Room, user: User) -> RoomParticipant:
    from fastapi import HTTPException
    from datetime import datetime, timezone

    if room.status == "finished":
        raise HTTPException(400, "Room is already finished.")
    if len(room.participants) >= room.max_players:
        raise HTTPException(400, "Room is full.")

    existing = _find_participant(db, room.id, user.id)
    if existing:
        return existing  # idempotent

    participant = RoomParticipant(
        room_id   = room.id,
        user_id   = user.id,
        status    = "joined",
        joined_at = datetime.now(timezone.utc),
    )
    db.add(participant)
    db.commit()
    db.refresh(participant)
    return participant


def start_room(*, db: Session, room: Room) -> Room:
    from fastapi import HTTPException
    if room.status != "waiting":
        raise HTTPException(400, f"Cannot start a room in '{room.status}' status.")
    if not room.participants:
        raise HTTPException(400, "Add at least one participant before starting.")
    room.status = "active"
    db.commit()
    db.refresh(room)
    return room


# ── Result submission ─────────────────────────────────────────────────────

def submit_room_result(
    *,
    db        : Session,
    room      : Room,
    user      : User,
    guesses   : int,
    won       : bool,
    time_taken: int,
) -> Room:
    from fastapi import HTTPException

    if room.status != "active":
        raise HTTPException(400, "Room is not active.")

    participant = _find_participant(db, room.id, user.id)
    if not participant:
        raise HTTPException(403, "You are not a participant in this room.")
    if participant.status in ("won", "lost"):
        raise HTTPException(400, "You have already submitted a result for this room.")

    # Persist game result
    game_result = GameResult(
        user_id     = user.id,
        word_length = room.word_length,
        target_word = room.cipher_word,
        guesses     = guesses,
        won         = won,
        time_taken  = time_taken,
        room_id     = room.id,
    )
    db.add(game_result)

    # Update participant status
    participant.status = "won" if won else "lost"

    # Update global stats
    stats = _get_or_create_stats(db, user.id)
    stats.played += 1
    if won:
        stats.won += 1
    _update_streak(stats, won)

    # Update per-length stats
    by_len = _get_or_create_stats_by_length(db, user.id, room.word_length)
    by_len.played += 1
    if won:
        by_len.won += 1
        if by_len.best_time is None or time_taken < by_len.best_time:
            by_len.best_time = time_taken
    _update_streak(by_len, won)

    # Auto-finish room when everyone has submitted
    all_done = all(p.status in ("won", "lost") for p in room.participants)
    if all_done:
        room.status = "finished"

    db.commit()
    db.refresh(room)
    return room


# ── Helpers ───────────────────────────────────────────────────────────────

def _find_participant(db: Session, room_id: str, user_id: int) -> RoomParticipant | None:
    return (
        db.query(RoomParticipant)
        .filter(RoomParticipant.room_id == room_id, RoomParticipant.user_id == user_id)
        .first()
    )
