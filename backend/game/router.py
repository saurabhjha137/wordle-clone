from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user
from models import User
from schemas import SubmitGameRequest, SubmitGameResponse, WordResponse
from game import service

router = APIRouter(prefix="/api/game", tags=["game"])


@router.get(
    "/word",
    response_model=WordResponse,
    summary="Get a ciphered word for solo play",
    description="Returns XOR+base64 ciphered word. Decipher client-side with the WRDL key.",
)
def get_word(
    length: int = Query(..., ge=3, le=7, description="Word length (3–7)"),
    _: User = Depends(get_current_user),
):
    try:
        cipher = service.get_ciphered_word(length)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"cipher": cipher, "word_length": length}


@router.post(
    "/submit",
    response_model=SubmitGameResponse,
    summary="Submit a completed game result",
)
def submit_game(
    body: SubmitGameRequest,
    db  : Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    stats = service.submit_game(
        db          = db,
        user        = user,
        word_length = body.word_length,
        guesses     = body.guesses,
        won         = body.won,
        time_taken  = body.time_taken,
        room_id     = body.room_id,
    )
    return {
        "ok"    : True,
        "played": stats.played,
        "won"   : stats.won,
        "streak": stats.streak,
    }
