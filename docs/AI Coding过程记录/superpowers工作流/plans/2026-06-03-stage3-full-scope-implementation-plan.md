# Stage 3 Full-Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 严格做满 LabelHub 的 A/B 两侧阶段 3：先完成审核工作台的多轮审核 / diff / 时间线，再完成高级模板的条件显示 / 联动校验 / group / tab，最后完成 Owner 审核标准与导出字段映射配置，并补齐测试、文档与浏览器验收证据。

**Architecture:** 后端继续保持 `submission` 作为 item 当前态聚合入口，并新增 `submission_versions` 历史层承载轮次、diff 和时间线；前端继续沿现有 `ReviewerReviewsPage`、`OwnerTemplatesPage`、`Renderer`、`OwnerTasksPage`、`OwnerExportsPage` 精准增强，不做无关重构。模板系统升级为 `schema v2`，但保留 `v1` 兼容；导出系统继续只支持 `json / csv`，通过任务快照实现字段映射和包含项开关。

**Tech Stack:** FastAPI, SQLAlchemy ORM, MySQL, pytest, React 18, Vite, Vitest, @testing-library/react, Chrome DevTools MCP

---

## Scope Check

这个 spec 覆盖三个子项目，但它们不是三个完全独立的工程：

- 审核工作台决定多轮审核、轮次、时间线与 diff 的真实数据结构；
- 高级模板需要在 workbench / submissions 路径上落地规则校验；
- Owner 配置与导出要复用前两项新增的阶段、轮次、审核记录与模板结构。

因此保留为 **一个顺序执行的实施计划**，但严格按三段推进：**P1-P4 审核工作台 → P5-P7 高级模板 → P8-P9 Owner 配置与导出 → P10 统一验收与文档回写**。

---

## File Map

### 后端模型与 schema patch
- Modify: `backend/app/models.py` — 新增 `SubmissionVersion`，扩展 `Submission` / `ReviewRecord` / `Task` / `ExportJob` 的阶段三字段
- Modify: `backend/app/core/database.py` — 为新表和新列补 patch 逻辑，保证旧库可启动
- Test: `backend/tests/test_database_schema.py` — 断言新表与新列存在

### 后端审核服务与接口
- Create: `backend/app/services/review_history.py` — 提供版本快照、字段级 diff、时间线序列化、阶段推进 helper
- Modify: `backend/app/api/routes/submissions.py` — submit 时创建版本快照、处理重提轮次与阶段重置
- Modify: `backend/app/api/routes/reviews.py` — 列表增强、详情增强、批量打回、Reviewer 分配、多阶段 approve/reject
- Modify: `backend/app/api/routes/workbench.py` — 返回当前轮次与最近打回理由，供 workbench 显示
- Test: `backend/tests/test_submissions_api.py`
- Test: `backend/tests/test_reviews_api.py`
- Test: `backend/tests/test_workbench_api.py`

### 后端模板与校验
- Modify: `backend/app/api/routes/templates.py` — 校验 `schema v2` 的 group / tab / visibleWhen / validationRules
- Modify: `backend/app/api/routes/submissions.py` — 递归执行 `required_if / min_selected / json_valid`
- Test: `backend/tests/test_templates_api.py`
- Test: `backend/tests/test_submissions_api.py`

### 前端模板与 renderer
- Modify: `frontend/src/types/domain.ts` — 扩展模板组件、规则、审核、导出相关类型
- Create: `frontend/src/features/renderer/rules.ts` — 条件显示与联动校验纯函数
- Modify: `frontend/src/features/renderer/Renderer.tsx` — 递归渲染 group / tab，接入 visibleWhen
- Test: `frontend/src/features/renderer/Renderer.test.tsx`
- Test: `frontend/src/features/renderer/rules.test.ts`
- Modify: `frontend/src/pages/owner/templates/OwnerTemplatesPage.tsx` — schema v2 设计器、group / tab / 规则编辑
- Modify: `frontend/src/pages/owner/templates/OwnerTemplatesPage.test.tsx`
- Modify: `frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.tsx` — 前端规则校验与错误展示
- Modify: `frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.test.tsx`

### 前端审核工作台
- Modify: `frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.tsx` — 轮次 / 阶段 / diff / 时间线 / 批量打回 / 分配
- Modify: `frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.test.tsx`

### Owner 配置与导出
- Modify: `backend/app/api/routes/tasks.py` — `reviewGuideline` 保存与读取
- Modify: `backend/app/api/routes/exports.py` — 字段映射、包含项开关、导出范围快照
- Test: `backend/tests/test_tasks_api.py`
- Test: `backend/tests/test_exports_api.py`
- Test: `backend/tests/test_export_contract.py`
- Modify: `frontend/src/pages/owner/tasks/OwnerTasksPage.tsx` — 审核标准与评分维度编辑区
- Modify: `frontend/src/pages/owner/tasks/OwnerTasksPage.test.tsx`
- Modify: `frontend/src/pages/owner/exports/OwnerExportsPage.tsx` — 字段映射与包含项配置 UI
- Modify: `frontend/src/pages/owner/exports/OwnerExportsPage.test.tsx`

### 文档与验收
- Modify: `PLANROAD-A.md`
- Modify: `PLANROAD-B.md`
- Modify: `.claude/context/progress-A.md`
- Modify: `.claude/context/decisions-A.md`
- Modify: `.claude/context/architecture-A.md`
- Modify: `README.md`（仅在功能口径与启动说明变化时）
- Verify: 浏览器真实链路（Reviewer 多轮审核、模板联动、Owner 导出配置）

---

### Task 1: 搭好阶段三的后端持久化基础（版本、轮次、导出配置列）

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/app/core/database.py`
- Test: `backend/tests/test_database_schema.py`

- [ ] **Step 1: Write the failing schema test**

`backend/tests/test_database_schema.py`
```python
from sqlalchemy import inspect


