from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_demo_user, require_role, success
from app.core.database import get_db
from app.models import (
    AIAuditJob,
    Assignment,
    AuditLog,
    ReviewRecord,
    Submission,
    SubmissionVersion,
    Task,
    TaskReviewerAssignment,
    User,
)
from app.services.ai_audit import mark_timed_out_ai_audit_jobs_as_human_review
from app.services.dataset_import import get_dataset_item_context
from app.services.review_history import build_answer_diff

router = APIRouter(prefix='/owner-reviews', tags=['owner-reviews'])

LABELER_COMPLETED_STATUSES = {'submitted', 'ai_passed', 'needs_revision', 'review_passed'}


def require_owner_review_task(db: Session, task_id: int, owner: User) -> Task:
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail='task not found')
    if task.owner_id != owner.id:
        raise HTTPException(status_code=403, detail='task belongs to another owner')
    return task


def serialize_ai_audit(submission: Submission) -> dict | None:
    job = submission.ai_audit_job
    result = submission.ai_audit_result
    if job is None and result is None:
        return None

    return {
        'job': None if job is None else {
            'jobId': job.id,
            'status': job.status,
            'attemptCount': job.attempt_count,
            'maxAttempts': job.max_attempts,
            'errorCode': job.error_code,
            'errorMessage': job.error_message,
            'startedAt': job.started_at,
            'finishedAt': job.finished_at,
            'updatedAt': job.updated_at,
            'promptSnapshot': job.prompt_snapshot,
            'rawResponse': job.raw_response,
        },
        'result': None if result is None else {
            'resultId': result.id,
            'scores': result.scores_json if isinstance(result.scores_json, list) else [],
            'overallScore': result.overall_score,
            'decision': result.decision,
            'summary': result.summary,
            'validationStatus': result.validation_status,
            'configVersion': result.config_version,
            'createdAt': result.created_at,
            'promptSnapshot': result.prompt_snapshot,
            'rawResponse': result.raw_response,
        },
    }


def serialize_owner_review_timeline(
    submission: Submission,
    versions: list[SubmissionVersion],
    review_records: list[ReviewRecord],
    audit_logs: list[AuditLog],
) -> list[dict]:
    items: list[dict] = [
        {
            'type': 'submission',
            'title': '提交创建',
            'createdAt': submission.created_at,
            'payload': {'status': submission.status, 'labelerName': submission.user.display_name},
        }
    ]

    items.extend(
        {
            'type': 'submission_version',
            'title': f'第 {version.version_no} 版提交',
            'createdAt': version.submitted_at,
            'payload': {
                'versionNo': version.version_no,
                'answers': version.answers_json,
                'submitterName': version.submitter.display_name if version.submitter else None,
            },
        }
        for version in versions
    )

    if submission.ai_audit_job:
        job = submission.ai_audit_job
        items.append(
            {
                'type': 'ai_job',
                'title': 'AI 预审作业',
                'createdAt': job.finished_at or job.updated_at or job.created_at,
                'payload': {
                    'jobId': job.id,
                    'status': job.status,
                    'attemptCount': job.attempt_count,
                    'errorMessage': job.error_message,
                },
            }
        )

    if submission.ai_audit_result:
        result = submission.ai_audit_result
        items.append(
            {
                'type': 'ai_result',
                'title': 'AI 预审结果',
                'createdAt': result.created_at,
                'payload': {
                    'decision': result.decision,
                    'overallScore': result.overall_score,
                    'summary': result.summary,
                    'scores': result.scores_json,
                },
            }
        )

    items.extend(
        {
            'type': 'review',
            'title': '人工复审',
            'createdAt': record.created_at,
            'payload': {
                'recordId': record.id,
                'reviewerName': record.reviewer.display_name if record.reviewer else None,
                'assigneeReviewerName': record.assignee_reviewer.display_name if record.assignee_reviewer else None,
                'stage': record.review_stage,
                'round': record.review_round,
                'decision': record.decision,
                'comment': record.comment,
                'reason': record.reason,
            },
        }
        for record in review_records
    )

    items.extend(
        {
            'type': 'audit_log',
            'title': log.event_type,
            'createdAt': log.created_at,
            'payload': {
                'eventType': log.event_type,
                'entityType': log.entity_type,
                'entityId': log.entity_id,
                'actorName': log.actor.display_name if log.actor else None,
                'data': log.payload_json,
            },
        }
        for log in audit_logs
    )

    return sorted(items, key=lambda item: item['createdAt'])


