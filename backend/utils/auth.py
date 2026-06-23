import os
from datetime import datetime, timedelta, timezone
import jwt


def _secret():
    s = os.environ.get('JWT_SECRET')
    if not s:
        raise RuntimeError('JWT_SECRET environment variable is not set.')
    return s


def sign_token(payload: dict) -> str:
    data = {**payload, 'exp': datetime.now(timezone.utc) + timedelta(days=7)}
    return jwt.encode(data, _secret(), algorithm='HS256')


def verify_token(token: str):
    try:
        return jwt.decode(token, _secret(), algorithms=['HS256'])
    except jwt.PyJWTError:
        return None


def extract_bearer_token(req) -> str | None:
    auth = req.headers.get('Authorization') or req.headers.get('authorization') or ''
    return auth[7:] if auth.startswith('Bearer ') else None
