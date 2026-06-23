import json
import uuid
import bcrypt
import logging
from datetime import datetime, timezone

import azure.functions as func

from utils.validate import validate_register, validate_login
from utils.db       import find_user_by_username, find_user_by_email, create_user
from utils.auth     import sign_token

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)
log = logging.getLogger(__name__)


# ── Helpers ────────────────────────────────────────────────────────────────

def _json(body: dict, status: int = 200) -> func.HttpResponse:
    return func.HttpResponse(
        json.dumps(body),
        status_code=status,
        mimetype='application/json',
        headers={'Access-Control-Allow-Origin': '*'}
    )


def _parse_body(req: func.HttpRequest):
    try:
        return req.get_json(), None
    except ValueError:
        return None, _json({'errors': {'form': 'Request body must be valid JSON.'}}, 400)


# ── POST /api/register ─────────────────────────────────────────────────────

@app.route(route='register', methods=['POST', 'OPTIONS'])
def register(req: func.HttpRequest) -> func.HttpResponse:
    if req.method == 'OPTIONS':
        return func.HttpResponse(status_code=204,
                                 headers={'Access-Control-Allow-Origin': '*',
                                          'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                                          'Access-Control-Allow-Methods': 'POST,OPTIONS'})

    body, err = _parse_body(req)
    if err:
        return err

    username = body.get('username')
    email    = body.get('email')
    password = body.get('password')
    age      = body.get('age')

    errors = validate_register(username, email, password, age)
    if errors:
        return _json({'errors': errors}, 400)

    if find_user_by_username(username):
        return _json({'errors': {'username': 'That username is already taken.'}}, 409)

    if find_user_by_email(email):
        return _json({'errors': {'email': 'An account with that email already exists.'}}, 409)

    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt(10)).decode()

    user = {
        'id':           str(uuid.uuid4()),
        'username':     username.strip().lower(),
        'displayName':  username.strip(),
        'email':        email.strip().lower(),
        'passwordHash': password_hash,
        'age':          int(age),
        'createdAt':    datetime.now(timezone.utc).isoformat()
    }

    create_user(user)
    token = sign_token({'userId': user['id'], 'username': user['username']})

    return _json({
        'token': token,
        'user': {
            'username':    user['username'],
            'displayName': user['displayName'],
            'email':       user['email']
        }
    }, 201)


# ── POST /api/login ────────────────────────────────────────────────────────

@app.route(route='login', methods=['POST', 'OPTIONS'])
def login(req: func.HttpRequest) -> func.HttpResponse:
    if req.method == 'OPTIONS':
        return func.HttpResponse(status_code=204,
                                 headers={'Access-Control-Allow-Origin': '*',
                                          'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                                          'Access-Control-Allow-Methods': 'POST,OPTIONS'})

    body, err = _parse_body(req)
    if err:
        return err

    username = body.get('username')
    password = body.get('password')

    errors = validate_login(username, password)
    if errors:
        return _json({'errors': errors}, 400)

    user = find_user_by_username(username)

    _invalid = {'errors': {'form': 'Invalid username or password.'}}

    if not user:
        return _json(_invalid, 401)

    if not bcrypt.checkpw(password.encode(), user['passwordHash'].encode()):
        return _json(_invalid, 401)

    token = sign_token({'userId': user['id'], 'username': user['username']})

    return _json({
        'token': token,
        'user': {
            'username':    user['username'],
            'displayName': user['displayName'],
            'email':       user['email']
        }
    })
