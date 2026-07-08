"""Shared FastAPI dependency functions — injected via Depends()."""
import jwt
from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from azure.cosmos.exceptions import CosmosResourceNotFoundError

from auth.utils import decode_access_token
from config import settings
from database import get_container
from models import User

_bearer = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(_bearer),
) -> User:
    """Validate Bearer JWT, check token_version, and return the authenticated User."""
    try:
        username, token_version = decode_access_token(credentials.credentials)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token.")

    try:
        doc = get_container("users").read_item(item=username, partition_key=username)
    except CosmosResourceNotFoundError:
        raise HTTPException(status_code=401, detail="User not found.")
    except Exception:
        raise HTTPException(status_code=401, detail="User not found.")

    if doc.get("token_version", 0) != token_version:
        raise HTTPException(status_code=401, detail="Token has been invalidated. Please log in again.")

    return User.from_doc(doc)


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Extend get_current_user — requires ROOT_USER or is_admin flag."""
    if not (current_user.username == settings.ROOT_USER or current_user.is_admin):
        raise HTTPException(status_code=403, detail="Admin access only.")
    return current_user
