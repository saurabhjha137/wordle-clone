"""Room domain — business logic only, no HTTP concerns."""
from __future__ import annotations

import random
import string
import uuid
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException
from azure.cosmos.exceptions import CosmosResourceNotFoundError

from config import settings
from database import get_container
from models import User
from game.words import cipher_word, decipher_word
from utils.audit import log_admin_action


WAITING_EXPIRY_MINUTES = 30
MAX_ROOM_HINTS = 3
HINT_PENALTIES = {
    "vowel_count": 80,
    "remove_wrong_letters": 100,
    "reveal_letter": 150,
    "first_letter": 200,
}
VOWELS = set("AEIOU")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _gen_room_id() -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=8))


def _is_admin(user: User) -> bool:
    return user.username == settings.ROOT_USER or user.is_admin


def _find_participant(room_id: str, username: str) -> dict | None:
    results = list(get_container("room_participants").query_items(
        query="SELECT * FROM c WHERE c.username = @u",
        parameters=[{"name": "@u", "value": username}],
        partition_key=room_id,
    ))
    return results[0] if results else None


def calculate_room_score(
    *,
    won: bool,
    guesses: int,
    time_taken: int,
    time_limit: int,
    hint_penalty: int,
) -> int:
    if not won:
        return 0
    guess_bonus = {
        1: 500,
        2: 350,
        3: 250,
        4: 150,
    }.get(guesses, 50)
    time_bonus = max(time_limit - time_taken, 0) * 2
    wrong_guess_penalty = max(guesses - 1, 0) * 50
    score = 500 + guess_bonus + time_bonus - wrong_guess_penalty - max(hint_penalty, 0)
    return max(score, 0)


def _hint_log(participant: dict) -> list[dict]:
    log = participant.get("hint_log")
    return log if isinstance(log, list) else []


def _previous_hint_match(participant: dict, hint_type: str, data: dict) -> bool:
    return any(h.get("type") == hint_type and h.get("data") == data for h in _hint_log(participant))


def _removed_letters(participant: dict) -> set[str]:
    removed: set[str] = set()
    for h in _hint_log(participant):
        if h.get("type") == "remove_wrong_letters":
            removed.update(h.get("data", {}).get("letters", []))
    return removed


def _revealed_positions(participant: dict) -> set[int]:
    positions: set[int] = set()
    for h in _hint_log(participant):
        if h.get("type") in ("reveal_letter", "first_letter"):
            pos = h.get("data", {}).get("position")
            if isinstance(pos, int):
                positions.add(pos)
    return positions


# ── Room creation ─────────────────────────────────────────────────────────

def create_room(
    *,
    admin             : User,
    name              : str,
    word_length       : int,
    time_limit        : int,
    max_players       : int,
    word              : str,
    invited_usernames : list[str],
) -> dict:
    rooms_c = get_container("rooms")
    parts_c = get_container("room_participants")
    users_c = get_container("users")

    room_id = _gen_room_id()
    now     = _now()

    room_doc = {
        "id":          room_id,
        "name":        name,
        "created_by":  admin.username,
        "word_length": word_length,
        "time_limit":  time_limit,
        "cipher_word": cipher_word(word),
        "max_players": max(max_players, len(invited_usernames) or 2),
        "status":      "waiting",
        "created_at":  now,
    }
    rooms_c.create_item(room_doc)

    participants = []
    for username in invited_usernames:
        if username == admin.username:
            continue
        try:
            users_c.read_item(item=username, partition_key=username)
        except CosmosResourceNotFoundError:
            continue  # skip non-existent users

        p = {
            "id":           str(uuid.uuid4()),
            "room_id":      room_id,
            "username":     username,
            "status":       "invited",
            "joined_at":    None,
            "score":        0,
            "hints_used":   0,
            "hint_penalty": 0,
            "hint_log":     [],
        }
        parts_c.create_item(p)
        participants.append(p)

    room_doc["participants"] = participants
    return room_doc


