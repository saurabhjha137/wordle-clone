from fastapi import APIRouter, Depends

from dependencies import get_current_user, require_admin
from models import User
from schemas import (
    CreateRoomRequest, InvitesResponse, JoinRoomResponse,
    RoomDetailResponse, RoomHintRequest, RoomHintResponse,
    RoomResponse, RoomResultRequest,
)
from room import service

router = APIRouter(prefix="/api/rooms", tags=["rooms"])


def _to_room_response(room: dict, participants: list[dict] | None = None) -> dict:
    return {
        "id":           room["id"],
        "name":         room["name"],
        "word_length":  room["word_length"],
        "time_limit":   room["time_limit"],
        "status":       room["status"],
        "max_players":  room["max_players"],
        "player_count": len(participants) if participants is not None else 0,
        "created_by":   room["created_by"],
        "created_at":   room["created_at"],
    }


def _participant_info(p: dict) -> dict:
    return {
        "username":     p["username"],
        "status":       p["status"],
        "guesses":      p.get("guesses"),
        "won":          p.get("won"),
        "time_taken":   p.get("time_taken"),
        "score":        p.get("score"),
        "hints_used":   p.get("hints_used") or 0,
        "hint_penalty": p.get("hint_penalty") or 0,
    }


@router.post("", response_model=RoomDetailResponse, status_code=201,
             summary="Create a room (admin only)")
def create_room(body: CreateRoomRequest, admin: User = Depends(require_admin)):
    room         = service.create_room(
        admin             = admin,
        name              = body.name,
        word_length       = body.word_length,
        time_limit        = body.time_limit,
        max_players       = body.max_players,
        word              = body.word,
        invited_usernames = body.invited_usernames,
    )
    participants = room.pop("participants", [])
    return {
        **_to_room_response(room, participants),
        "cipher_word":  None,
        "participants": [_participant_info(p) for p in participants],
    }


@router.get("/invites", response_model=InvitesResponse,
            summary="Get pending room invites for the current user")
def get_invites(user: User = Depends(get_current_user)):
    return {"invites": service.get_invites(user)}


@router.get("", response_model=list[RoomDetailResponse],
            summary="List rooms visible to the current user")
def list_rooms(user: User = Depends(get_current_user)):
    rooms  = service.list_rooms(user.username)
    result = []
    for room in rooms:
        participants = service._get_participants(room["id"])
        is_member    = any(p["username"] == user.username for p in participants)
        cipher       = (
            room["cipher_word"]
            if room["status"] == "active" and is_member
            else None
        )
        result.append({
            **_to_room_response(room, participants),
            "cipher_word":  cipher,
            "participants": [_participant_info(p) for p in participants],
        })
    return result


@router.get("/{room_id}", response_model=RoomDetailResponse,
            summary="Get room details")
def get_room(room_id: str, user: User = Depends(get_current_user)):
    room         = service.get_room_or_404(room_id)
    participants = service._get_participants(room_id)
    is_member    = any(p["username"] == user.username for p in participants)
    cipher       = (
        room["cipher_word"]
        if room["status"] == "active" and is_member
        else None
    )
    return {
        **_to_room_response(room, participants),
        "cipher_word":  cipher,
        "participants": [_participant_info(p) for p in participants],
    }


@router.post("/{room_id}/join", response_model=JoinRoomResponse,
             summary="Accept a room invite")
def join_room(room_id: str, user: User = Depends(get_current_user)):
    room        = service.get_room_or_404(room_id)
    cipher_word = service.join_room(room=room, user=user)
    return {
        "message":     f"Joined room '{room['name']}'.",
        "cipher_word": cipher_word,
        "time_limit":  room["time_limit"],
        "word_length": room["word_length"],
        "created_by":  room["created_by"],
        "room_name":   room["name"],
        "room_id":     room["id"],
        "status":      room["status"],
    }


@router.post("/{room_id}/start", response_model=RoomDetailResponse,
             summary="Start a room (creator or admin)")
def start_room(room_id: str, user: User = Depends(get_current_user)):
    room         = service.get_room_or_404(room_id)
    room         = service.start_room(room=room, user=user)
    participants = service._get_participants(room_id)
    return {
        **_to_room_response(room, participants),
        "cipher_word":  None,   # don't expose cipher in start response
        "participants": [_participant_info(p) for p in participants],
    }


@router.post("/{room_id}/hint", response_model=RoomHintResponse,
             summary="Request a hint for an active room game")
def request_hint(
    room_id: str,
    body   : RoomHintRequest,
    user   : User = Depends(get_current_user),
):
    room = service.get_room_or_404(room_id)
    return service.request_hint(
        room            = room,
        user            = user,
        hint_type       = body.hint_type,
        known_positions = body.known_positions,
    )


@router.post("/{room_id}/cancel", response_model=RoomResponse,
             summary="Cancel a room (creator or admin)")
def cancel_room(room_id: str, user: User = Depends(get_current_user)):
    room = service.get_room_or_404(room_id)
    room = service.cancel_room(room=room, user=user)
    return _to_room_response(room)


@router.delete("/{room_id}", status_code=204,
               summary="Hard-delete a room and its participants (admin only)")
def delete_room(room_id: str, user: User = Depends(get_current_user)):
    room = service.get_room_or_404(room_id)
    service.delete_room(room=room, user=user)


@router.post("/{room_id}/result", response_model=RoomResponse,
             summary="Submit your result for a room game")
def submit_room_result(
    room_id: str,
    body   : RoomResultRequest,
    user   : User = Depends(get_current_user),
):
    room = service.get_room_or_404(room_id)
    room = service.submit_room_result(
        room       = room,
        user       = user,
        guesses    = body.guesses,
        won        = body.won,
        time_taken = body.time_taken,
    )
    return _to_room_response(room)
