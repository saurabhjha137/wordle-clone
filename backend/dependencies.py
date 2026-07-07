"""Shared FastAPI dependency functions — injected via Depends()."""
import jwt
from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from auth.utils import decode_token
from config import settings
from database import get_db
from models import User

_bearer = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(_bearer),
    db: Session = Depends(get_db),
) -> User:
    """Validate Bearer JWT and return the authenticated User row."""
    try:
        username = decode_token(credentials.credentials, expected_type="access")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token.")

    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found.")
    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Extend get_current_user — requires ROOT_USER or is_admin flag."""
    if not (current_user.username == settings.ROOT_USER or current_user.is_admin):
        raise HTTPException(status_code=403, detail="Admin access only.")
    return current_user