# ── Invites ───────────────────────────────────────────────────────────────

def get_invites(user: User) -> list[dict]:
    parts_c = get_container("room_participants")
    rooms_c = get_container("rooms")
    cutoff  = (datetime.now(timezone.utc) - timedelta(minutes=WAITING_EXPIRY_MINUTES)).isoformat()

    invites = []
    for p in parts_c.query_items(
        query=("SELECT * FROM c "
               "WHERE c.username = @u AND c.status = 'invited'"),
        parameters=[{"name": "@u", "value": user.username}],
        enable_cross_partition_query=True,
    ):
        try:
            room = rooms_c.read_item(item=p["room_id"], partition_key=p["room_id"])
        except CosmosResourceNotFoundError:
            continue
        if room.get("status") != "waiting":
            continue
        if room.get("created_at", "") < cutoff:
            continue

        p_count = len(_get_participants(p["room_id"]))
        invites.append({
            "room_id":      room["id"],
            "room_name":    room["name"],
            "word_length":  room["word_length"],
            "time_limit":   room["time_limit"],
            "created_by":   room["created_by"],
            "player_count": p_count,
        })
    return invites


# ── Listing ───────────────────────────────────────────────────────────────

def list_rooms(username: str) -> list[dict]:
    """Return all rooms created by or participated in by the given user."""
    parts_c = get_container("room_participants")
    rooms_c = get_container("rooms")

    # Room IDs where user is any kind of participant
    part_ids: set[str] = {
        p["room_id"]
        for p in parts_c.query_items(
            query="SELECT c.room_id FROM c WHERE c.username = @u",
            parameters=[{"name": "@u", "value": username}],
            enable_cross_partition_query=True,
        )
    }

    rooms: dict[str, dict] = {}

    # Rooms created by this user
    for r in rooms_c.query_items(
        query=("SELECT * FROM c WHERE c.created_by = @u "
               "ORDER BY c.created_at DESC"),
        parameters=[{"name": "@u", "value": username}],
        enable_cross_partition_query=True,
    ):
        rooms[r["id"]] = r

    # Rooms where user is a participant (fetch individually)
    for rid in part_ids:
        if rid not in rooms:
            try:
                r = rooms_c.read_item(item=rid, partition_key=rid)
                rooms[rid] = r
            except CosmosResourceNotFoundError:
                pass

    expiry_cutoff = (
        datetime.now(timezone.utc) - timedelta(minutes=WAITING_EXPIRY_MINUTES)
    ).isoformat()

    return [
        r for r in sorted(rooms.values(), key=lambda r: r.get("created_at", ""), reverse=True)
        if not (r.get("status") == "waiting" and r.get("created_at", "") < expiry_cutoff)
    ]


def get_room_or_404(room_id: str) -> dict:
    try:
        return get_container("rooms").read_item(item=room_id, partition_key=room_id)
    except CosmosResourceNotFoundError:
        raise HTTPException(status_code=404, detail="Room not found.")


def _get_participants(room_id: str) -> list[dict]:
    return list(get_container("room_participants").query_items(
        query="SELECT * FROM c",
        partition_key=room_id,
    ))


# ── Participation ─────────────────────────────────────────────────────────

def join_room(*, room: dict, user: User) -> str | None:
    if room["status"] not in ("waiting", "active"):
        raise HTTPException(400, f"Cannot join a room with status '{room['status']}'.")

    parts_c = get_container("room_participants")
    results = list(parts_c.query_items(
        query="SELECT * FROM c WHERE c.username = @u",
        parameters=[{"name": "@u", "value": user.username}],
        partition_key=room["id"],
    ))

    if not results:
        raise HTTPException(status_code=403, detail="You were not invited to this room.")

    p = results[0]
    if p["status"] == "invited":
        p["status"]    = "joined"
        p["joined_at"] = _now()
        parts_c.upsert_item(p)

    # Reveal cipher only when the room is active (started)
    return room["cipher_word"] if room["status"] == "active" else None


