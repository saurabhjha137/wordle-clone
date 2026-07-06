import jwt
from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from models import AuthActivity, User
from schemas import (
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
)
from auth.utils import (
    decode_token,
    hash_password,
    make_access_token,
    make_reset_token,
    verify_password,
)


def _log(db: Session, *, action: str, success: bool, user_id: int | None = None,
         detail: str | None = None, request: Request | None = None) -> None:
    ip = request.client.host if request and request.client else None
    db.add(AuthActivity(user_id=user_id, action=action, success=success, detail=detail, ip_address=ip))
    db.commit()


def register(body: RegisterRequest, db: Session, request: Request):
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=409, detail={"username": "Username already taken."})

    user = User(
        username      = body.username,
        email         = body.email.strip().lower() if body.email else None,
        password_hash = hash_password(body.password),
        secret_q1     = body.secret_q1,
        secret_a1     = hash_password(body.secret_a1),   # hashed; lowercased by schema validator
        secret_q2     = body.secret_q2,
        secret_a2     = hash_password(body.secret_a2),   # hashed; lowercased by schema validator
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    _log(db, action="register", success=True, user_id=user.id, request=request)
    return {"access_token": make_access_token(user.username), "token_type": "bearer", "username": user.username}


def login(body: LoginRequest, db: Session, request: Request):
    user = db.query(User).filter(User.username == body.username).first()

    if not user or not verify_password(body.password, user.password_hash):
        _log(
            db, action="failed_login", success=False,
            user_id=user.id if user else None,
            detail="bad credentials",
            request=request,
        )
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    _log(db, action="login", success=True, user_id=user.id, request=request)
    return {"access_token": make_access_token(user.username), "token_type": "bearer", "username": user.username}


def forgot_password(body: ForgotPasswordRequest, db: Session, request: Request):
    user = db.query(User).filter(User.username == body.username).first()

    # Always give the same error regardless of whether username exists (prevent user enumeration)
    if (
        not user
        or not verify_password(body.secret_a1, user.secret_a1)
        or not verify_password(body.secret_a2, user.secret_a2)
    ):
        _log(
            db, action="forgot_password", success=False,
            user_id=user.id if user else None,
            detail="answer mismatch",
            request=request,
        )
        raise HTTPException(status_code=400, detail="Username or security answers are incorrect.")

    _log(db, action="forgot_password", success=True, user_id=user.id, request=request)
    return {
        "reset_token": make_reset_token(user.username),
        "message": "Answers verified. Use the reset_token to set a new password.",
    }


def reset_password(body: ResetPasswordRequest, db: Session, request: Request):
    try:
        username = decode_token(body.reset_token, expected_type="reset")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=400, detail="Reset token has expired. Please start over.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=400, detail="Invalid reset token.")

    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid reset token.")

    user.password_hash = hash_password(body.new_password)
    db.commit()

    _log(db, action="password_reset", success=True, user_id=user.id, request=request)
    return {"message": "Password updated successfully."}