def serialize_owner_submission_detail(
    submission: Submission,
    review_records: list[ReviewRecord],
    audit_logs: list[AuditLog],
) -> dict:
    versions = sorted(submission.versions, key=lambda version: version.version_no)
    current_version = versions[-1] if versions else None
    previous_version = versions[-2] if len(versions) >= 2 else None
    current_answers = current_version.answers_json if current_version else submission.answers_json
    previous_answers = previous_version.answers_json if previous_version else {}

    return {
        'submissionId': submission.id,
        'taskId': submission.task_id,
        'assignmentId': submission.assignment_id,
        'datasetItemId': submission.dataset_item_id,
        'item': {
            'itemId': submission.dataset_item_id or submission.assignment_id,
            'source': get_dataset_item_context(submission.dataset_item),
        },
        'labeler': {
            'userId': submission.user_id,
            'displayName': submission.user.display_name,
            'username': submission.user.username,
        },
        'assignedReviewer': None if submission.assigned_reviewer is None else {
            'userId': submission.assigned_reviewer.id,
            'displayName': submission.assigned_reviewer.display_name,
            'username': submission.assigned_reviewer.username,
        },
        'finalizedBy': None if submission.finalizer is None else {
            'userId': submission.finalizer.id,
            'displayName': submission.finalizer.display_name,
            'username': submission.finalizer.username,
        },
        'status': submission.status,
        'answers': submission.answers_json,
        'finalAnswers': submission.final_answer_json or submission.answers_json,
        'currentVersionNo': submission.current_version_no,
        'currentReviewStage': submission.current_review_stage,
        'currentReviewRound': submission.current_review_round,
        'finalSubmissionVersionNo': submission.final_submission_version_no,
        'finalizedAt': submission.finalized_at,
        'createdAt': submission.created_at,
        'updatedAt': submission.updated_at,
        'versions': [
            {
                'versionNo': version.version_no,
                'answers': version.answers_json,
                'templateVersionId': version.template_version_id,
                'submittedBy': version.submitter.display_name if version.submitter else None,
                'submittedAt': version.submitted_at,
            }
            for version in versions
        ],
        'diffItems': build_answer_diff(previous_answers, current_answers) if previous_answers else [],
        'aiAudit': serialize_ai_audit(submission),
        'reviewHistory': [
            {
                'recordId': record.id,
                'reviewerId': record.reviewer_id,
                'reviewerName': record.reviewer.display_name if record.reviewer else None,
                'assigneeReviewerId': record.assignee_reviewer_id,
                'assigneeReviewerName': record.assignee_reviewer.display_name if record.assignee_reviewer else None,
                'stage': record.review_stage,
                'round': record.review_round,
                'decision': record.decision,
                'reason': record.reason,
                'comment': record.comment,
                'createdAt': record.created_at,
            }
            for record in review_records
        ],
        'timeline': serialize_owner_review_timeline(submission, versions, review_records, audit_logs),
    }


def map_labeler_submission_status(status: str, ai_job_status: str | None) -> str:
    if ai_job_status in {'queued', 'running'}:
        return 'ai_reviewing'
    if status == 'draft':
        return 'draft'
    if status == 'submitted':
        return 'submitted'
    if status == 'ai_passed':
        return 'manual_reviewing'
    if status == 'needs_revision':
        return 'needs_revision'
    if status == 'review_passed':
        return 'review_passed'
    return status or 'submitted'


