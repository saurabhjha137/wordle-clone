import os
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
