from datetime import timezone

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_demo_user, require_role, success
from app.api.routes.submissions import validate_required_answers
from app.core.database import get_db
from app.models import AIAuditResult, AuditLog, ReviewRecord, Submission, SubmissionVersion, TaskReviewerAssignment, User, utc_now
from app.services.access_control import require_reviewer_submission_access
from app.services.ai_audit import mark_timed_out_ai_audit_jobs_as_human_review
from app.services.audit_log import write_audit_log
from app.services.dataset_import import get_dataset_item_context
from app.services.review_history import build_answer_diff, clear_finalized_result, next_review_stage, serialize_timeline

router = APIRouter(prefix='/reviews', tags=['reviews'])


class ReviewApproveRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    comment: str = ''
    final_answers: dict | None = Field(default=None, alias='finalAnswers')


class ReviewRejectRequest(BaseModel):
    reason: str


class ReviewBulkApproveRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    submission_ids: list[int] = Field(validation_alias='submissionIds')
    comment: str = ''


class ReviewBulkRejectRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    submission_ids: list[int] = Field(validation_alias='submissionIds')
    reason: str


class ReviewAssignRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    reviewer_id: int = Field(validation_alias='reviewerId')


def get_ai_result(submission_id: int, db: Session) -> dict:
    result = db.query(AIAuditResult).filter(AIAuditResult.submission_id == submission_id).first()
    if result is None:
        return {
            'scores': [],
            'overallScore': 0,
            'decision': 'human_review',
            'summary': 'AI 结果暂不可用，建议人工复核。',
        }

    scores = result.scores_json if isinstance(result.scores_json, list) else []
    decision = result.decision if result.decision in {'pass', 'reject', 'human_review'} else 'human_review'
    summary = result.summary or 'AI 结果暂不可用，建议人工复核。'

    return {
        'scores': scores,
        'overallScore': result.overall_score or 0,
        'decision': decision,
        'summary': summary,
    }


def clamp_score(value: float) -> int:
    return int(max(0, min(100, round(value))))


def calculate_ai_risk_score(ai_result: dict) -> int:
    decision = ai_result.get('decision')
    overall_score = int(ai_result.get('overallScore') or 0)
    inverse_score = max(0, 100 - overall_score)

    if decision == 'reject':
        return clamp_score(max(85, inverse_score))
    if decision == 'human_review':
        return clamp_score(max(65, inverse_score))
    return clamp_score(max(10, inverse_score))


def calculate_waiting_priority(submitted_at) -> tuple[int, float]:
    if submitted_at is None:
        return 0, 0.0

    submitted_time = submitted_at
    if submitted_time.tzinfo is None:
        submitted_time = submitted_time.replace(tzinfo=timezone.utc)

    waiting_hours = max(0.0, (utc_now() - submitted_time).total_seconds() / 3600)
    # 48 小时等待视为满分，避免极老数据长期压住所有新高风险提交。
    return clamp_score((waiting_hours / 48) * 100), round(waiting_hours, 1)


def calculate_task_priority_score(task) -> int:
    tags = task.task_tags_json if isinstance(task.task_tags_json, list) else []
    haystack = ' '.join(
        str(value)
        for value in [task.title, task.description, task.task_brief, *tags]
        if value
    ).lower()

    high_keywords = ['p0', 'p1', '高优', '高优先级', '紧急', 'urgent', 'critical', '重要']
    medium_keywords = ['p2', '中优', '中优先级', 'medium']
    low_keywords = ['p3', '低优', '低优先级', 'low']

    if any(keyword in haystack for keyword in high_keywords):
        return 100
    if any(keyword in haystack for keyword in medium_keywords):
        return 60
    if any(keyword in haystack for keyword in low_keywords):
        return 15
    return 30


def build_labeler_reject_rates(db: Session) -> dict[int, float]:
    rows = (
        db.query(Submission.user_id, ReviewRecord.decision, func.count(ReviewRecord.id))
        .select_from(ReviewRecord)
        .join(Submission, Submission.id == ReviewRecord.submission_id)
        .group_by(Submission.user_id, ReviewRecord.decision)
        .all()
    )
    totals: dict[int, int] = {}
    rejects: dict[int, int] = {}
    for user_id, decision, count in rows:
        totals[user_id] = totals.get(user_id, 0) + count
        if decision == 'reject':
            rejects[user_id] = rejects.get(user_id, 0) + count
    return {
        user_id: (rejects.get(user_id, 0) / total if total else 0.0)
        for user_id, total in totals.items()
    }


