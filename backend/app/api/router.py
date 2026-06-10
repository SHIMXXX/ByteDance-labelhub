from fastapi import APIRouter

from app.api.routes import auth, datasets, exports, health, owner_reviews, reviews, submissions, tasks, templates, users, workbench
from app.core.config import settings

api_router = APIRouter(prefix=settings.api_prefix)
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(datasets.router)
api_router.include_router(reviews.router)
api_router.include_router(tasks.router)
api_router.include_router(templates.router)
api_router.include_router(users.router)
api_router.include_router(exports.router)
api_router.include_router(submissions.router)
api_router.include_router(workbench.router)
api_router.include_router(owner_reviews.router)
