import json

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.api.deps import get_demo_user, require_role, success
from app.core.database import get_db
from app.core.config import settings
from app.models import AIAuditJob, Assignment, ReviewRecord, Submission, Task, TemplateVersion, utc_now
from app.services.access_control import require_labeler_assignment, require_labeler_submission
from app.services.ai_audit import build_config_snapshot, build_failed_human_review_result, persist_ai_audit
from app.services.ai_executor import DeepSeekAIExecutor, LocalRuleAIExecutor
from app.services.ai_job_runner import enqueue_ai_audit_job
from app.services.audit_log import write_audit_log
from app.services.review_history import create_submission_version, reset_review_progress_for_submission

router = APIRouter(prefix='/submissions', tags=['submissions'])
executor = DeepSeekAIExecutor() if settings.ai_provider == 'deepseek' else LocalRuleAIExecutor()


class DraftSaveRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    assignment_id: int = Field(alias='assignmentId')
    item_id: int | None = Field(default=None, alias='itemId')
    template_version_id: int | None = Field(default=None, alias='templateVersionId')
    answers: dict = Field(default_factory=dict)


class SubmitRequest(BaseModel):
    answers: dict | None = None


def walk_schema_components(components: list[dict]) -> list[dict]:
    flat: list[dict] = []
    for component in components:
        if component.get('type') == 'group':
            flat.extend(walk_schema_components(component.get('children', [])))
            continue
        if component.get('type') == 'tab_container':
            for tab in component.get('tabs', []):
                flat.extend(walk_schema_components(tab.get('children', [])))
            continue
        flat.append(component)
    return flat


def evaluate_rule(rule: dict, answers: dict) -> bool:
    field_value = answers.get(rule.get('field'))
    operator = rule.get('operator')
    if operator == 'eq':
        return field_value == rule.get('value')
    if operator == 'neq':
        return field_value != rule.get('value')
    if operator == 'not_empty':
        return field_value not in (None, '', [])
    if operator == 'includes':
        return isinstance(field_value, list) and rule.get('value') in field_value
    return False


def component_is_visible(component: dict, answers: dict) -> bool:
    visible_when = component.get('visibleWhen') or []
    if not visible_when:
        return True
    return all(evaluate_rule(rule, answers) for rule in visible_when)


def extract_template_components(schema_json: dict | None) -> list[dict]:
    if not isinstance(schema_json, dict):
        return []

    if schema_json.get('version') == 3:
        answer_view = schema_json.get('answerView')
        if isinstance(answer_view, dict):
            components = answer_view.get('components', [])
            return components if isinstance(components, list) else []
        return []

    components = schema_json.get('components', [])
    return components if isinstance(components, list) else []


def validate_required_answers(template_version: TemplateVersion | None, answers: dict) -> None:
    if not template_version:
        return

    components = walk_schema_components(extract_template_components(template_version.schema_json))
    for component in components:
        if component.get('type') == 'show_item' or not component_is_visible(component, answers):
            continue

        field = component.get('field')
        if component.get('required') and (field not in answers or answers[field] in (None, '', [])):
            raise HTTPException(status_code=400, detail=f'missing required answer: {field}')

        for rule in component.get('validationRules', []):
            if rule.get('type') == 'required_if' and evaluate_rule(rule, answers) and answers.get(field) in (None, '', []):
                raise HTTPException(status_code=400, detail=f'missing conditional answer: {field}')
            if rule.get('type') == 'min_selected' and len(answers.get(field, [])) < int(rule.get('value', 0)):
                raise HTTPException(status_code=400, detail=f'not enough selections: {field}')
            if rule.get('type') == 'json_valid' and answers.get(field):
                try:
                    json.loads(answers[field])
                except json.JSONDecodeError as exc:
                    raise HTTPException(status_code=400, detail=f'invalid json answer: {field}') from exc
            if rule.get('type') == 'min_length':
                text_value = str(answers.get(field) or '').strip()
                if len(text_value) < int(rule.get('value', 0)):
                    raise HTTPException(status_code=400, detail=f'answer is too short: {field}')
            if rule.get('type') == 'equals_if' and evaluate_rule(rule, answers) and answers.get(field) != rule.get('expectedValue'):
                raise HTTPException(status_code=400, detail=f'answer must equal expected value: {field}')
            if rule.get('type') == 'not_equals_if' and evaluate_rule(rule, answers) and answers.get(field) == rule.get('expectedValue'):
                raise HTTPException(status_code=400, detail=f'answer must not equal forbidden value: {field}')