def test_patch_schema_adds_stage3_review_and_export_columns(db_session):
    inspector = inspect(db_session.bind)
    table_names = set(inspector.get_table_names())

    assert 'submission_versions' in table_names

    submission_columns = {column['name'] for column in inspector.get_columns('submissions')}
    assert {'current_version_no', 'current_review_stage', 'current_review_round', 'assigned_reviewer_id'} <= submission_columns

    review_columns = {column['name'] for column in inspector.get_columns('review_records')}
    assert {'submission_version_id', 'review_stage', 'review_round', 'assignee_reviewer_id'} <= review_columns

    task_columns = {column['name'] for column in inspector.get_columns('tasks')}
    assert {'review_guideline'} <= task_columns

    export_columns = {column['name'] for column in inspector.get_columns('export_jobs')}
    assert {'field_mapping_json', 'include_ai_audit', 'include_review_records', 'export_scope'} <= export_columns
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
PYTHONPATH=backend pytest backend/tests/test_database_schema.py::test_patch_schema_adds_stage3_review_and_export_columns -q
```
Expected: FAIL because `submission_versions` and the new stage3 columns do not exist yet.

- [ ] **Step 3: Write the minimal persistence code**

`backend/app/models.py`
```python
class Submission(Base):
    __tablename__ = 'submissions'
    __table_args__ = (UniqueConstraint('assignment_id', 'dataset_item_id', name='uq_submission_assignment_item'),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    task_id: Mapped[int] = mapped_column(ForeignKey('tasks.id'), nullable=False)
    assignment_id: Mapped[int] = mapped_column(ForeignKey('assignments.id'), nullable=False)
    dataset_item_id: Mapped[int | None] = mapped_column(ForeignKey('dataset_items.id'), nullable=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'), nullable=False)
    template_version_id: Mapped[int | None] = mapped_column(ForeignKey('template_versions.id'), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default='draft', index=True, nullable=False)
    answers_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    current_version_no: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    current_review_stage: Mapped[str] = mapped_column(String(16), default='initial', nullable=False)
    current_review_round: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    assigned_reviewer_id: Mapped[int | None] = mapped_column(ForeignKey('users.id'), nullable=True)
```

```python
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
```

```python
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
```

```python
class Task(Base):
    review_guideline: Mapped[str | None] = mapped_column(Text, nullable=True)
```

```python
class ExportJob(Base):
    field_mapping_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    include_ai_audit: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    include_review_records: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    export_scope: Mapped[str] = mapped_column(String(32), default='all', nullable=False)
```

`backend/app/core/database.py`
```python
if 'submission_versions' not in table_names:
    Base.metadata.tables['submission_versions'].create(bind=engine)

if 'submissions' in table_names:
    submission_columns = {column['name'] for column in inspector.get_columns('submissions')}
    submission_statements = []
    if 'current_version_no' not in submission_columns:
        submission_statements.append('ALTER TABLE submissions ADD COLUMN current_version_no INT NOT NULL DEFAULT 0')
    if 'current_review_stage' not in submission_columns:
        submission_statements.append("ALTER TABLE submissions ADD COLUMN current_review_stage VARCHAR(16) NOT NULL DEFAULT 'initial'")
    if 'current_review_round' not in submission_columns:
        submission_statements.append('ALTER TABLE submissions ADD COLUMN current_review_round INT NOT NULL DEFAULT 1')
    if 'assigned_reviewer_id' not in submission_columns:
        submission_statements.append('ALTER TABLE submissions ADD COLUMN assigned_reviewer_id INT NULL')
```

```python
if 'review_records' in table_names:
    review_columns = {column['name'] for column in inspector.get_columns('review_records')}
    review_statements = []
    if 'submission_version_id' not in review_columns:
        review_statements.append('ALTER TABLE review_records ADD COLUMN submission_version_id INT NULL')
    if 'review_stage' not in review_columns:
        review_statements.append("ALTER TABLE review_records ADD COLUMN review_stage VARCHAR(16) NOT NULL DEFAULT 'initial'")
    if 'review_round' not in review_columns:
        review_statements.append('ALTER TABLE review_records ADD COLUMN review_round INT NOT NULL DEFAULT 1')
    if 'assignee_reviewer_id' not in review_columns:
        review_statements.append('ALTER TABLE review_records ADD COLUMN assignee_reviewer_id INT NULL')
```

```python
if 'tasks' in table_names:
    task_columns = {column['name'] for column in inspector.get_columns('tasks')}
    if 'review_guideline' not in task_columns:
        statements.append('ALTER TABLE tasks ADD COLUMN review_guideline TEXT NULL')

if 'export_jobs' in table_names:
    export_columns = {column['name'] for column in inspector.get_columns('export_jobs')}
    export_statements = []
    if 'field_mapping_json' not in export_columns:
        export_statements.append('ALTER TABLE export_jobs ADD COLUMN field_mapping_json JSON NULL')
    if 'include_ai_audit' not in export_columns:
        export_statements.append('ALTER TABLE export_jobs ADD COLUMN include_ai_audit BOOLEAN NOT NULL DEFAULT FALSE')
    if 'include_review_records' not in export_columns:
        export_statements.append('ALTER TABLE export_jobs ADD COLUMN include_review_records BOOLEAN NOT NULL DEFAULT FALSE')
    if 'export_scope' not in export_columns:
        export_statements.append("ALTER TABLE export_jobs ADD COLUMN export_scope VARCHAR(32) NOT NULL DEFAULT 'all'")
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
PYTHONPATH=backend pytest backend/tests/test_database_schema.py::test_patch_schema_adds_stage3_review_and_export_columns -q
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/models.py backend/app/core/database.py backend/tests/test_database_schema.py
git commit -m "feat: add stage3 review and export persistence"
```

---

### Task 2: 在 submit 链路里落地版本快照、重提轮次与阶段重置

**Files:**
- Create: `backend/app/services/review_history.py`
- Modify: `backend/app/api/routes/submissions.py`
- Test: `backend/tests/test_submissions_api.py`

- [ ] **Step 1: Write the failing submit version test**

`backend/tests/test_submissions_api.py`
```python
def test_submit_creates_submission_version_and_resubmit_increments_round(client, db_session, seed_users):
    submission = seed_submission_graph(db_session, seed_users)

    first = client.post(
        f'/api/v1/submissions/{submission.id}/submit',
        headers={'X-Demo-User': 'labeler_demo'},
        json={'answers': {'answer': 'first version'}},
    )
    assert first.status_code == 200

    db_session.refresh(submission)
    assert submission.current_version_no == 1
    assert submission.current_review_round == 1
    assert submission.current_review_stage == 'initial'

    submission.status = 'needs_revision'
    db_session.commit()

    second = client.post(
        f'/api/v1/submissions/{submission.id}/submit',
        headers={'X-Demo-User': 'labeler_demo'},
        json={'answers': {'answer': 'second version'}},
    )
    assert second.status_code == 200

    db_session.refresh(submission)
    assert submission.current_version_no == 2
    assert submission.current_review_round == 2
    assert submission.current_review_stage == 'initial'
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
PYTHONPATH=backend pytest backend/tests/test_submissions_api.py::test_submit_creates_submission_version_and_resubmit_increments_round -q
```
Expected: FAIL because submit currently does not create `SubmissionVersion` rows or update the new stage3 fields.

- [ ] **Step 3: Write the minimal versioning code**

`backend/app/services/review_history.py`
```python
from app.models import Submission, SubmissionVersion


REVIEW_STAGES = ('initial', 'second', 'final')


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


def reset_review_progress_for_submission(submission: Submission, previous_status: str) -> None:
    if previous_status == 'needs_revision':
        submission.current_review_round = (submission.current_review_round or 1) + 1
    elif submission.current_review_round <= 0:
        submission.current_review_round = 1
    submission.current_review_stage = 'initial'
    submission.assigned_reviewer_id = None
```

`backend/app/api/routes/submissions.py`
```python
from app.models import AIAuditJob, Assignment, Submission, TemplateVersion, utc_now
from app.services.review_history import create_submission_version, reset_review_progress_for_submission
```

```python
previous_status = submission.status

if payload.answers is not None:
    submission.answers_json = payload.answers

validate_required_answers(template_version, submission.answers_json)
reset_review_progress_for_submission(submission, previous_status)
version = create_submission_version(db, submission)
submission.status = 'submitted'
```

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
PYTHONPATH=backend pytest backend/tests/test_submissions_api.py::test_submit_creates_submission_version_and_resubmit_increments_round -q
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/review_history.py backend/app/api/routes/submissions.py backend/tests/test_submissions_api.py
git commit -m "feat: snapshot submission versions on submit"
```

---

### Task 3: 把 Reviewer API 升级成多轮审核工作台接口

**Files:**
- Modify: `backend/app/services/review_history.py`
- Modify: `backend/app/api/routes/reviews.py`
- Modify: `backend/tests/test_reviews_api.py`
- Modify: `backend/tests/test_workbench_api.py`

- [ ] **Step 1: Write the failing review history / diff / bulk reject tests**

`backend/tests/test_reviews_api.py`
```python
def test_review_detail_returns_diff_history_and_timeline(client, db_session, seed_users):
    submission = seed_reviewable_submission(db_session, seed_users, answer='first answer')
    submission.current_version_no = 2
    submission.current_review_round = 2
    submission.current_review_stage = 'second'
    db_session.commit()

    response = client.get(f'/api/v1/reviews/{submission.id}', headers={'X-Demo-User': 'reviewer_demo'})
    assert response.status_code == 200
    data = response.json()['data']
    assert 'diffItems' in data
    assert 'reviewHistory' in data
    assert 'timeline' in data
```

```python
def test_bulk_reject_requires_reason_and_updates_submissions(client, db_session, seed_users):
    first = seed_reviewable_submission(db_session, seed_users)
    second = seed_reviewable_submission(db_session, seed_users)

    missing = client.post(
        '/api/v1/reviews/bulk/reject',
        headers={'X-Demo-User': 'reviewer_demo'},
        json={'submissionIds': [first.id, second.id], 'reason': '   '},
    )
    assert missing.status_code == 400

    ok = client.post(
        '/api/v1/reviews/bulk/reject',
        headers={'X-Demo-User': 'reviewer_demo'},
        json={'submissionIds': [first.id, second.id], 'reason': '需要补充依据'},
    )
    assert ok.status_code == 200
```

```python
def test_assign_review_sets_submission_assignee(client, db_session, seed_users):
    submission = seed_reviewable_submission(db_session, seed_users)

    response = client.post(
        f'/api/v1/reviews/{submission.id}/assign',
        headers={'X-Demo-User': 'reviewer_demo'},
        json={'reviewerId': seed_users['reviewer'].id},
    )
    assert response.status_code == 200

    db_session.refresh(submission)
    assert submission.assigned_reviewer_id == seed_users['reviewer'].id
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
PYTHONPATH=backend pytest backend/tests/test_reviews_api.py::test_review_detail_returns_diff_history_and_timeline backend/tests/test_reviews_api.py::test_bulk_reject_requires_reason_and_updates_submissions backend/tests/test_reviews_api.py::test_assign_review_sets_submission_assignee -q
```
Expected: FAIL because the enhanced detail payload, bulk reject endpoint, and assign endpoint do not exist yet.

- [ ] **Step 3: Write the minimal review history and route code**

`backend/app/services/review_history.py`
```python
from app.models import AuditLog, ReviewRecord, SubmissionVersion


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
        items.append({'field': key, 'previousValue': previous, 'currentValue': current, 'changeType': change_type})
    return items


def next_review_stage(current_stage: str) -> str | None:
    if current_stage == 'initial':
        return 'second'
    if current_stage == 'second':
        return 'final'
    return None
```

```python
def serialize_timeline(submission_id: int, review_records: list[ReviewRecord], audit_logs: list[AuditLog]) -> list[dict]:
    items = [
        {'type': 'review', 'createdAt': record.created_at, 'stage': record.review_stage, 'decision': record.decision}
        for record in review_records
    ]
    items.extend(
        {
            'type': 'audit',
            'createdAt': log.created_at,
            'eventType': log.event_type,
            'payload': log.payload_json,
        }
        for log in audit_logs
        if log.entity_id == submission_id or log.payload_json.get('submissionId') == submission_id
    )
    return sorted(items, key=lambda item: item['createdAt'])
```

`backend/app/api/routes/reviews.py`
```python
class ReviewBulkRejectRequest(BaseModel):
    submission_ids: list[int] = Field(validation_alias='submissionIds')
    reason: str


class ReviewAssignRequest(BaseModel):
    reviewer_id: int = Field(validation_alias='reviewerId')
```

```python
def serialize_review_detail(submission: Submission, db: Session) -> dict:
    versions = db.query(SubmissionVersion).filter(SubmissionVersion.submission_id == submission.id).order_by(SubmissionVersion.version_no.asc()).all()
    current_version = versions[-1] if versions else None
    previous_version = versions[-2] if len(versions) >= 2 else None
    review_history = db.query(ReviewRecord).filter(ReviewRecord.submission_id == submission.id).order_by(ReviewRecord.created_at.asc()).all()
    audit_logs = db.query(AuditLog).filter(AuditLog.entity_id.in_([submission.id])).order_by(AuditLog.created_at.asc()).all()
    diff_items = build_answer_diff(previous_version.answers_json if previous_version else {}, current_version.answers_json if current_version else submission.answers_json)

    return {
        'submissionId': submission.id,
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
        'timeline': serialize_timeline(submission.id, review_history, audit_logs),
    }
```

```python
@router.post('/bulk/reject')
def reject_reviews_in_bulk(payload: ReviewBulkRejectRequest, ...):
    if not payload.reason.strip():
        raise HTTPException(status_code=400, detail='reject reason is required')
    updated_ids = []
    for submission_id in payload.submission_ids:
        submission = db.get(Submission, submission_id)
        if submission and reviewable_status(submission.status):
            submission.status = 'needs_revision'
            db.add(ReviewRecord(
                submission_id=submission.id,
                submission_version_id=None,
                reviewer_id=user.id,
                assignee_reviewer_id=submission.assigned_reviewer_id,
                review_stage=submission.current_review_stage,
                review_round=submission.current_review_round,
                decision='reject',
                reason=payload.reason,
                comment='',
            ))
            updated_ids.append(submission.id)
    db.commit()
    return success({'submissionIds': updated_ids, 'status': 'needs_revision'})
```

```python
@router.post('/{submission_id}/assign')
def assign_review(submission_id: int, payload: ReviewAssignRequest, ...):
    submission = db.get(Submission, submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail='submission not found')
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
```

```python
if submission.current_review_stage == 'final':
    submission.status = 'review_passed'
else:
    submission.current_review_stage = next_review_stage(submission.current_review_stage) or 'final'
    submission.status = 'ai_passed'
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
PYTHONPATH=backend pytest backend/tests/test_reviews_api.py -q
```
Expected: PASS, including the new detail payload, bulk reject flow, and assign flow.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/review_history.py backend/app/api/routes/reviews.py backend/tests/test_reviews_api.py backend/tests/test_workbench_api.py
git commit -m "feat: add stage3 review history and actions"
```

---

### Task 4: 把 Reviewer 前端升级成真正的审核工作台

**Files:**
- Modify: `frontend/src/types/domain.ts`
- Modify: `frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.tsx`
- Modify: `frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.test.tsx`

- [ ] **Step 1: Write the failing reviewer UI test**

`frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.test.tsx`
```tsx
it('renders review round, stage, diff and bulk reject controls', async () => {
  const user = userEvent.setup()
  fetchMock.mockImplementation((path: string, method: string) => {
    if (path === '/reviews/pending' && method === 'GET') {
      return Promise.resolve({
        items: [
          {
            submissionId: 701,
            taskId: 201,
            itemId: 901,
            labelerName: 'Labeler Demo',
            aiDecision: 'pass',
            submissionStatus: 'ai_passed',
            submittedAt: '2026-06-03T10:00:00Z',
            currentReviewStage: 'second',
            currentReviewRound: 2,
            hasPreviousVersion: true,
            latestAiSummary: '整体较好',
          },
        ],
        total: 1,
      })
    }

    if (path === '/reviews/701' && method === 'GET') {
      return Promise.resolve({
        submissionId: 701,
        task: { id: 201, title: '阶段三审核任务' },
        item: { itemId: 901, source: { source_text: '原始内容' } },
        answers: { reason: '最新答案' },
        aiResult: { scores: [], decision: 'pass', summary: '整体较好' },
        submissionStatus: 'ai_passed',
        currentReviewStage: 'second',
        currentReviewRound: 2,
        diffItems: [{ field: 'reason', previousValue: '旧答案', currentValue: '最新答案', changeType: 'changed' }],
        reviewHistory: [{ id: 1, decision: 'reject', stage: 'initial', round: 1, comment: '', reason: '补充依据', createdAt: '2026-06-03T09:00:00Z' }],
        timeline: [{ type: 'audit', createdAt: '2026-06-03T09:00:00Z', eventType: 'submission_resubmitted', payload: { reviewRound: 2 } }],
      })
    }

    if (path === '/reviews/bulk/reject' && method === 'POST') {
      return Promise.resolve({ submissionIds: [701], status: 'needs_revision' })
    }

    throw new Error(`unexpected call: ${method} ${path}`)
  })

  renderReviewerReviewsPage()
  expect(await screen.findByText('第 2 轮 / second')).toBeInTheDocument()
  await user.click(screen.getByRole('checkbox', { name: '选择待审项' }))
  await user.click(screen.getByRole('button', { name: '批量打回' }))
  await user.type(screen.getByLabelText('批量打回理由'), '请补充证据')
  await user.click(screen.getByRole('button', { name: '确认批量打回' }))
  await user.click(screen.getByRole('button', { name: '查看详情' }))
  expect(await screen.findByText('答案差异')).toBeInTheDocument()
  expect(screen.getByText('旧答案')).toBeInTheDocument()
  expect(screen.getByText('最新答案')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npm --prefix frontend run test -- src/pages/reviewer/reviews/ReviewerReviewsPage.test.tsx
```
Expected: FAIL because the page does not render round/stage fields, bulk reject controls, or diff/timeline blocks.

- [ ] **Step 3: Write the minimal UI changes**

`frontend/src/types/domain.ts`
```ts
export type ReviewDiffItem = {
  field: string
  previousValue: unknown
  currentValue: unknown
  changeType: 'added' | 'changed' | 'unchanged' | 'removed'
}

export type ReviewHistoryItem = {
  id: number
  decision: 'approve' | 'reject'
  stage: 'initial' | 'second' | 'final'
  round: number
  comment: string
  reason: string
  createdAt: string
}
```

```ts
export type ReviewPendingItem = {
  submissionId: number
  taskId: number
  itemId: number
  labelerName: string
  aiDecision: AIDecision
  submissionStatus: SubmissionStatus
  submittedAt: string
  currentReviewStage?: 'initial' | 'second' | 'final'
  currentReviewRound?: number
  hasPreviousVersion?: boolean
  latestAiSummary?: string
}
```

`frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.tsx`
```tsx
const [bulkRejectReason, setBulkRejectReason] = useState('')
const [showBulkReject, setShowBulkReject] = useState(false)
```

```tsx
<p>{`第 ${item.currentReviewRound ?? 1} 轮 / ${item.currentReviewStage ?? 'initial'}`}</p>
{item.hasPreviousVersion ? <p>可查看上一轮差异</p> : <p>首轮提交</p>}
{item.latestAiSummary ? <p>{item.latestAiSummary}</p> : null}
```

```tsx
<button type="button" onClick={() => setShowBulkReject(true)} disabled={selectedIds.length === 0 || actionLoading}>
  批量打回
</button>
{showBulkReject ? (
  <div className="review-reject-box">
    <label className="form-field">
      <span>批量打回理由</span>
      <textarea aria-label="批量打回理由" value={bulkRejectReason} onChange={(event) => setBulkRejectReason(event.target.value)} />
    </label>
    <button type="button" onClick={() => void handleBulkReject()}>确认批量打回</button>
  </div>
) : null}
```

```tsx
<article className="card">
  <h3>答案差异</h3>
  {detail.diffItems.length === 0 ? (
    <p className="review-empty-message">首轮提交暂无对比版本</p>
  ) : (
    detail.diffItems.map((item) => (
      <div className="review-score-row" key={item.field}>
        <span className="review-score-dim">{item.field}</span>
        <span className="review-score-reason">{String(item.previousValue ?? '')}</span>
        <span className="review-score-num">→</span>
        <span className="review-score-reason">{String(item.currentValue ?? '')}</span>
      </div>
    ))
  )}
</article>
```

```tsx
<article className="card">
  <h3>审核时间线</h3>
  {detail.timeline.map((item, index) => (
    <p key={`${item.type}-${index}`}>{item.type === 'audit' ? item.eventType : `${item.stage} / ${item.decision}`}</p>
  ))}
</article>
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npm --prefix frontend run test -- src/pages/reviewer/reviews/ReviewerReviewsPage.test.tsx
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/domain.ts frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.tsx frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.test.tsx
git commit -m "feat: upgrade reviewer page into stage3 workbench"
```

---

### Task 5: 让后端真正理解 schema v2，并在 submit 时做基础联动校验

**Files:**
- Modify: `backend/app/api/routes/templates.py`
- Modify: `backend/app/api/routes/submissions.py`
- Modify: `backend/tests/test_templates_api.py`
- Modify: `backend/tests/test_submissions_api.py`

- [ ] **Step 1: Write the failing schema v2 and validation tests**

`backend/tests/test_templates_api.py`
```python
def test_create_template_version_accepts_group_and_tab_schema_v2(client):
    create_template = client.post('/api/v1/templates', json={'name': '阶段三模板', 'description': 'v2'}, headers={'Authorization': 'Bearer owner-demo-token'})
    template_id = create_template.json()['data']['id']

    response = client.post(
        f'/api/v1/templates/{template_id}/versions',
        headers={'Authorization': 'Bearer owner-demo-token'},
        json={
            'schema': {
                'version': 2,
                'components': [
                    {
                        'type': 'group',
                        'label': '基础信息',
                        'description': '第一组',
                        'children': [
                            {'type': 'text_input', 'label': '标题', 'field': 'title', 'required': True},
                        ],
                    },
                    {
                        'type': 'tab_container',
                        'label': '扩展信息',
                        'tabs': [
                            {'key': 'main', 'label': '主信息', 'children': [{'type': 'textarea', 'label': '内容', 'field': 'content', 'required': False}]},
                        ],
                    },
                ],
            },
        },
    )

    assert response.status_code == 200
```

`backend/tests/test_submissions_api.py`
```python
def test_submit_rejects_required_if_and_invalid_json(client, db_session, seed_users):
    submission = seed_submission_graph(db_session, seed_users)
    submission.template_version.schema_json = {
        'version': 2,
        'components': [
            {'type': 'single_select', 'label': '模式', 'field': 'mode', 'required': True, 'options': ['manual', 'json']},
            {'type': 'json_editor', 'label': '结构化结果', 'field': 'payload', 'required': False, 'validationRules': [{'type': 'json_valid'}], 'visibleWhen': [{'field': 'mode', 'operator': 'eq', 'value': 'json'}]},
            {'type': 'text_input', 'label': '备注', 'field': 'note', 'required': False, 'validationRules': [{'type': 'required_if', 'field': 'mode', 'operator': 'eq', 'value': 'manual'}]},
        ],
    }
    db_session.commit()

    response = client.post(
        f'/api/v1/submissions/{submission.id}/submit',
        headers={'X-Demo-User': 'labeler_demo'},
        json={'answers': {'mode': 'json', 'payload': '{bad json}'}}
    )
    assert response.status_code == 400
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
PYTHONPATH=backend pytest backend/tests/test_templates_api.py::test_create_template_version_accepts_group_and_tab_schema_v2 backend/tests/test_submissions_api.py::test_submit_rejects_required_if_and_invalid_json -q
```
Expected: FAIL because `group` / `tab_container` and the new rule keys are not allowed, and submit only validates `required` today.

- [ ] **Step 3: Write the minimal schema v2 and validation code**

`backend/app/api/routes/templates.py`
```python
ALLOWED_COMPONENT_TYPES = {
    'text_input', 'textarea', 'single_select', 'multi_select', 'tag_select', 'image_upload', 'show_item',
    'rich_text', 'json_editor', 'llm_assist', 'group', 'tab_container',
}
```

```python
def validate_field_component(component: dict, seen_fields: set[str]) -> None:
    field = component.get('field')
    if component.get('type') != 'show_item' and isinstance(field, str) and field.strip():
        normalized = field.strip()
        if normalized in seen_fields:
            raise HTTPException(status_code=400, detail=f'duplicate field: {normalized}')
        seen_fields.add(normalized)
```

```python
def validate_rule_list(component: dict) -> None:
    visible_when = component.get('visibleWhen', [])
    for rule in visible_when:
        if rule.get('operator') not in {'eq', 'neq', 'not_empty', 'includes'}:
            raise HTTPException(status_code=400, detail='invalid visibleWhen operator')

    validation_rules = component.get('validationRules', [])
    for rule in validation_rules:
        if rule.get('type') not in {'required_if', 'min_selected', 'json_valid'}:
            raise HTTPException(status_code=400, detail='invalid validation rule type')
```

```python
def validate_component_tree(components: list[dict], seen_fields: set[str]) -> None:
    for component in components:
        component_type = component.get('type')
        if component_type == 'group':
            validate_component_tree(component.get('children', []), seen_fields)
            continue
        if component_type == 'tab_container':
            for tab in component.get('tabs', []):
                validate_component_tree(tab.get('children', []), seen_fields)
            continue
        validate_rule_list(component)
        validate_field_component(component, seen_fields)
```

`backend/app/api/routes/submissions.py`
```python
import json


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
```

```python
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
```

```python
def validate_required_answers(template_version: TemplateVersion | None, answers: dict) -> None:
    if not template_version:
        return
    components = walk_schema_components(template_version.schema_json.get('components', []))
    for component in components:
        field = component.get('field')
        if component.get('required') and answers.get(field) in (None, '', []):
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
PYTHONPATH=backend pytest backend/tests/test_templates_api.py::test_create_template_version_accepts_group_and_tab_schema_v2 backend/tests/test_submissions_api.py::test_submit_rejects_required_if_and_invalid_json -q
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/templates.py backend/app/api/routes/submissions.py backend/tests/test_templates_api.py backend/tests/test_submissions_api.py
git commit -m "feat: support schema v2 validation rules"
```

---

### Task 6: 扩展 Owner 模板设计器到 schema v2（group / tab / 规则编辑）

**Files:**
- Modify: `frontend/src/types/domain.ts`
- Modify: `frontend/src/pages/owner/templates/OwnerTemplatesPage.tsx`
- Modify: `frontend/src/pages/owner/templates/OwnerTemplatesPage.test.tsx`

- [ ] **Step 1: Write the failing designer UI test**

`frontend/src/pages/owner/templates/OwnerTemplatesPage.test.tsx`
```tsx
it('adds group and tab container and saves schema version 2', async () => {
  const user = userEvent.setup()
  renderOwnerTemplatesPage()

  await waitFor(() => expect(screen.getByRole('button', { name: /选择组件 1/ })).toBeInTheDocument())
  await user.click(screen.getByRole('button', { name: '添加 分组容器' }))
  await user.click(screen.getByRole('button', { name: '添加 Tab 容器' }))
  await user.click(screen.getByRole('button', { name: '保存模板' }))

  expect(fetchMock).toHaveBeenCalledWith(
    '/templates/1/versions',
    'POST',
    expect.objectContaining({
      schema: expect.objectContaining({ version: 2 }),
    }),
  )
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npm --prefix frontend run test -- src/pages/owner/templates/OwnerTemplatesPage.test.tsx
```
Expected: FAIL because the designer has no group/tab material buttons and still saves `version: 1` only.

- [ ] **Step 3: Write the minimal schema v2 designer code**

`frontend/src/types/domain.ts`
```ts
export type TemplateVisibilityRule = {
  field: string
  operator: 'eq' | 'neq' | 'not_empty' | 'includes'
  value?: string
}

export type TemplateValidationRule =
  | { type: 'required_if'; field: string; operator: 'eq' | 'neq' | 'not_empty' | 'includes'; value?: string }
  | { type: 'min_selected'; value: number }
  | { type: 'json_valid' }
```

```ts
export type TemplateComponent = {
  id: number
  type: TemplateComponentType
  label: string
  field: string
  required: boolean
  options?: string[]
  optionsText?: string
  maxCount?: number
  content?: string
  visibleWhen?: TemplateVisibilityRule[]
  validationRules?: TemplateValidationRule[]
  children?: TemplateComponent[]
  tabs?: Array<{ key: string; label: string; children: TemplateComponent[] }>
  description?: string
}
```

`frontend/src/pages/owner/templates/OwnerTemplatesPage.tsx`
```tsx
const componentOptions: Array<{ type: TemplateComponentType; name: string }> = [
  { type: 'text_input', name: '单行文本' },
  { type: 'textarea', name: '多行文本' },
  { type: 'rich_text', name: '富文本' },
  { type: 'single_select', name: '单选' },
  { type: 'multi_select', name: '多选' },
  { type: 'tag_select', name: '标签选择' },
  { type: 'json_editor', name: 'JSON 编辑器' },
  { type: 'llm_assist', name: 'LLM 辅助' },
  { type: 'image_upload', name: '图片上传' },
  { type: 'show_item', name: '展示项' },
  { type: 'group', name: '分组容器' },
  { type: 'tab_container', name: 'Tab 容器' },
]
```

```tsx
if (type === 'group') {
  return { ...base, field: '', description: '用于分组展示', children: [] }
}

if (type === 'tab_container') {
  return {
    ...base,
    field: '',
    tabs: [{ key: `tab_${id}_main`, label: '主信息', children: [] }],
  }
}
```

```tsx
const schema = {
  version: components.some((component) => component.type === 'group' || component.type === 'tab_container' || (component.visibleWhen?.length ?? 0) > 0 || (component.validationRules?.length ?? 0) > 0) ? 2 : 1,
  components: normalizeComponents(),
}
```

```tsx
{selectedComponent?.type === 'group' ? (
  <label className="form-field">
    <span>分组说明</span>
    <textarea value={selectedComponent.description ?? ''} onChange={(event) => updateSelectedComponent({ description: event.target.value })} />
  </label>
) : null}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npm --prefix frontend run test -- src/pages/owner/templates/OwnerTemplatesPage.test.tsx
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/domain.ts frontend/src/pages/owner/templates/OwnerTemplatesPage.tsx frontend/src/pages/owner/templates/OwnerTemplatesPage.test.tsx
git commit -m "feat: extend owner template designer to schema v2"
```

---

### Task 7: 升级 Renderer 与 Workbench，使条件显示和联动校验真实生效

**Files:**
- Create: `frontend/src/features/renderer/rules.ts`
- Create: `frontend/src/features/renderer/rules.test.ts`
- Modify: `frontend/src/features/renderer/Renderer.tsx`
- Modify: `frontend/src/features/renderer/Renderer.test.tsx`
- Modify: `frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.tsx`
- Modify: `frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.test.tsx`

- [ ] **Step 1: Write the failing rules and workbench tests**

`frontend/src/features/renderer/rules.test.ts`
```ts
import { describe, expect, it } from 'vitest'
import { evaluateVisibleWhen, validateAnswers } from './rules'


describe('renderer rules', () => {
  it('evaluates visibleWhen and validationRules', () => {
    expect(evaluateVisibleWhen([{ field: 'mode', operator: 'eq', value: 'json' }], { mode: 'json' })).toBe(true)
    expect(evaluateVisibleWhen([{ field: 'mode', operator: 'eq', value: 'json' }], { mode: 'manual' })).toBe(false)

    const errors = validateAnswers([
      { id: 1, type: 'json_editor', label: '结构化结果', field: 'payload', required: false, validationRules: [{ type: 'json_valid' }] },
    ], { payload: '{bad json}' })
    expect(errors.payload).toContain('JSON')
  })
})
```

`frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.test.tsx`
```tsx
it('blocks submit when schema v2 validation fails', async () => {
  const user = userEvent.setup()
  renderLabelerWorkbenchPageWithSchemaV2()

  await user.selectOptions(screen.getByLabelText('模式'), 'json')
  await user.type(screen.getByLabelText('结构化结果'), '{bad json}')
  await user.click(screen.getByRole('button', { name: '提交当前题' }))

  expect(await screen.findByText('结构化结果 必须是合法 JSON')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npm --prefix frontend run test -- src/features/renderer/Renderer.test.tsx src/pages/labeler/workbench/LabelerWorkbenchPage.test.tsx
```
Expected: FAIL because there is no `rules.ts`, no visibleWhen gating, and workbench submit does not surface schema v2 validation errors.

- [ ] **Step 3: Write the minimal renderer / validation code**

`frontend/src/features/renderer/rules.ts`
```ts
import type { TemplateComponent, TemplateValidationRule, TemplateVisibilityRule } from '../../types/domain'

export function evaluateVisibleWhen(rules: TemplateVisibilityRule[] = [], answers: Record<string, unknown>): boolean {
  return rules.every((rule) => {
    const value = answers[rule.field]
    if (rule.operator === 'eq') return value === rule.value
    if (rule.operator === 'neq') return value !== rule.value
    if (rule.operator === 'not_empty') return value !== '' && value !== null && value !== undefined
    if (rule.operator === 'includes') return Array.isArray(value) && value.includes(rule.value)
    return true
  })
}

export function validateAnswers(components: TemplateComponent[], answers: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const component of components) {
    for (const rule of component.validationRules ?? []) {
      if (rule.type === 'json_valid' && typeof answers[component.field] === 'string') {
        try {
          JSON.parse(String(answers[component.field]))
        } catch {
          errors[component.field] = `${component.label} 必须是合法 JSON`
        }
      }
    }
  }
  return errors
}
```

`frontend/src/features/renderer/Renderer.tsx`
```tsx
import { evaluateVisibleWhen } from './rules'
```

```tsx
const visibleComponents = schema.filter((component) => evaluateVisibleWhen(component.visibleWhen, values))

return (
  <div className="form-grid">
    {visibleComponents.map((component) => (
      <RendererField
        component={component}
        key={component.id || component.field || component.label}
        mode={mode}
        source={source}
        onGenerateLLMAnswer={onGenerateLLMAnswer}
        onToggleArrayAnswer={onToggleArrayAnswer}
        onUpdateAnswer={onUpdateAnswer}
        value={values[component.field]}
      />
    ))}
  </div>
)
```

`frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.tsx`
```tsx
import { validateAnswers } from '../../../features/renderer/rules'
```

```tsx
const validationErrors = validateAnswers(schema, draftAnswers)
if (Object.keys(validationErrors).length > 0) {
  setSubmitError(Object.values(validationErrors)[0])
  return
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npm --prefix frontend run test -- src/features/renderer/Renderer.test.tsx src/pages/labeler/workbench/LabelerWorkbenchPage.test.tsx
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/renderer/rules.ts frontend/src/features/renderer/rules.test.ts frontend/src/features/renderer/Renderer.tsx frontend/src/features/renderer/Renderer.test.tsx frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.tsx frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.test.tsx
git commit -m "feat: enforce schema v2 rules in renderer and workbench"
```

---

### Task 8: 把 Owner 任务页补成完整的审核标准与评分维度配置台

**Files:**
- Modify: `backend/app/api/routes/tasks.py`
- Modify: `backend/tests/test_tasks_api.py`
- Modify: `frontend/src/types/domain.ts`
- Modify: `frontend/src/pages/owner/tasks/OwnerTasksPage.tsx`
- Modify: `frontend/src/pages/owner/tasks/OwnerTasksPage.test.tsx`

- [ ] **Step 1: Write the failing AI config guideline test**

`backend/tests/test_tasks_api.py`
```python
def test_owner_can_save_review_guideline_with_ai_config(client, db_session, seed_users):
    owner = seed_users['owner']
    task = Task(title='Config Task', description='', status='draft', quota=1, owner_id=owner.id)
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)

    response = client.patch(
        f'/api/v1/tasks/{task.id}/ai-config',
        headers={'X-Demo-User': 'owner_demo'},
        json={
            'promptTemplate': '请审查答案',
            'scoreDimensions': [{'key': 'quality', 'label': '质量', 'description': '答案质量', 'weight': 1, 'enabled': True}],
            'passThreshold': 3,
            'reviewGuideline': '人工审核时优先核对事实依据。',
        },
    )
    assert response.status_code == 200
    assert response.json()['data']['aiConfig']['reviewGuideline'] == '人工审核时优先核对事实依据。'
```

`frontend/src/pages/owner/tasks/OwnerTasksPage.test.tsx`
```tsx
it('saves review guideline and score dimensions', async () => {
  const user = userEvent.setup()
  renderOwnerTasksPage()

  await user.type(screen.getByLabelText('审核标准说明'), '人工审核时优先核对事实依据。')
  await user.type(screen.getByLabelText('维度 key'), 'quality')
  await user.type(screen.getByLabelText('维度名称'), '质量')
  await user.click(screen.getByRole('button', { name: '保存 AI 配置' }))

  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringMatching(/\/tasks\/\d+\/ai-config$/),
    'PATCH',
    expect.objectContaining({ reviewGuideline: '人工审核时优先核对事实依据。' }),
  )
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
PYTHONPATH=backend pytest backend/tests/test_tasks_api.py::test_owner_can_save_review_guideline_with_ai_config -q
npm --prefix frontend run test -- src/pages/owner/tasks/OwnerTasksPage.test.tsx
```
Expected: FAIL because `reviewGuideline` is not part of the API contract or Owner UI yet.

- [ ] **Step 3: Write the minimal config code**

`backend/app/api/routes/tasks.py`
```python
class TaskAIConfigPayload(BaseModel):
    promptTemplate: str
    scoreDimensions: list[ScoreDimensionPayload] = []
    passThreshold: int = 3
    reviewGuideline: str = ''
```

```python
def serialize_ai_config(task: Task) -> dict:
    config = task.ai_audit_config
    if config is None:
        return {
            'promptTemplate': task.ai_prompt_template or '',
            'scoreDimensions': task.ai_score_dimensions_json or [],
            'passThreshold': task.ai_pass_threshold or 3,
            'reviewGuideline': task.review_guideline or '',
        }
    return {
        'promptTemplate': config.prompt_template,
        'scoreDimensions': config.score_dimensions_json,
        'passThreshold': config.pass_threshold,
        'reviewGuideline': task.review_guideline or '',
    }
```

```python
task.review_guideline = payload.reviewGuideline.strip()
```

`frontend/src/pages/owner/tasks/OwnerTasksPage.tsx`
```tsx
type TaskFormState = {
  title: string
  description: string
  deadline: string
  quota: string
  templateId: string
  datasetId: string
  aiPromptTemplate: string
  aiPassThreshold: string
  reviewGuideline: string
}
```

```tsx
<label className="form-field">
  <span>审核标准说明</span>
  <textarea value={form.reviewGuideline} onChange={(event) => handleChange('reviewGuideline', event.target.value)} />
</label>
```

```tsx
await apiPatch(`/tasks/${taskId}/ai-config`, {
  promptTemplate: form.aiPromptTemplate.trim(),
  scoreDimensions,
  passThreshold: Number(form.aiPassThreshold || 3),
  reviewGuideline: form.reviewGuideline.trim(),
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
PYTHONPATH=backend pytest backend/tests/test_tasks_api.py::test_owner_can_save_review_guideline_with_ai_config -q
npm --prefix frontend run test -- src/pages/owner/tasks/OwnerTasksPage.test.tsx
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/tasks.py backend/tests/test_tasks_api.py frontend/src/types/domain.ts frontend/src/pages/owner/tasks/OwnerTasksPage.tsx frontend/src/pages/owner/tasks/OwnerTasksPage.test.tsx
git commit -m "feat: add owner review guideline configuration"
```

---

### Task 9: 扩展导出后端，支持字段映射与包含项开关（仍只做 json/csv）

**Files:**
- Modify: `backend/app/api/routes/exports.py`
- Modify: `backend/tests/test_exports_api.py`
- Modify: `backend/tests/test_export_contract.py`

- [ ] **Step 1: Write the failing export snapshot test**

`backend/tests/test_exports_api.py`
```python
def test_create_export_persists_field_mapping_and_include_flags(client, db_session, seed_users):
    task = seed_export_task(db_session, seed_users)

    response = client.post(
        '/api/v1/exports',
        headers={'X-Demo-User': 'owner_demo'},
        json={
            'taskId': task.id,
            'format': 'json',
            'fieldMapping': [
                {'sourceKey': 'submissionId', 'targetLabel': '提交ID', 'enabled': True},
                {'sourceKey': 'aiDecision', 'targetLabel': 'AI结论', 'enabled': True},
            ],
            'includeAiAudit': True,
            'includeReviewRecords': True,
            'exportScope': 'review_passed',
        },
    )

    assert response.status_code == 200
    data = response.json()['data']
    assert data['status'] == 'queued'
```

```python
def test_complete_export_respects_selected_fields_for_csv(client, db_session, seed_users):
    task = seed_export_task(db_session, seed_users)
    created = client.post(
        '/api/v1/exports',
        headers={'X-Demo-User': 'owner_demo'},
        json={
            'taskId': task.id,
            'format': 'csv',
            'fieldMapping': [
                {'sourceKey': 'submissionId', 'targetLabel': '提交ID', 'enabled': True},
                {'sourceKey': 'reviewDecision', 'targetLabel': '人工结果', 'enabled': True},
            ],
            'includeAiAudit': False,
            'includeReviewRecords': True,
        },
    )
    job_id = created.json()['data']['jobId']

    completed = client.post(f'/api/v1/exports/{job_id}/complete', headers={'X-Demo-User': 'owner_demo'})
    assert completed.status_code == 200
    assert '提交ID,人工结果' in completed.json()['data']['content']
    assert 'aiDecision' not in completed.json()['data']['content']
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
PYTHONPATH=backend pytest backend/tests/test_exports_api.py::test_create_export_persists_field_mapping_and_include_flags backend/tests/test_exports_api.py::test_complete_export_respects_selected_fields_for_csv -q
```
Expected: FAIL because `/exports` does not accept `fieldMapping` / include flags today.

- [ ] **Step 3: Write the minimal export configuration code**

`backend/app/api/routes/exports.py`
```python
class ExportFieldMappingPayload(BaseModel):
    source_key: str = Field(alias='sourceKey')
    target_label: str = Field(alias='targetLabel')
    enabled: bool = True


class CreateExportRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    task_id: int = Field(alias='taskId')
    format: str
    field_mapping: list[ExportFieldMappingPayload] = Field(default_factory=list, alias='fieldMapping')
    include_ai_audit: bool = Field(default=False, alias='includeAiAudit')
    include_review_records: bool = Field(default=False, alias='includeReviewRecords')
    export_scope: str = Field(default='all', alias='exportScope')
```

```python
def apply_field_mapping(item: dict, mappings: list[dict]) -> dict:
    enabled = [mapping for mapping in mappings if mapping.get('enabled')]
    if not enabled:
        return item
    return {mapping['targetLabel']: item.get(mapping['sourceKey']) for mapping in enabled}
```

```python
job = ExportJob(
    task_id=task.id,
    format=payload.format,
    status='queued',
    created_by=user.id,
    field_mapping_json=[item.model_dump(by_alias=True) for item in payload.field_mapping],
    include_ai_audit=payload.include_ai_audit,
    include_review_records=payload.include_review_records,
    export_scope=payload.export_scope,
)
```

```python
def build_export_items(db: Session, job: ExportJob) -> list[dict]:
    submissions = db.query(Submission).filter(Submission.task_id == job.task_id).order_by(Submission.id.asc()).all()
    if job.export_scope == 'review_passed':
        submissions = [submission for submission in submissions if submission.status == 'review_passed']
    items = []
    for submission in submissions:
        latest_review = db.query(ReviewRecord).filter(ReviewRecord.submission_id == submission.id).order_by(ReviewRecord.created_at.desc()).first()
        item = {
            'submissionId': submission.id,
            'taskId': submission.task_id,
            'datasetItemId': submission.dataset_item_id,
            'labelerName': submission.user.display_name,
            'submissionStatus': submission.status,
            'answers': submission.answers_json,
            'currentVersionNo': submission.current_version_no,
            'reviewStage': submission.current_review_stage,
            'reviewRound': submission.current_review_round,
        }
        if job.include_ai_audit:
            item['aiDecision'] = submission.ai_audit_result.decision if submission.ai_audit_result else None
            item['aiSummary'] = submission.ai_audit_result.summary if submission.ai_audit_result else ''
        if job.include_review_records:
            item['reviewDecision'] = latest_review.decision if latest_review else None
            item['reviewComment'] = latest_review.comment if latest_review else ''
            item['reviewReason'] = latest_review.reason if latest_review else ''
        items.append(apply_field_mapping(item, job.field_mapping_json or []))
    return items
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
PYTHONPATH=backend pytest backend/tests/test_exports_api.py -q
```
Expected: PASS, while still rejecting unsupported `jsonl` / `excel` formats.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/exports.py backend/tests/test_exports_api.py backend/tests/test_export_contract.py
git commit -m "feat: add configurable stage3 export payloads"
```

---

### Task 10: 把 Owner 导出页补成阶段三导出配置台

**Files:**
- Modify: `frontend/src/types/domain.ts`
- Modify: `frontend/src/pages/owner/exports/OwnerExportsPage.tsx`
- Modify: `frontend/src/pages/owner/exports/OwnerExportsPage.test.tsx`

- [ ] **Step 1: Write the failing export UI test**

`frontend/src/pages/owner/exports/OwnerExportsPage.test.tsx`
```tsx
it('submits field mapping and include flags when creating export', async () => {
  const user = userEvent.setup()
  renderOwnerExportsPage()

  await user.click(screen.getByLabelText('包含 AI 审核结果'))
  await user.click(screen.getByLabelText('包含人工审核记录'))
  await user.clear(screen.getByLabelText('submissionId 别名'))
  await user.type(screen.getByLabelText('submissionId 别名'), '提交ID')
  await user.click(screen.getByRole('button', { name: '发起导出' }))

  expect(fetchMock).toHaveBeenCalledWith(
    '/exports',
    'POST',
    expect.objectContaining({
      includeAiAudit: true,
      includeReviewRecords: true,
      fieldMapping: expect.any(Array),
    }),
  )
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npm --prefix frontend run test -- src/pages/owner/exports/OwnerExportsPage.test.tsx
```
Expected: FAIL because the page only sends `taskId` and `format` today.

- [ ] **Step 3: Write the minimal export UI code**

`frontend/src/pages/owner/exports/OwnerExportsPage.tsx`
```tsx
const defaultFieldMapping = [
  { sourceKey: 'submissionId', targetLabel: 'submissionId', enabled: true },
  { sourceKey: 'taskId', targetLabel: 'taskId', enabled: true },
  { sourceKey: 'labelerName', targetLabel: 'labelerName', enabled: true },
  { sourceKey: 'reviewDecision', targetLabel: 'reviewDecision', enabled: true },
]
```

```tsx
const [fieldMapping, setFieldMapping] = useState(defaultFieldMapping)
const [includeAiAudit, setIncludeAiAudit] = useState(false)
const [includeReviewRecords, setIncludeReviewRecords] = useState(false)
const [exportScope, setExportScope] = useState<'all' | 'review_passed'>('all')
```

```tsx
<label className="checkbox-field">
  <input aria-label="包含 AI 审核结果" type="checkbox" checked={includeAiAudit} onChange={(event) => setIncludeAiAudit(event.target.checked)} />
  <span>包含 AI 审核结果</span>
</label>
<label className="checkbox-field">
  <input aria-label="包含人工审核记录" type="checkbox" checked={includeReviewRecords} onChange={(event) => setIncludeReviewRecords(event.target.checked)} />
  <span>包含人工审核记录</span>
</label>
```

```tsx
{fieldMapping.map((item, index) => (
  <div className="form-grid" key={item.sourceKey}>
    <label className="checkbox-field">
      <input type="checkbox" checked={item.enabled} onChange={(event) => updateFieldMapping(index, { enabled: event.target.checked })} />
      <span>{item.sourceKey}</span>
    </label>
    <label className="form-field">
      <span>{item.sourceKey} 别名</span>
      <input aria-label={`${item.sourceKey} 别名`} value={item.targetLabel} onChange={(event) => updateFieldMapping(index, { targetLabel: event.target.value })} />
    </label>
  </div>
))}
```

```tsx
const newJob = await apiPost('/exports', {
  taskId: selectedTaskId,
  format: selectedFormat,
  fieldMapping,
  includeAiAudit,
  includeReviewRecords,
  exportScope,
})
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npm --prefix frontend run test -- src/pages/owner/exports/OwnerExportsPage.test.tsx
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/domain.ts frontend/src/pages/owner/exports/OwnerExportsPage.tsx frontend/src/pages/owner/exports/OwnerExportsPage.test.tsx
git commit -m "feat: add stage3 export configuration ui"
```

---

### Task 11: 统一回归、浏览器验收与文档回写

**Files:**
- Modify: `PLANROAD-A.md`
- Modify: `PLANROAD-B.md`
- Modify: `.claude/context/progress-A.md`
- Modify: `.claude/context/decisions-A.md`
- Modify: `.claude/context/architecture-A.md`
- Modify: `README.md`（若需要）

- [ ] **Step 1: Write the final verification checklist into progress notes**

`.claude/context/progress-A.md`
```md
### 2026-06-03
- 阶段 3 审核工作台已补：多轮提交版本、字段级 diff、完整时间线、批量打回、Reviewer 分配。
- 阶段 3 高级模板已补：schema v2、group、tab_container、visibleWhen、validationRules。
- 阶段 3 Owner / 导出已补：审核标准说明、评分维度配置、字段映射、AI / 人工审核记录包含项。
- 本轮验证：后端阶段 3 定向测试通过、前端阶段 3 定向测试通过、前端 build 通过、浏览器真实链路通过。
```

- [ ] **Step 2: Run the full relevant automated checks**

Run:
```bash
PYTHONPATH=backend pytest backend/tests/test_database_schema.py backend/tests/test_submissions_api.py backend/tests/test_reviews_api.py backend/tests/test_workbench_api.py backend/tests/test_templates_api.py backend/tests/test_tasks_api.py backend/tests/test_exports_api.py backend/tests/test_export_contract.py -q
npm --prefix frontend run test -- src/pages/reviewer/reviews/ReviewerReviewsPage.test.tsx src/pages/owner/templates/OwnerTemplatesPage.test.tsx src/features/renderer/Renderer.test.tsx src/features/renderer/rules.test.ts src/pages/labeler/workbench/LabelerWorkbenchPage.test.tsx src/pages/owner/tasks/OwnerTasksPage.test.tsx src/pages/owner/exports/OwnerExportsPage.test.tsx
npm --prefix frontend run build
```
Expected: all PASS.

- [ ] **Step 3: Verify the three real browser flows**

Run the app(s), then manually verify:
```text
1. Reviewer flow:
   owner_demo / labeler_demo / reviewer_demo 走一条“提交 -> 打回 -> 修改 -> 重提 -> diff -> 最终通过”链路。
2. Template flow:
   Owner 创建 schema v2 模板（group + tab + visibleWhen + json_valid），Labeler 打开 workbench，验证显示/隐藏和提交拦截。
3. Export flow:
   Owner 保存审核标准与评分维度，发起一条带字段映射、includeAiAudit、includeReviewRecords 的 json/csv 导出，核对返回内容。
```
Expected: all three flows succeed without console/runtime errors.

- [ ] **Step 4: Write the route-map and decision docs**

`PLANROAD-A.md`
```md
- [x] 模板组件支持条件显示
- [x] 模板组件支持基础联动校验
- [x] 模板支持分组容器
- [x] 模板支持多 Tab 布局
- [x] Reviewer 页面展示多轮审核记录
- [x] Reviewer 页面展示打回前后答案 diff
- [x] Reviewer 页面展示完整审计时间线
- [x] Owner 页面支持审核标准配置的前端表单
- [x] Owner 页面支持评分维度配置
- [x] 导出页面支持字段映射配置
- [x] 导出页面支持是否包含 AI 审核 / 人工审核记录
```

`.claude/context/decisions-A.md`
```md
| 2026-06-03 | 阶段 3 审核链路采用“Submission 当前态 + SubmissionVersion 历史层”而不是每次重提生成新 Submission | 需要兼容现有 assignment+item 唯一键、workbench 聚合与导出口径，避免状态机和统计全部重写 | `backend/app/models.py`、`backend/app/api/routes/submissions.py`、`backend/app/api/routes/reviews.py`、Reviewer 前端与导出逻辑 |
| 2026-06-03 | 高级模板规则只做 `visibleWhen` 与 `validationRules` 的最小表达能力，不引入复杂 DSL 或跨层拖拽 | 时间有限，目标是稳定完成阶段 3 验收，而不是引入后续难维护的规则系统 | `frontend/src/pages/owner/templates/OwnerTemplatesPage.tsx`、`frontend/src/features/renderer/*`、`backend/app/api/routes/templates.py` |
```

- [ ] **Step 5: Commit**

```bash
git add PLANROAD-A.md PLANROAD-B.md .claude/context/progress-A.md .claude/context/decisions-A.md .claude/context/architecture-A.md README.md
git commit -m "docs: close stage3 planroad and verification records"
```

---

## Self-Review

### Spec coverage
- 审核工作台：Task 1-4 覆盖多轮提交版本、Reviewer 分配、diff、时间线、批量打回、阶段推进。
- 高级模板：Task 5-7 覆盖 schema v2、group、tab_container、visibleWhen、validationRules、前后端校验与 workbench 落地。
- Owner 配置与导出：Task 8-10 覆盖 review guideline、评分维度、字段映射、AI / review include flags 与导出范围。
- 文档与验收：Task 11 覆盖测试、build、浏览器验收和上下文回写。

### Placeholder scan
- 没有 `TODO` / `TBD` / “类似 Task N” 这类占位语句。
- 每个任务都有明确文件、测试、命令和提交信息。

### Type consistency
- 审核阶段统一使用 `initial | second | final`。
- 模板版本统一使用 `version: 1 | 2`，新增容器为 `group` 与 `tab_container`。
- 导出配置统一使用 `fieldMapping / includeAiAudit / includeReviewRecords / exportScope`。

---

Plan complete and saved to `docs/superpowers/plans/2026-06-03-stage3-full-scope-implementation-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
