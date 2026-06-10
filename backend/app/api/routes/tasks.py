from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_from_token, get_demo_user, require_role, success
from app.core.database import get_db
from app.models import (
    AIAuditConfig,
    AIAuditJob,
    AIAuditResult,
    Assignment,
    Dataset,
    DatasetItem,
    ExportJob,
    ReviewRecord,
    Submission,
    SubmissionVersion,
    Task,
    TaskReviewerAssignment,
    Template,
    TemplateVersion,
    User,
)
from app.services.access_control import require_owner_dataset, require_owner_task, require_owner_template
from app.services.ai_defaults import (
    DEFAULT_AI_PASS_THRESHOLD,
    normalize_percent_pass_threshold,
    normalize_score_dimensions,
)
from app.services.ai_executor import select_ai_executor
from app.services.dataset_import import get_dataset_item_reference_answer, get_dataset_item_source

router = APIRouter(prefix='/tasks', tags=['tasks'])

# --- Pydantic Models ---

class ScoreDimensionPayload(BaseModel):
    key: str
    label: str
    description: str = ''
    weight: int = 1
    enabled: bool = True


class TaskAIConfigPayload(BaseModel):
    promptTemplate: str
    scoreDimensions: list[ScoreDimensionPayload] = []
    passThreshold: int = DEFAULT_AI_PASS_THRESHOLD
    reviewGuideline: str = ''
    aiModel: str = 'qwen3.6-flash'


class TaskAIConfigTestRunRequest(TaskAIConfigPayload):
    model_config = ConfigDict(populate_by_name=True)
    item_id: int | None = Field(default=None, alias='itemId')
    mock_answers: dict = Field(default_factory=dict, alias='mockAnswers')


class TaskCreateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title: str
    description: str = ''
    task_brief: str | None = Field(default=None, alias='taskBrief')
    task_tags: list[str] = Field(default_factory=list, alias='taskTags')
    reward_rule: str | None = Field(default=None, alias='rewardRule')
    quota: int = 1
    deadline: datetime | None = None
    template_id: int | None = Field(default=None, alias='templateId')
    dataset_id: int | None = Field(default=None, alias='datasetId')
    ai_prompt_template: str | None = Field(default=None, alias='aiPromptTemplate')
    ai_pass_threshold: int | None = Field(default=None, alias='aiPassThreshold')
    ai_model: str | None = Field(default=None, alias='aiModel')


class TaskStatusRequest(BaseModel):
    status: str


class TaskReviewerUpdateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    reviewer_ids: list[int] = Field(alias='reviewerIds')


class TaskLabelerUpdateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    labeler_ids: list[int] = Field(alias='labelerIds')


class TaskDatasetBindingRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    dataset_id: int | None = Field(default=None, alias='datasetId')


class TaskUpdateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title: str | None = None
    description: str | None = None
    task_brief: str | None = Field(default=None, alias='taskBrief')
    task_tags: list[str] | None = Field(default=None, alias='taskTags')
    reward_rule: str | None = Field(default=None, alias='rewardRule')
    quota: int | None = None
    deadline: str | None = None
    dataset_id: int | None = Field(default=None, alias='datasetId')
    template_id: int | None = Field(default=None, alias='templateId')

# --- Helper Functions ---

def latest_template_version(db: Session, template_id: int | None) -> TemplateVersion | None:
    if not template_id:
        return None

    return (
        db.query(TemplateVersion)
        .filter(TemplateVersion.template_id == template_id)
        .order_by(TemplateVersion.version.desc())
        .first()
    )


def latest_template_version_id(db: Session, template_id: int | None) -> int | None:
    version = latest_template_version(db, template_id)
    return version.id if version else None


def freeze_template_version_id(db: Session, task: Task) -> int | None:
    if task.active_template_version_id:
        return task.active_template_version_id
    if not task.active_template_id:
        return None

    version_id = latest_template_version_id(db, task.active_template_id)
    task.active_template_version_id = version_id
    return version_id