def request_hint(
    *,
    room: dict,
    user: User,
    hint_type: str,
    known_positions: dict[int, str],
) -> dict:
    if room["status"] != "active":
        raise HTTPException(400, "Hints are available only after the room starts.")

    parts_c = get_container("room_participants")
    participant = _find_participant(room["id"], user.username)
    if not participant or participant["status"] == "invited":
        raise HTTPException(403, "You have not joined this room.")
    if participant["status"] in ("won", "lost"):
        raise HTTPException(400, "Hints are not available after submitting a result.")

    word = decipher_word(room["cipher_word"])
    penalty = HINT_PENALTIES[hint_type]

    if hint_type == "vowel_count":
        count = sum(1 for letter in word if letter in VOWELS)
        data = {"count": count}
        message = f"This word has {count} vowel{'' if count == 1 else 's'}."
    elif hint_type == "remove_wrong_letters":
        previous = _removed_letters(participant)
        letters = [letter for letter in string.ascii_uppercase if letter not in word and letter not in previous][:3]
        data = {"letters": letters}
        message = f"Not in word: {', '.join(letters)}" if letters else "No more wrong letters to remove."
        if not letters:
            penalty = 0
    elif hint_type == "first_letter":
        data = {"position": 0, "letter": word[0]}
        message = f"First letter is {word[0]}."
    else:
        known = {int(pos) for pos in known_positions.keys()}
        blocked = known | _revealed_positions(participant)
        candidates = [idx for idx in range(len(word)) if idx not in blocked]
        if len(candidates) <= 1:
            data = {}
            message = "No safe reveal left."
            penalty = 0
        else:
            idx = candidates[0]
            data = {"position": idx, "letter": word[idx]}
            message = f"Letter {idx + 1} is {word[idx]}."

    if penalty and _previous_hint_match(participant, hint_type, data):
        penalty = 0
    if penalty and (participant.get("hints_used") or 0) >= MAX_ROOM_HINTS:
        raise HTTPException(400, f"Maximum {MAX_ROOM_HINTS} hints already used.")

    if penalty:
        participant["hints_used"] = (participant.get("hints_used") or 0) + 1
        participant["hint_penalty"] = (participant.get("hint_penalty") or 0) + penalty
        log = _hint_log(participant)
        log.append({"type": hint_type, "data": data, "penalty": penalty, "at": _now()})
        participant["hint_log"] = log
        parts_c.upsert_item(participant)

    return {
        "hint_type": hint_type,
        "message": message,
        "data": data,
        "penalty": penalty,
        "hints_used": participant.get("hints_used") or 0,
        "hint_penalty": participant.get("hint_penalty") or 0,
    }


def start_room(*, room: dict, user: User) -> dict:
    if room["created_by"] != user.username and not _is_admin(user):
        raise HTTPException(403, "Only the room creator or admin can start the room.")
    if room["status"] != "waiting":
        raise HTTPException(400, f"Cannot start a room in '{room['status']}' status.")
    participants = _get_participants(room["id"])
    joined = [p for p in participants if p["status"] == "joined"]
    if not joined:
        raise HTTPException(400, "At least one player must join before starting.")
    room["status"] = "active"
    get_container("rooms").upsert_item(room)
    return room


def cancel_room(*, room: dict, user: User) -> dict:
    if room["created_by"] != user.username and not _is_admin(user):
        raise HTTPException(403, "Only the room creator or admin can cancel the room.")
    if room["status"] in ("finished", "cancelled"):
        raise HTTPException(400, f"Room is already {room['status']}.")
    room["status"] = "cancelled"
    get_container("rooms").upsert_item(room)
    return room


# ── Result submission ─────────────────────────────────────────────────────

