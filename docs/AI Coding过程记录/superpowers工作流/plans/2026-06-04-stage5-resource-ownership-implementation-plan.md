# Stage 5 Resource Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 LabelHub 当前主链路补齐三角色资源归属与 reviewer 任务级分配闭环，让 Owner / Labeler / Reviewer 的关键接口和页面第一次具备真实的数据访问边界。

**Architecture:** 后端继续复用现有 `owner_id`、`created_by`、`user_id` 等归属字段，只新增一张 `task_reviewer_assignments` 任务级 reviewer 分配表；权限实现采用“显式 helper + 业务路由调用”的方式，不引入通用 ACL/RBAC 框架。前端只在现有 Owner 任务管理页补最小 reviewer 分配入口，其他页面主要通过现有列表过滤与后端 403/404 结果自然体现权限边界。

**Tech Stack:** FastAPI, SQLAlchemy ORM, MySQL/SQLite schema patch, pytest, React 18, TypeScript, Vite, Vitest, Testing Library, Chrome DevTools MCP

---

## File Map

### 后端模型与 schema patch
- Modify: `backend/app/models.py` — 新增 `TaskReviewerAssignment` 模型
- Modify: `backend/app/core/database.py` — 为 reviewer 任务分配表补建表 / 约束 / 索引 patch
- Modify: `backend/tests/test_database_schema.py` — 校验 reviewer 分配表存在且具备唯一约束

### 后端权限 helper
- Create: `backend/app/services/access_control.py` — Owner / Labeler / Reviewer 资源归属与分配校验 helper
- Modify: `backend/app/api/routes/tasks.py` — Owner task 过滤、task 详情/状态/AI 配置归属校验、reviewer 分配接口
- Modify: `backend/app/api/routes/templates.py` — Owner template 列表与版本接口归属校验
- Modify: `backend/app/api/routes/datasets.py` — Owner dataset 列表 / items 归属校验
- Modify: `backend/app/api/routes/exports.py` — Owner export 列表 / 详情 / 下载 / 创建归属校验
- Modify: `backend/app/api/routes/submissions.py` — Labeler draft / submit 归属校验补强
- Modify: `backend/app/api/routes/workbench.py` — 继续复用 assignment 归属校验
- Modify: `backend/app/api/routes/reviews.py` — Reviewer 严格分配制过滤与详情/动作校验
- Create: `backend/app/api/routes/users.py` — 提供 reviewer 最小列表接口 `GET /users/reviewers`
- Modify: `backend/app/main.py`（如需） — 注册新 users 路由

### 后端测试
- Modify: `backend/tests/conftest.py` — 补 reviewer / owner / labeler 多用户 fixture 或 builder helper
- Modify: `backend/tests/test_tasks_api.py` — Owner task 归属、Labeler claim 归属、reviewer 分配接口
- Modify: `backend/tests/test_templates_api.py` — Template owner 归属校验
- Modify: `backend/tests/test_datasets_api.py`（如已有）或 Create: `backend/tests/test_datasets_api.py` — Dataset owner 归属校验
- Modify: `backend/tests/test_exports_api.py` — Export owner 归属校验
- Modify: `backend/tests/test_submissions_api.py` — Labeler draft / submit 归属校验
- Modify: `backend/tests/test_workbench_api.py` — Labeler assignment 归属校验
- Modify: `backend/tests/test_reviews_api.py` — Reviewer 严格分配制与 pending/detail/approve/reject 权限矩阵

### 前端任务页与类型
- Modify: `frontend/src/pages/owner/tasks/OwnerTasksPage.tsx` — 最小 reviewer 分配 UI
- Modify: `frontend/src/pages/owner/tasks/OwnerTasksPage.test.tsx` — reviewer 分配入口与保存回显测试
- Modify: `frontend/src/types/domain.ts` — 如需补 task reviewer 摘要类型
- Modify: `frontend/src/services/api/client.ts`（仅在确有需要时） — 继续复用现有请求封装
- Modify: `frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.test.tsx`（如需） — 未分配/空列表最小稳定性回归

### 文档回写
- Modify: `docs/api-contracts/labelhub-v1.md`
- Modify: `README.md`
- Modify: `PLANROAD-B.md`
- Modify: `.claude/context/progress-A.md`
- Modify: `.claude/context/decisions-A.md`
- Modify: `.claude/context/architecture-A.md`

---

### Task 1: 新增 reviewer 任务级分配模型与 schema patch

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/app/core/database.py`
- Test: `backend/tests/test_database_schema.py`

- [ ] **Step 1: Write the failing schema test**

`backend/tests/test_database_schema.py`
```python
from sqlalchemy import inspect
from app.core.database import engine