def ensure_publishable_task(db: Session, task: Task) -> None:
    if not task.dataset_id or not task.dataset:
        raise HTTPException(status_code=409, detail='发布失败：请先绑定数据集。')
    if task.dataset.item_count <= 0:
        raise HTTPException(status_code=409, detail='发布失败：数据集至少需要包含一道题目。')
    if not task.active_template_id:
        raise HTTPException(status_code=409, detail='发布失败：请先绑定标注模板。')
    if not freeze_template_version_id(db, task):
        raise HTTPException(status_code=409, detail='发布失败：模板还没有保存任何组件，请先在模板设计台添加组件后重试。')


def serialize_ai_config(task: Task) -> dict:
    config = task.ai_audit_config
    if config is None:
        return {
            'promptTemplate': getattr(task, 'ai_prompt_template', '') or '',
            'scoreDimensions': normalize_score_dimensions(getattr(task, 'ai_score_dimensions_json', []) or []),
            'passThreshold': normalize_percent_pass_threshold(getattr(task, 'ai_pass_threshold', DEFAULT_AI_PASS_THRESHOLD)),
            'reviewGuideline': task.review_guideline or '',
            'aiModel': 'qwen3.6-flash',
        }

    return {
        'promptTemplate': config.prompt_template,
        'scoreDimensions': normalize_score_dimensions(config.score_dimensions_json),
        'passThreshold': normalize_percent_pass_threshold(config.pass_threshold),
        'reviewGuideline': task.review_guideline or '',
        'aiModel': getattr(config, 'ai_model', 'qwen3.6-flash') or 'qwen3.6-flash',
    }


def build_task_metrics(db: Session, task: Task) -> dict:
    total = task.dataset.item_count if task.dataset else 0
    completed = db.query(func.count(func.distinct(Submission.dataset_item_id))).filter(
        Submission.task_id == task.id,
        Submission.status.in_(['submitted', 'ai_passed', 'needs_revision', 'review_passed']),
    ).scalar() or 0
    passed = db.query(func.count(func.distinct(Submission.dataset_item_id))).filter(
        Submission.task_id == task.id,
        Submission.status == 'review_passed',
    ).scalar() or 0
    pending = db.query(func.count(func.distinct(Submission.dataset_item_id))).filter(
        Submission.task_id == task.id,
        Submission.status.in_(['submitted', 'ai_passed']),
    ).scalar() or 0
    pass_rate = int((passed / total) * 100) if total else 0

    return {
        'itemCount': total,
        'completedItemCount': completed,
        'passedItemCount': passed,
        'pendingReviewCount': pending,
        'passRate': pass_rate,
    }


def is_task_ready_for_storage(metrics: dict) -> bool:
    total = metrics.get('itemCount', 0) or 0
    passed = metrics.get('passedItemCount', 0) or 0
    pending = metrics.get('pendingReviewCount', 0) or 0
    return total > 0 and passed >= total and pending == 0


def ensure_storable_task(db: Session, task: Task) -> None:
    metrics = build_task_metrics(db, task)
    if not is_task_ready_for_storage(metrics):
        raise HTTPException(status_code=409, detail='task can be stored only after all items pass review and no pending reviews remain')


def build_task_reviewer_summary(db: Session, task_id: int) -> list[dict]:
    rows = (
        db.query(TaskReviewerAssignment)
        .filter(TaskReviewerAssignment.task_id == task_id)
        .order_by(TaskReviewerAssignment.id.asc())
        .all()
    )
    items = []
    for row in rows:
        if row.reviewer:
            items.append({
                'reviewerId': row.reviewer.id,
                'username': row.reviewer.username,
                'displayName': row.reviewer.display_name,
            })
    return items


def build_task_labeler_summary(db: Session, task_id: int) -> list[dict]:
    rows = (
        db.query(Assignment)
        .filter(Assignment.task_id == task_id)
        .order_by(Assignment.id.asc())
        .all()
    )
    items = []
    for row in rows:
        if row.user:
            items.append({
                'labelerId': row.user.id,
                'username': row.user.username,
                'displayName': row.user.display_name,
                'assignmentId': row.id,
            })
    return items


