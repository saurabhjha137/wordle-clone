import os
from datetime import date, timedelta
from azure.cosmos import CosmosClient

_DB        = 'wordledb'
_CONTAINER = 'users'
_client    = None


def _get_container():
    global _client
    if _client is None:
        _client = CosmosClient.from_connection_string(os.environ['COSMOS_CONNECTION_STRING'])
    return _client.get_database_client(_DB).get_container_client(_CONTAINER)


def find_user_by_username(username: str):
    results = list(_get_container().query_items(
        query='SELECT * FROM c WHERE c.username = @username',
        parameters=[{'name': '@username', 'value': username.lower()}],
        enable_cross_partition_query=True
    ))
    return results[0] if results else None


def find_user_by_email(email: str):
    results = list(_get_container().query_items(
        query='SELECT * FROM c WHERE c.email = @email',
        parameters=[{'name': '@email', 'value': email.lower()}],
        enable_cross_partition_query=True
    ))
    return results[0] if results else None


def create_user(user: dict):
    return _get_container().create_item(body=user)


def update_user_stats(username: str, won: bool, guess_count: int | None):
    user = find_user_by_username(username)
    if not user:
        return

    today     = date.today().isoformat()
    yesterday = (date.today() - timedelta(days=1)).isoformat()

    s = user.get('stats', {'played': 0, 'won': 0, 'streak': 0, 'maxStreak': 0, 'lastWon': ''})

    s['played'] = s.get('played', 0) + 1
    if won:
        s['won']     = s.get('won', 0) + 1
        last_won     = s.get('lastWon', '')
        if last_won == today:
            pass                                        # already won today — don't touch streak
        elif last_won == yesterday:
            s['streak'] = s.get('streak', 0) + 1       # extend streak
        else:
            s['streak'] = 1                             # new streak or gap in days
        s['maxStreak'] = max(s.get('maxStreak', 0), s['streak'])
        s['lastWon']   = today
    else:
        s['streak'] = 0

    user['stats'] = s
    _get_container().upsert_item(user)


def get_leaderboard(limit: int = 10) -> list:
    items = list(_get_container().query_items(
        query='SELECT c.username, c.displayName, c.stats FROM c WHERE IS_DEFINED(c.stats)',
        enable_cross_partition_query=True
    ))
    items.sort(key=lambda x: x.get('stats', {}).get('won', 0), reverse=True)
    return items[:limit]


# ── Room helpers ───────────────────────────────────────────────────────────

def list_all_users() -> list:
    return list(_get_container().query_items(
        query="SELECT c.username, c.displayName FROM c WHERE NOT IS_DEFINED(c.type)",
        enable_cross_partition_query=True
    ))


def create_room(room: dict):
    return _get_container().create_item(body=room)


def find_room_by_id(room_id: str):
    results = list(_get_container().query_items(
        query="SELECT * FROM c WHERE c.id = @id AND c.type = 'room'",
        parameters=[{'name': '@id', 'value': room_id}],
        enable_cross_partition_query=True
    ))
    return results[0] if results else None


def get_pending_invites(username: str) -> list:
    results = list(_get_container().query_items(
        query="SELECT * FROM c WHERE c.type = 'room' AND ARRAY_CONTAINS(c.players, @username)",
        parameters=[{'name': '@username', 'value': username.lower()}],
        enable_cross_partition_query=True
    ))
    return [r for r in results if r.get('playerStatus', {}).get(username.lower()) == 'pending']


def update_room(room: dict):
    return _get_container().upsert_item(room)