def map_owner_ai_audit_flow_status(job: AIAuditJob, submission: Submission) -> str:
    if job.status in {'queued', 'running'}:
        return 'queued'
    if job.status in {'fallback_human_review', 'failed'}:
        return 'failed'
    decision = job.result.decision if job.result else None
    if decision == 'reject' or submission.status == 'needs_revision':
        return 'rejected'
    if decision == 'human_review':
        return 'human_review'
    if decision == 'pass':
        return 'passed'
    return job.status or 'queued'


@router.get('/tasks')
def get_owner_task_audit_progress(
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user, default_username='owner_demo')
    require_role(user, {'owner'})

    # Get tasks owned by this user
    tasks = db.query(Task).filter(Task.owner_id == user.id).all()
    task_ids = [t.id for t in tasks]

    if not task_ids:
        return success({'items': []})

    mark_timed_out_ai_audit_jobs_as_human_review(db, task_ids=task_ids)

    # Aggregate submission counts per task
    stats = (
        db.query(
            Submission.task_id,
            Submission.status,
            func.count(Submission.id).label('count')
        )
        .filter(Submission.task_id.in_(task_ids))
        .group_by(Submission.task_id, Submission.status)
        .all()
    )

    # Process stats into a dictionary
    task_stats = {}
    for task_id, status, count in stats:
        if task_id not in task_stats:
            task_stats[task_id] = {
                'total': 0,
                'pending_ai': 0,
                'pending_manual': 0,
                'approved': 0,
                'rejected': 0
            }
        task_stats[task_id]['total'] += count
        if status == 'submitted':
            task_stats[task_id]['pending_ai'] += count
        elif status == 'ai_passed':
            task_stats[task_id]['pending_manual'] += count
        elif status == 'review_passed':
            task_stats[task_id]['approved'] += count
        elif status == 'needs_revision':
            task_stats[task_id]['rejected'] += count

    latest_submission_updates = dict(
        db.query(Submission.task_id, func.max(Submission.updated_at))
        .filter(Submission.task_id.in_(task_ids))
        .group_by(Submission.task_id)
        .all()
    )

    items = []
    for task in tasks:
        s = task_stats.get(task.id, {
            'total': 0,
            'pending_ai': 0,
            'pending_manual': 0,
            'approved': 0,
            'rejected': 0
        })
        items.append({
            'taskId': task.id,
            'title': task.title,
            'status': task.status,
            'createdAt': task.created_at,
            'updatedAt': latest_submission_updates.get(task.id) or task.updated_at,
            'stats': s
        })

    return success({'items': items})


@router.get('/tasks/{task_id}/details')
def get_owner_task_review_details(
    task_id: int,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user, default_username='owner_demo')
    require_role(user, {'owner'})
    task = require_owner_review_task(db, task_id, user)

    mark_timed_out_ai_audit_jobs_as_human_review(db, task_ids=[task.id])

    submissions = (
        db.query(Submission)
        .filter(Submission.task_id == task.id)
        .order_by(Submission.updated_at.desc(), Submission.id.desc())
        .all()
    )
    submission_ids = [submission.id for submission in submissions]
    if not submission_ids:
        return success(
            {
                'task': {
                    'taskId': task.id,
                    'title': task.title,
                    'status': task.status,
                    'datasetId': task.dataset_id,
                    'templateId': task.active_template_id,
                },
                'summary': {
                    'total': 0,
                    'pendingAi': 0,
                    'pendingManual': 0,
                    'approved': 0,
                    'rejected': 0,
                },
                'submissions': [],
            }
        )

    review_records = (
        db.query(ReviewRecord)
        .filter(ReviewRecord.submission_id.in_(submission_ids))
        .order_by(ReviewRecord.created_at.asc(), ReviewRecord.id.asc())
        .all()
    )
    records_by_submission_id: dict[int, list[ReviewRecord]] = {}
    for record in review_records:
        records_by_submission_id.setdefault(record.submission_id, []).append(record)

    audit_logs = (
        db.query(AuditLog)
        .filter(
            (AuditLog.entity_type == 'submission') |
            (AuditLog.entity_type == 'submission_version') |
            (AuditLog.entity_type == 'ai_audit_job')
        )
        .order_by(AuditLog.created_at.asc(), AuditLog.id.asc())
        .all()
    )
    submission_id_set = set(submission_ids)
    logs_by_submission_id: dict[int, list[AuditLog]] = {submission_id: [] for submission_id in submission_ids}
    for log in audit_logs:
        payload_submission_id = log.payload_json.get('submissionId') if isinstance(log.payload_json, dict) else None
        if log.entity_type == 'submission' and log.entity_id in submission_id_set:
            logs_by_submission_id.setdefault(log.entity_id, []).append(log)
        elif payload_submission_id in submission_id_set:
            logs_by_submission_id.setdefault(payload_submission_id, []).append(log)

    summary = {
        'total': len(submissions),
        'pendingAi': sum(1 for submission in submissions if submission.status == 'submitted'),
        'pendingManual': sum(1 for submission in submissions if submission.status == 'ai_passed'),
        'approved': sum(1 for submission in submissions if submission.status == 'review_passed'),
        'rejected': sum(1 for submission in submissions if submission.status == 'needs_revision'),
    }

    return success(
        {
            'task': {
                'taskId': task.id,
                'title': task.title,
                'status': task.status,
                'datasetId': task.dataset_id,
                'templateId': task.active_template_id,
            },
            'summary': summary,
            'submissions': [
                serialize_owner_submission_detail(
                    submission,
                    records_by_submission_id.get(submission.id, []),
                    logs_by_submission_id.get(submission.id, []),
                )
                for submission in submissions
            ],
        }
    )