def build_task_status_breakdown(db: Session, task_id: int) -> dict[str, int]:
    rows = (
        db.query(Submission.status, func.count(Submission.id))
        .filter(Submission.task_id == task_id)
        .group_by(Submission.status)
        .all()
    )
    return {status: count for status, count in rows}


def task_to_dict(db: Session, task: Task) -> dict:
    metrics = build_task_metrics(db, task)
    dataset_name = task.dataset.name if task.dataset else None
    template_name = None
    current_template_version = None
    newest_template_version = None
    if task.active_template_id:
        tmpl = db.query(Template.name).filter(Template.id == task.active_template_id).scalar()
        template_name = tmpl
        newest_template_version = latest_template_version(db, task.active_template_id)
        if task.active_template_version_id:
            current_template_version = db.get(TemplateVersion, task.active_template_version_id)
        else:
            current_template_version = newest_template_version

    return {
        'id': task.id,
        'title': task.title,
        'description': task.description,
        'taskBrief': task.task_brief or '',
        'taskTags': task.task_tags_json or [],
        'rewardRule': task.reward_rule or '',
        'status': task.status,
        'quota': task.quota,
        'deadline': task.deadline,
        'templateId': task.active_template_id,
        'templateName': template_name,
        'datasetId': task.dataset_id,
        'datasetName': dataset_name,
        **metrics,
        'labelers': build_task_labeler_summary(db, task.id),
        'reviewers': build_task_reviewer_summary(db, task.id),
        'aiPromptTemplate': getattr(task, 'ai_prompt_template', None),
        'aiPassThreshold': getattr(task, 'ai_pass_threshold', None),
        'aiConfig': serialize_ai_config(task),
        'activeTemplateVersionId': current_template_version.id if current_template_version else None,
        'activeTemplateVersionNumber': current_template_version.version if current_template_version else None,
        'latestTemplateVersionId': newest_template_version.id if newest_template_version else None,
        'latestTemplateVersionNumber': newest_template_version.version if newest_template_version else None,
        'createdBy': task.owner_id,
        'createdAt': task.created_at,
        'updatedAt': task.updated_at,
    }

# --- API Routes ---

@router.get('')
def list_tasks(
    status: str | None = None,
    keyword: str | None = None,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user, default_username='owner_demo')
    require_role(user, {'owner'})

    query = db.query(Task).filter(Task.owner_id == user.id)
    if status:
        query = query.filter(Task.status == status)
    if keyword:
        query = query.filter(Task.title.like(f'%{keyword}%'))

    tasks = query.order_by(Task.created_at.desc()).all()
    return success({'items': [task_to_dict(db, task) for task in tasks], 'total': len(tasks)})


