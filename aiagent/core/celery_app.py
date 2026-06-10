from celery import Celery

from app.core.config import settings


celery_app = Celery(
    'labelhub',
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=['aiagent.services.ai_job_runner', 'aiagent.services.export_job_runner'],
)

celery_app.conf.update(
    task_default_queue='labelhub-ai',
    task_serializer='json',
    result_serializer='json',
    accept_content=['json'],
    task_always_eager=settings.celery_task_always_eager,
    imports=('aiagent.services.ai_job_runner', 'aiagent.services.export_job_runner'),
)
