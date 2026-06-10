from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = 'users'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(128), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class Dataset(Base):
    __tablename__ = 'datasets'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    description: Mapped[str] = mapped_column(Text, default='', nullable=False)
    source_type: Mapped[str] = mapped_column(String(16), nullable=False)
    import_mode: Mapped[str] = mapped_column(String(32), default='normal', nullable=False)
    item_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_by: Mapped[int] = mapped_column(ForeignKey('users.id'), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )

    creator: Mapped[User] = relationship('User')
    # 级联删除关系
    items: Mapped[list['DatasetItem']] = relationship(
        'DatasetItem',
        back_populates='dataset',
        cascade='all, delete-orphan',
    )


class DatasetItem(Base):
    __tablename__ = 'dataset_items'
    __table_args__ = (UniqueConstraint('dataset_id', 'item_index', name='uq_dataset_item_index'),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    dataset_id: Mapped[int] = mapped_column(ForeignKey('datasets.id'), nullable=False, index=True)
    item_index: Mapped[int] = mapped_column(Integer, nullable=False)
    source_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    reference_answer_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    search_text: Mapped[str] = mapped_column(Text, default='', nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    dataset: Mapped[Dataset] = relationship('Dataset', back_populates='items')


class Task(Base):
    __tablename__ = 'tasks'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, default='', nullable=False)
    task_brief: Mapped[str | None] = mapped_column(Text, nullable=True)
    task_tags_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    reward_rule: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default='draft', index=True, nullable=False)
    quota: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey('users.id'), nullable=False)
    dataset_id: Mapped[int | None] = mapped_column(ForeignKey('datasets.id'), nullable=True)
    active_template_id: Mapped[int] = mapped_column(Integer, nullable=True)
    active_template_version_id: Mapped[int] = mapped_column(Integer, nullable=True)
    ai_prompt_template: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_score_dimensions_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    ai_pass_threshold: Mapped[int | None] = mapped_column(Integer, nullable=True)
    review_guideline: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )

    owner: Mapped[User] = relationship('User')
    dataset: Mapped[Dataset | None] = relationship('Dataset')
    ai_audit_config: Mapped[AIAuditConfig | None] = relationship(
        'AIAuditConfig',
        back_populates='task',
        uselist=False,
        cascade='all, delete-orphan',
    )
    # 级联删除关系
    reviewer_assignments: Mapped[list['TaskReviewerAssignment']] = relationship(
        'TaskReviewerAssignment',
        back_populates='task',
        cascade='all, delete-orphan',
    )
    export_jobs: Mapped[list['ExportJob']] = relationship(
        'ExportJob',
        back_populates='task',
        cascade='all, delete-orphan',
    )