@router.post('')
def create_task(
    payload: TaskCreateRequest,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_current_user_from_token(db, authorization)
    require_role(user, {'owner'})

    if payload.dataset_id:
        require_owner_dataset(db, payload.dataset_id, user)
    if payload.template_id:
        require_owner_template(db, payload.template_id, user)

    task = Task(
        title=payload.title,
        description=payload.description,
        task_brief=(payload.task_brief or '').strip() or None,
        task_tags_json=[item.strip() for item in payload.task_tags if item.strip()],
        reward_rule=(payload.reward_rule or '').strip() or None,
        quota=payload.quota,
        deadline=payload.deadline,
        owner_id=user.id,
        dataset_id=payload.dataset_id,
        active_template_id=payload.template_id,
    )
    if payload.ai_prompt_template is not None:
        task.ai_prompt_template = payload.ai_prompt_template.strip()
    if payload.ai_pass_threshold is not None:
        task.ai_pass_threshold = normalize_percent_pass_threshold(payload.ai_pass_threshold)
    db.add(task)
    db.commit()
    db.refresh(task)

    return success({'id': task.id, 'status': task.status})


@router.get('/plaza')
def list_plaza_tasks(
    keyword: str | None = None,
    claimStatus: str | None = None,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user, default_username='labeler_demo')
    require_role(user, {'labeler'})

    tasks = db.query(Task).filter(Task.status.in_(['published', 'paused'])).order_by(Task.created_at.desc()).all()
    items = []

    normalized_keyword = keyword.strip().lower() if keyword else ''

    for task in tasks:
        claimed_count = db.query(Assignment).filter(Assignment.task_id == task.id).count()
        current_assignment = (
            db.query(Assignment)
            .filter(Assignment.task_id == task.id, Assignment.user_id == user.id)
            .first()
        )
        remaining_quota = max(task.quota - claimed_count, 0)
        has_capacity = remaining_quota > 0
        claimed_by_current_user = current_assignment is not None

        if normalized_keyword:
            haystack = f"{task.title} {task.description}".lower()
            if normalized_keyword not in haystack:
                continue

        if claimStatus == 'claimed' and not claimed_by_current_user:
            continue
        if claimStatus == 'available' and (claimed_by_current_user or not has_capacity):
            continue

        items.append(
            {
                'id': task.id,
                'title': task.title,
                'description': task.description,
                'status': task.status,
                'quota': task.quota,
                'claimedCount': claimed_count,
                'claimedByCurrentUser': claimed_by_current_user,
                'assignmentId': current_assignment.id if current_assignment else None,
                'itemCount': task.dataset.item_count if task.dataset else 0,
                'deadline': task.deadline,
                'createdAt': task.created_at,
                'updatedAt': task.updated_at,
            }
        )

    return success({'items': items, 'total': len(items)})


@router.get('/{task_id}/analytics')
def get_task_analytics(
    task_id: int,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user, default_username='owner_demo')
    require_role(user, {'owner'})

    task = require_owner_task(db, task_id, user)
    metrics = build_task_metrics(db, task)

    return success(
        {
            'task': {
                'id': task.id,
                'title': task.title,
                'status': task.status,
                'taskBrief': task.task_brief or '',
                'taskTags': task.task_tags_json or [],
                'rewardRule': task.reward_rule or '',
            },
            'metrics': metrics,
            'statusBreakdown': build_task_status_breakdown(db, task.id),
            'reviewers': build_task_reviewer_summary(db, task.id),
            'dataset': {
                'id': task.dataset.id,
                'name': task.dataset.name,
                'itemCount': task.dataset.item_count,
            }
            if task.dataset
            else None,
            'template': {
                'id': task.active_template_id,
                'activeTemplateVersionId': task.active_template_version_id or latest_template_version_id(db, task.active_template_id),
            },
            'aiConfigEnabled': task.ai_audit_config is not None or bool(getattr(task, 'ai_prompt_template', '')),
        }
    )


@router.get('/{task_id}')
def get_task_detail(
    task_id: int,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user, default_username='owner_demo')
    require_role(user, {'owner'})

    task = require_owner_task(db, task_id, user)
    return success(task_to_dict(db, task))


@router.patch('/{task_id}/ai-config')
def update_task_ai_config(
    task_id: int,
    payload: TaskAIConfigPayload,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_current_user_from_token(db, authorization)
    require_role(user, {'owner'})

    task = require_owner_task(db, task_id, user)

    if '{answers}' not in payload.promptTemplate:
        raise HTTPException(status_code=400, detail='Prompt 模板必须包含 {answers} 占位符')

    config = task.ai_audit_config
    if config is None:
        config = AIAuditConfig(task_id=task.id)

    config.prompt_template = payload.promptTemplate.strip()
    config.score_dimensions_json = normalize_score_dimensions([item.model_dump() for item in payload.scoreDimensions])
    config.pass_threshold = normalize_percent_pass_threshold(payload.passThreshold)
    config.ai_model = payload.aiModel
    config.config_version = (config.config_version or 0) + 1
    task.review_guideline = payload.reviewGuideline.strip()

    db.add(config)
    db.commit()
    db.refresh(task)

    return success({'taskId': task.id, 'aiConfig': serialize_ai_config(task)})


@router.patch('/{task_id}/status')
def update_task_status(
    task_id: int,
    payload: TaskStatusRequest,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_current_user_from_token(db, authorization)
    require_role(user, {'owner'})

    if payload.status not in {'draft', 'published', 'paused', 'ended'}:
        raise HTTPException(status_code=400, detail='invalid task status')

    task = require_owner_task(db, task_id, user)

    if payload.status == 'published':
        ensure_publishable_task(db, task)
    elif payload.status == 'ended':
        ensure_storable_task(db, task)

    task.status = payload.status
    db.commit()
    db.refresh(task)

    return success({'id': task.id, 'status': task.status})


@router.patch('/{task_id}/dataset-binding')
def update_task_dataset_binding(
    task_id: int,
    payload: TaskDatasetBindingRequest,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user, default_username='owner_demo')
    require_role(user, {'owner'})
    task = require_owner_task(db, task_id, user)

    if payload.dataset_id is None:
        if task.status != 'paused':
            raise HTTPException(status_code=409, detail='task must be paused before unbinding dataset')
        task.dataset_id = None
        db.add(task)
        db.commit()
        db.refresh(task)
        return success({'taskId': task.id, 'datasetId': task.dataset_id})

    require_owner_dataset(db, payload.dataset_id, user)
    task.dataset_id = payload.dataset_id
    db.add(task)
    db.commit()
    db.refresh(task)
    return success({'taskId': task.id, 'datasetId': task.dataset_id})


@router.post('/{task_id}/template-version/refresh')
def refresh_task_template_version(
    task_id: int,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user, default_username='owner_demo')
    require_role(user, {'owner'})
    task = require_owner_task(db, task_id, user)

    if not task.active_template_id:
        raise HTTPException(status_code=409, detail='task has no linked template')

    require_owner_template(db, task.active_template_id, user)
    version = latest_template_version(db, task.active_template_id)
    if not version:
        raise HTTPException(status_code=409, detail='linked template has no versions')

    previous_version_id = task.active_template_version_id
    task.active_template_version_id = version.id
    db.add(task)
    db.commit()
    db.refresh(task)

    return success(
        {
            'task': task_to_dict(db, task),
            'previousTemplateVersionId': previous_version_id,
            'activeTemplateVersionId': version.id,
            'activeTemplateVersionNumber': version.version,
        }
    )


@router.patch('/{task_id}')
def update_task(
    task_id: int,
    payload: TaskUpdateRequest,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user, default_username='owner_demo')
    require_role(user, {'owner'})
    task = require_owner_task(db, task_id, user)

    if payload.title is not None:
        task.title = payload.title
    if payload.description is not None:
        task.description = payload.description
    if payload.task_brief is not None:
        task.task_brief = payload.task_brief
    if payload.task_tags is not None:
        task.task_tags_json = payload.task_tags
    if payload.reward_rule is not None:
        task.reward_rule = payload.reward_rule
    if payload.quota is not None:
        task.quota = payload.quota
    if payload.deadline is not None:
        task.deadline = payload.deadline
    if payload.dataset_id is not None:
        require_owner_dataset(db, payload.dataset_id, user)
        task.dataset_id = payload.dataset_id
    if payload.template_id is not None:
        require_owner_template(db, payload.template_id, user)
        if payload.template_id != task.active_template_id:
            task.active_template_version_id = latest_template_version_id(db, payload.template_id)
        task.active_template_id = payload.template_id

    db.add(task)
    db.commit()
    db.refresh(task)
    return success({'task': task_to_dict(db, task)})


@router.post('/{task_id}/reviewers')
def replace_task_reviewers(
    task_id: int,
    payload: TaskReviewerUpdateRequest,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user, default_username='owner_demo')
    require_role(user, {'owner'})
    task = require_owner_task(db, task_id, user)

    reviewer_ids = list(dict.fromkeys(payload.reviewer_ids))
    reviewers = db.query(User).filter(User.role == 'reviewer', User.id.in_(reviewer_ids)).all() if reviewer_ids else []
    if len(reviewers) != len(reviewer_ids):
        raise HTTPException(status_code=400, detail='some reviewers do not exist')

    db.query(TaskReviewerAssignment).filter(TaskReviewerAssignment.task_id == task.id).delete()
    for reviewer in reviewers:
        db.add(TaskReviewerAssignment(task_id=task.id, reviewer_id=reviewer.id, assigned_by=user.id))
    db.commit()

    return success({'taskId': task.id, 'reviewerIds': [reviewer.id for reviewer in reviewers]})


@router.post('/{task_id}/labelers')
def replace_task_labelers(
    task_id: int,
    payload: TaskLabelerUpdateRequest,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user, default_username='owner_demo')
    require_role(user, {'owner'})
    task = require_owner_task(db, task_id, user)

    labeler_ids = list(dict.fromkeys(payload.labeler_ids))
    if len(labeler_ids) > task.quota:
        raise HTTPException(status_code=400, detail='assigned labelers cannot exceed task quota')

    labelers = db.query(User).filter(User.role == 'labeler', User.id.in_(labeler_ids)).all() if labeler_ids else []
    if len(labelers) != len(labeler_ids):
        raise HTTPException(status_code=400, detail='some labelers do not exist')

    existing_assignments = db.query(Assignment).filter(Assignment.task_id == task.id).all()
    keep_user_ids = set(labeler_ids)
    for assignment in existing_assignments:
        if assignment.user_id not in keep_user_ids:
            has_submissions = db.query(Submission.id).filter(Submission.assignment_id == assignment.id).first()
            if has_submissions:
                raise HTTPException(status_code=409, detail='cannot remove labeler with existing submissions')
            db.delete(assignment)

    existing_user_ids = {assignment.user_id for assignment in existing_assignments}
    for labeler in labelers:
        if labeler.id in existing_user_ids:
            continue
        assignment = Assignment(task_id=task.id, user_id=labeler.id)
        if task.dataset:
            assignment.progress_total = task.dataset.item_count
        db.add(assignment)

    db.commit()
    return success({'taskId': task.id, 'labelerIds': labeler_ids, 'labelers': build_task_labeler_summary(db, task.id)})


@router.delete('/{task_id}')
def delete_task(
    task_id: int,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user, default_username='owner_demo')
    require_role(user, {'owner'})

    task = require_owner_task(db, task_id, user)
    if db.query(Assignment).filter(Assignment.task_id == task.id).first():
        raise HTTPException(status_code=409, detail='task already has assignments and cannot be deleted')
    if db.query(Submission).filter(Submission.task_id == task.id).first():
        raise HTTPException(status_code=409, detail='task already has submissions and cannot be deleted')

    try:
        db.query(TaskReviewerAssignment).filter(TaskReviewerAssignment.task_id == task.id).delete()
        db.query(AIAuditConfig).filter(AIAuditConfig.task_id == task.id).delete()
        db.query(ExportJob).filter(ExportJob.task_id == task.id).delete()

        db.delete(task)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f'Failed to delete task: {str(e)}')

    return success({'taskId': task_id})


@router.get('/{task_id}/reviewers')
def get_task_reviewers(
    task_id: int,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user, default_username='owner_demo')
    require_role(user, {'owner'})
    task = require_owner_task(db, task_id, user)

    rows = (
        db.query(TaskReviewerAssignment)
        .filter(TaskReviewerAssignment.task_id == task.id)
        .order_by(TaskReviewerAssignment.id.asc())
        .all()
    )
    return success(
        {
            'taskId': task.id,
            'items': [
                {
                    'reviewerId': row.reviewer.id,
                    'username': row.reviewer.username,
                    'displayName': row.reviewer.display_name,
                }
                for row in rows
            ],
        }
    )


@router.get('/{task_id}/labelers')
def get_task_labelers(
    task_id: int,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user, default_username='owner_demo')
    require_role(user, {'owner'})
    task = require_owner_task(db, task_id, user)

    return success({'taskId': task.id, 'items': build_task_labeler_summary(db, task.id)})


@router.post('/{task_id}/claim')
def claim_task(
    task_id: int,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user, default_username='labeler_demo')
    require_role(user, {'labeler'})

    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail='task not found')
    if task.status not in {'published', 'paused'}:
        raise HTTPException(status_code=409, detail='task is not claimable')

    existing = db.query(Assignment).filter(Assignment.task_id == task.id, Assignment.user_id == user.id).first()
    if existing:
        return success(
            {
                'assignmentId': existing.id,
                'taskId': existing.task_id,
                'userId': existing.user_id,
                'claimedAt': existing.claimed_at,
            }
        )

    claimed_count = db.query(Assignment).filter(Assignment.task_id == task.id).count()
    if claimed_count >= task.quota:
        raise HTTPException(status_code=409, detail='task quota has been fully claimed')

    assignment = Assignment(task_id=task.id, user_id=user.id)
    if task.dataset:
        assignment.progress_total = task.dataset.item_count
    db.add(assignment)
    db.commit()
    db.refresh(assignment)

    return success(
        {
            'assignmentId': assignment.id,
            'taskId': assignment.task_id,
            'userId': assignment.user_id,
            'progressTotal': assignment.progress_total,
            'progressCompleted': assignment.progress_completed,
            'claimedAt': assignment.claimed_at,
        }
    )


@router.post('/{task_id}/unclaim')
def unclaim_task(
    task_id: int,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user, default_username='labeler_demo')
    require_role(user, {'labeler'})

    # 1. Find the assignment
    assignment = (
        db.query(Assignment)
        .filter(Assignment.task_id == task_id, Assignment.user_id == user.id)
        .first()
    )

    if not assignment:
        raise HTTPException(status_code=404, detail='assignment not found')

    # 2. Collect all submission IDs associated with this assignment
    submission_id_rows = db.query(Submission.id).filter(Submission.assignment_id == assignment.id).all()
    submission_ids = [row[0] for row in submission_id_rows]

    try:
        if submission_ids:
            # 3. Defensive granular cleanup to avoid FK issues
            # Delete review records first (depends on submissions and versions)
            db.query(ReviewRecord).filter(ReviewRecord.submission_id.in_(submission_ids)).delete(synchronize_session=False)

            # Delete AI audit results (depends on jobs and submissions)
            db.query(AIAuditResult).filter(AIAuditResult.submission_id.in_(submission_ids)).delete(synchronize_session=False)

            # Delete AI audit jobs (depends on submissions)
            db.query(AIAuditJob).filter(AIAuditJob.submission_id.in_(submission_ids)).delete(synchronize_session=False)

            # Delete submission versions (depends on submissions)
            db.query(SubmissionVersion).filter(SubmissionVersion.submission_id.in_(submission_ids)).delete(synchronize_session=False)

            # Synchronize state before deleting submissions
            db.flush()

            # Delete submissions
            db.query(Submission).filter(Submission.id.in_(submission_ids)).delete(synchronize_session=False)
            db.flush()

        # 4. Finally delete the assignment
        db.delete(assignment)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f'Database error during unclaim: {str(e)}')

    return success({'taskId': task_id, 'unclaimed': True})


