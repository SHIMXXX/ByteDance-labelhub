from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_demo_user, require_role, success
from app.core.database import get_db
from app.models import Assignment, DatasetItem, ReviewRecord, Submission, TemplateVersion
from app.services.access_control import require_labeler_assignment
from app.services.dataset_import import get_dataset_item_context, get_dataset_item_source
from app.services.llm_assist import generate_llm_assist
from app.services.review_history import build_answer_diff

router = APIRouter(prefix='/workbench', tags=['workbench'])


class LLMAssistRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    assignmentId: int
    itemId: int
    field: str
    prompt: str
    currentAnswers: dict | None = None
    source: dict | None = None



def map_workbench_status(submission: Submission | None) -> str:
    if submission is None:
        return 'not_started'
    if submission.ai_audit_job and submission.ai_audit_job.status in {'queued', 'running'}:
        return 'ai_reviewing'
    if submission.status == 'draft':
        return 'draft'
    if submission.status == 'submitted':
        return 'submitted'
    if submission.status == 'ai_passed':
        return 'manual_reviewing'
    if submission.status == 'needs_revision':
        return 'needs_revision'
    if submission.status == 'review_passed':
        return 'review_passed'
    return 'submitted'


def get_latest_reject_reason_map(db: Session) -> dict[int, str]:
    latest_reject_reason_by_submission_id: dict[int, str] = {}
    for record in (
        db.query(ReviewRecord)
        .filter(ReviewRecord.decision == 'reject')
        .order_by(ReviewRecord.created_at.desc())
        .all()
    ):
        if record.submission_id not in latest_reject_reason_by_submission_id:
            latest_reject_reason_by_submission_id[record.submission_id] = record.reason
    return latest_reject_reason_by_submission_id


def get_latest_reject_reason(submission: Submission, latest_reject_reason_by_submission_id: dict[int, str]) -> str | None:
    if submission.status != 'needs_revision':
        return None

    review_reason = latest_reject_reason_by_submission_id.get(submission.id)
    if review_reason:
        return review_reason
    ai_result = submission.ai_audit_result
    if ai_result and ai_result.decision == 'reject':
        return ai_result.summary
    return None


def get_submission_item_display_id(submission: Submission) -> int:
    if submission.dataset_item and submission.dataset_item.item_index is not None:
        return submission.dataset_item.item_index
    if submission.dataset_item_id is not None:
        return submission.dataset_item_id
    return submission.assignment_id


def count_assignment_completed_items(db: Session, assignment_id: int) -> int:
    return db.query(func.count(func.distinct(Submission.dataset_item_id))).filter(
        Submission.assignment_id == assignment_id,
        Submission.status.in_(['submitted', 'ai_passed', 'needs_revision', 'review_passed']),
    ).scalar() or 0


@router.post('/llm-assist')
def generate_workbench_llm_assist(
    payload: LLMAssistRequest,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user, default_username='labeler_demo')
    require_role(user, {'labeler'})
    assignment = require_labeler_assignment(db, payload.assignmentId, user)

    submission = (
        db.query(Submission)
        .filter(
            Submission.assignment_id == assignment.id,
            Submission.dataset_item_id == payload.itemId,
        )
        .first()
    )
    source = payload.source or get_dataset_item_source(submission.dataset_item if submission else None)

    return success(
        generate_llm_assist(
            source=source,
            prompt=payload.prompt,
            current_answers=payload.currentAnswers,
        )
    )


@router.get('/summary')
def get_workbench_summary(
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user, default_username='labeler_demo')
    require_role(user, {'labeler'})

    assignments = (
        db.query(Assignment)
        .filter(Assignment.user_id == user.id)
        .order_by(Assignment.claimed_at.desc())
        .all()
    )
    submissions = (
        db.query(Submission)
        .filter(Submission.user_id == user.id)
        .order_by(Submission.updated_at.desc())
        .all()
    )
    latest_reject_reason_by_submission_id = get_latest_reject_reason_map(db)

    metrics = {
        'claimedTaskCount': len(assignments),
        'submittedItemCount': sum(1 for submission in submissions if submission.status in {'submitted', 'ai_passed'}),
        'reviewPassedItemCount': sum(1 for submission in submissions if submission.status == 'review_passed'),
        'needsRevisionItemCount': sum(1 for submission in submissions if submission.status == 'needs_revision'),
    }

    assignment_summaries = []
    for assignment in assignments:
        task_submissions = [submission for submission in submissions if submission.assignment_id == assignment.id]
        latest_submission = task_submissions[0] if task_submissions else None
        revision_submissions = [submission for submission in task_submissions if submission.status == 'needs_revision']
        latest_revision_submission = revision_submissions[0] if revision_submissions else None
        assignment_summaries.append(
            {
                'assignmentId': assignment.id,
                'taskId': assignment.task_id,
                'taskTitle': assignment.task.title,
                'taskStatus': assignment.task.status,
                'total': assignment.progress_total,
                'completed': count_assignment_completed_items(db, assignment.id),
                'reviewPassed': sum(1 for submission in task_submissions if submission.status == 'review_passed'),
                'needsRevision': sum(1 for submission in task_submissions if submission.status == 'needs_revision'),
                'latestSubmissionStatus': map_workbench_status(latest_submission),
                'latestUpdatedAt': latest_submission.updated_at if latest_submission else None,
                'latestRejectReason': get_latest_reject_reason(latest_submission, latest_reject_reason_by_submission_id) if latest_submission else None,
                'latestRejectItemId': get_submission_item_display_id(latest_revision_submission) if latest_revision_submission else None,
                'latestRejectAt': latest_revision_submission.updated_at if latest_revision_submission else None,
                'revisionItemIds': sorted(get_submission_item_display_id(submission) for submission in revision_submissions),
            }
        )

    recent_submissions = [
        {
            'submissionId': submission.id,
            'assignmentId': submission.assignment_id,
            'taskId': submission.task_id,
            'taskTitle': submission.task.title,
            'itemId': submission.dataset_item_id or submission.assignment_id,
            'status': map_workbench_status(submission),
            'updatedAt': submission.updated_at,
            'latestRejectReason': get_latest_reject_reason(submission, latest_reject_reason_by_submission_id),
        }
        for submission in submissions[:8]
    ]

    return success(
        {
            'metrics': metrics,
            'assignments': assignment_summaries,
            'recentSubmissions': recent_submissions,
        }
    )


