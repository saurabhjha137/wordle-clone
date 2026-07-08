from fastapi import APIRouter, Depends, HTTPException, Query

from dependencies import get_current_user
from models import User
from schemas import (
    AchievementsResponse,
    DailyChallengeResponse,
    GameHistoryResponse,
    SubmitGameRequest,
    SubmitGameResponse,
    WordResponse,
)
from game import service
from game.service import DuplicateDailyError
from game.words import is_valid_word

router = APIRouter(prefix="/api/game", tags=["game"])


@router.get("/word", response_model=WordResponse, summary="Get a ciphered word for solo play")
def get_word(
    length: int = Query(..., ge=3, le=7),
    _: User = Depends(get_current_user),
):
    try:
        cipher = service.get_ciphered_word(length)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"cipher": cipher, "word_length": length}


@router.get("/validate-word", summary="Check if a guessed word exists in the dictionary")
def validate_word(
    word: str = Query(..., min_length=3, max_length=7),
    _: User = Depends(get_current_user),
):
    return {"valid": is_valid_word(word)}


@router.get("/daily", response_model=DailyChallengeResponse,
            summary="Get today's daily challenge word (same for all users)")
def get_daily(
    word_length: int = Query(5, ge=3, le=7),
    user: User = Depends(get_current_user),
):
    try:
        return service.get_daily_challenge(user.username, word_length)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/history", response_model=GameHistoryResponse,
            summary="Get current user's recent game history")
def get_history(
    limit: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
):
    return {"entries": service.get_game_history(user.username, limit)}


@router.get("/achievements", response_model=AchievementsResponse,
            summary="Get current user's unlocked achievements")
def get_achievements(user: User = Depends(get_current_user)):
    return {"entries": service.get_user_achievements(user.username)}


@router.post("/submit", response_model=SubmitGameResponse,
             summary="Submit a completed game result")
def submit_game(body: SubmitGameRequest, user: User = Depends(get_current_user)):
    try:
        result = service.submit_game(
            user        = user,
            word_length = body.word_length,
            guesses     = body.guesses,
            won         = body.won,
            time_taken  = body.time_taken,
            room_id     = body.room_id,
            mode        = body.mode,
            is_daily    = body.is_daily,
            daily_date  = body.daily_date,
        )
    except DuplicateDailyError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return {
        "ok":              True,
        "played":          result.get("played", 0),
        "won":             result.get("won", 0),
        "streak":          result.get("streak", 0),
        "ranked":          result.get("ranked", True),
        "new_achievements": result.get("new_achievements", []),
    }