def calculate_review_priority(submission: Submission, ai_result: dict, labeler_reject_rate: float) -> dict:
    ai_risk_score = calculate_ai_risk_score(ai_result)
    waiting_score, waiting_hours = calculate_waiting_priority(submission.updated_at)
    labeler_reject_score = clamp_score(labeler_reject_rate * 100)
    task_priority_score = calculate_task_priority_score(submission.task)
    score = clamp_score(
        ai_risk_score * 0.4
        + waiting_score * 0.2
        + labeler_reject_score * 0.2
        + task_priority_score * 0.2
    )

    if score >= 75:
        level = 'high'
    elif score >= 50:
        level = 'medium'
    else:
        level = 'normal'

    return {
        'score': score,
        'level': level,
        'factors': {
            'aiRiskScore': ai_risk_score,
            'waitingScore': waiting_score,
            'waitingHours': waiting_hours,
            'labelerRejectRate': round(labeler_reject_rate, 3),
            'labelerRejectScore': labeler_reject_score,
            'taskPriorityScore': task_priority_score,
        },
    }


def reviewable_status(status: str) -> bool:
    return status == 'ai_passed'


def ai_job_is_pending(submission: Submission) -> bool:
    job = submission.ai_audit_job
    return job is not None and job.status in {'queued', 'running'}


def has_ai_audit_result(submission: Submission) -> bool:
    return submission.ai_audit_result is not None


def finalize_submission_result(
    submission: Submission,
    reviewer_id: int,
    final_answers: dict,
) -> None:
    submission.final_answer_json = final_answers
    submission.finalized_by = reviewer_id
    submission.finalized_at = utc_now()
    submission.final_submission_version_no = submission.current_version_no


def serialize_review_detail(submission: Submission, db: Session) -> dict:
    versions = (
        db.query(SubmissionVersion)
        .filter(SubmissionVersion.submission_id == submission.id)
        .order_by(SubmissionVersion.version_no.asc())
        .all()
    )
    current_version = versions[-1] if versions else None
    previous_version = versions[-2] if len(versions) >= 2 else None
    review_history = (
        db.query(ReviewRecord)
        .filter(ReviewRecord.submission_id == submission.id)
        .order_by(ReviewRecord.created_at.asc())
        .all()
    )
    audit_logs = db.query(AuditLog).order_by(AuditLog.created_at.asc()).all()
    diff_items = build_answer_diff(
        previous_version.answers_json if previous_version else {},
        current_version.answers_json if current_version else submission.answers_json,
    )
    review_source = get_dataset_item_context(submission.dataset_item)
    if not review_source:
        review_source = {'source_text': submission.task.description or '当前任务暂无原文内容。'}

    return {
        'submissionId': submission.id,
        'task': {
            'id': submission.task.id,
            'title': submission.task.title,
        },
        'template': {
            'templateVersionId': submission.template_version_id,
            'schema': submission.template_version.schema_json if submission.template_version else {'version': 1, 'components': []},
        },
        'item': {
            'itemId': submission.dataset_item_id or submission.assignment_id,
            'source': review_source,
        },
        'answers': submission.answers_json,
        'finalAnswers': submission.final_answer_json or submission.answers_json,
        'aiResult': get_ai_result(submission.id, db),
        'submissionStatus': submission.status,
        'currentReviewStage': submission.current_review_stage,
        'currentReviewRound': submission.current_review_round,
        'currentVersionNo': submission.current_version_no,
        'diffItems': diff_items,
        'reviewHistory': [
            {
                'id': record.id,
                'decision': record.decision,
                'stage': record.review_stage,
                'round': record.review_round,
                'comment': record.comment,
                'reason': record.reason,
                'createdAt': record.created_at,
            }
            for record in review_history
        ],
        'timeline': serialize_timeline(submission.id, review_history, audit_logs, submission.user.display_name if submission.user else None),
    }


