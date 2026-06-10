from app._repo_path import REPO_ROOT  # noqa: F401

from aiagent.core.celery_app import celery_app

__all__ = ['celery_app']
