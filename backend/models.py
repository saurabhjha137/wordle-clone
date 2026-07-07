"""SQLAlchemy ORM models.

Tables
------
users               — auth credentials + security answers
auth_activity       — audit log for every auth action
user_stats          — aggregate game stats per player (1 row per user)
game_results        — one row per completed game (solo or room)
rooms               — multiplayer rooms (admin-created)
room_participants   — players assigned to a room
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── Auth ──────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id            : Mapped[int]        = mapped_column(Integer, primary_key=True)
    username      : Mapped[str]        = mapped_column(String(20), unique=True, nullable=False, index=True)
    email         : Mapped[str | None] = mapped_column(String, nullable=True)
    password_hash : Mapped[str]        = mapped_column(String, nullable=False)
    secret_q1     : Mapped[str]        = mapped_column(String, nullable=False)
    secret_a1     : Mapped[str]        = mapped_column(String, nullable=False)
    secret_q2     : Mapped[str]        = mapped_column(String, nullable=False)
    secret_a2     : Mapped[str]        = mapped_column(String, nullable=False)
    is_admin      : Mapped[bool]       = mapped_column(Boolean, default=False, nullable=False, server_default='0')
    created_at    : Mapped[datetime]   = mapped_column(DateTime(timezone=True), default=_now)
    updated_at    : Mapped[datetime]   = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    activity        : Mapped[list[AuthActivity]]        = relationship(back_populates="user", cascade="all, delete-orphan")
    stats           : Mapped[UserStats | None]           = relationship(back_populates="user", uselist=False, cascade="all, delete-orphan")
    stats_by_length : Mapped[list[UserStatsByLength]]    = relationship(back_populates="user", cascade="all, delete-orphan")
    game_results    : Mapped[list[GameResult]]           = relationship(back_populates="user", cascade="all, delete-orphan")
    rooms_created   : Mapped[list[Room]]                 = relationship(back_populates="created_by_user")
    participations  : Mapped[list[RoomParticipant]]      = relationship(back_populates="user", cascade="all, delete-orphan")


class AuthActivity(Base):
    __tablename__ = "auth_activity"

    id         : Mapped[int]        = mapped_column(Integer, primary_key=True)
    user_id    : Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    action     : Mapped[str]        = mapped_column(String, nullable=False)
    ip_address : Mapped[str | None] = mapped_column(String, nullable=True)
    success    : Mapped[bool]       = mapped_column(Boolean, nullable=False)
    detail     : Mapped[str | None] = mapped_column(String, nullable=True)
    timestamp  : Mapped[datetime]   = mapped_column(DateTime(timezone=True), default=_now)

    user: Mapped[User | None] = relationship(back_populates="activity")


# ── Game stats ────────────────────────────────────────────────────────────

class UserStats(Base):
    """One row per user — global aggregate across all word lengths."""
    __tablename__ = "user_stats"

    user_id    : Mapped[int]            = mapped_column(Integer, ForeignKey("users.id"), primary_key=True)
    played     : Mapped[int]            = mapped_column(Integer, default=0, nullable=False)
    won        : Mapped[int]            = mapped_column(Integer, default=0, nullable=False)
    streak     : Mapped[int]            = mapped_column(Integer, default=0, nullable=False)
    max_streak : Mapped[int]            = mapped_column(Integer, default=0, nullable=False)
    last_won   : Mapped[date | None]    = mapped_column(Date, nullable=True)

    user: Mapped[User] = relationship(back_populates="stats")


class UserStatsByLength(Base):
    """One row per (user, word_length) pair — per-mode stats including best winning time."""
    __tablename__ = "user_stats_by_length"

    user_id     : Mapped[int]         = mapped_column(Integer, ForeignKey("users.id"), primary_key=True)
    word_length : Mapped[int]         = mapped_column(Integer, primary_key=True)
    played      : Mapped[int]         = mapped_column(Integer, default=0, nullable=False)
    won         : Mapped[int]         = mapped_column(Integer, default=0, nullable=False)
    best_time   : Mapped[int | None]  = mapped_column(Integer, nullable=True)  # best WIN time in seconds
    streak      : Mapped[int]         = mapped_column(Integer, default=0, nullable=False)
    max_streak  : Mapped[int]         = mapped_column(Integer, default=0, nullable=False)
    last_won    : Mapped[date | None] = mapped_column(Date, nullable=True)

    user: Mapped[User] = relationship(back_populates="stats_by_length")


class GameResult(Base):
    """One row per completed game attempt (solo or room)."""
    __tablename__ = "game_results"

    id          : Mapped[int]        = mapped_column(Integer, primary_key=True)
    user_id     : Mapped[int]        = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    word_length : Mapped[int]        = mapped_column(Integer, nullable=False)
    target_word : Mapped[str]        = mapped_column(String, nullable=False)   # stored as cipher text
    guesses     : Mapped[int]        = mapped_column(Integer, nullable=False)
    won         : Mapped[bool]       = mapped_column(Boolean, nullable=False)
    time_taken  : Mapped[int]        = mapped_column(Integer, nullable=False)  # seconds
    room_id     : Mapped[str | None] = mapped_column(String, ForeignKey("rooms.id"), nullable=True)
    played_at   : Mapped[datetime]   = mapped_column(DateTime(timezone=True), default=_now)

    user: Mapped[User]        = relationship(back_populates="game_results")
    room: Mapped[Room | None] = relationship(back_populates="results")


# ── Rooms ─────────────────────────────────────────────────────────────────

class Room(Base):
    """Multiplayer room. Only admin can create."""
    __tablename__ = "rooms"

    id            : Mapped[str]      = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4())[:8].upper())
    name          : Mapped[str]      = mapped_column(String, nullable=False)
    created_by    : Mapped[int]      = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    word_length   : Mapped[int]      = mapped_column(Integer, nullable=False)
    time_limit    : Mapped[int]      = mapped_column(Integer, nullable=False)  # seconds
    cipher_word   : Mapped[str]      = mapped_column(String, nullable=False)   # XOR-ciphered, never plaintext
    status        : Mapped[str]      = mapped_column(String, default="waiting", nullable=False)
    # status values: waiting | active | finished
    max_players   : Mapped[int]      = mapped_column(Integer, default=10, nullable=False)
    created_at    : Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    created_by_user: Mapped[User]              = relationship(back_populates="rooms_created")
    participants   : Mapped[list[RoomParticipant]] = relationship(back_populates="room", cascade="all, delete-orphan")
    results        : Mapped[list[GameResult]]      = relationship(back_populates="room")


class RoomParticipant(Base):
    __tablename__ = "room_participants"

    id        : Mapped[int]        = mapped_column(Integer, primary_key=True)
    room_id   : Mapped[str]        = mapped_column(String, ForeignKey("rooms.id"), nullable=False)
    user_id   : Mapped[int]        = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    status    : Mapped[str]        = mapped_column(String, default="invited", nullable=False)
    # status values: invited | joined | won | lost
    joined_at : Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    room: Mapped[Room] = relationship(back_populates="participants")
    user: Mapped[User] = relationship(back_populates="participations")
