from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from dependencies import require_admin
from models import AuthActivity, User

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get(
    "/show-all-user-data",
    summary="List every user with their auth activity",
    description=(
        "**Admin-only.** Requires a Bearer token for the root user. "
        "Not intended to be called from the frontend — use Swagger UI."
    ),
)
def show_all_user_data(
    db: Session = Depends(get_db),
    _: User     = Depends(require_admin),
):
    users = db.query(User).order_by(User.created_at).all()

    result = []
    for u in users:
        activity = (
            db.query(AuthActivity)
            .filter(AuthActivity.user_id == u.id)
            .order_by(AuthActivity.timestamp.desc())
            .all()
        )
        result.append({
            "id"        : u.id,
            "username"  : u.username,
            "email"     : u.email,
            "secret_q1" : u.secret_q1,
            "secret_q2" : u.secret_q2,
            "created_at": u.created_at.isoformat(),
            "updated_at": u.updated_at.isoformat(),
            "activity"  : [
                {
                    "action"    : a.action,
                    "success"   : a.success,
                    "ip_address": a.ip_address,
                    "detail"    : a.detail,
                    "timestamp" : a.timestamp.isoformat(),
                }
                for a in activity
            ],
        })

    return {"total": len(result), "users": result}
