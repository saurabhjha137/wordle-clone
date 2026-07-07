from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from dependencies import require_admin
from models import AuthActivity, User
from schemas import MessageResponse, SetAdminRequest

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


@router.post(
    "/set-admin",
    response_model=MessageResponse,
    summary="Promote or demote a user's admin status (ROOT only)",
    description=(
        "**ROOT user only.** Pass `is_admin: Y` to grant admin rights, `N` to revoke. "
        "Intended to be called from Swagger UI or a direct API call — not from the frontend."
    ),
)
def set_admin(
    body: SetAdminRequest,
    db  : Session = Depends(get_db),
    _   : User    = Depends(require_admin),
):
    user = db.query(User).filter(User.username == body.username).first()
    if not user:
        raise HTTPException(status_code=404, detail=f"User '{body.username}' not found.")
    user.is_admin = (body.is_admin == "Y")
    db.commit()
    state = "Y" if user.is_admin else "N"
    return {"message": f"User '{body.username}' is_admin → {state}."}
