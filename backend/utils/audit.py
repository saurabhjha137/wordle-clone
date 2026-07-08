"""Admin action audit log — writes to the audit_log Cosmos container.

Schema per document:
  id        – UUID
  actor     – username who performed the action (partition key)
  action    – short verb: "set_admin", "reset_user", "delete_room", …
  target    – the subject of the action (username, room_id, …)
  detail    – optional free-text context
  timestamp – UTC ISO string
"""
import uuid
from datetime import datetime, timezone


def log_admin_action(actor: str, action: str, target: str, detail: str = "") -> None:
    """Write one audit record. Never raises — failure must not block the caller."""
    try:
        from database import get_container
        get_container("audit_log").create_item({
            "id":        str(uuid.uuid4()),
            "actor":     actor,
            "action":    action,
            "target":    target,
            "detail":    detail,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        pass
