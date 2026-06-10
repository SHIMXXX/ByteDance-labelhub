import os

from fastapi import FastAPI

from app.api.router import api_router
from app.core.config import settings
from app.core.database import SessionLocal, init_db, seed_demo_users

app = FastAPI(title=settings.app_name)
app.include_router(api_router)


@app.on_event('startup')
def startup() -> None:
    if settings.app_env != 'test' and settings.jwt_secret_key == 'change-me-jwt-secret':
        raise RuntimeError('jwt_secret_key must be explicitly configured outside test environment')
    if os.getenv('LABELHUB_SKIP_STARTUP_DB_INIT') == '1':
        return

    init_db()
    db = SessionLocal()
    try:
        seed_demo_users(db)
    finally:
        db.close()