@router.get('/history')
def get_workbench_history(
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user, default_username='labeler_demo')
    require_role(user, {'labeler'})

    submissions = (
        db.query(Submission)
        .filter(Submission.user_id == user.id)
        .order_by(Submission.updated_at.desc())
        .all()
    )

    return success(
        {
            'items': [
                {
                    'submissionId': submission.id,
                    'assignmentId': submission.assignment_id,
                    'taskId': submission.task_id,
                    'taskTitle': submission.task.title,
                    'itemId': submission.dataset_item_id or submission.assignment_id,
                    'status': submission.status,
                    'updatedAt': submission.updated_at,
                }
                for submission in submissions
            ]
        }
    )


@router.get('/items')
def get_workbench_items(
    assignmentId: int,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user, default_username='labeler_demo')
    require_role(user, {'labeler'})

    assignment = require_labeler_assignment(db, assignmentId, user)

    task = assignment.task
    template_version = None
    if task.active_template_version_id:
        template_version = db.get(TemplateVersion, task.active_template_version_id)
    elif task.active_template_id:
        template_version = (
            db.query(TemplateVersion)
            .filter(TemplateVersion.template_id == task.active_template_id)
            .order_by(TemplateVersion.version.desc())
            .first()
        )

    submissions = {
        submission.dataset_item_id: submission
        for submission in db.query(Submission).filter(Submission.assignment_id == assignment.id).all()
    }
    submission_versions_by_submission_id: dict[int, list] = {}
    for submission in submissions.values():
        if not submission:
            continue
        submission_versions_by_submission_id[submission.id] = sorted(
            submission.versions,
            key=lambda version: version.version_no,
        )
    latest_reject_reason_by_submission_id = get_latest_reject_reason_map(db)

    dataset_items = []
    if task.dataset_id:
        dataset_items = (
            db.query(DatasetItem)
            .filter(DatasetItem.dataset_id == task.dataset_id)
            .order_by(DatasetItem.item_index.asc())
            .all()
        )

    items = []
    completed = 0
    for dataset_item in dataset_items:
        submission = submissions.get(dataset_item.id)
        if submission and submission.status in {'submitted', 'ai_passed', 'needs_revision', 'review_passed'}:
            completed += 1
        draft_submission = None
        if submission:
            submission_versions = submission_versions_by_submission_id.get(submission.id, [])
            previous_version = submission_versions[-1] if submission_versions else None
            previous_answers = previous_version.answers_json if previous_version else None
            draft_submission = {
                'submissionId': submission.id,
                'status': submission.status,
                'statusLabel': map_workbench_status(submission),
                'savedAt': submission.updated_at,
                'answers': submission.answers_json,
                'previousAnswers': previous_answers,
                'diffItems': build_answer_diff(previous_answers or {}, submission.answers_json or {}) if previous_answers else [],
                'currentVersionNo': submission.current_version_no,
                'latestRejectReason': get_latest_reject_reason(submission, latest_reject_reason_by_submission_id),
            }
        items.append(
            {
                'itemId': dataset_item.id,
                'index': dataset_item.item_index,
                'source': get_dataset_item_context(dataset_item),
                'draftSubmission': draft_submission,
            }
        )

    return success(
        {
            'assignmentId': assignment.id,
            'task': {
                'id': task.id,
                'title': task.title,
            },
            'template': {
                'templateId': task.active_template_id,
                'templateVersionId': template_version.id if template_version else None,
                'schema': template_version.schema_json if template_version else {'version': 1, 'components': []},
            },
            'items': items,
            'progress': {
                'total': len(dataset_items),
                'completed': completed,
            },
        }
    )