@router.get('/quality-stats')
def get_quality_stats(
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user, default_username='reviewer_demo')
    require_role(user, {'reviewer'})

    records = (
        db.query(ReviewRecord)
        .options(
            joinedload(ReviewRecord.submission).joinedload(Submission.task),
            joinedload(ReviewRecord.submission).joinedload(Submission.user),
        )
        .filter(ReviewRecord.reviewer_id == user.id)
        .order_by(ReviewRecord.created_at.desc())
        .all()
    )
    decision_counts = {'approve': 0, 'reject': 0}
    reject_reasons: dict[str, int] = {}
    history_reviews = []
    for record in records:
        decision_counts[record.decision] = decision_counts.get(record.decision, 0) + 1
        if record.decision == 'reject' and record.reason.strip():
            reject_reasons[record.reason] = reject_reasons.get(record.reason, 0) + 1
        if len(history_reviews) < 10:
            submission = record.submission
            history_reviews.append(
                {
                    'submissionId': submission.id,
                    'taskTitle': submission.task.title,
                    'labelerName': submission.user.display_name,
                    'itemId': submission.dataset_item_id or submission.assignment_id,
                    'reviewRound': record.review_round,
                    'reviewStage': record.review_stage,
                    'decision': record.decision,
                    'reason': record.reason,
                    'comment': record.comment,
                    'createdAt': record.created_at,
                }
            )

    total = sum(decision_counts.values())
    approval_rate = int((decision_counts.get('approve', 0) / total) * 100) if total else 0

    return success(
        {
            'approvalRate': approval_rate,
            'decisionCounts': decision_counts,
            'topRejectReasons': [
                {'reason': reason, 'count': count}
                for reason, count in sorted(reject_reasons.items(), key=lambda item: item[1], reverse=True)[:5]
            ],
            'historyReviews': history_reviews,
        }
    )


@router.get('/pending')
def list_pending_reviews(
    taskId: int | None = None,
    aiDecision: str | None = None,
    keyword: str | None = None,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user, default_username='reviewer_demo')
    require_role(user, {'reviewer'})

    assigned_task_ids = (
        db.query(TaskReviewerAssignment.task_id)
        .filter(TaskReviewerAssignment.reviewer_id == user.id)
        .distinct()
        .all()
    )
    assigned_set = {row[0] for row in assigned_task_ids}

    timeout_task_ids = list(assigned_set)
    if not timeout_task_ids:
        timeout_task_ids = [
            row[0]
            for row in (
                db.query(Submission.task_id)
                .filter(Submission.assigned_reviewer_id == user.id)
                .distinct()
                .all()
            )
        ]
    mark_timed_out_ai_audit_jobs_as_human_review(db, task_ids=timeout_task_ids)

    query = db.query(Submission).filter(
        Submission.status == 'ai_passed',
    )

    if assigned_set:
        query = query.filter(Submission.task_id.in_(assigned_set))
        query = query.filter(
            (Submission.assigned_reviewer_id.is_(None)) | (Submission.assigned_reviewer_id == user.id),
        )
    else:
        query = query.filter(Submission.assigned_reviewer_id == user.id)

    if taskId is not None:
        query = query.filter(Submission.task_id == taskId)

    submissions = query.order_by(Submission.updated_at.desc()).all()
    labeler_reject_rates = build_labeler_reject_rates(db)

    items = []
    for submission in submissions:
        if ai_job_is_pending(submission) or not has_ai_audit_result(submission):
            continue

        ai_result = get_ai_result(submission.id, db)
        review_priority = calculate_review_priority(
            submission,
            ai_result,
            labeler_reject_rates.get(submission.user_id, 0.0),
        )

        if aiDecision and ai_result['decision'] != aiDecision:
            continue
        if keyword:
            haystack = f"{submission.task.title} {submission.user.display_name}".lower()
            if keyword.lower() not in haystack:
                continue

        items.append(
            {
                'submissionId': submission.id,
                'taskId': submission.task_id,
                'itemId': submission.dataset_item_id or submission.assignment_id,
                'labelerName': submission.user.display_name,
                'taskTitle': submission.task.title,
                'aiDecision': ai_result['decision'],
                'submissionStatus': submission.status,
                'submittedAt': submission.updated_at,
                'currentReviewStage': submission.current_review_stage,
                'currentReviewRound': submission.current_review_round,
                'hasPreviousVersion': submission.current_version_no > 1,
                'assignedReviewer': submission.assigned_reviewer.display_name if submission.assigned_reviewer else None,
                'latestAiSummary': ai_result['summary'],
                'reviewPriorityScore': review_priority['score'],
                'reviewPriorityLevel': review_priority['level'],
                'reviewPriorityFactors': review_priority['factors'],
            }
        )
    items.sort(key=lambda item: (-item['reviewPriorityScore'], item['submittedAt']))
    return success({'items': items, 'total': len(items)})


