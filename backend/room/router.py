from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user, require_admin
from models import User
from schemas import (
    CreateRoomRequest,
    MessageResponse,
    RoomDetailResponse,
    RoomResponse,
    RoomResultRequest,
)
from room import service

router = APIRouter(prefix="/api/rooms", tags=["rooms"])


def _to_room_response(room) -> dict:
    return {
        "id"          : room.id,
        "name"        : room.name,
        "word_length" : room.word_length,
        "time_limit"  : room.time_limit,
        "status"      : room.status,
        "max_players" : room.max_players,
        "player_count": len(room.participants),
        "created_by"  : room.created_by_user.username,
        "created_at"  : room.created_at.isoformat(),
    }


@router.post(
    "",
    response_model=RoomDetailResponse,
    status_code=201,
    summary="Create a room (admin only)",
)
def create_room(
    body : CreateRoomRequest,
    db   : Session = Depends(get_db),
    admin: User    = Depends(require_admin),
):
    room = service.create_room(
        db          = db,
        admin       = admin,
        name        = body.name,
        word_length = body.word_length,
        time_limit  = body.time_limit,
        max_players = body.max_players,
    )
    return {**_to_room_response(room), "cipher_word": None, "participants": []}


@router.get(
    "",
    response_model=list[RoomResponse],
    summary="List open rooms",
)
def list_rooms(
    db: Session = Depends(get_db),
    _ : User    = Depends(get_current_user),
):
    rooms = service.list_rooms(db)
    return [_to_room_response(r) for r in rooms]


@router.get(
    "/{room_id}",
    response_model=RoomDetailResponse,
    summary="Get room details",
)
def get_room(
    room_id: str,
    db     : Session = Depends(get_db),
    user   : User    = Depends(get_current_user),
):
    room = service.get_room_or_404(db, room_id)
    is_participant = any(p.user_id == user.id for p in room.participants)

    # Only reveal the cipher word to participants of an active room
    cipher = room.cipher_word if (room.status == "active" and is_participant) else None

    participants = [
        {"username": p.user.username, "status": p.status}
        for p in room.participants
    ]
    return {**_to_room_response(room), "cipher_word": cipher, "participants": participants}


@router.post(
    "/{room_id}/join",
    response_model=MessageResponse,
    summary="Join a room",
)
def join_room(
    room_id: str,
    db     : Session = Depends(get_db),
    user   : User    = Depends(get_current_user),
):
    room = service.get_room_or_404(db, room_id)
    service.join_room(db=db, room=room, user=user)
    return {"message": f"Joined room '{room.name}'."}


@router.post(
    "/{room_id}/start",
    response_model=RoomResponse,
    summary="Start a room (admin only)",
)
def start_room(
    room_id: str,
    db     : Session = Depends(get_db),
    _      : User    = Depends(require_admin),
):
    room = service.get_room_or_404(db, room_id)
    room = service.start_room(db=db, room=room)
    return _to_room_response(room)


@router.post(
    "/{room_id}/result",
    response_model=RoomResponse,
    summary="Submit your result for a room game",
)
def submit_room_result(
    room_id: str,
    body   : RoomResultRequest,
    db     : Session = Depends(get_db),
    user   : User    = Depends(get_current_user),
):
    room = service.get_room_or_404(db, room_id)
    room = service.submit_room_result(
        db         = db,
        room       = room,
        user       = user,
        guesses    = body.guesses,
        won        = body.won,
        time_taken = body.time_taken,
    )
    return _to_room_response(room)
