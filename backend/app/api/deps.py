from typing import Annotated
from datetime import datetime, timezone

from fastapi import Header, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import User
from app.services.auth_security import create_access_token, decode_access_token



def serialize_datetime(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)
    return value.isoformat().replace('+00:00', 'Z')


def serialize_response_data(data: object) -> object:
    if isinstance(data, datetime):
        return serialize_datetime(data)
    if isinstance(data, dict):
        return {key: serialize_response_data(value) for key, value in data.items()}
    if isinstance(data, list):
        return [serialize_response_data(item) for item in data]
    if isinstance(data, tuple):
        return [serialize_response_data(item) for item in data]
    return data


def success(data: object) -> dict:
    return {
        'code': 0,
        'message': 'ok',
        'data': serialize_response_data(data),
    }



def user_to_dict(user: User) -> dict:
    return {
        'id': user.id,
        'username': user.username,
        'displayName': user.display_name,
        'role': user.role,
    }



def token_for_user(user: User) -> str:
    return create_access_token(user.username, user.role)



def get_current_user_from_token(
    db: Session,
    authorization: Annotated[str | None, Header()] = None,
) -> User:
    if not authorization or not authorization.lower().startswith('bearer '):
        raise HTTPException(status_code=401, detail='missing bearer token')

    token = authorization.split(' ', 1)[1]
    try:
        payload = decode_access_token(token)
    except Exception as exc:
        raise HTTPException(status_code=401, detail='invalid access token') from exc

    username = payload.get('sub')
    if not username:
        raise HTTPException(status_code=401, detail='invalid access token')

    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail='user not found')

    return user



def get_demo_user(
    db: Session,
    authorization: Annotated[str | None, Header()] = None,
    x_demo_user: Annotated[str | None, Header()] = None,
    default_username: str = 'owner_demo',
) -> User:
    if settings.app_env in {'test', 'development'}:
        if x_demo_user:
            user = db.query(User).filter(User.username == x_demo_user).first()
            if not user:
                raise HTTPException(status_code=401, detail='demo user not found')
            return user

        if authorization and authorization.lower().startswith('bearer '):
            return get_current_user_from_token(db, authorization)

        user = db.query(User).filter(User.username == default_username).first()
        if not user:
            raise HTTPException(status_code=401, detail='demo user not found')
        return user

    return get_current_user_from_token(db, authorization)



def require_role(user: User, roles: set[str]) -> None:
    if user.role not in roles:
        raise HTTPException(status_code=403, detail='role is not allowed for this action')
