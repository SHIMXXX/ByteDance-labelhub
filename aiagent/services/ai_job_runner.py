import inspect
import json

from sqlalchemy.orm import Session

from aiagent.core.celery_app import celery_app
from app.core.config import settings
from app.core.database import SessionLocal
from app.models import AIAuditJob, utc_now
from aiagent.services.ai_audit import (
    build_failed_human_review_result,
    map_execution_result_to_submission_status,
    persist_ai_audit_result,
)
from aiagent.services.ai_executor import LocalRuleAIExecutor, safe_format, select_ai_executor
from aiagent.services.ai_defaults import DEFAULT_AI_PASS_THRESHOLD, normalize_percent_pass_threshold
from app.services.audit_log import write_audit_log
from app.services.dataset_import import get_dataset_item_reference_answer, get_dataset_item_source


@celery_app.task(name='labelhub.ai.run_job')
def run_ai_audit_job(job_id: int) -> None:
    process_ai_audit_job(job_id)


# 中文注释：当前先提供最小入队边界，后续再补真实 worker 处理逻辑。
def enqueue_ai_audit_job(job_id: int) -> str:
    async_result = run_ai_audit_job.delay(job_id)
    return str(async_result.id)



def build_executor():
    return LocalRuleAIExecutor() if settings.ai_provider == 'local' else select_ai_executor()



def render_prompt(snapshot: dict, answers: dict, source: dict | None = None, reference_answer: dict | None = None) -> str:
    prompt_template = snapshot.get('promptTemplate') or '请审查：{answers}'
    pass_threshold = normalize_percent_pass_threshold(snapshot.get('passThreshold') or DEFAULT_AI_PASS_THRESHOLD)
    return safe_format(
        prompt_template,
        pass_threshold=pass_threshold,
        answers=json.dumps(answers, ensure_ascii=False),
        source=json.dumps(source or {}, ensure_ascii=False),
        reference_answer=json.dumps(reference_answer or {}, ensure_ascii=False),
    )


def execute_ai_audit(executor, submission, snapshot: dict, source: dict | None, reference_answer: dict | None):
    kwargs = {
        'prompt_template': snapshot.get('promptTemplate'),
        'score_dimensions': snapshot.get('scoreDimensions'),
        'pass_threshold': snapshot.get('passThreshold'),
        'source': source,
        'reference_answer': reference_answer,
    }
    if 'model' in inspect.signature(executor.execute).parameters:
        kwargs['model'] = snapshot.get('aiModel')
    return executor.execute(submission.answers_json, **kwargs)



def process_ai_audit_job(job_id: int) -> None:
    db: Session = SessionLocal()
    try:
        job = db.get(AIAuditJob, job_id)
        if job is None or job.status not in {'queued', 'running'}:
            return

        submission = job.submission
        snapshot = job.config_snapshot_json or {}
        executor = select_ai_executor(snapshot.get('aiModel')) if settings.ai_provider != 'local' else build_executor()
        source = get_dataset_item_source(submission.dataset_item)
        reference_answer = get_dataset_item_reference_answer(submission.dataset_item)

        job.status = 'running'
        job.started_at = utc_now()
        job.attempt_count = (job.attempt_count or 0) + 1
        write_audit_log(
            db,
            event_type='ai_job_started',
            entity_type='ai_audit_job',
            entity_id=job.id,
            actor_user_id=None,
            payload={'submissionId': submission.id, 'attempt': job.attempt_count},
        )
        db.commit()

        try:
            execution_result = execute_ai_audit(executor, submission, snapshot, source, reference_answer)
        except RuntimeError as exc:
            job.error_message = str(exc)
            job.error_code = 'runtime_error'
            job.finished_at = utc_now()
            job.prompt_snapshot = render_prompt(snapshot, submission.answers_json, source, reference_answer)
            job.raw_response = str(exc)
            if job.attempt_count < job.max_attempts:
                job.status = 'queued'
                write_audit_log(
                    db,
                    event_type='ai_job_retried',
                    entity_type='ai_audit_job',
                    entity_id=job.id,
                    actor_user_id=None,
                    payload={
                        'submissionId': submission.id,
                        'attempt': job.attempt_count,
                        'errorMessage': str(exc),
                    },
                )
                db.commit()
                return

            fallback_result = build_failed_human_review_result(str(exc))
            job.status = 'fallback_human_review'
            persist_ai_audit_result(db, submission, job, fallback_result, validation_status='fallback')
            submission.status = map_execution_result_to_submission_status(fallback_result.decision)
            write_audit_log(
                db,
                event_type='ai_audit_fallback_human_review',
                entity_type='submission',
                entity_id=submission.id,
                actor_user_id=None,
                payload={'jobId': job.id, 'errorMessage': str(exc)},
            )
            db.commit()
            return

        job.prompt_snapshot = render_prompt(snapshot, submission.answers_json, source, reference_answer)
        job.raw_response = json.dumps(
            {
                'scores': execution_result.scores,
                'overallScore': execution_result.overall_score,
                'decision': execution_result.decision,
                'summary': execution_result.summary,
            },
            ensure_ascii=False,
        )
        job.status = 'succeeded'
        job.error_message = None
        job.error_code = None
        job.finished_at = utc_now()
        persist_ai_audit_result(db, submission, job, execution_result, validation_status='valid')
        submission.status = map_execution_result_to_submission_status(execution_result.decision)
        write_audit_log(
            db,
            event_type='ai_audit_succeeded',
            entity_type='submission',
            entity_id=submission.id,
            actor_user_id=None,
            payload={'jobId': job.id, 'decision': execution_result.decision, 'overallScore': execution_result.overall_score},
        )
        db.commit()
    finally:
        db.close()
