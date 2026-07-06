"""Pydantic request / response schemas.

Grouped by domain: auth, game, room, leaderboard.
"""
from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

_USERNAME_RE = re.compile(r'^[a-zA-Z0-9_]{3,20}$')
_PASSWORD_RE = re.compile(r'^(?=.*[a-zA-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{8,}$')

VALID_TIME_LIMITS = {60, 90, 120, 180, 300}
VALID_WORD_LENGTHS = {3, 4, 5, 6, 7}


# ── Auth ──────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    username  : str
    password  : str
    email     : str | None = None
    secret_q1 : str
    secret_a1 : str
    secret_q2 : str
    secret_a2 : str

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        v = v.strip()
        if not _USERNAME_RE.match(v):
            raise ValueError("Username must be 3–20 chars: letters, numbers, underscores only.")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if not _PASSWORD_RE.match(v):
            raise ValueError("Password must be 8+ chars with at least one letter, one number, and one special character.")
        return v

    @field_validator("secret_q1", "secret_q2")
    @classmethod
    def validate_question(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 5:
            raise ValueError("Security question must be at least 5 characters.")
        return v

    @field_validator("secret_a1", "secret_a2")
    @classmethod
    def validate_answer(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Security answer must be at least 2 characters.")
        return v.lower()

    @model_validator(mode="after")
    def different_questions(self) -> RegisterRequest:
        if self.secret_q1.lower() == self.secret_q2.lower():
            raise ValueError("Both security questions must be different.")
        return self


class LoginRequest(BaseModel):
    username : str
    password : str

    @field_validator("username")
    @classmethod
    def strip_username(cls, v: str) -> str:
        return v.strip()


class ForgotPasswordRequest(BaseModel):
    username  : str
    secret_a1 : str
    secret_a2 : str

    @field_validator("username")
    @classmethod
    def strip_username(cls, v: str) -> str:
        return v.strip()

    @field_validator("secret_a1", "secret_a2")
    @classmethod
    def lowercase_answers(cls, v: str) -> str:
        return v.strip().lower()


class ResetPasswordRequest(BaseModel):
    reset_token  : str
    new_password : str

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if not _PASSWORD_RE.match(v):
            raise ValueError("Password must be 8+ chars with at least one letter, one number, and one special character.")
        return v


class TokenResponse(BaseModel):
    access_token : str
    token_type   : str = "bearer"
    username     : str


class ResetTokenResponse(BaseModel):
    reset_token : str
    message     : str


class MessageResponse(BaseModel):
    message: str


# ── Game ──────────────────────────────────────────────────────────────────

class WordResponse(BaseModel):
    cipher     : str
    word_length: int


class SubmitGameRequest(BaseModel):
    word_length : int  = Field(..., ge=3, le=7)
    guesses     : int  = Field(..., ge=0, le=8)
    won         : bool
    time_taken  : int  = Field(..., ge=0, description="Seconds elapsed")
    room_id     : str | None = None

    @field_validator("word_length")
    @classmethod
    def valid_length(cls, v: int) -> int:
        if v not in VALID_WORD_LENGTHS:
            raise ValueError(f"word_length must be one of {sorted(VALID_WORD_LENGTHS)}.")
        return v


class SubmitGameResponse(BaseModel):
    ok     : bool
    played : int
    won    : int
    streak : int


# ── Room ──────────────────────────────────────────────────────────────────

class CreateRoomRequest(BaseModel):
    name        : str = Field(..., min_length=3, max_length=40)
    word_length : int = Field(..., ge=3, le=7)
    time_limit  : int
    max_players : int = Field(default=10, ge=2, le=20)

    @field_validator("word_length")
    @classmethod
    def valid_length(cls, v: int) -> int:
        if v not in VALID_WORD_LENGTHS:
            raise ValueError(f"word_length must be one of {sorted(VALID_WORD_LENGTHS)}.")
        return v

    @field_validator("time_limit")
    @classmethod
    def valid_time_limit(cls, v: int) -> int:
        if v not in VALID_TIME_LIMITS:
            raise ValueError(f"time_limit must be one of {sorted(VALID_TIME_LIMITS)} seconds.")
        return v


class ParticipantInfo(BaseModel):
    username  : str
    status    : str


class RoomResponse(BaseModel):
    id           : str
    name         : str
    word_length  : int
    time_limit   : int
    status       : str
    max_players  : int
    player_count : int
    created_by   : str
    created_at   : str


class RoomDetailResponse(RoomResponse):
    cipher_word  : str | None        # only returned when room is active and caller is a participant
    participants : list[ParticipantInfo]


class RoomResultRequest(BaseModel):
    guesses    : int  = Field(..., ge=1, le=8)
    won        : bool
    time_taken : int  = Field(..., ge=0)


# ── Leaderboard ───────────────────────────────────────────────────────────

class LeaderboardEntry(BaseModel):
    rank       : int
    username   : str
    played     : int
    won        : int
    win_pct    : int
    streak     : int
    max_streak : int
    best_time  : int | None = None


class LeaderboardResponse(BaseModel):
    total   : int
    entries : list[LeaderboardEntry]


class UserStatsResponse(BaseModel):
    username   : str
    played     : int
    won        : int
    win_pct    : int
    streak     : int
    max_streak : int
    best_time  : int | None = None
