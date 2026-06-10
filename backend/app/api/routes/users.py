from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_from_token, require_role, success
from app.core.database import get_db
from app.models import User

router = APIRouter(prefix='/users', tags=['users'])


@router.get('/reviewers')
def list_reviewers(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_current_user_from_token(db, authorization)
    require_role(user, {'owner'})

    reviewers = db.query(User).filter(User.role == 'reviewer').order_by(User.id.asc()).all()
    return success(
        {
            'items': [
                {
                    'id': reviewer.id,
                    'username': reviewer.username,
                    'displayName': reviewer.display_name,
                    'role': reviewer.role,
                }
                for reviewer in reviewers
            ],
            'total': len(reviewers),
        }
    )


@router.get('/labelers')
def list_labelers(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_current_user_from_token(db, authorization)
    require_role(user, {'owner'})

    labelers = db.query(User).filter(User.role == 'labeler').order_by(User.id.asc()).all()
    return success(
        {
            'items': [
                {
                    'id': labeler.id,
                    'username': labeler.username,
                    'displayName': labeler.display_name,
                    'role': labeler.role,
                }
                for labeler in labelers
            ],
            'total': len(labelers),
        }
    )
