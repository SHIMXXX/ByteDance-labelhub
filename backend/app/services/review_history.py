from app.models import AuditLog, ReviewRecord, Submission, SubmissionVersion


REVIEW_STAGES = ('final',)


def create_submission_version(db, submission: Submission) -> SubmissionVersion:
    next_version_no = (submission.current_version_no or 0) + 1
    version = SubmissionVersion(
        submission_id=submission.id,
        version_no=next_version_no,
        answers_json=submission.answers_json,
        template_version_id=submission.template_version_id,
        submitted_by=submission.user_id,
    )
    db.add(version)
    submission.current_version_no = next_version_no
    return version


def clear_finalized_result(submission: Submission) -> None:
    submission.final_answer_json = {}
    submission.finalized_by = None
    submission.finalized_at = None
    submission.final_submission_version_no = None


def reset_review_progress_for_submission(submission: Submission, previous_status: str) -> None:
    if previous_status == 'needs_revision':
        submission.current_review_round = (submission.current_review_round or 1) + 1
    elif submission.current_review_round <= 0:
        submission.current_review_round = 1

    submission.current_review_stage = 'final'
    submission.assigned_reviewer_id = None
    clear_finalized_result(submission)


def build_answer_diff(previous_answers: dict, current_answers: dict) -> list[dict]:
    keys = sorted(set(previous_answers) | set(current_answers))
    items = []
    for key in keys:
        previous = previous_answers.get(key)
        current = current_answers.get(key)
        if previous is None and current is not None:
            change_type = 'added'
        elif previous is not None and current is None:
            change_type = 'removed'
        elif previous == current:
            change_type = 'unchanged'
        else:
            change_type = 'changed'
        items.append(
            {
                'field': key,
                'previousValue': previous,
                'currentValue': current,
                'changeType': change_type,
            }
        )
    return items


def next_review_stage(current_stage: str) -> str | None:
    # 简化为单级审核，不再有下一阶段
    return None


def serialize_timeline(
    submission_id: int,
    review_records: list[ReviewRecord],
    audit_logs: list[AuditLog],
    labeler_name: str | None = None,
) -> list[dict]:
    items = [
        {
            'type': 'review',
            'createdAt': record.created_at,
            'stage': record.review_stage,
            'decision': record.decision,
            'reviewerName': record.reviewer.display_name if record.reviewer else None,
            'payload': {
                'reviewerName': record.reviewer.display_name if record.reviewer else None,
                'labelerName': labeler_name,
            },
        }
        for record in review_records
    ]
    items.extend(
        {
            'type': 'audit',
            'createdAt': log.created_at,
            'eventType': log.event_type,
            'payload': {
                **(log.payload_json if isinstance(log.payload_json, dict) else {}),
                'labelerName': (log.payload_json or {}).get('labelerName') if isinstance(log.payload_json, dict) else None,
                'reviewerName': (
                    (log.payload_json or {}).get('reviewerName')
                    if isinstance(log.payload_json, dict)
                    else None
                ) or (log.actor.display_name if log.actor else None),
            },
        }
        for log in audit_logs
        if (
            (log.entity_type == 'submission' and log.entity_id == submission_id)
            or log.payload_json.get('submissionId') == submission_id
        )
    )
    return sorted(items, key=lambda item: item['createdAt'])
