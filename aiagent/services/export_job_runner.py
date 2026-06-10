from sqlalchemy.orm import Session

from aiagent.core.celery_app import celery_app
from app.core.database import SessionLocal
from app.services.export_service import process_export_job


@celery_app.task(name='labelhub.exports.run_job')
def run_export_job(job_id: int) -> None:
    process_export_task(job_id)


# 中文注释：导出任务沿用 AI 审核的最小异步边界，先提供入队与 worker 处理能力。
def enqueue_export_job(job_id: int) -> str:
    async_result = run_export_job.delay(job_id)
    return str(async_result.id)



def process_export_task(job_id: int) -> None:
    db: Session = SessionLocal()
    try:
        process_export_job(db, job_id)
    finally:
        db.close()
