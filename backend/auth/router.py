from fastapi import APIRouter, Request
from schemas import (
    ForgotPasswordRequest, LoginRequest, MessageResponse,
    RegisterRequest, ResetPasswordRequest, ResetTokenResponse, TokenResponse,
)
from auth import service
from limiter import limiter

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=201)
@limiter.limit("5/minute")
def register(request: Request, body: RegisterRequest):
    return service.register(body, request)


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
def login(request: Request, body: LoginRequest):
    return service.login(body, request)


@router.post("/forgot-password", response_model=ResetTokenResponse)
@limiter.limit("5/minute")
def forgot_password(request: Request, body: ForgotPasswordRequest):
    return service.forgot_password(body, request)


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(body: ResetPasswordRequest, request: Request):
    return service.reset_password(body, request)