def test_patch_schema_adds_task_reviewer_assignments_table():
    inspector = inspect(engine)
    assert 'task_reviewer_assignments' in inspector.get_table_names()



def test_task_reviewer_assignments_has_unique_pair_constraint():
    inspector = inspect(engine)
    indexes = {index['name'] for index in inspector.get_indexes('task_reviewer_assignments')}
    assert 'uq_task_reviewer_assignment' in indexes
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_database_schema.py -q
```
Expected: FAIL because `task_reviewer_assignments` table/index does not exist yet.

- [ ] **Step 3: Add the minimal model and patch logic**

`backend/app/models.py`
```python
class TaskReviewerAssignment(Base):
    __tablename__ = 'task_reviewer_assignments'
    __table_args__ = (UniqueConstraint('task_id', 'reviewer_id', name='uq_task_reviewer_assignment'),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    task_id: Mapped[int] = mapped_column(ForeignKey('tasks.id'), nullable=False, index=True)
    reviewer_id: Mapped[int] = mapped_column(ForeignKey('users.id'), nullable=False, index=True)
    assigned_by: Mapped[int] = mapped_column(ForeignKey('users.id'), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    task: Mapped[Task] = relationship('Task', foreign_keys=[task_id])
    reviewer: Mapped[User] = relationship('User', foreign_keys=[reviewer_id])
    assigner: Mapped[User] = relationship('User', foreign_keys=[assigned_by])
```

`backend/app/core/database.py`
```python
if 'task_reviewer_assignments' not in table_names:
    Base.metadata.tables['task_reviewer_assignments'].create(bind=engine)
    table_names.add('task_reviewer_assignments')
```

If SQLite/MySQL index behavior needs explicit patching, keep it minimal and deterministic:
```python
if 'task_reviewer_assignments' in table_names:
    assignment_indexes = {index['name'] for index in inspector.get_indexes('task_reviewer_assignments')}
    if 'uq_task_reviewer_assignment' not in assignment_indexes:
        with engine.begin() as connection:
            connection.execute(
                text('CREATE UNIQUE INDEX uq_task_reviewer_assignment ON task_reviewer_assignments (task_id, reviewer_id)')
            )
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_database_schema.py -q
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/models.py backend/app/core/database.py backend/tests/test_database_schema.py
git commit -m "feat: add task reviewer assignment model"
```

---

### Task 2: 抽出后端资源归属与 reviewer 分配权限 helper

**Files:**
- Create: `backend/app/services/access_control.py`
- Modify: `backend/tests/conftest.py`
- Test: `backend/tests/test_tasks_api.py`

- [ ] **Step 1: Write the failing permission tests**

`backend/tests/test_tasks_api.py`
```python
def test_owner_task_detail_rejects_other_owner_token(client, owner_task, another_owner_token):
    response = client.get(f'/api/v1/tasks/{owner_task.id}', headers={'Authorization': f'Bearer {another_owner_token}'})
    assert response.status_code == 403



def test_reviewer_assignment_helper_blocks_unassigned_reviewer(client, seeded_review_submission, another_reviewer_token):
    response = client.get(
        f'/api/v1/reviews/{seeded_review_submission.id}',
        headers={'Authorization': f'Bearer {another_reviewer_token}'},
    )
    assert response.status_code == 403
```

`backend/tests/conftest.py`
```python
@pytest.fixture
def another_owner(db_session):
    user = User(username='owner_extra', display_name='Owner Extra', role='owner', password_hash=hash_password('demo-owner-456'))
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:
```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_tasks_api.py -q
```
Expected: FAIL because there is no centralized ownership/reviewer access helper yet, and current routes still overexpose cross-owner/cross-reviewer access.

- [ ] **Step 3: Create the minimal access control module**

`backend/app/services/access_control.py`
```python
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import Assignment, ExportJob, Submission, Task, TaskReviewerAssignment, Template, Dataset


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
    return submission
```

- [ ] **Step 4: Run the focused tests to verify they pass**

Run:
```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_tasks_api.py -q
```
Expected: PASS for the new ownership/reviewer-access assertions.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/access_control.py backend/tests/conftest.py backend/tests/test_tasks_api.py
git commit -m "feat: add resource access control helpers"
```

---

### Task 3: 收口 Owner 资源归属与 reviewer 分配后端接口

**Files:**
- Modify: `backend/app/api/routes/tasks.py`
- Create: `backend/app/api/routes/users.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_tasks_api.py`

- [ ] **Step 1: Write the failing route tests**

`backend/tests/test_tasks_api.py`
```python
def test_list_tasks_only_returns_current_owner_tasks(client, owner_token, another_owner, db_session):
    foreign_task = Task(title='foreign', description='', quota=1, owner_id=another_owner.id)
    db_session.add(foreign_task)
    db_session.commit()

    response = client.get('/api/v1/tasks', headers={'Authorization': f'Bearer {owner_token}'})
    assert response.status_code == 200
    titles = [item['title'] for item in response.json()['data']['items']]
    assert 'foreign' not in titles



def test_owner_can_replace_task_reviewers(client, owner_owned_task, reviewer_token, owner_token):
    response = client.post(
        f'/api/v1/tasks/{owner_owned_task.id}/reviewers',
        json={'reviewerIds': [3]},
        headers={'Authorization': f'Bearer {owner_token}'},
    )
    assert response.status_code == 200
    assert response.json()['data']['reviewerIds'] == [3]



def test_non_owner_cannot_replace_task_reviewers(client, owner_owned_task, labeler_token):
    response = client.post(
        f'/api/v1/tasks/{owner_owned_task.id}/reviewers',
        json={'reviewerIds': [3]},
        headers={'Authorization': f'Bearer {labeler_token}'},
    )
    assert response.status_code == 403



def test_list_reviewers_returns_only_reviewer_users(client, owner_token):
    response = client.get('/api/v1/users/reviewers', headers={'Authorization': f'Bearer {owner_token}'})
    assert response.status_code == 200
    assert all(item['role'] == 'reviewer' for item in response.json()['data']['items'])
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_tasks_api.py -q
```
Expected: FAIL because `/tasks` is not filtered by owner, reviewer assignment endpoints do not exist, and `/users/reviewers` does not exist.

- [ ] **Step 3: Implement the minimal owner filtering and reviewer assignment APIs**

`backend/app/api/routes/tasks.py`
```python
from app.api.deps import get_current_user_from_token, require_role, success
from app.models import TaskReviewerAssignment, User
from app.services.access_control import require_owner_task


class TaskReviewerUpdateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    reviewer_ids: list[int] = Field(validation_alias='reviewerIds')


@router.get('')
def list_tasks(...):
    user = get_current_user_from_token(db, authorization)
    require_role(user, {'owner'})

    query = db.query(Task).filter(Task.owner_id == user.id)
    ...


@router.get('/{task_id}')
def get_task_detail(...):
    user = get_current_user_from_token(db, authorization)
    require_role(user, {'owner'})
    task = require_owner_task(db, task_id, user)
    return success(task_to_dict(db, task))


@router.post('/{task_id}/reviewers')
def replace_task_reviewers(task_id: int, payload: TaskReviewerUpdateRequest, authorization: str | None = Header(default=None), db: Session = Depends(get_db)) -> dict:
    user = get_current_user_from_token(db, authorization)
    require_role(user, {'owner'})
    task = require_owner_task(db, task_id, user)

    reviewers = db.query(User).filter(User.role == 'reviewer', User.id.in_(payload.reviewer_ids)).all()
    if len(reviewers) != len(set(payload.reviewer_ids)):
        raise HTTPException(status_code=400, detail='some reviewers do not exist')

    db.query(TaskReviewerAssignment).filter(TaskReviewerAssignment.task_id == task.id).delete()
    for reviewer in reviewers:
        db.add(TaskReviewerAssignment(task_id=task.id, reviewer_id=reviewer.id, assigned_by=user.id))
    db.commit()

    return success({'taskId': task.id, 'reviewerIds': [reviewer.id for reviewer in reviewers]})


@router.get('/{task_id}/reviewers')
def get_task_reviewers(task_id: int, authorization: str | None = Header(default=None), db: Session = Depends(get_db)) -> dict:
    user = get_current_user_from_token(db, authorization)
    require_role(user, {'owner'})
    task = require_owner_task(db, task_id, user)

    rows = (
        db.query(TaskReviewerAssignment)
        .filter(TaskReviewerAssignment.task_id == task.id)
        .order_by(TaskReviewerAssignment.id.asc())
        .all()
    )
    return success({
        'taskId': task.id,
        'items': [
            {
                'reviewerId': row.reviewer.id,
                'username': row.reviewer.username,
                'displayName': row.reviewer.display_name,
            }
            for row in rows
        ],
    })
```

`backend/app/api/routes/users.py`
```python
from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_from_token, require_role, success
from app.core.database import get_db
from app.models import User

router = APIRouter(prefix='/users', tags=['users'])


@router.get('/reviewers')
def list_reviewers(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_current_user_from_token(db, authorization)
    require_role(user, {'owner'})

    reviewers = db.query(User).filter(User.role == 'reviewer').order_by(User.id.asc()).all()
    return success(
        {
            'items': [
                {
                    'id': reviewer.id,
                    'username': reviewer.username,
                    'displayName': reviewer.display_name,
                    'role': reviewer.role,
                }
                for reviewer in reviewers
            ],
            'total': len(reviewers),
        }
    )
```

`backend/app/main.py`
```python
from app.api.routes import users
app.include_router(users.router, prefix='/api/v1')
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_tasks_api.py -q
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/tasks.py backend/app/api/routes/users.py backend/app/main.py backend/tests/test_tasks_api.py
git commit -m "feat: add owner task ownership and reviewer assignment routes"
```

---

### Task 4: 收口 Template / Dataset / Export 的 Owner 归属校验

**Files:**
- Modify: `backend/app/api/routes/templates.py`
- Modify: `backend/app/api/routes/datasets.py`
- Modify: `backend/app/api/routes/exports.py`
- Test: `backend/tests/test_templates_api.py`
- Test: `backend/tests/test_datasets_api.py`
- Test: `backend/tests/test_exports_api.py`

- [ ] **Step 1: Write the failing owner-isolation tests**

`backend/tests/test_templates_api.py`
```python
def test_list_templates_only_returns_current_owner_templates(client, owner_token, another_owner, db_session):
    foreign_template = Template(name='foreign template', description='', created_by=another_owner.id)
    db_session.add(foreign_template)
    db_session.commit()

    response = client.get('/api/v1/templates', headers={'Authorization': f'Bearer {owner_token}'})
    assert response.status_code == 200
    names = [item['name'] for item in response.json()['data']['items']]
    assert 'foreign template' not in names
```

`backend/tests/test_datasets_api.py`
```python
def test_get_dataset_items_rejects_other_owner(client, foreign_dataset, owner_token):
    response = client.get(f'/api/v1/datasets/{foreign_dataset.id}/items', headers={'Authorization': f'Bearer {owner_token}'})
    assert response.status_code == 403
```

`backend/tests/test_exports_api.py`
```python
def test_get_export_rejects_other_owner(client, foreign_export_job, owner_token):
    response = client.get(f'/api/v1/exports/{foreign_export_job.id}', headers={'Authorization': f'Bearer {owner_token}'})
    assert response.status_code == 403
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_templates_api.py backend/tests/test_datasets_api.py backend/tests/test_exports_api.py -q
```
Expected: FAIL because the routes still expose cross-owner resources.

- [ ] **Step 3: Implement the minimal owner filtering/guard code**

`backend/app/api/routes/templates.py`
```python
from app.api.deps import get_current_user_from_token, require_role, success
from app.services.access_control import require_owner_task, require_owner_template


@router.get('')
def list_templates(authorization: str | None = Header(default=None), db: Session = Depends(get_db)) -> dict:
    user = get_current_user_from_token(db, authorization)
    require_role(user, {'owner'})
    templates = db.query(Template).filter(Template.created_by == user.id).order_by(Template.created_at.desc()).all()
    return success({'items': [{'id': template.id, 'name': template.name} for template in templates]})


@router.post('')
def create_template(...):
    user = get_current_user_from_token(db, authorization)
    require_role(user, {'owner'})
    if payload.task_id:
        require_owner_task(db, payload.task_id, user)
    ...


@router.post('/{template_id}/versions')
def create_template_version(...):
    user = get_current_user_from_token(db, authorization)
    require_role(user, {'owner'})
    template = require_owner_template(db, template_id, user)
    ...
```

`backend/app/api/routes/datasets.py`
```python
from app.api.deps import get_current_user_from_token, require_role, success
from app.services.access_control import require_owner_dataset


@router.get('')
def get_datasets(...):
    user = get_current_user_from_token(db, authorization)
    require_role(user, {'owner'})
    result = list_datasets(db, owner_id=user.id, keyword=keyword, page=page, page_size=pageSize)
    ...


@router.get('/{dataset_id}/items')
def get_dataset_items(...):
    user = get_current_user_from_token(db, authorization)
    require_role(user, {'owner'})
    require_owner_dataset(db, dataset_id, user)
    dataset, result = list_dataset_items(...)
```

`backend/app/api/routes/exports.py`
```python
from app.api.deps import get_current_user_from_token, require_role, success
from app.services.access_control import require_owner_export_job, require_owner_task


@router.get('')
def list_exports(...):
    user = get_current_user_from_token(db, authorization)
    require_role(user, {'owner'})
    query = db.query(ExportJob).filter(ExportJob.created_by == user.id).order_by(ExportJob.created_at.desc())
    ...


@router.post('')
def create_export(...):
    user = get_current_user_from_token(db, authorization)
    require_role(user, {'owner'})
    task = require_owner_task(db, payload.task_id, user)
    ...


@router.get('/{job_id}')
def get_export(...):
    user = get_current_user_from_token(db, authorization)
    require_role(user, {'owner'})
    job = require_owner_export_job(db, job_id, user)
    return success(serialize_export_job(job))
```

If `list_datasets()` currently has no owner filter, extend it minimally instead of duplicating raw query logic:

`backend/app/services/dataset_import.py`
```python
def list_datasets(db: Session, owner_id: int | None = None, keyword: str | None = None, page: int = 1, page_size: int = 10):
    query = db.query(Dataset)
    if owner_id is not None:
        query = query.filter(Dataset.created_by == owner_id)
    ...
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_templates_api.py backend/tests/test_datasets_api.py backend/tests/test_exports_api.py -q
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/templates.py backend/app/api/routes/datasets.py backend/app/api/routes/exports.py backend/app/services/dataset_import.py backend/tests/test_templates_api.py backend/tests/test_datasets_api.py backend/tests/test_exports_api.py
git commit -m "feat: enforce owner resource ownership"
```

---

### Task 5: 补强 Labeler assignment / submission 归属校验

**Files:**
- Modify: `backend/app/api/routes/submissions.py`
- Modify: `backend/app/api/routes/workbench.py`
- Modify: `backend/app/api/routes/tasks.py`
- Test: `backend/tests/test_submissions_api.py`
- Test: `backend/tests/test_workbench_api.py`
- Test: `backend/tests/test_tasks_api.py`

- [ ] **Step 1: Write the failing labeler tests**

`backend/tests/test_submissions_api.py`
```python
def test_save_draft_rejects_other_labeler_assignment(client, another_labeler_token, foreign_assignment_id):
    response = client.post(
        '/api/v1/submissions/draft',
        headers={'Authorization': f'Bearer {another_labeler_token}'},
        json={'assignmentId': foreign_assignment_id, 'answers': {'sentiment': '正向'}},
    )
    assert response.status_code == 403



def test_submit_rejects_other_labeler_submission(client, another_labeler_token, foreign_submission_id):
    response = client.post(
        f'/api/v1/submissions/{foreign_submission_id}/submit',
        headers={'Authorization': f'Bearer {another_labeler_token}'},
        json={'answers': {'sentiment': '正向'}},
    )
    assert response.status_code == 403
```

`backend/tests/test_workbench_api.py`
```python
def test_workbench_rejects_other_labeler_assignment(client, another_labeler_token, foreign_assignment_id):
    response = client.get(
        f'/api/v1/workbench/items?assignmentId={foreign_assignment_id}',
        headers={'Authorization': f'Bearer {another_labeler_token}'},
    )
    assert response.status_code == 403
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_submissions_api.py backend/tests/test_workbench_api.py backend/tests/test_tasks_api.py -q
```
Expected: FAIL if any route still accepts cross-labeler assignment/submission references without full relation checks.

- [ ] **Step 3: Implement the minimal labeler access checks**

`backend/app/api/routes/tasks.py`
```python
@router.post('/{task_id}/claim')
def claim_task(...):
    user = get_demo_user(db, authorization, x_demo_user, default_username='labeler_demo')
    require_role(user, {'labeler'})
    ...
    existing = db.query(Assignment).filter(Assignment.task_id == task.id).first()
    if existing and existing.user_id != user.id:
        raise HTTPException(status_code=409, detail='task has already been claimed')
```

`backend/app/api/routes/workbench.py`
```python
from app.services.access_control import require_labeler_assignment


assignment = require_labeler_assignment(db, assignmentId, user)
```

`backend/app/api/routes/submissions.py`
```python
from app.services.access_control import require_labeler_assignment, require_labeler_submission


assignment = require_labeler_assignment(db, payload.assignment_id, user)
...
submission = require_labeler_submission(db, submission_id, user)
if submission.assignment_id != submission.assignment.id:
    raise HTTPException(status_code=409, detail='submission relation is inconsistent')
```

Also keep the relation consistency explicit at submit time:
```python
if submission.assignment.user_id != user.id or submission.assignment.task_id != submission.task_id:
    raise HTTPException(status_code=403, detail='submission belongs to another user')
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_submissions_api.py backend/tests/test_workbench_api.py backend/tests/test_tasks_api.py -q
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/tasks.py backend/app/api/routes/workbench.py backend/app/api/routes/submissions.py backend/tests/test_submissions_api.py backend/tests/test_workbench_api.py backend/tests/test_tasks_api.py
git commit -m "feat: enforce labeler assignment ownership"
```

---

### Task 6: 收口 Reviewer 严格分配制到 pending/detail/approve/reject

**Files:**
- Modify: `backend/app/api/routes/reviews.py`
- Test: `backend/tests/test_reviews_api.py`

- [ ] **Step 1: Write the failing reviewer-assignment tests**

`backend/tests/test_reviews_api.py`
```python
def test_pending_reviews_only_returns_assigned_tasks(client, reviewer_token, another_reviewer_token, assigned_submission, unassigned_submission):
    response = client.get('/api/v1/reviews/pending', headers={'Authorization': f'Bearer {reviewer_token}'})
    assert response.status_code == 200
    ids = [item['submissionId'] for item in response.json()['data']['items']]
    assert assigned_submission.id in ids
    assert unassigned_submission.id not in ids



def test_review_detail_rejects_unassigned_reviewer(client, another_reviewer_token, assigned_submission):
    response = client.get(
        f'/api/v1/reviews/{assigned_submission.id}',
        headers={'Authorization': f'Bearer {another_reviewer_token}'},
    )
    assert response.status_code == 403



def test_approve_reject_require_task_assignment(client, another_reviewer_token, assigned_submission):
    approve = client.post(
        f'/api/v1/reviews/{assigned_submission.id}/approve',
        headers={'Authorization': f'Bearer {another_reviewer_token}'},
        json={'comment': 'pass'},
    )
    reject = client.post(
        f'/api/v1/reviews/{assigned_submission.id}/reject',
        headers={'Authorization': f'Bearer {another_reviewer_token}'},
        json={'reason': 'need revise'},
    )
    assert approve.status_code == 403
    assert reject.status_code == 403
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_reviews_api.py -q
```
Expected: FAIL because `reviews.py` still lists all pending submissions and does not enforce reviewer task assignment on detail/actions.

- [ ] **Step 3: Implement the minimal reviewer assignment filtering**

`backend/app/api/routes/reviews.py`
```python
from app.models import TaskReviewerAssignment
from app.services.access_control import require_reviewer_submission_access


@router.get('/pending')
def list_pending_reviews(...):
    user = get_demo_user(db, authorization, x_demo_user, default_username='reviewer_demo')
    require_role(user, {'reviewer'})

    query = (
        db.query(Submission)
        .join(TaskReviewerAssignment, TaskReviewerAssignment.task_id == Submission.task_id)
        .filter(
            Submission.status.in_(['submitted', 'ai_passed']),
            TaskReviewerAssignment.reviewer_id == user.id,
        )
    )
    ...


@router.get('/{submission_id}')
def get_review_detail(...):
    user = get_demo_user(db, authorization, x_demo_user, default_username='reviewer_demo')
    require_role(user, {'reviewer'})
    submission = require_reviewer_submission_access(db, submission_id, user)
    if not reviewable_status(submission.status):
        raise HTTPException(status_code=409, detail='submission is not pending review')
    return success(serialize_review_detail(submission, db))


@router.post('/{submission_id}/approve')
def approve_review(...):
    submission = require_reviewer_submission_access(db, submission_id, user)
    ...


@router.post('/{submission_id}/reject')
def reject_review(...):
    submission = require_reviewer_submission_access(db, submission_id, user)
    ...
```

If current bulk endpoints are still active in UI/tests, apply the same gate before mutating each submission:
```python
require_reviewer_submission_access(db, submission_id, user)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_reviews_api.py -q
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/reviews.py backend/tests/test_reviews_api.py
git commit -m "feat: enforce reviewer task assignments"
```

---

### Task 7: 在 Owner 任务页补最小 reviewer 分配入口

**Files:**
- Modify: `frontend/src/pages/owner/tasks/OwnerTasksPage.tsx`
- Modify: `frontend/src/pages/owner/tasks/OwnerTasksPage.test.tsx`
- Modify: `frontend/src/types/domain.ts` (only if needed)

- [ ] **Step 1: Write the failing UI tests**

`frontend/src/pages/owner/tasks/OwnerTasksPage.test.tsx`
```tsx
it('loads reviewer options and shows empty assignment state', async () => {
  renderOwnerTasksPage()
  expect(await screen.findByText('情感标注任务')).toBeInTheDocument()
  expect(screen.getByText('当前未分配 Reviewer')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '分配 Reviewer' })).toBeInTheDocument()
})

it('replaces task reviewers from the owner task card', async () => {
  const user = userEvent.setup()
  renderOwnerTasksPage()

  await screen.findByText('情感标注任务')
  await user.click(screen.getByRole('button', { name: '分配 Reviewer' }))
  await user.click(screen.getByLabelText('Reviewer Demo'))
  await user.click(screen.getByRole('button', { name: '保存 Reviewer 分配' }))

  expect(fetchMock).toHaveBeenCalledWith('/tasks/1/reviewers', 'POST', { reviewerIds: [3] })
  expect(await screen.findByText('Reviewer 分配已更新')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npm --prefix frontend run test -- src/pages/owner/tasks/OwnerTasksPage.test.tsx
```
Expected: FAIL because the task page does not yet render reviewer assignment UI or call reviewer assignment APIs.

- [ ] **Step 3: Implement the minimal reviewer assignment UI**

`frontend/src/pages/owner/tasks/OwnerTasksPage.tsx`
```tsx
type ReviewerOption = {
  id: number
  username: string
  displayName: string
  role: 'reviewer'
}

type TaskReviewerState = {
  reviewerId: number
  username: string
  displayName: string
}
```

Extend task response minimally:
```tsx
type TaskListResponse = {
  items: Array<{
    id: number
    title: string
    ...
    reviewers?: Array<{
      reviewerId: number
      username: string
      displayName: string
    }>
  }>
  total: number
}
```

Add local state:
```tsx
const [reviewerOptions, setReviewerOptions] = useState<ReviewerOption[]>([])
const [editingReviewerTaskId, setEditingReviewerTaskId] = useState<number | null>(null)
const [selectedReviewerIds, setSelectedReviewerIds] = useState<number[]>([])
const [reviewerMessage, setReviewerMessage] = useState('')
```

Load reviewer options alongside tasks:
```tsx
const [taskResult, templateResult, datasetResult, reviewerResult] = await Promise.all([
  apiGet<TaskListResponse>('/tasks'),
  apiGet<TemplateListResponse>('/templates'),
  listDatasets(),
  apiGet<{ items: ReviewerOption[] }>('/users/reviewers'),
])
setReviewerOptions(reviewerResult.items)
```

Render minimal task-card section:
```tsx
<div className="task-reviewer-block">
  <p>Reviewer 分配</p>
  {task.reviewers && task.reviewers.length > 0 ? (
    <p>{task.reviewers.map((item) => item.displayName).join('、')}</p>
  ) : (
    <p>当前未分配 Reviewer</p>
  )}
  <button type="button" onClick={() => openReviewerEditor(task)}>
    分配 Reviewer
  </button>
</div>
```

Use the simplest possible inline editor:
```tsx
{editingReviewerTaskId === task.id ? (
  <div>
    {reviewerOptions.map((reviewer) => (
      <label key={reviewer.id}>
        <input
          type="checkbox"
          checked={selectedReviewerIds.includes(reviewer.id)}
          onChange={() => toggleReviewer(reviewer.id)}
        />
        {reviewer.displayName}
      </label>
    ))}
    <button type="button" onClick={() => void saveTaskReviewers(task.id)}>
      保存 Reviewer 分配
    </button>
  </div>
) : null}
```

Save with overwrite semantics:
```tsx
await apiPost(`/tasks/${taskId}/reviewers`, { reviewerIds: selectedReviewerIds })
setReviewerMessage('Reviewer 分配已更新')
await loadTasks()
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npm --prefix frontend run test -- src/pages/owner/tasks/OwnerTasksPage.test.tsx
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/owner/tasks/OwnerTasksPage.tsx frontend/src/pages/owner/tasks/OwnerTasksPage.test.tsx frontend/src/types/domain.ts
git commit -m "feat: add owner reviewer assignment ui"
```

---

### Task 8: 回归测试、浏览器验收与文档回写

**Files:**
- Modify: `docs/api-contracts/labelhub-v1.md`
- Modify: `README.md`
- Modify: `PLANROAD-B.md`
- Modify: `.claude/context/progress-A.md`
- Modify: `.claude/context/decisions-A.md`
- Modify: `.claude/context/architecture-A.md`

- [ ] **Step 1: Write the documentation deltas before editing**

Prepare the exact facts you will write back:

```md
- API contract: 新增 `GET /users/reviewers`、`GET/POST /tasks/{taskId}/reviewers`，并把 Owner/Labeler/Reviewer 权限边界补进相关接口段落。
- README: 明确当前阶段五已完成认证基础层 + 第一轮资源归属；reviewer 采用任务级严格分配制。
- Progress/decisions/architecture: 记录“权限 helper + 任务级 reviewer 分配 + 三角色资源归属”的真实完成口径。
```

- [ ] **Step 2: Run the full relevant verification suite**

Run:
```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_database_schema.py backend/tests/test_tasks_api.py backend/tests/test_templates_api.py backend/tests/test_datasets_api.py backend/tests/test_exports_api.py backend/tests/test_submissions_api.py backend/tests/test_workbench_api.py backend/tests/test_reviews_api.py -q
```
Expected: PASS with all role-ownership and reviewer-assignment tests green.

Run:
```bash
npm --prefix frontend run test -- src/pages/owner/tasks/OwnerTasksPage.test.tsx src/pages/reviewer/reviews/ReviewerReviewsPage.test.tsx
```
Expected: PASS.

Run:
```bash
npm --prefix frontend run build
```
Expected: PASS.

- [ ] **Step 3: Perform the minimal browser acceptance**

Use the running local app and verify these exact flows:

1. **Owner**
   - 登录 `owner_demo / demo-owner-123`
   - 打开 Owner 任务页
   - 在某个 task 上打开 reviewer 分配入口
   - 选择 `reviewer_demo` 并保存
   - 页面成功回显分配结果

2. **Labeler**
   - 登录 `labeler_demo / demo-labeler-123`
   - 正常进入自己的 assignment/workbench
   - 尝试访问不属于自己的 assignment（如果页面无入口，则用已知 URL 或网络请求验证）
   - 结果应被后端拒绝，页面不崩

3. **Reviewer**
   - 登录 `reviewer_demo / demo-reviewer-123`
   - 只能看见被分配 task 下的待审 submission
   - 能进入 detail 并 approve/reject

Record the exact observed pages or API results in `.claude/context/progress-A.md` rather than claiming success from memory.

- [ ] **Step 4: Write the minimal documentation updates**

`docs/api-contracts/labelhub-v1.md`
```md
- 在 tasks 段新增 reviewer 分配接口：
  - `GET /api/v1/tasks/{taskId}/reviewers`
  - `POST /api/v1/tasks/{taskId}/reviewers`
- 在 auth/global 说明后补充阶段五当前权限口径：
  - Owner 只可管理自己的 task/template/dataset/export
  - Labeler 只可访问自己的 assignment/submission
  - Reviewer 仅可访问被分配 task 下的待审 submission
- 新增 `GET /api/v1/users/reviewers`
```

`README.md`
```md
- 当前阶段五已完成：
  - 认证基础层（账号密码 + JWT）
  - 第一轮资源归属闭环（三角色）
- Reviewer 当前采用任务级严格分配制，由 Owner 在任务页进行最小分配
- 当前仍未完成：submission 级 reviewer 分配、完整 RBAC/ACL、部署方案
```

`.claude/context/progress-A.md`
```md
- 记录本轮真实测试命令、通过数量与浏览器三角色权限验收结果。
```

`.claude/context/decisions-A.md`
```md
- 新增决策：阶段五第一轮权限收口采用“显式 helper + 任务级 reviewer 分配”，不引入通用 ACL 框架。
```

`.claude/context/architecture-A.md`
```md
- 新增说明：Owner/Labeler 权限依赖现有归属字段，Reviewer 权限主依据是 `task_reviewer_assignments`，而非 `Submission.assigned_reviewer_id`。
```

- [ ] **Step 5: Commit**

```bash
git add docs/api-contracts/labelhub-v1.md README.md PLANROAD-B.md .claude/context/progress-A.md .claude/context/decisions-A.md .claude/context/architecture-A.md
git commit -m "docs: sync stage5 resource ownership rollout"
```

---

## Self-Review Checklist

### Spec coverage
- Owner 资源归属：Task 3 + Task 4
- Labeler 资源归属：Task 5
- Reviewer 严格分配制：Task 1 + Task 2 + Task 3 + Task 6
- Owner 最小 reviewer 分配入口：Task 3 + Task 7
- 测试矩阵、浏览器验收、文档回写：Task 8

### Placeholder scan
- 没有 `TODO` / `TBD` / “类似 Task N” 占位。
- 每个任务都给出了精确路径、最小代码形态、验证命令与预期结果。

### Type consistency
- reviewer 分配统一使用 `task_reviewer_assignments` 与 `reviewerIds` 覆盖式保存。
- Reviewer 权限判断统一以 `task_id + reviewer_id` 为主键语义，不混用 `Submission.assigned_reviewer_id` 作为本轮主依据。

---

Plan complete and saved to `docs/superpowers/plans/2026-06-04-stage5-resource-ownership-implementation-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