@router.post('/bulk/approve')
def approve_reviews_in_bulk(
    payload: ReviewBulkApproveRequest,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user, default_username='reviewer_demo')
    require_role(user, {'reviewer'})

    updated_ids: list[int] = []
    for submission_id in payload.submission_ids:
        submission = require_reviewer_submission_access(db, submission_id, user)
        mark_timed_out_ai_audit_jobs_as_human_review(db, submission_id=submission.id)
        db.refresh(submission)
        if reviewable_status(submission.status) and not ai_job_is_pending(submission) and has_ai_audit_result(submission):
            record_stage = submission.current_review_stage
            record_round = submission.current_review_round
            
            # 一级审核逻辑：直接标记为通过并归档
            submission.status = 'review_passed'
            finalize_submission_result(submission, user.id, submission.answers_json)
            
            db.add(
                ReviewRecord(
                    submission_id=submission.id,
                    submission_version_id=None,
                    reviewer_id=user.id,
                    assignee_reviewer_id=submission.assigned_reviewer_id,
                    review_stage=record_stage,
                    review_round=record_round,
                    decision='approve',
                    comment=payload.comment,
                    reason='',
                )
            )
            write_audit_log(
                db,
                event_type='review_approved',
                entity_type='submission',
                entity_id=submission.id,
                actor_user_id=user.id,
                payload={'reviewerId': user.id, 'comment': payload.comment, 'bulk': True},
            )
            updated_ids.append(submission.id)

    db.commit()
    return success({'submissionIds': updated_ids, 'status': 'ai_passed'})


@router.post('/bulk/reject')
def reject_reviews_in_bulk(
    payload: ReviewBulkRejectRequest,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user, default_username='reviewer_demo')
    require_role(user, {'reviewer'})

    if not payload.reason.strip():
        raise HTTPException(status_code=400, detail='reject reason is required')

    updated_ids: list[int] = []
    for submission_id in payload.submission_ids:
        submission = require_reviewer_submission_access(db, submission_id, user)
        mark_timed_out_ai_audit_jobs_as_human_review(db, submission_id=submission.id)
        db.refresh(submission)
        if reviewable_status(submission.status) and not ai_job_is_pending(submission) and has_ai_audit_result(submission):
            submission.status = 'needs_revision'
            clear_finalized_result(submission)
            db.add(
                ReviewRecord(
                    submission_id=submission.id,
                    submission_version_id=None,
                    reviewer_id=user.id,
                    assignee_reviewer_id=submission.assigned_reviewer_id,
                    review_stage=submission.current_review_stage,
                    review_round=submission.current_review_round,
                    decision='reject',
                    comment='',
                    reason=payload.reason,
                )
            )
            write_audit_log(
                db,
                event_type='review_rejected',
                entity_type='submission',
                entity_id=submission.id,
                actor_user_id=user.id,
                payload={'reviewerId': user.id, 'reason': payload.reason, 'bulk': True},
            )
            updated_ids.append(submission.id)

    db.commit()
    return success({'submissionIds': updated_ids, 'status': 'needs_revision'})


@router.post('/{submission_id}/assign')
def assign_review(
    submission_id: int,
    payload: ReviewAssignRequest,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user, default_username='reviewer_demo')
    require_role(user, {'reviewer'})

    submission = require_reviewer_submission_access(db, submission_id, user)
    mark_timed_out_ai_audit_jobs_as_human_review(db, submission_id=submission.id)
    db.refresh(submission)
    if not reviewable_status(submission.status) or ai_job_is_pending(submission) or not has_ai_audit_result(submission):
        raise HTTPException(status_code=409, detail='submission is not pending review')

    reviewer = db.get(User, payload.reviewer_id)
    if not reviewer:
        raise HTTPException(status_code=404, detail='reviewer not found')
    if reviewer.role != 'reviewer':
        raise HTTPException(status_code=400, detail='target user is not a reviewer')
    task_assignment = (
        db.query(TaskReviewerAssignment)
        .filter(
            TaskReviewerAssignment.task_id == submission.task_id,
            TaskReviewerAssignment.reviewer_id == reviewer.id,
        )
        .first()
    )
    if not task_assignment:
        raise HTTPException(status_code=403, detail='reviewer is not assigned to this task')

    submission.assigned_reviewer_id = payload.reviewer_id
    write_audit_log(
        db,
        event_type='review_assigned',
        entity_type='submission',
        entity_id=submission.id,
        actor_user_id=user.id,
        payload={'reviewerId': payload.reviewer_id, 'reviewRound': submission.current_review_round},
    )
    db.commit()
    return success({'submissionId': submission.id, 'reviewerId': payload.reviewer_id})


