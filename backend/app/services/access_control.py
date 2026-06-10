from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import Assignment, Dataset, ExportJob, Submission, Task, TaskReviewerAssignment, Template


def require_owner_task(db: Session, task_id: int, current_user):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail='task not found')
    if task.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail='task belongs to another owner')
    return task


def require_owner_template(db: Session, template_id: int, current_user):
    template = db.get(Template, template_id)
    if not template:
        raise HTTPException(status_code=404, detail='template not found')
    if template.created_by != current_user.id:
        raise HTTPException(status_code=403, detail='template belongs to another owner')
    return template


def require_owner_dataset(db: Session, dataset_id: int, current_user):
    dataset = db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail='dataset not found')
    if dataset.created_by != current_user.id:
        raise HTTPException(status_code=403, detail='dataset belongs to another owner')
    return dataset


def require_owner_export_job(db: Session, job_id: int, current_user):
    job = db.get(ExportJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail='export job not found')
    if job.created_by != current_user.id:
        raise HTTPException(status_code=403, detail='export job belongs to another owner')
    return job


def require_labeler_assignment(db: Session, assignment_id: int, current_user):
    assignment = db.get(Assignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail='assignment not found')
    if assignment.user_id != current_user.id:
        raise HTTPException(status_code=403, detail='assignment belongs to another user')
    return assignment


def require_labeler_submission(db: Session, submission_id: int, current_user):
    submission = db.get(Submission, submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail='submission not found')
    if submission.user_id != current_user.id or submission.assignment.user_id != current_user.id:
        raise HTTPException(status_code=403, detail='submission belongs to another user')
    return submission


def require_reviewer_task_assignment(db: Session, task_id: int, current_user):
    assignment = (
        db.query(TaskReviewerAssignment)
        .filter(TaskReviewerAssignment.task_id == task_id, TaskReviewerAssignment.reviewer_id == current_user.id)
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=403, detail='reviewer is not assigned to this task')
    return assignment


def require_reviewer_submission_access(db: Session, submission_id: int, current_user):
    submission = db.get(Submission, submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail='submission not found')
    require_reviewer_task_assignment(db, submission.task_id, current_user)
    if submission.assigned_reviewer_id is not None and submission.assigned_reviewer_id != current_user.id:
        raise HTTPException(status_code=403, detail='submission is assigned to another reviewer')
    return submission