@router.get('/reviewers')
def get_owner_reviewer_workload(
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user, default_username='owner_demo')
    require_role(user, {'owner'})

    # Get tasks owned by this user
    task_ids = [t[0] for t in db.query(Task.id).filter(Task.owner_id == user.id).all()]

    if not task_ids:
        return success({'items': []})

    # Get all reviewers assigned to these tasks
    assignments = (
        db.query(TaskReviewerAssignment, User)
        .join(User, TaskReviewerAssignment.reviewer_id == User.id)
        .filter(TaskReviewerAssignment.task_id.in_(task_ids))
        .all()
    )

    reviewer_ids = list(set(a[0].reviewer_id for a in assignments))
    reviewer_map = {a[1].id: a[1].display_name for a in assignments}

    if not reviewer_ids:
        return success({'items': []})

    assignment_counts = dict(
        db.query(TaskReviewerAssignment.reviewer_id, func.count(TaskReviewerAssignment.task_id))
        .filter(TaskReviewerAssignment.task_id.in_(task_ids))
        .filter(TaskReviewerAssignment.reviewer_id.in_(reviewer_ids))
        .group_by(TaskReviewerAssignment.reviewer_id)
        .all()
    )

    workload_stats = {
        reviewer_id: {
            'assigned_count': assignment_counts.get(reviewer_id, 0),
            'completed_count': 0,
            'pending_count': 0,
        }
        for reviewer_id in reviewer_ids
    }

    completed_counts = dict(
        db.query(ReviewRecord.reviewer_id, func.count(ReviewRecord.id))
        .join(Submission, ReviewRecord.submission_id == Submission.id)
        .filter(Submission.task_id.in_(task_ids))
        .filter(ReviewRecord.reviewer_id.in_(reviewer_ids))
        .filter(ReviewRecord.decision.in_(['approve', 'reject']))
        .group_by(ReviewRecord.reviewer_id)
        .all()
    )

    pending_counts = dict(
        db.query(TaskReviewerAssignment.reviewer_id, func.count(func.distinct(Submission.id)))
        .join(Submission, Submission.task_id == TaskReviewerAssignment.task_id)
        .filter(TaskReviewerAssignment.task_id.in_(task_ids))
        .filter(TaskReviewerAssignment.reviewer_id.in_(reviewer_ids))
        .filter(Submission.status.in_(['submitted', 'ai_passed']))
        .filter(
            (Submission.assigned_reviewer_id.is_(None))
            | (Submission.assigned_reviewer_id == TaskReviewerAssignment.reviewer_id)
        )
        .group_by(TaskReviewerAssignment.reviewer_id)
        .all()
    )

    for reviewer_id in reviewer_ids:
        workload_stats[reviewer_id]['completed_count'] = completed_counts.get(reviewer_id, 0)
        workload_stats[reviewer_id]['pending_count'] = pending_counts.get(reviewer_id, 0)

    latest_submission_by_reviewer = dict(
        db.query(TaskReviewerAssignment.reviewer_id, func.max(Submission.updated_at))
        .join(Submission, Submission.task_id == TaskReviewerAssignment.task_id)
        .filter(TaskReviewerAssignment.task_id.in_(task_ids))
        .filter(TaskReviewerAssignment.reviewer_id.in_(reviewer_ids))
        .filter(
            (Submission.assigned_reviewer_id.is_(None))
            | (Submission.assigned_reviewer_id == TaskReviewerAssignment.reviewer_id)
        )
        .group_by(TaskReviewerAssignment.reviewer_id)
        .all()
    )
    latest_review_by_reviewer = dict(
        db.query(ReviewRecord.reviewer_id, func.max(ReviewRecord.created_at))
        .join(Submission, ReviewRecord.submission_id == Submission.id)
        .filter(Submission.task_id.in_(task_ids))
        .filter(ReviewRecord.reviewer_id.in_(reviewer_ids))
        .group_by(ReviewRecord.reviewer_id)
        .all()
    )
    latest_assignment_by_reviewer = dict(
        db.query(TaskReviewerAssignment.reviewer_id, func.max(TaskReviewerAssignment.created_at))
        .filter(TaskReviewerAssignment.task_id.in_(task_ids))
        .filter(TaskReviewerAssignment.reviewer_id.in_(reviewer_ids))
        .group_by(TaskReviewerAssignment.reviewer_id)
        .all()
    )

    items = []
    for rid, name in reviewer_map.items():
        s = workload_stats.get(
            rid,
            {'assigned_count': assignment_counts.get(rid, 0), 'completed_count': 0, 'pending_count': 0},
        )
        latest_updated_at = max(
            (
                value
                for value in (
                    latest_submission_by_reviewer.get(rid),
                    latest_review_by_reviewer.get(rid),
                    latest_assignment_by_reviewer.get(rid),
                )
                if value is not None
            ),
            default=None,
        )
        items.append({
            'reviewerId': rid,
            'displayName': name,
            'latestUpdatedAt': latest_updated_at,
            'stats': s
        })

    return success({'items': items})