def submit_room_result(
    *,
    room      : dict,
    user      : User,
    guesses   : int,
    won       : bool,
    time_taken: int,
) -> dict:
    if room["status"] != "active":
        raise HTTPException(400, "Room is not active.")

    parts_c = get_container("room_participants")
    p = _find_participant(room["id"], user.username)

    if not p or p["status"] == "invited":
        raise HTTPException(403, "You have not joined this room.")

    if p["status"] in ("won", "lost"):
        raise HTTPException(400, "You have already submitted a result for this room.")

    hint_penalty = p.get("hint_penalty") or 0
    score = calculate_room_score(
        won=won,
        guesses=guesses,
        time_taken=time_taken,
        time_limit=room["time_limit"],
        hint_penalty=hint_penalty,
    )

    get_container("game_results").create_item({
        "id":          str(uuid.uuid4()),
        "username":    user.username,
        "word_length": room["word_length"],
        "target_word": room["cipher_word"],
        "guesses":     guesses,
        "won":         won,
        "time_taken":  time_taken,
        "room_id":     room["id"],
        "mode":        "ranked",
        "is_daily":    False,
        "score":       score,
        "hints_used":  p.get("hints_used") or 0,
        "hint_penalty": hint_penalty,
        "played_at":   _now(),
    })

    p["status"]      = "won" if won else "lost"
    p["won"]         = won
    p["guesses"]     = guesses
    p["time_taken"]  = time_taken
    p["score"]       = score
    parts_c.upsert_item(p)

    all_parts = _get_participants(room["id"])
    active    = [p2 for p2 in all_parts if p2["status"] != "invited"]
    if active and all(p2["status"] in ("won", "lost") for p2 in active):
        room["status"] = "finished"
        get_container("rooms").upsert_item(room)

    return room


def update_room_participant_from_game(
    room_id   : str,
    username  : str,
    won       : bool,
    guesses   : int,
    time_taken: int,
) -> None:
    """Called from game.service.submit_game when room_id is provided.

    Updates the participant's status/result and triggers auto-finish when all
    joined players have submitted.  Never raises — a room-update failure must
    not roll back a successful game submit.
    """
    try:
        rooms_c = get_container("rooms")
        parts_c = get_container("room_participants")

        try:
            room = rooms_c.read_item(item=room_id, partition_key=room_id)
        except CosmosResourceNotFoundError:
            return

        if room.get("status") != "active":
            return

        p = _find_participant(room_id, username)
        if not p:
            return

        if p["status"] in ("won", "lost"):
            return  # already submitted via /api/rooms/{id}/result

        score = calculate_room_score(
            won=won,
            guesses=guesses,
            time_taken=time_taken,
            time_limit=room["time_limit"],
            hint_penalty=p.get("hint_penalty") or 0,
        )
        p["status"]     = "won" if won else "lost"
        p["won"]        = won
        p["guesses"]    = guesses
        p["time_taken"] = time_taken
        p["score"]      = score
        parts_c.upsert_item(p)

        all_parts = _get_participants(room_id)
        active    = [p2 for p2 in all_parts if p2["status"] != "invited"]
        if active and all(p2["status"] in ("won", "lost") for p2 in active):
            room["status"] = "finished"
            rooms_c.upsert_item(room)

    except Exception:
        pass  # never propagate


# ── Admin hard-delete ─────────────────────────────────────────────────────

def delete_room(*, room: dict, user: User) -> None:
    if user.username != room["created_by"]:
        raise HTTPException(403, "Only the room creator can delete this room.")
    room_id = room["id"]
    parts_c = get_container("room_participants")
    for p in _get_participants(room_id):
        parts_c.delete_item(item=p["id"], partition_key=room_id)
    get_container("rooms").delete_item(item=room_id, partition_key=room_id)
    log_admin_action(actor=user.username, action="delete_room",
                     target=room_id, detail=room.get("name", ""))
