import uuid
import jwt
from datetime import datetime, timezone
from fastapi import HTTPException, Request
from azure.cosmos.exceptions import CosmosResourceNotFoundError

from config import settings
from database import get_container
from schemas import (
    ForgotPasswordRequest, LoginRequest, RegisterRequest, ResetPasswordRequest,
)
from auth.utils import (
    decode_token, hash_password, make_access_token, make_reset_token, verify_password,
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _log(*, action: str, success: bool, username: str | None = None,
         detail: str | None = None, request: Request | None = None) -> None:
    ip = request.client.host if request and request.client else None
    try:
        get_container("auth_activity").create_item({
            "id":         str(uuid.uuid4()),
            "username":   username or "system",
            "action":     action,
            "success":    success,
            "detail":     detail,
            "ip_address": ip,
            "timestamp":  _now(),
        })
    except Exception:
        pass


def register(body: RegisterRequest, request: Request):
    users = get_container("users")

    try:
        users.read_item(item=body.username, partition_key=body.username)
        raise HTTPException(status_code=409, detail={"username": "Username already taken."})
    except CosmosResourceNotFoundError:
        pass  # expected — user does not exist yet

    now = _now()
    users.create_item({
        "id":            body.username,
        "username":      body.username,
        "email":         body.email.strip().lower() if body.email else None,
        "password_hash": hash_password(body.password),
        "secret_q1":     body.secret_q1,
        "secret_a1":     hash_password(body.secret_a1),
        "secret_q2":     body.secret_q2,
        "secret_a2":     hash_password(body.secret_a2),
        "is_admin":      False,
        "token_version": 0,
        "created_at":    now,
        "updated_at":    now,
    })

    _log(action="register", success=True, username=body.username, request=request)
    return {
        "access_token": make_access_token(body.username, token_version=0),
        "token_type":   "bearer",
        "username":     body.username,
        "is_admin":     (body.username == settings.ROOT_USER),
    }


def login(body: LoginRequest, request: Request):
    users = get_container("users")

    try:
        doc = users.read_item(item=body.username, partition_key=body.username)
    except CosmosResourceNotFoundError:
        doc = None

    if not doc or not verify_password(body.password, doc["password_hash"]):
        _log(action="failed_login", success=False, username=body.username,
             detail="bad credentials", request=request)
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    _log(action="login", success=True, username=body.username, request=request)
    is_admin = doc.get("is_admin", False) or (body.username == settings.ROOT_USER)
    return {
        "access_token": make_access_token(body.username, token_version=doc.get("token_version", 0)),
        "token_type":   "bearer",
        "username":     body.username,
        "is_admin":     is_admin,
    }


def forgot_password(body: ForgotPasswordRequest, request: Request):
    users = get_container("users")

    try:
        doc = users.read_item(item=body.username, partition_key=body.username)
    except CosmosResourceNotFoundError:
        doc = None

    if (
        not doc
        or not verify_password(body.secret_a1, doc["secret_a1"])
        or not verify_password(body.secret_a2, doc["secret_a2"])
    ):
        _log(action="forgot_password", success=False, username=body.username,
             detail="answer mismatch", request=request)
        raise HTTPException(status_code=400,
                            detail="Username or security answers are incorrect.")

    _log(action="forgot_password", success=True, username=body.username, request=request)
    return {
        "reset_token": make_reset_token(body.username),
        "message":     "Answers verified. Use the reset_token to set a new password.",
    }


def reset_password(body: ResetPasswordRequest, request: Request):
    try:
        username = decode_token(body.reset_token, expected_type="reset")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=400,
                            detail="Reset token has expired. Please start over.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=400, detail="Invalid reset token.")

    users = get_container("users")
    try:
        doc = users.read_item(item=username, partition_key=username)
    except CosmosResourceNotFoundError:
        raise HTTPException(status_code=400, detail="Invalid reset token.")

    doc["password_hash"]  = hash_password(body.new_password)
    doc["token_version"]  = doc.get("token_version", 0) + 1
    doc["updated_at"]     = _now()
    users.upsert_item(doc)

    _log(action="password_reset", success=True, username=username, request=request)
    return {"message": "Password updated successfully."}