@router.get('/labelers')
def get_owner_labeler_performance(
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user, default_username='owner_demo')
    require_role(user, {'owner'})

    task_ids = [task_id for task_id, in db.query(Task.id).filter(Task.owner_id == user.id).all()]
    if not task_ids:
        return success({'items': []})

    assignments = (
        db.query(Assignment, User, Task)
        .join(User, Assignment.user_id == User.id)
        .join(Task, Assignment.task_id == Task.id)
        .filter(Assignment.task_id.in_(task_ids))
        .order_by(User.id.asc(), Assignment.claimed_at.desc(), Assignment.id.desc())
        .all()
    )
    if not assignments:
        return success({'items': []})

    assignment_ids = [assignment.id for assignment, _, _ in assignments]
    submissions = (
        db.query(Submission)
        .filter(Submission.assignment_id.in_(assignment_ids))
        .order_by(Submission.updated_at.desc(), Submission.id.desc())
        .all()
    )

    submissions_by_assignment_id: dict[int, list[Submission]] = {}
    for submission in submissions:
        submissions_by_assignment_id.setdefault(submission.assignment_id, []).append(submission)

    completed_by_assignment_id = dict(
        db.query(
            Submission.assignment_id,
            func.count(func.distinct(Submission.dataset_item_id)),
        )
        .filter(Submission.assignment_id.in_(assignment_ids))
        .filter(Submission.status.in_(LABELER_COMPLETED_STATUSES))
        .group_by(Submission.assignment_id)
        .all()
    )

    items_by_labeler_id: dict[int, dict] = {}
    for assignment, labeler, task in assignments:
        task_submissions = submissions_by_assignment_id.get(assignment.id, [])
        latest_submission = task_submissions[0] if task_submissions else None
        labeler_item = items_by_labeler_id.setdefault(
            labeler.id,
            {
                'labelerId': labeler.id,
                'displayName': labeler.display_name,
                'username': labeler.username,
                'latestUpdatedAt': None,
                'metrics': {
                    'claimedTaskCount': 0,
                    'submittedItemCount': 0,
                    'reviewPassedItemCount': 0,
                    'needsRevisionItemCount': 0,
                },
                'assignments': [],
            },
        )

        labeler_item['metrics']['claimedTaskCount'] += 1
        labeler_item['metrics']['submittedItemCount'] += sum(
            1 for submission in task_submissions if submission.status in {'submitted', 'ai_passed'}
        )
        labeler_item['metrics']['reviewPassedItemCount'] += sum(
            1 for submission in task_submissions if submission.status == 'review_passed'
        )
        labeler_item['metrics']['needsRevisionItemCount'] += sum(
            1 for submission in task_submissions if submission.status == 'needs_revision'
        )

        assignment_summary = {
            'assignmentId': assignment.id,
            'taskId': task.id,
            'taskTitle': task.title,
            'taskStatus': task.status,
            'total': assignment.progress_total,
            'completed': completed_by_assignment_id.get(assignment.id, 0) or 0,
            'reviewPassed': sum(1 for submission in task_submissions if submission.status == 'review_passed'),
            'needsRevision': sum(1 for submission in task_submissions if submission.status == 'needs_revision'),
            'latestSubmissionStatus': map_labeler_submission_status(
                latest_submission.status,
                latest_submission.ai_audit_job.status if latest_submission and latest_submission.ai_audit_job else None,
            ) if latest_submission else 'not_started',
            'latestUpdatedAt': latest_submission.updated_at if latest_submission else assignment.claimed_at,
        }
        labeler_item['assignments'].append(assignment_summary)

        assignment_updated_at = assignment_summary['latestUpdatedAt']
        if assignment_updated_at and (
            labeler_item['latestUpdatedAt'] is None or assignment_updated_at > labeler_item['latestUpdatedAt']
        ):
            labeler_item['latestUpdatedAt'] = assignment_updated_at

    items = sorted(items_by_labeler_id.values(), key=lambda item: item['displayName'])
    items.sort(
        key=lambda item: (
            item['latestUpdatedAt'] is not None,
            item['latestUpdatedAt'],
        ),
        reverse=True,
    )
    return success({'items': items})