def get_effective_template_version(db: Session, task: Task, submission: Submission | None = None) -> TemplateVersion | None:
    template_version_id = submission.template_version_id if submission else None
    if template_version_id:
        template_version = db.get(TemplateVersion, template_version_id)
        if template_version and template_version.template_id == task.active_template_id:
            return template_version

    if task.active_template_version_id:
        template_version = db.get(TemplateVersion, task.active_template_version_id)
        if template_version:
            return template_version

    if task.active_template_id:
        return (
            db.query(TemplateVersion)
            .filter(TemplateVersion.template_id == task.active_template_id)
            .order_by(TemplateVersion.version.desc())
            .first()
        )

    return None


def map_submission_status(ai_decision: str) -> str:
    if ai_decision == 'reject':
        return 'needs_revision'
    if ai_decision in {'pass', 'human_review'}:
        return 'ai_passed'
    raise HTTPException(status_code=500, detail=f'unsupported ai decision: {ai_decision}')


@router.get('')
def list_submissions(
    taskId: int | None = Query(default=None),
    userId: int | None = Query(default=None),
    status: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user)
    require_role(user, {'owner'})

    query = db.query(Submission).join(Task, Submission.task_id == Task.id).filter(Task.owner_id == user.id)
    if taskId:
        query = query.filter(Submission.task_id == taskId)
    if userId:
        query = query.filter(Submission.user_id == userId)
    if status:
        query = query.filter(Submission.status == status)

    submissions = query.order_by(Submission.updated_at.desc()).all()

    items = []
    for submission in submissions:
        ai_result = submission.ai_audit_result
        review_records = (
            db.query(ReviewRecord)
            .filter(ReviewRecord.submission_id == submission.id)
            .order_by(ReviewRecord.created_at.desc())
            .all()
        )
        items.append({
            'submissionId': submission.id,
            'taskId': submission.task_id,
            'assignmentId': submission.assignment_id,
            'datasetItemId': submission.dataset_item_id,
            'userId': submission.user_id,
            'labelerName': submission.user.display_name,
            'status': submission.status,
            'answers': submission.answers_json,
            'finalAnswers': submission.final_answer_json or submission.answers_json,
            'currentVersionNo': submission.current_version_no,
            'currentReviewStage': submission.current_review_stage,
            'currentReviewRound': submission.current_review_round,
            'assignedReviewerId': submission.assigned_reviewer_id,
            'aiDecision': ai_result.decision if ai_result else None,
            'aiSummary': ai_result.summary if ai_result else None,
            'latestReviewDecision': review_records[0].decision if review_records else None,
            'latestReviewComment': review_records[0].comment if review_records else None,
            'latestReviewReason': review_records[0].reason if review_records else None,
            'createdAt': submission.created_at,
            'updatedAt': submission.updated_at,
        })

    return success({'items': items, 'total': len(items)})


@router.post('/draft')
def save_draft(
    payload: DraftSaveRequest,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user, default_username='labeler_demo')
    require_role(user, {'labeler'})

    assignment = require_labeler_assignment(db, payload.assignment_id, user)
    template_version = get_effective_template_version(db, assignment.task, submission=None)

    submission = None
    if payload.item_id is not None:
        submission = (
            db.query(Submission)
            .filter(Submission.assignment_id == assignment.id, Submission.dataset_item_id == payload.item_id)
            .first()
        )
    if not submission:
        submission = db.query(Submission).filter(Submission.assignment_id == assignment.id, Submission.dataset_item_id.is_(None)).first()

    if not submission:
        submission = Submission(
            task_id=assignment.task_id,
            assignment_id=assignment.id,
            dataset_item_id=payload.item_id,
            user_id=user.id,
            template_version_id=template_version.id if template_version else None,
            answers_json=payload.answers,
        )
        db.add(submission)
    else:
        if submission.status in {'submitted', 'ai_passed', 'review_passed'}:
            raise HTTPException(status_code=409, detail='submitted item cannot be saved as draft')
        submission.status = 'draft'
        submission.dataset_item_id = payload.item_id if payload.item_id is not None else submission.dataset_item_id
        submission.template_version_id = template_version.id if template_version else submission.template_version_id
        submission.answers_json = payload.answers

    db.commit()
    db.refresh(submission)

    return success(
        {
            'submissionId': submission.id,
            'status': submission.status,
            'savedAt': submission.updated_at,
        }
    )