@router.post('/{submission_id}/unassign')
def unassign_review(
    submission_id: int,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user, default_username='reviewer_demo')
    require_role(user, {'reviewer'})

    submission = require_reviewer_submission_access(db, submission_id, user)
    mark_timed_out_ai_audit_jobs_as_human_review(db, submission_id=submission.id)
    db.refresh(submission)
    if not reviewable_status(submission.status) or ai_job_is_pending(submission) or not has_ai_audit_result(submission):
        raise HTTPException(status_code=409, detail='submission is not pending review')

    submission.assigned_reviewer_id = None
    write_audit_log(
        db,
        event_type='review_unassigned',
        entity_type='submission',
        entity_id=submission.id,
        actor_user_id=user.id,
        payload={'reviewerId': user.id, 'reviewRound': submission.current_review_round},
    )
    db.commit()
    return success({'submissionId': submission.id, 'reviewerId': None})


@router.get('/{submission_id}')
def get_review_detail(
    submission_id: int,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user, default_username='reviewer_demo')
    require_role(user, {'reviewer'})

    submission = require_reviewer_submission_access(db, submission_id, user)
    mark_timed_out_ai_audit_jobs_as_human_review(db, submission_id=submission.id)
    db.refresh(submission)
    if not reviewable_status(submission.status) or ai_job_is_pending(submission) or not has_ai_audit_result(submission):
        raise HTTPException(status_code=409, detail='submission is not pending review')

    return success(serialize_review_detail(submission, db))


@router.post('/{submission_id}/approve')
def approve_review(
    submission_id: int,
    payload: ReviewApproveRequest,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user, default_username='reviewer_demo')
    require_role(user, {'reviewer'})

    submission = require_reviewer_submission_access(db, submission_id, user)
    mark_timed_out_ai_audit_jobs_as_human_review(db, submission_id=submission.id)
    db.refresh(submission)
    if not reviewable_status(submission.status) or ai_job_is_pending(submission) or not has_ai_audit_result(submission):
        raise HTTPException(status_code=409, detail='submission is not pending review')

    record_stage = submission.current_review_stage
    record_round = submission.current_review_round
    final_answers = payload.final_answers if payload.final_answers is not None else submission.answers_json
    validate_required_answers(submission.template_version, final_answers)
    
    # 一级审核逻辑：直接标记为通过并归档
    submission.status = 'review_passed'
    finalize_submission_result(submission, user.id, final_answers)
    
    db.add(
        ReviewRecord(
            submission_id=submission.id,
            submission_version_id=None,
            reviewer_id=user.id,
            assignee_reviewer_id=submission.assigned_reviewer_id,
            review_stage=record_stage,
            review_round=record_round,
            decision='approve',
            comment=payload.comment,
            reason='',
        )
    )
    write_audit_log(
        db,
        event_type='review_approved',
        entity_type='submission',
        entity_id=submission.id,
        actor_user_id=user.id,
        payload={'reviewerId': user.id, 'comment': payload.comment},
    )
    db.commit()
    db.refresh(submission)

    return success(
        {
            'submissionId': submission.id,
            'status': submission.status,
            'comment': payload.comment,
            'currentReviewStage': submission.current_review_stage,
            'currentReviewRound': submission.current_review_round,
        }
    )


@router.post('/{submission_id}/reject')
def reject_review(
    submission_id: int,
    payload: ReviewRejectRequest,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user, default_username='reviewer_demo')
    require_role(user, {'reviewer'})

    submission = require_reviewer_submission_access(db, submission_id, user)
    mark_timed_out_ai_audit_jobs_as_human_review(db, submission_id=submission.id)
    db.refresh(submission)
    if not reviewable_status(submission.status) or ai_job_is_pending(submission) or not has_ai_audit_result(submission):
        raise HTTPException(status_code=409, detail='submission is not pending review')

    if not payload.reason.strip():
        raise HTTPException(status_code=400, detail='reject reason is required')

    submission.status = 'needs_revision'
    clear_finalized_result(submission)
    db.add(
        ReviewRecord(
            submission_id=submission.id,
            submission_version_id=None,
            reviewer_id=user.id,
            assignee_reviewer_id=submission.assigned_reviewer_id,
            review_stage=submission.current_review_stage,
            review_round=submission.current_review_round,
            decision='reject',
            comment='',
            reason=payload.reason,
        )
    )
    write_audit_log(
        db,
        event_type='review_rejected',
        entity_type='submission',
        entity_id=submission.id,
        actor_user_id=user.id,
        payload={'reviewerId': user.id, 'reason': payload.reason},
    )
    db.commit()
    db.refresh(submission)

    return success({'submissionId': submission.id, 'status': submission.status, 'reason': payload.reason})
