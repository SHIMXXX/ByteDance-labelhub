from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_from_token, success, token_for_user, user_to_dict
from app.core.database import get_db
from app.models import User
from app.services.auth_security import verify_password

router = APIRouter(prefix='/auth', tags=['auth'])


class LoginRequest(BaseModel):
    username: str | None = None
    password: str | None = None
    role: str | None = None


@router.post('/login')
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> dict:
    if not payload.username or not payload.password:
        raise HTTPException(status_code=400, detail='username and password are required')

    user = db.query(User).filter(User.username == payload.username).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail='invalid username or password')

    return success(
        {
            'token': token_for_user(user),
            'user': user_to_dict(user),
        }
    )


@router.get('/me')
def get_current_user(
    db: Session = Depends(get_db),
    authorization: Annotated[str | None, Header()] = None,
) -> dict:
    user = get_current_user_from_token(db, authorization)
    return success(user_to_dict(user))
