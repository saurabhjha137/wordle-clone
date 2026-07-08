"""User dataclass — thin wrapper around a Cosmos DB document.

All other entities (rooms, stats, participants) are plain dicts throughout
the codebase since they're only ever used in one domain each.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Optional


@dataclass
class User:
    username: str
    password_hash: str
    secret_q1: str
    secret_a1: str
    secret_q2: str
    secret_a2: str
    is_admin: bool = False
    token_version: int = 0
    email: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    @property
    def id(self) -> str:
        return self.username

    @classmethod
    def from_doc(cls, doc: dict) -> "User":
        return cls(
            username      = doc["username"],
            password_hash = doc["password_hash"],
            secret_q1     = doc["secret_q1"],
            secret_a1     = doc["secret_a1"],
            secret_q2     = doc["secret_q2"],
            secret_a2     = doc["secret_a2"],
            is_admin      = doc.get("is_admin", False),
            token_version = doc.get("token_version", 0),
            email         = doc.get("email"),
            created_at    = doc.get("created_at"),
            updated_at    = doc.get("updated_at"),
        )
