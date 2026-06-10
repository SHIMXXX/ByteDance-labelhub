from sqlalchemy.orm import Session

from app.models import AIAuditJob, AIAuditResult, Submission, Task, utc_now
from aiagent.services.ai_defaults import (
    DEFAULT_AI_PASS_THRESHOLD,
    calculate_overall_score,
    normalize_percent_pass_threshold,
)
from aiagent.services.ai_executor import AIExecutionResult


def build_config_snapshot(task: Task) -> dict:
    config = task.ai_audit_config
    if config is None:
        return {
            'promptTemplate': getattr(task, 'ai_prompt_template', '') or '',
            'scoreDimensions': getattr(task, 'ai_score_dimensions_json', []) or [],
            'passThreshold': normalize_percent_pass_threshold(getattr(task, 'ai_pass_threshold', DEFAULT_AI_PASS_THRESHOLD)),
            'configVersion': 1,
            'aiModel': 'qwen3.6-flash',
        }

    return {
        'promptTemplate': config.prompt_template,
        'scoreDimensions': config.score_dimensions_json or [],
        'passThreshold': normalize_percent_pass_threshold(config.pass_threshold),
        'configVersion': config.config_version,
        'aiModel': config.ai_model,
    }



def map_execution_result_to_submission_status(ai_decision: str) -> str:
    if ai_decision == 'reject':
        return 'needs_revision'
    if ai_decision in {'pass', 'human_review'}:
        return 'ai_passed'
    raise RuntimeError(f'unsupported ai decision: {ai_decision}')



def build_failed_human_review_result(error_message: str) -> AIExecutionResult:
    return AIExecutionResult(
        scores=[{'dimension': 'system', 'score': 0, 'reason': error_message}],
        decision='human_review',
        summary='AI \u9884\u5ba1\u5931\u8d25\uff0c\u5df2\u81ea\u52a8\u8f6c\u4eba\u5de5\u590d\u6838\u3002',
        overall_score=0,
    )


def mark_timed_out_ai_audit_jobs_as_human_review(
    db: Session,
    *,
    task_ids: list[int] | None = None,
    submission_id: int | None = None,
) -> int:
    # AI audit jobs should not be failed just because they have waited in the queue.
    return 0


def persist_ai_audit_result(
    db: Session,
    submission: Submission,
    job: AIAuditJob,
    execution_result: AIExecutionResult,
    validation_status: str,
) -> AIAuditResult:
    result = submission.ai_audit_result
    if result is None:
        result = AIAuditResult(job=job, submission=submission)

    snapshot = job.config_snapshot_json or {}
    result.scores_json = execution_result.scores
    result.overall_score = (
        execution_result.overall_score
        if execution_result.overall_score is not None
        else calculate_overall_score(execution_result.scores, snapshot.get('scoreDimensions'))
    )
    result.decision = execution_result.decision
    result.summary = execution_result.summary
    result.prompt_snapshot = job.prompt_snapshot
    result.raw_response = job.raw_response
    result.validation_status = validation_status
    result.config_version = snapshot.get('configVersion', 1)
    db.add(result)
    return result



def persist_ai_audit(
    submission: Submission,
    execution_result: AIExecutionResult,
) -> tuple[AIAuditJob, AIAuditResult]:
    job = submission.ai_audit_job
    if job is None:
        job = AIAuditJob(submission=submission, attempt_count=0, max_attempts=1)
        job.status = 'done'
        job.error_message = None
        job.started_at = job.started_at or utc_now()
        job.finished_at = utc_now()
        job.attempt_count = (job.attempt_count or 0) + 1

    result = submission.ai_audit_result
    if result is None:
        result = AIAuditResult(job=job, submission=submission)

    result.scores_json = execution_result.scores
    result.overall_score = (
        execution_result.overall_score
        if execution_result.overall_score is not None
        else calculate_overall_score(execution_result.scores)
    )
    result.decision = execution_result.decision
    result.summary = execution_result.summary
    return job, result
