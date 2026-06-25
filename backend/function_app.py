import json
import uuid
import bcrypt
import logging
from datetime import datetime, timezone

import azure.functions as func

from utils.validate import validate_register, validate_login
from utils.db       import (find_user_by_username, find_user_by_email,
                             create_user, update_user_stats, get_leaderboard,
                             list_all_users, create_room, find_room_by_id,
                             get_pending_invites, update_room)
from utils.auth     import sign_token, verify_token, extract_bearer_token
from utils.words    import get_random_word, cipher_word

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)
log = logging.getLogger(__name__)

ROOT_USER = 'ggboy'
ROOM_TIME_LIMITS = {60, 90, 120, 180, 300}


# ── Helpers ────────────────────────────────────────────────────────────────

def _json(body: dict, status: int = 200) -> func.HttpResponse:
    return func.HttpResponse(
        json.dumps(body),
        status_code=status,
        mimetype='application/json',
        headers={'Access-Control-Allow-Origin': '*'}
    )


def _cors_preflight(methods: str) -> func.HttpResponse:
    return func.HttpResponse(
        status_code=204,
        headers={
            'Access-Control-Allow-Origin':  '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
            'Access-Control-Allow-Methods': methods,
        }
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
        return _cors_preflight('POST,OPTIONS')

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
        return _cors_preflight('POST,OPTIONS')

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


# ── POST /api/save-result ──────────────────────────────────────────────────

@app.route(route='save-result', methods=['POST', 'OPTIONS'])
def save_result(req: func.HttpRequest) -> func.HttpResponse:
    if req.method == 'OPTIONS':
        return _cors_preflight('POST,OPTIONS')

    token   = extract_bearer_token(req)
    payload = verify_token(token) if token else None
    if not payload:
        return _json({'error': 'Unauthorized'}, 401)

    body, err = _parse_body(req)
    if err:
        return err

    try:
        won         = bool(body.get('won'))
        guess_count = body.get('guessCount')
        update_user_stats(payload['username'], won, guess_count)
        return _json({'ok': True})
    except Exception as e:
        log.error('save_result error: %s', e)
        return _json({'error': 'Could not save result.'}, 500)


# ── GET /api/word ──────────────────────────────────────────────────────────

@app.route(route='word', methods=['GET', 'OPTIONS'])
def get_word(req: func.HttpRequest) -> func.HttpResponse:
    if req.method == 'OPTIONS':
        return _cors_preflight('GET,OPTIONS')

    try:
        length = int(req.params.get('length', 5))
    except (ValueError, TypeError):
        return _json({'error': 'length must be an integer'}, 400)

    if length not in (3, 4, 5, 6, 7):
        return _json({'error': 'length must be 3, 4, 5, 6, or 7'}, 400)

    word = get_random_word(length)
    if not word:
        return _json({'error': 'No words available for that length'}, 500)

    return _json({'word': cipher_word(word), 'length': length})


# ── GET /api/leaderboard ───────────────────────────────────────────────────

@app.route(route='leaderboard', methods=['GET', 'OPTIONS'])
def leaderboard(req: func.HttpRequest) -> func.HttpResponse:
    if req.method == 'OPTIONS':
        return _cors_preflight('GET,OPTIONS')

    try:
        rows   = get_leaderboard(limit=10)
        result = []
        for row in rows:
            s = row.get('stats', {})
            played = s.get('played', 0)
            won    = s.get('won', 0)
            result.append({
                'username':  row.get('displayName') or row.get('username'),
                'won':       won,
                'played':    played,
                'winPct':    round((won / played) * 100) if played > 0 else 0,
                'streak':    s.get('streak', 0),
                'maxStreak': s.get('maxStreak', 0),
            })
        return _json({'leaderboard': result})
    except Exception as e:
        log.error('leaderboard error: %s', e)
        return _json({'error': 'Could not fetch leaderboard.'}, 500)


# ── GET /api/users  (root only — player picker for room creation) ──────────

@app.route(route='users', methods=['GET', 'OPTIONS'])
def get_users(req: func.HttpRequest) -> func.HttpResponse:
    if req.method == 'OPTIONS':
        return _cors_preflight('GET,OPTIONS')

    token   = extract_bearer_token(req)
    payload = verify_token(token) if token else None
    if not payload or payload['username'] != ROOT_USER:
        return _json({'error': 'Forbidden'}, 403)

    users = list_all_users()
    result = [
        {'username': u['username'], 'displayName': u.get('displayName', u['username'])}
        for u in users
        if u['username'] != ROOT_USER
    ]
    return _json({'users': result})


# ── POST /api/rooms  (root only — create a room) ───────────────────────────

@app.route(route='rooms', methods=['POST', 'OPTIONS'])
def create_room_endpoint(req: func.HttpRequest) -> func.HttpResponse:
    if req.method == 'OPTIONS':
        return _cors_preflight('POST,OPTIONS')

    token   = extract_bearer_token(req)
    payload = verify_token(token) if token else None
    if not payload or payload['username'] != ROOT_USER:
        return _json({'error': 'Forbidden'}, 403)

    body, err = _parse_body(req)
    if err:
        return err

    word = (body.get('word') or '').upper().strip()
    if not word or len(word) != 5 or not word.isalpha():
        return _json({'error': 'word must be exactly 5 letters'}, 400)

    try:
        time_limit = int(body.get('timeLimit', 120))
    except (ValueError, TypeError):
        return _json({'error': 'timeLimit must be an integer'}, 400)
    if time_limit not in ROOM_TIME_LIMITS:
        return _json({'error': 'timeLimit must be 60, 90, 120, 180, or 300 seconds'}, 400)

    players = [p.lower() for p in (body.get('players') or []) if p]
    if not players:
        return _json({'error': 'Select at least one player'}, 400)

    creator      = find_user_by_username(ROOT_USER)
    display_name = creator.get('displayName', ROOT_USER) if creator else ROOT_USER

    room = {
        'id':               str(uuid.uuid4()),
        'type':             'room',
        'createdBy':        ROOT_USER,
        'createdByDisplay': display_name,
        'word':             cipher_word(word),
        'wordLength':       5,
        'timeLimit':        time_limit,
        'players':          players,
        'playerStatus':     {p: 'pending' for p in players},
        'playerResults':    {},
        'status':           'active',
        'createdAt':        datetime.now(timezone.utc).isoformat(),
    }
    create_room(room)
    return _json({'roomId': room['id']}, 201)


# ── GET /api/invites  (poll for pending room invites) ─────────────────────

@app.route(route='invites', methods=['GET', 'OPTIONS'])
def get_invites(req: func.HttpRequest) -> func.HttpResponse:
    if req.method == 'OPTIONS':
        return _cors_preflight('GET,OPTIONS')

    token   = extract_bearer_token(req)
    payload = verify_token(token) if token else None
    if not payload:
        return _json({'error': 'Unauthorized'}, 401)

    rooms  = get_pending_invites(payload['username'])
    result = [{
        'id':          r['id'],
        'createdBy':   r.get('createdByDisplay', r['createdBy']),
        'timeLimit':   r['timeLimit'],
        'playerCount': len(r['players']),
    } for r in rooms]
    return _json({'invites': result})


# ── POST /api/rooms/{roomId}/join ──────────────────────────────────────────

@app.route(route='rooms/{roomId}/join', methods=['POST', 'OPTIONS'])
def join_room(req: func.HttpRequest) -> func.HttpResponse:
    if req.method == 'OPTIONS':
        return _cors_preflight('POST,OPTIONS')

    token   = extract_bearer_token(req)
    payload = verify_token(token) if token else None
    if not payload:
        return _json({'error': 'Unauthorized'}, 401)

    room_id  = req.route_params.get('roomId')
    room     = find_room_by_id(room_id)
    if not room:
        return _json({'error': 'Room not found'}, 404)

    username = payload['username']
    if username not in room.get('players', []):
        return _json({'error': 'Not invited to this room'}, 403)

    ps = room.get('playerStatus', {})
    if ps.get(username) not in ('playing', 'won', 'lost'):
        ps[username] = 'playing'
        room['playerStatus'] = ps
        update_room(room)

    return _json({
        'word':      room['word'],
        'timeLimit': room['timeLimit'],
        'createdBy': room.get('createdByDisplay', room['createdBy']),
    })


# ── POST /api/rooms/{roomId}/result ───────────────────────────────────────

@app.route(route='rooms/{roomId}/result', methods=['POST', 'OPTIONS'])
def submit_room_result(req: func.HttpRequest) -> func.HttpResponse:
    if req.method == 'OPTIONS':
        return _cors_preflight('POST,OPTIONS')

    token   = extract_bearer_token(req)
    payload = verify_token(token) if token else None
    if not payload:
        return _json({'error': 'Unauthorized'}, 401)

    room_id  = req.route_params.get('roomId')
    room     = find_room_by_id(room_id)
    if not room:
        return _json({'error': 'Room not found'}, 404)

    username = payload['username']
    if username not in room.get('players', []):
        return _json({'error': 'Not in this room'}, 403)

    body, err = _parse_body(req)
    if err:
        return err

    won         = bool(body.get('won'))
    guess_count = body.get('guessCount')

    ps = room.get('playerStatus', {})
    ps[username] = 'won' if won else 'lost'
    room['playerStatus'] = ps

    pr = room.get('playerResults', {})
    pr[username] = {
        'won':        won,
        'guessCount': guess_count,
        'completedAt': datetime.now(timezone.utc).isoformat(),
    }
    room['playerResults'] = pr
    update_room(room)
    return _json({'ok': True})
