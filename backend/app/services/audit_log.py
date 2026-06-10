from sqlalchemy.orm import Session

from app.models import AuditLog


def write_audit_log(
    db: Session,
    *,
    event_type: str,
    entity_type: str,
    entity_id: int,
    actor_user_id: int | None,
    payload: dict,
) -> AuditLog:
    log = AuditLog(
        event_type=event_type,
        entity_type=entity_type,
        entity_id=entity_id,
        actor_user_id=actor_user_id,
        payload_json=payload,
    )
    db.add(log)
    return log
