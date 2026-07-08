from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from azure.cosmos.exceptions import CosmosResourceNotFoundError

from dependencies import require_admin
from database import get_container
from models import User
from schemas import AdminResetUserRequest, MessageResponse, SetAdminRequest
from auth.utils import hash_password
from utils.audit import log_admin_action


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get(
    "/show-all-user-data",
    summary="List every user with their auth activity (admin only)",
)
def show_all_user_data(_: User = Depends(require_admin)):
    users_c    = get_container("users")
    activity_c = get_container("auth_activity")

    users = list(users_c.query_items(
        query="SELECT * FROM c ORDER BY c.created_at ASC",
        enable_cross_partition_query=True,
    ))

    result = []
    for u in users:
        activity = list(activity_c.query_items(
            query="SELECT * FROM c ORDER BY c.timestamp DESC",
            partition_key=u["username"],
        ))
        result.append({
            "id":         u.get("id"),
            "username":   u["username"],
            "email":      u.get("email"),
            "secret_q1":  u.get("secret_q1"),
            "secret_q2":  u.get("secret_q2"),
            "created_at": u.get("created_at"),
            "updated_at": u.get("updated_at"),
            "activity": [
                {
                    "action":     a["action"],
                    "success":    a["success"],
                    "ip_address": a.get("ip_address"),
                    "detail":     a.get("detail"),
                    "timestamp":  a["timestamp"],
                }
                for a in activity
            ],
        })

    return {"total": len(result), "users": result}


@router.get("/users", response_model=dict,
            summary="List all registered users (for room player picker)")
def list_users(admin: User = Depends(require_admin)):
    users = list(get_container("users").query_items(
        query="SELECT c.username FROM c ORDER BY c.username ASC",
        enable_cross_partition_query=True,
    ))
    return {
        "users": [
            {"username": u["username"]}
            for u in users
            if u["username"] != admin.username
        ]
    }


@router.post("/set-admin", response_model=MessageResponse,
             summary="Promote or demote a user's admin status (admin only)")
def set_admin(body: SetAdminRequest, admin: User = Depends(require_admin)):
    users_c = get_container("users")
    try:
        doc = users_c.read_item(item=body.username, partition_key=body.username)
    except CosmosResourceNotFoundError:
        raise HTTPException(status_code=404, detail=f"User '{body.username}' not found.")

    doc["is_admin"] = (body.is_admin == "Y")
    users_c.upsert_item(doc)
    state = "Y" if doc["is_admin"] else "N"
    log_admin_action(actor=admin.username, action="set_admin",
                     target=body.username, detail=f"is_admin → {state}")
    return {"message": f"User '{body.username}' is_admin → {state}."}


@router.post("/reset-user", response_model=MessageResponse,
             summary="Admin: reset password, secret answers, email, or username for any user")
def admin_reset_user(body: AdminResetUserRequest, admin: User = Depends(require_admin)):
    users_c = get_container("users")

    try:
        doc = users_c.read_item(item=body.username, partition_key=body.username)
    except CosmosResourceNotFoundError:
        raise HTTPException(status_code=404, detail=f"User '{body.username}' not found.")

    changed = []

    if body.new_password is not None:
        doc["password_hash"] = hash_password(body.new_password)
        changed.append("password")

    if body.new_email is not None:
        doc["email"] = body.new_email.strip().lower() if body.new_email.strip() else None
        changed.append("email")

    if body.new_secret_a1 is not None:
        doc["secret_a1"] = hash_password(body.new_secret_a1)
        changed.append("secret_a1")

    if body.new_secret_a2 is not None:
        doc["secret_a2"] = hash_password(body.new_secret_a2)
        changed.append("secret_a2")

    doc["updated_at"] = _now()

    if body.new_username is not None and body.new_username != body.username:
        try:
            users_c.read_item(item=body.new_username, partition_key=body.new_username)
            raise HTTPException(status_code=409,
                                detail=f"Username '{body.new_username}' is already taken.")
        except CosmosResourceNotFoundError:
            pass

        new_doc = {**doc, "id": body.new_username, "username": body.new_username}
        users_c.create_item(new_doc)
        users_c.delete_item(item=body.username, partition_key=body.username)
        changed.append("username")

        note = " Note: game stats/activity remain indexed under the old username." if len(changed) > 1 or "username" in changed else ""
        log_admin_action(actor=admin.username, action="reset_user",
                         target=body.username, detail=f"changed: {', '.join(changed)}")
        return {"message": f"User '{body.username}' → '{body.new_username}'. Changed: {', '.join(changed)}.{note}"}

    if not changed:
        return {"message": "No changes requested. Provide at least one new_* field."}

    users_c.upsert_item(doc)
    log_admin_action(actor=admin.username, action="reset_user",
                     target=body.username, detail=f"changed: {', '.join(changed)}")
    return {"message": f"User '{body.username}' updated. Changed: {', '.join(changed)}."}