class TaskReviewerAssignment(Base):
    __tablename__ = 'task_reviewer_assignments'
    __table_args__ = (UniqueConstraint('task_id', 'reviewer_id', name='uq_task_reviewer_assignment'),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    task_id: Mapped[int] = mapped_column(ForeignKey('tasks.id'), nullable=False, index=True)
    reviewer_id: Mapped[int] = mapped_column(ForeignKey('users.id'), nullable=False, index=True)
    assigned_by: Mapped[int] = mapped_column(ForeignKey('users.id'), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    task: Mapped[Task] = relationship('Task', foreign_keys=[task_id], back_populates='reviewer_assignments')
    reviewer: Mapped[User] = relationship('User', foreign_keys=[reviewer_id])
    assigner: Mapped[User] = relationship('User', foreign_keys=[assigned_by])


class AIAuditConfig(Base):
    __tablename__ = 'ai_audit_configs'
    __table_args__ = (UniqueConstraint('task_id', name='uq_ai_audit_config_task'),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    task_id: Mapped[int] = mapped_column(ForeignKey('tasks.id'), nullable=False, index=True)
    prompt_template: Mapped[str] = mapped_column(Text, default='', nullable=False)
    score_dimensions_json: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    pass_threshold: Mapped[int] = mapped_column(Integer, default=80, nullable=False)
    ai_model: Mapped[str] = mapped_column(String(64), default='qwen3.6-flash', nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    config_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )

    task: Mapped[Task] = relationship('Task', back_populates='ai_audit_config')


class Template(Base):
    __tablename__ = 'templates'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    task_id: Mapped[int] = mapped_column(ForeignKey('tasks.id'), nullable=True)
    design_dataset_id: Mapped[int | None] = mapped_column(ForeignKey('datasets.id'), nullable=True)
    design_sample_item_id: Mapped[int | None] = mapped_column(ForeignKey('dataset_items.id'), nullable=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, default='', nullable=False)
    created_by: Mapped[int] = mapped_column(ForeignKey('users.id'), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    task: Mapped[Task] = relationship('Task', foreign_keys=[task_id])
    design_dataset: Mapped[Dataset | None] = relationship('Dataset', foreign_keys=[design_dataset_id])
    design_sample_item: Mapped[DatasetItem | None] = relationship('DatasetItem', foreign_keys=[design_sample_item_id])
    creator: Mapped[User] = relationship('User')
    # 级联删除关系
    versions: Mapped[list['TemplateVersion']] = relationship(
        'TemplateVersion',
        back_populates='template',
        cascade='all, delete-orphan',
    )


class TemplateVersion(Base):
    __tablename__ = 'template_versions'
    __table_args__ = (UniqueConstraint('template_id', 'version', name='uq_template_version'),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    template_id: Mapped[int] = mapped_column(ForeignKey('templates.id'), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    schema_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    template: Mapped[Template] = relationship('Template', back_populates='versions')


class Assignment(Base):
    __tablename__ = 'assignments'
    __table_args__ = (UniqueConstraint('task_id', 'user_id', name='uq_assignment_task_user'),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    task_id: Mapped[int] = mapped_column(ForeignKey('tasks.id'), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default='claimed', nullable=False)
    progress_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    progress_completed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    claimed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    task: Mapped[Task] = relationship('Task')
    user: Mapped[User] = relationship('User')
    submissions: Mapped[list['Submission']] = relationship('Submission', back_populates='assignment', cascade='all, delete-orphan')


class Submission(Base):
    __tablename__ = 'submissions'
    __table_args__ = (UniqueConstraint('assignment_id', 'dataset_item_id', name='uq_submission_assignment_item'),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    task_id: Mapped[int] = mapped_column(ForeignKey('tasks.id'), nullable=False)
    assignment_id: Mapped[int] = mapped_column(ForeignKey('assignments.id'), nullable=False)
    dataset_item_id: Mapped[int | None] = mapped_column(ForeignKey('dataset_items.id'), nullable=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'), nullable=False)
    template_version_id: Mapped[int] = mapped_column(ForeignKey('template_versions.id'), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default='draft', index=True, nullable=False)
    answers_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    final_answer_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    current_version_no: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    current_review_stage: Mapped[str] = mapped_column(String(16), default='initial', nullable=False)
    current_review_round: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    assigned_reviewer_id: Mapped[int | None] = mapped_column(ForeignKey('users.id'), nullable=True)
    finalized_by: Mapped[int | None] = mapped_column(ForeignKey('users.id'), nullable=True)
    finalized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    final_submission_version_no: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )

    task: Mapped[Task] = relationship('Task')
    assignment: Mapped[Assignment] = relationship('Assignment', back_populates='submissions')
    dataset_item: Mapped[DatasetItem | None] = relationship('DatasetItem')
    user: Mapped[User] = relationship('User', foreign_keys=[user_id])
    assigned_reviewer: Mapped[User | None] = relationship('User', foreign_keys=[assigned_reviewer_id])
    finalizer: Mapped[User | None] = relationship('User', foreign_keys=[finalized_by])
    template_version: Mapped[TemplateVersion] = relationship('TemplateVersion')
    ai_audit_job: Mapped[AIAuditJob | None] = relationship('AIAuditJob', back_populates='submission', uselist=False, cascade='all, delete-orphan')
    ai_audit_result: Mapped[AIAuditResult | None] = relationship(
        'AIAuditResult',
        back_populates='submission',
        uselist=False,
        cascade='all, delete-orphan',
    )
    versions: Mapped[list[SubmissionVersion]] = relationship('SubmissionVersion', back_populates='submission', cascade='all, delete-orphan')
    review_records: Mapped[list['ReviewRecord']] = relationship('ReviewRecord', back_populates='submission', cascade='all, delete-orphan')


class SubmissionVersion(Base):
    __tablename__ = 'submission_versions'
    __table_args__ = (UniqueConstraint('submission_id', 'version_no', name='uq_submission_version_no'),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey('submissions.id'), nullable=False, index=True)
    version_no: Mapped[int] = mapped_column(Integer, nullable=False)
    answers_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    template_version_id: Mapped[int | None] = mapped_column(ForeignKey('template_versions.id'), nullable=True)
    submitted_by: Mapped[int] = mapped_column(ForeignKey('users.id'), nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    submission: Mapped[Submission] = relationship('Submission', back_populates='versions')
    template_version: Mapped[TemplateVersion | None] = relationship('TemplateVersion')
    submitter: Mapped[User] = relationship('User')


class AIAuditJob(Base):
    __tablename__ = 'ai_audit_jobs'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey('submissions.id'), unique=True, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default='queued', nullable=False)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    celery_task_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    config_snapshot_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    prompt_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )

    submission: Mapped[Submission] = relationship('Submission', back_populates='ai_audit_job')
    result: Mapped[AIAuditResult | None] = relationship('AIAuditResult', back_populates='job', uselist=False)


class AIAuditResult(Base):
    __tablename__ = 'ai_audit_results'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    job_id: Mapped[int] = mapped_column(ForeignKey('ai_audit_jobs.id'), unique=True, nullable=False)
    submission_id: Mapped[int] = mapped_column(ForeignKey('submissions.id'), unique=True, nullable=False)
    scores_json: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    overall_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    decision: Mapped[str] = mapped_column(String(32), nullable=False)
    summary: Mapped[str] = mapped_column(Text, default='', nullable=False)
    prompt_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    validation_status: Mapped[str] = mapped_column(String(32), default='valid', nullable=False)
    config_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    job: Mapped[AIAuditJob] = relationship('AIAuditJob', back_populates='result')
    submission: Mapped[Submission] = relationship('Submission', back_populates='ai_audit_result')


class AuditLog(Base):
    __tablename__ = 'audit_logs'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False)
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey('users.id'), nullable=True)
    payload_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    actor: Mapped[User | None] = relationship('User')


class ReviewRecord(Base):
    __tablename__ = 'review_records'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey('submissions.id'), nullable=False, index=True)
    submission_version_id: Mapped[int | None] = mapped_column(ForeignKey('submission_versions.id'), nullable=True)
    reviewer_id: Mapped[int] = mapped_column(ForeignKey('users.id'), nullable=False)
    assignee_reviewer_id: Mapped[int | None] = mapped_column(ForeignKey('users.id'), nullable=True)
    review_stage: Mapped[str] = mapped_column(String(16), default='initial', nullable=False)
    review_round: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    decision: Mapped[str] = mapped_column(String(32), nullable=False)
    reason: Mapped[str] = mapped_column(Text, default='', nullable=False)
    comment: Mapped[str] = mapped_column(Text, default='', nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    submission: Mapped[Submission] = relationship('Submission', back_populates='review_records')
    submission_version: Mapped[SubmissionVersion | None] = relationship('SubmissionVersion')
    reviewer: Mapped[User] = relationship('User', foreign_keys=[reviewer_id])
    assignee_reviewer: Mapped[User | None] = relationship('User', foreign_keys=[assignee_reviewer_id])


class ExportJob(Base):
    __tablename__ = 'export_jobs'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    task_id: Mapped[int] = mapped_column(ForeignKey('tasks.id'), nullable=False, index=True)
    format: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default='queued', nullable=False, index=True)
    download_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    content_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    content_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    field_mapping_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    include_ai_audit: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    include_review_records: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    export_scope: Mapped[str] = mapped_column(String(32), default='all', nullable=False)
    created_by: Mapped[int] = mapped_column(ForeignKey('users.id'), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )

    task: Mapped[Task] = relationship('Task', back_populates='export_jobs')
    creator: Mapped[User] = relationship('User')