@router.post('/{task_id}/ai-config/test-run')
def test_run_ai_audit_config(
    task_id: int,
    payload: TaskAIConfigTestRunRequest,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_current_user_from_token(db, authorization)
    require_role(user, {'owner'})

    task = require_owner_task(db, task_id, user)
    source = {}
    reference_answer = {}
    if payload.item_id is not None:
        item = (
            db.query(DatasetItem)
            .filter(DatasetItem.id == payload.item_id, DatasetItem.dataset_id == task.dataset_id)
            .first()
        )
        if item is None:
            raise HTTPException(status_code=404, detail='测试样本不存在')
        source = get_dataset_item_source(item)
        reference_answer = get_dataset_item_reference_answer(item)

    execution_result = select_ai_executor(payload.aiModel).execute(
        payload.mock_answers,
        prompt_template=payload.promptTemplate,
        score_dimensions=normalize_score_dimensions([item.model_dump() for item in payload.scoreDimensions]),
        pass_threshold=normalize_percent_pass_threshold(payload.passThreshold),
        source=source,
        reference_answer=reference_answer,
        model=payload.aiModel,
    )

    return success(
        {
            'scores': execution_result.scores,
            'overallScore': execution_result.overall_score,
            'decision': execution_result.decision,
            'summary': execution_result.summary,
        }
    )
