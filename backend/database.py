"""Cosmos DB client — lazy-initialised, module-level singleton.

Containers are created on first cold start (create_if_not_exists).
After that, get_container() returns a cached ContainerProxy with zero
network overhead.
"""
import os
from azure.cosmos import CosmosClient, PartitionKey

_CONN_STR = os.environ.get("COSMOS_CONNECTION_STRING", "")
_DB_NAME   = "wordleee"

_client    = None
_database  = None
_containers: dict = {}

# Container name → partition key path
_SCHEMAS = {
    "users":                "/username",
    "auth_activity":        "/username",
    "user_stats":           "/username",
    "user_stats_by_length": "/username",
    "game_results":         "/username",
    "rooms":                "/id",
    "room_participants":    "/room_id",
    "daily_submissions":    "/username",
    "user_achievements":    "/username",
    "audit_log":            "/actor",
}


def _get_database():
    global _client, _database
    if _client is None:
        _client = CosmosClient.from_connection_string(_CONN_STR)
    if _database is None:
        _database = _client.create_database_if_not_exists(id=_DB_NAME)
    return _database


def ensure_containers():
    """Create all containers (idempotent). Called once at module load."""
    if len(_containers) == len(_SCHEMAS):
        return
    db = _get_database()
    for name, pk in _SCHEMAS.items():
        if name not in _containers:
            _containers[name] = db.create_container_if_not_exists(
                id=name,
                partition_key=PartitionKey(path=pk),
            )


def get_container(name: str):
    """Return a cached ContainerProxy for the given container name."""
    if name not in _containers:
        ensure_containers()
    return _containers[name]


try:
    ensure_containers()
except Exception as exc:
    # Log warning but don't crash import — will fail on first DB call instead
    import sys
    print(f"[database] Warning: could not connect to Cosmos DB: {exc}", file=sys.stderr)
