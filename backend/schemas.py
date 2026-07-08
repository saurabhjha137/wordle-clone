"""Pydantic request / response schemas.

Grouped by domain: auth, game, room, leaderboard.
"""
from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


_USERNAME_RE = re.compile(r'^[a-zA-Z0-9_-]{3,20}$')
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
            raise ValueError("Username must be 3–20 characters: letters, numbers, _ or - only.")
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
    is_admin     : bool = False


class ResetTokenResponse(BaseModel):
    reset_token : str
    message     : str


class MessageResponse(BaseModel):
    message: str


class SetAdminRequest(BaseModel):
    username : str
    is_admin : str = "N"

    @field_validator("is_admin")
    @classmethod
    def validate_flag(cls, v: str) -> str:
        v = v.strip().upper()
        if v not in {"Y", "N"}:
            raise ValueError("is_admin must be Y or N")
        return v


class AdminResetUserRequest(BaseModel):
    username     : str
    new_username : str | None = None
    new_password : str | None = None
    new_email    : str | None = None
    new_secret_a1: str | None = None
    new_secret_a2: str | None = None

    @field_validator("username", "new_username", mode="before")
    @classmethod
    def validate_usernames(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not _USERNAME_RE.match(v):
            raise ValueError("Username must be 3–20 characters: letters, numbers, _ or - only.")
        return v

    @field_validator("new_password", mode="before")
    @classmethod
    def validate_new_password(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if not _PASSWORD_RE.match(v):
            raise ValueError("Password must be 8+ chars with at least one letter, one number, and one special character.")
        return v

    @field_validator("new_secret_a1", "new_secret_a2", mode="before")
    @classmethod
    def lowercase_answers(cls, v: str | None) -> str | None:
        if v is None:
            return v
        return v.strip().lower()


# ── Game ──────────────────────────────────────────────────────────────────

class WordResponse(BaseModel):
    cipher     : str
    word_length: int


class SubmitGameRequest(BaseModel):
    word_length : int  = Field(..., ge=3, le=7)
    guesses     : int  = Field(..., ge=0, le=8)
    won         : bool
    time_taken  : int  = Field(..., ge=0, description="Seconds elapsed")
    mode        : Literal["ranked", "practice"] = "ranked"
    is_daily    : bool = False
    daily_date  : str | None = None
    room_id     : str | None = None

    @field_validator("word_length")
    @classmethod
    def valid_length(cls, v: int) -> int:
        if v not in VALID_WORD_LENGTHS:
            raise ValueError(f"word_length must be one of {sorted(VALID_WORD_LENGTHS)}.")
        return v


class AchievementInfo(BaseModel):
    code        : str
    name        : str
    description : str


class SubmitGameResponse(BaseModel):
    ok               : bool
    played           : int
    won              : int
    streak           : int
    ranked           : bool = True
    new_achievements : list[AchievementInfo] = []


class GameHistoryEntry(BaseModel):
    id          : str
    played_at   : str
    word_length : int
    won         : bool
    guesses     : int
    time_taken  : int
    mode        : str
    is_daily    : bool
    room_id     : str | None = None


class GameHistoryResponse(BaseModel):
    entries: list[GameHistoryEntry]


class AchievementEntry(AchievementInfo):
    unlocked_at: str


class AchievementsResponse(BaseModel):
    entries: list[AchievementEntry]


class DailyChallengeResponse(BaseModel):
    date          : str
    word_length   : int
    cipher        : str
    already_played: bool


# ── Room ──────────────────────────────────────────────────────────────────

class CreateRoomRequest(BaseModel):
    name              : str       = Field(..., min_length=3, max_length=40)
    word_length       : int       = Field(..., ge=3, le=7)
    time_limit        : int
    max_players       : int       = Field(default=10, ge=2, le=20)
    word              : str       = Field(..., description="Plaintext word set by admin")
    invited_usernames : list[str] = Field(default_factory=list, description="Usernames to invite")

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

    @field_validator("word")
    @classmethod
    def normalize_word(cls, v: str) -> str:
        v = v.strip().upper()
        if not v.isalpha():
            raise ValueError("Word must contain only letters A–Z.")
        return v

    @model_validator(mode="after")
    def word_matches_length(self) -> "CreateRoomRequest":
        if len(self.word) != self.word_length:
            raise ValueError(f"Word must be exactly {self.word_length} letters long.")
        return self


class ParticipantInfo(BaseModel):
    username    : str
    status      : str
    guesses     : int | None = None
    won         : bool | None = None
    time_taken  : int | None = None
    score       : int | None = None
    hints_used  : int = 0
    hint_penalty: int = 0


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


class RoomHintRequest(BaseModel):
    hint_type       : str
    known_positions : dict[int, str] = Field(default_factory=dict)

    @field_validator("hint_type")
    @classmethod
    def valid_hint_type(cls, v: str) -> str:
        valid = {"vowel_count", "remove_wrong_letters", "reveal_letter", "first_letter"}
        if v not in valid:
            raise ValueError(f"hint_type must be one of {sorted(valid)}.")
        return v

    @field_validator("known_positions")
    @classmethod
    def valid_known_positions(cls, v: dict[int, str]) -> dict[int, str]:
        cleaned: dict[int, str] = {}
        for pos, letter in v.items():
            if pos < 0 or pos > 6:
                raise ValueError("known_positions keys must be zero-based positions from 0 to 6.")
            if not isinstance(letter, str) or len(letter.strip()) != 1 or not letter.strip().isalpha():
                raise ValueError("known_positions values must be single letters.")
            cleaned[pos] = letter.strip().upper()
        return cleaned


class RoomHintResponse(BaseModel):
    hint_type    : str
    message      : str
    data         : dict
    penalty      : int
    hints_used   : int
    hint_penalty : int


class JoinRoomResponse(BaseModel):
    message     : str
    cipher_word : str | None     # null for waiting rooms; revealed only when active
    time_limit  : int
    word_length : int
    created_by  : str
    room_name   : str
    room_id     : str
    status      : str            # "waiting" | "active"


class InviteItem(BaseModel):
    room_id     : str
    room_name   : str
    word_length : int
    time_limit  : int
    created_by  : str
    player_count: int


class InvitesResponse(BaseModel):
    invites: list[InviteItem]


class UserSummary(BaseModel):
    username: str


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