@router.post('/{submission_id}/submit')
def submit_answers(
    submission_id: int,
    payload: SubmitRequest,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user, default_username='labeler_demo')
    require_role(user, {'labeler'})

    submission = require_labeler_submission(db, submission_id, user)
    if submission.assignment.user_id != user.id or submission.assignment.task_id != submission.task_id:
        raise HTTPException(status_code=403, detail='submission belongs to another user')
    if submission.status in {'submitted', 'ai_passed', 'review_passed'}:
        raise HTTPException(status_code=409, detail='submission has already been submitted')

    previous_status = submission.status

    if payload.answers is not None:
        submission.answers_json = payload.answers

    template_version = get_effective_template_version(db, submission.task, submission)
    if template_version is None:
        raise HTTPException(status_code=409, detail='task has no active template version')
    submission.template_version_id = template_version.id
    validate_required_answers(template_version, submission.answers_json)
    reset_review_progress_for_submission(submission, previous_status)
    version = create_submission_version(db, submission)

    job = submission.ai_audit_job
    if job is None:
        job = AIAuditJob(submission=submission, attempt_count=0, max_attempts=settings.ai_max_attempts)
        db.add(job)

    existing_result = submission.ai_audit_result or job.result
    if existing_result is not None:
        db.delete(existing_result)
        db.flush()
        submission.ai_audit_result = None
        job.result = None

    job.status = 'queued'
    job.max_attempts = settings.ai_max_attempts
    job.error_message = None
    job.error_code = None
    job.started_at = None
    job.finished_at = None
    job.config_snapshot_json = build_config_snapshot(submission.task)
    job.prompt_snapshot = None
    job.raw_response = None
    job.updated_at = utc_now()
    submission.status = 'submitted'

    db.commit()
    db.refresh(submission)

    try:
        celery_task_id = enqueue_ai_audit_job(job.id)
    except RuntimeError as exc:
        submission.status = previous_status
        job.status = 'failed'
        job.error_code = 'enqueue_failed'
        job.error_message = str(exc)
        job.finished_at = utc_now()
        db.commit()
        raise HTTPException(status_code=500, detail='failed to enqueue ai audit job') from exc

    job.celery_task_id = celery_task_id

    write_audit_log(
        db,
        event_type='submission_submitted',
        entity_type='submission',
        entity_id=submission.id,
        actor_user_id=user.id,
        payload={
            'assignmentId': submission.assignment_id,
            'aiJobId': job.id,
            'celeryTaskId': celery_task_id,
        },
    )
    write_audit_log(
        db,
        event_type='submission_version_created',
        entity_type='submission_version',
        entity_id=version.id,
        actor_user_id=user.id,
        payload={'submissionId': submission.id, 'versionNo': version.version_no},
    )
    if previous_status == 'needs_revision':
        write_audit_log(
            db,
            event_type='submission_resubmitted',
            entity_type='submission',
            entity_id=submission.id,
            actor_user_id=user.id,
            payload={'reviewRound': submission.current_review_round, 'versionNo': version.version_no},
        )
    write_audit_log(
        db,
        event_type='ai_job_queued',
        entity_type='ai_audit_job',
        entity_id=job.id,
        actor_user_id=None,
        payload={'submissionId': submission.id},
    )
    db.commit()

    return success(
        {
            'submissionId': submission.id,
            'status': submission.status,
            'submittedAt': submission.updated_at,
            'aiJobStatus': job.status,
            'aiDecision': None,
        }
    )