@router.get('/ai-jobs')
def get_owner_ai_audit_monitor(
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user, default_username='owner_demo')
    require_role(user, {'owner'})

    # Get tasks owned by this user
    task_ids = [t[0] for t in db.query(Task.id).filter(Task.owner_id == user.id).all()]

    if not task_ids:
        return success({'items': []})

    mark_timed_out_ai_audit_jobs_as_human_review(db, task_ids=task_ids)

    # Get latest AI jobs for these tasks
    jobs = (
        db.query(AIAuditJob, Submission, Task)
        .join(Submission, AIAuditJob.submission_id == Submission.id)
        .join(Task, Submission.task_id == Task.id)
        .filter(Submission.task_id.in_(task_ids))
        .order_by(AIAuditJob.updated_at.desc())
        .limit(100)
        .all()
    )

    items = []
    for job, submission, task in jobs:
        items.append({
            'jobId': job.id,
            'submissionId': submission.id,
            'taskTitle': task.title,
            'status': job.status,
            'flowStatus': map_owner_ai_audit_flow_status(job, submission),
            'aiDecision': job.result.decision if job.result else None,
            'submissionStatus': submission.status,
            'attemptCount': job.attempt_count,
            'errorReason': job.error_message,
            'updatedAt': job.updated_at
        })

    return success({'items': items})
