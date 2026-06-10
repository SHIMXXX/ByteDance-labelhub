# Stage 2 Full Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 严格做满 LabelHub 的 A/B 两侧阶段 2：先完成 B2 的 Celery/Redis 异步 AI 审核工程化，再完成 A2 的多题任务前台补满，并只对阶段 3 做结构预埋。

**Architecture:** 后端把当前同步提交链路拆成“任务级 AI 配置 → AI job 入队 → Celery worker 执行 → 结果回写 → 失败重试/人工兜底”的明确流水线；前端继续沿现有 OwnerTasksPage、LabelerWorkbenchPage、ReviewerReviewsPage 三个页面精准增强，不做无关重构。所有状态、聚合口径和联调剧本都围绕 `task -> assignment -> submission(item)` 组织，先统一后端状态契约，再补前端工作台体验与多题视角。

**Tech Stack:** FastAPI, SQLAlchemy ORM, MySQL, Celery, Redis, pytest, React 18, Vite, Vitest, Chrome DevTools MCP

---

## Scope Check

这个 spec 同时覆盖 B2 与 A2，但它们不是两个完全独立的子项目：A2 的题目状态、Owner 统计和 Reviewer 多题列表都直接依赖 B2 的异步 AI 状态、聚合口径和结果结构。因此保留为 **一个顺序执行的实施计划**，但严格按任务包串行推进：**P1-P3 先完成 B2，P4-P5 再完成 A2，P6 最后统一联调与文档回写**。

---

## File Map

### 后端基础设施与模型
- Create: `backend/app/core/celery_app.py` — Celery 实例、默认队列名、测试 eager 开关
- Modify: `backend/app/core/config.py` — 新增 Redis/Celery 相关配置项
- Modify: `backend/requirements.txt` — 增加 `celery`、`redis`
- Modify: `backend/app/models.py` — 新增 `AIAuditConfig`，扩展 `AIAuditJob` / `AIAuditResult` 字段
- Modify: `backend/app/core/database.py` — 为新表与新列补 patch 逻辑，保持旧库可启动

### 后端服务与接口
- Modify: `backend/app/services/ai_audit.py` — 提供 config snapshot、结果落库、失败 fallback helper
- Create: `backend/app/services/ai_job_runner.py` — worker 执行入口、重试、幂等、审计事件
- Modify: `backend/app/api/routes/tasks.py` — AI 配置保存/读取、Owner 聚合统计
- Modify: `backend/app/api/routes/submissions.py` — submit 改为入队，不再同步执行 AI
- Modify: `backend/app/api/routes/workbench.py` — 返回 item 级状态、最近保存时间、AI job 状态
- Modify: `backend/app/api/routes/reviews.py` — 多题列表筛选、批量审核入口与详情 source 修正

### 后端测试
- Modify: `backend/tests/test_database_schema.py` — 断言 schema patch 覆盖新表与新列
- Modify: `backend/tests/test_tasks_api.py` — AI 配置 API、Owner 统计 API
- Modify: `backend/tests/test_submissions_api.py` — submit 入队、幂等、fallback、snapshot
- Create: `backend/tests/test_ai_queue_flow.py` — Celery eager worker 成功 / retry / fallback
- Modify: `backend/tests/test_workbench_api.py` — item 级状态与 autosave 字段
- Modify: `backend/tests/test_reviews_api.py` — 多题列表、筛选、批量入口

### 前端类型与 API 封装
- Modify: `frontend/src/types/domain.ts` — Owner 统计字段、AI 配置类型、workbench item 状态、review 批量类型
- Modify: `frontend/src/services/api/datasets.ts` — 新增数据集题目预览读取 helper

### 前端页面
- Modify: `frontend/src/pages/owner/tasks/OwnerTasksPage.tsx` — AI 配置表单、统计卡片、数据集题目预览
- Modify: `frontend/src/pages/owner/tasks/OwnerTasksPage.test.tsx` — 覆盖 AI 配置、统计展示、预览抽屉
- Modify: `frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.tsx` — item 状态导航、自动保存提示、未完成题汇总
- Modify: `frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.test.tsx` — 覆盖 autosave、状态、未完成题汇总
- Modify: `frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.tsx` — 筛选、多选、批量入口、item source 区分
- Modify: `frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.test.tsx` — 覆盖筛选与批量交互

### 文档与路线图
- Modify: `README.md` — 启动 Redis/Celery 的最小说明（如果根 README 已承载统一启动说明）
- Modify: `PLANROAD-A.md` — 阶段 2 条目标记与剩余阶段 3 边界对齐
- Modify: `PLANROAD-B.md` — 阶段 2 条目标记与 Celery/Redis 工程化对齐
- Modify: `.claude/context/progress-A.md` — 本轮收口事实、测试与联调证据
- Modify: `.claude/context/decisions-A.md` — 如新增“AI 配置表 + Celery/Redis”为稳定边界，补一条技术决策
- Modify: `.claude/context/architecture-A.md` — 如执行层边界发生实质变化，补架构记录

---

### Task 1: 搭好 B2 的 Celery/Redis 与 AI 配置模型基础

**Files:**
- Create: `backend/app/core/celery_app.py`
- Modify: `backend/app/core/config.py`
- Modify: `backend/requirements.txt`
- Modify: `backend/app/models.py`
- Modify: `backend/app/core/database.py`
- Test: `backend/tests/test_database_schema.py`

- [ ] **Step 1: Write the failing schema test**

```python
from sqlalchemy import inspect


def test_patch_schema_adds_ai_audit_config_and_queue_columns(db_session):
    inspector = inspect(db_session.bind)
    table_names = set(inspector.get_table_names())

    assert 'ai_audit_configs' in table_names

    job_columns = {column['name'] for column in inspector.get_columns('ai_audit_jobs')}
    assert {'celery_task_id', 'config_snapshot_json', 'prompt_snapshot', 'raw_response', 'error_code'} <= job_columns

    result_columns = {column['name'] for column in inspector.get_columns('ai_audit_results')}
    assert {'prompt_snapshot', 'raw_response', 'validation_status', 'config_version'} <= result_columns
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
PYTHONPATH=backend pytest backend/tests/test_database_schema.py::test_patch_schema_adds_ai_audit_config_and_queue_columns -q
```
Expected: FAIL because `ai_audit_configs` and the new queue/result columns do not exist yet.

- [ ] **Step 3: Write the minimal foundation code**

`backend/requirements.txt`
```txt
fastapi==0.115.5
uvicorn==0.32.0
pydantic==2.13.4
pydantic-settings==2.14.1
sqlalchemy==2.0.36
pymysql==1.1.1
cryptography==43.0.3
pytest==8.3.3
httpx==0.27.2
requests==2.32.3
celery==5.4.0
redis==5.2.1
```

`backend/app/core/config.py`
```python
class Settings(BaseSettings):
    app_name: str = 'LabelHub API'
    app_env: str = 'development'
    api_prefix: str = '/api/v1'
    mysql_host: str = '127.0.0.1'
    mysql_port: int = 3306
    mysql_user: str = 'root'
    mysql_password: str = 'root'
    mysql_database: str = 'labelhub'
    ai_provider: str = 'deepseek'
    ai_timeout_seconds: int = 30
    ai_max_attempts: int = 2
    deepseek_api_key: str | None = None
    deepseek_model: str = 'deepseek-chat'
    deepseek_base_url: str = 'https://api.deepseek.com'
    redis_url: str = 'redis://127.0.0.1:6379/0'
    celery_task_always_eager: bool = False
```

`backend/app/core/celery_app.py`
```python
from celery import Celery

from app.core.config import settings

celery_app = Celery(
    'labelhub',
    broker=settings.redis_url,
    backend=settings.redis_url,
)
celery_app.conf.update(
    task_default_queue='labelhub-ai',
    task_serializer='json',
    result_serializer='json',
    accept_content=['json'],
    task_always_eager=settings.celery_task_always_eager,
)
```

`backend/app/models.py`
```python
class AIAuditConfig(Base):
    __tablename__ = 'ai_audit_configs'
    __table_args__ = (UniqueConstraint('task_id', name='uq_ai_audit_config_task'),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    task_id: Mapped[int] = mapped_column(ForeignKey('tasks.id'), nullable=False, index=True)
    prompt_template: Mapped[str] = mapped_column(Text, default='', nullable=False)
    score_dimensions_json: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    pass_threshold: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    enabled: Mapped[bool] = mapped_column(default=True, nullable=False)
    config_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    task: Mapped['Task'] = relationship('Task')
```

```python
class AIAuditJob(Base):
    celery_task_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    config_snapshot_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    prompt_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
```

```python
class AIAuditResult(Base):
    prompt_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    validation_status: Mapped[str] = mapped_column(String(32), default='valid', nullable=False)
    config_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
```

`backend/app/core/database.py`
```python
if 'ai_audit_configs' not in table_names:
    Base.metadata.tables['ai_audit_configs'].create(bind=engine)

if 'ai_audit_jobs' in table_names:
    job_columns = {column['name'] for column in inspector.get_columns('ai_audit_jobs')}
    job_statements = []
    if 'celery_task_id' not in job_columns:
        job_statements.append('ALTER TABLE ai_audit_jobs ADD COLUMN celery_task_id VARCHAR(128) NULL')
    if 'config_snapshot_json' not in job_columns:
        job_statements.append('ALTER TABLE ai_audit_jobs ADD COLUMN config_snapshot_json JSON NULL')
    if 'prompt_snapshot' not in job_columns:
        job_statements.append('ALTER TABLE ai_audit_jobs ADD COLUMN prompt_snapshot TEXT NULL')
    if 'raw_response' not in job_columns:
        job_statements.append('ALTER TABLE ai_audit_jobs ADD COLUMN raw_response TEXT NULL')
    if 'error_code' not in job_columns:
        job_statements.append('ALTER TABLE ai_audit_jobs ADD COLUMN error_code VARCHAR(64) NULL')
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
PYTHONPATH=backend pytest backend/tests/test_database_schema.py::test_patch_schema_adds_ai_audit_config_and_queue_columns -q
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/requirements.txt backend/app/core/config.py backend/app/core/celery_app.py backend/app/models.py backend/app/core/database.py backend/tests/test_database_schema.py
git commit -m "feat: add ai audit config and celery schema foundation"
```

---

### Task 2: 实现任务级 AI 配置 API，并让 Owner 真能配置评分维度

**Files:**
- Modify: `backend/app/api/routes/tasks.py`
- Modify: `backend/tests/test_tasks_api.py`
- Modify: `frontend/src/types/domain.ts`
- Modify: `frontend/src/pages/owner/tasks/OwnerTasksPage.tsx`
- Modify: `frontend/src/pages/owner/tasks/OwnerTasksPage.test.tsx`

- [ ] **Step 1: Write the failing API and UI tests**

`backend/tests/test_tasks_api.py`
```python
def test_owner_can_save_and_read_ai_audit_config(client, db_session, seed_users):
    owner = seed_users['owner']
    task = Task(title='AI Config Task', description='', status='draft', quota=1, owner_id=owner.id)
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)

    payload = {
        'promptTemplate': '请按 {pass_threshold} 分阈值审查：{answers}',
        'scoreDimensions': [
            {'key': 'quality', 'label': '质量', 'description': '答案质量', 'weight': 1, 'enabled': True},
            {'key': 'safety', 'label': '安全', 'description': '内容安全', 'weight': 1, 'enabled': True},
        ],
        'passThreshold': 4,
    }

    response = client.patch(
        f'/api/v1/tasks/{task.id}/ai-config',
        headers={'X-Demo-User': 'owner_demo'},
        json=payload,
    )

    assert response.status_code == 200
    detail = client.get(f'/api/v1/tasks/{task.id}', headers={'X-Demo-User': 'owner_demo'})
    assert detail.status_code == 200
    data = detail.json()['data']
    assert data['aiConfig']['promptTemplate'] == payload['promptTemplate']
    assert data['aiConfig']['passThreshold'] == 4
    assert data['aiConfig']['scoreDimensions'][0]['key'] == 'quality'
```

`frontend/src/pages/owner/tasks/OwnerTasksPage.test.tsx`
```tsx
it('saves ai score dimensions as structured config', async () => {
  const user = userEvent.setup()
  renderOwnerTasksPage()

  await user.click(screen.getByRole('button', { name: '新建任务' }))
  await user.type(screen.getByLabelText('标题'), '阶段二 AI 配置任务')
  await user.type(screen.getByLabelText('截止时间'), '2026-06-05T20:00:00+08:00')
  await user.clear(screen.getByLabelText('配额'))
  await user.type(screen.getByLabelText('配额'), '1')
  await user.type(screen.getByLabelText('AI Prompt 模板'), '请按要求审查')
  await user.type(screen.getByLabelText('评分维度'), 'quality|质量|答案质量|1\nsafety|安全|内容安全|1')
  await user.type(screen.getByLabelText('通过阈值'), '4')
  await user.click(screen.getByRole('button', { name: '保存任务' }))

  expect(fetchMock).toHaveBeenCalledWith(
    '/tasks',
    'POST',
    expect.objectContaining({
      aiConfig: {
        promptTemplate: '请按要求审查',
        passThreshold: 4,
        scoreDimensions: [
          { key: 'quality', label: '质量', description: '答案质量', weight: 1, enabled: true },
          { key: 'safety', label: '安全', description: '内容安全', weight: 1, enabled: true },
        ],
      },
    }),
  )
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
PYTHONPATH=backend pytest backend/tests/test_tasks_api.py::test_owner_can_save_and_read_ai_audit_config -q
npm --prefix frontend test -- --run src/pages/owner/tasks/OwnerTasksPage.test.tsx
```
Expected: backend FAIL because `/tasks/{id}/ai-config` and `aiConfig` serializer do not exist; frontend FAIL because the score dimension field and request body do not exist.

- [ ] **Step 3: Implement the smallest full config flow**

`backend/app/api/routes/tasks.py`
```python
class ScoreDimensionPayload(BaseModel):
    key: str
    label: str
    description: str = ''
    weight: int = 1
    enabled: bool = True


class TaskAIConfigPayload(BaseModel):
    promptTemplate: str
    scoreDimensions: list[ScoreDimensionPayload]
    passThreshold: int
```

```python
def serialize_ai_config(task: Task) -> dict:
    config = task.ai_audit_config
    if config is None:
        return {
            'promptTemplate': task.ai_prompt_template or '',
            'scoreDimensions': task.ai_score_dimensions_json or [],
            'passThreshold': task.ai_pass_threshold or 3,
        }
    return {
        'promptTemplate': config.prompt_template,
        'scoreDimensions': config.score_dimensions_json,
        'passThreshold': config.pass_threshold,
    }
```

```python
@router.get('/{task_id}')
def get_task_detail(task_id: int, authorization: str | None = Header(default=None), x_demo_user: str | None = Header(default=None), db: Session = Depends(get_db)) -> dict:
    user = get_demo_user(db, authorization, x_demo_user)
    require_role(user, {'owner'})
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail='task not found')
    payload = task_to_dict(db, task)
    payload['aiConfig'] = serialize_ai_config(task)
    return success(payload)
```

```python
@router.patch('/{task_id}/ai-config')
def update_task_ai_config(task_id: int, payload: TaskAIConfigPayload, authorization: str | None = Header(default=None), x_demo_user: str | None = Header(default=None), db: Session = Depends(get_db)) -> dict:
    user = get_demo_user(db, authorization, x_demo_user)
    require_role(user, {'owner'})
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail='task not found')

    config = task.ai_audit_config or AIAuditConfig(task_id=task.id)
    config.prompt_template = payload.promptTemplate.strip()
    config.score_dimensions_json = [item.model_dump() for item in payload.scoreDimensions]
    config.pass_threshold = payload.passThreshold
    config.config_version = (config.config_version or 0) + 1
    task.ai_prompt_template = config.prompt_template
    task.ai_score_dimensions_json = config.score_dimensions_json
    task.ai_pass_threshold = config.pass_threshold
    db.add(config)
    db.commit()
    db.refresh(config)
    return success({'taskId': task.id, 'aiConfig': serialize_ai_config(task)})
```

`frontend/src/types/domain.ts`
```ts
export type AIScoreDimension = {
  key: string
  label: string
  description: string
  weight: number
  enabled: boolean
}

export type TaskAIConfig = {
  promptTemplate: string
  scoreDimensions: AIScoreDimension[]
  passThreshold: number
}
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
  aiScoreDimensions: string
  aiPassThreshold: string
}
```

```tsx
function parseScoreDimensions(input: string) {
  return input
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [key, label, description = '', weight = '1'] = line.split('|').map((part) => part.trim())
      return {
        key,
        label: label || key,
        description,
        weight: Number(weight || '1'),
        enabled: true,
      }
    })
}
```

```tsx
<label className="form-field">
  <span>评分维度</span>
  <textarea
    value={form.aiScoreDimensions}
    onChange={(event) => handleChange('aiScoreDimensions', event.target.value)}
    placeholder="quality|质量|答案质量|1"
  />
</label>
```

```tsx
...(form.aiPromptTemplate.trim() || form.aiScoreDimensions.trim() || form.aiPassThreshold.trim()
  ? {
      aiConfig: {
        promptTemplate: form.aiPromptTemplate.trim(),
        scoreDimensions: parseScoreDimensions(form.aiScoreDimensions),
        passThreshold: Number(form.aiPassThreshold || '3'),
      },
    }
  : {}),
```

- [ ] **Step 4: Re-run tests to verify they pass**

Run:
```bash
PYTHONPATH=backend pytest backend/tests/test_tasks_api.py::test_owner_can_save_and_read_ai_audit_config -q
npm --prefix frontend test -- --run src/pages/owner/tasks/OwnerTasksPage.test.tsx
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/tasks.py backend/tests/test_tasks_api.py frontend/src/types/domain.ts frontend/src/pages/owner/tasks/OwnerTasksPage.tsx frontend/src/pages/owner/tasks/OwnerTasksPage.test.tsx
git commit -m "feat: add task ai config api and owner form"
```

---

### Task 3: 把 submit 从同步执行改成 Celery 入队

**Files:**
- Modify: `backend/app/services/ai_audit.py`
- Modify: `backend/app/api/routes/submissions.py`
- Create: `backend/app/services/ai_job_runner.py`
- Test: `backend/tests/test_submissions_api.py`

- [ ] **Step 1: Write the failing submit-queue test**

```python
def test_submit_enqueues_ai_job_and_returns_queued_status(client, db_session, seed_users, monkeypatch):
    submission = seed_submission_graph(db_session, seed_users)
    captured: dict[str, int] = {}

    def fake_enqueue(job_id: int) -> str:
        captured['job_id'] = job_id
        return 'celery-task-1'

    monkeypatch.setattr('app.api.routes.submissions.enqueue_ai_audit_job', fake_enqueue)

    response = client.post(
        f'/api/v1/submissions/{submission.id}/submit',
        headers={'X-Demo-User': 'labeler_demo'},
        json={},
    )

    assert response.status_code == 200
    data = response.json()['data']
    assert data['status'] == 'submitted'
    assert data['aiJobStatus'] == 'queued'
    assert data['aiDecision'] is None
    db_session.refresh(submission)
    assert submission.ai_audit_job.status == 'queued'
    assert submission.ai_audit_job.celery_task_id == 'celery-task-1'
    assert captured['job_id'] == submission.ai_audit_job.id
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
PYTHONPATH=backend pytest backend/tests/test_submissions_api.py::test_submit_enqueues_ai_job_and_returns_queued_status -q
```
Expected: FAIL because submit still executes the AI audit synchronously and returns `aiDecision` immediately.

- [ ] **Step 3: Implement the queue handoff**

`backend/app/services/ai_audit.py`
```python
def build_config_snapshot(task: Task) -> dict:
    config = task.ai_audit_config
    if config is None:
        return {
            'promptTemplate': task.ai_prompt_template or '',
            'scoreDimensions': task.ai_score_dimensions_json or [],
            'passThreshold': task.ai_pass_threshold or 3,
            'configVersion': 1,
        }
    return {
        'promptTemplate': config.prompt_template,
        'scoreDimensions': config.score_dimensions_json,
        'passThreshold': config.pass_threshold,
        'configVersion': config.config_version,
    }
```

`backend/app/services/ai_job_runner.py`
```python
from app.core.celery_app import celery_app


@celery_app.task(name='labelhub.ai.run_job')
def run_ai_audit_job(job_id: int) -> None:
    process_ai_audit_job(job_id)


def enqueue_ai_audit_job(job_id: int) -> str:
    async_result = run_ai_audit_job.delay(job_id)
    return async_result.id
```

`backend/app/api/routes/submissions.py`
```python
from app.models import AIAuditJob, AIAuditResult, Assignment, Submission, TemplateVersion, utc_now
from app.services.ai_audit import build_config_snapshot
from app.services.ai_job_runner import enqueue_ai_audit_job
```

```python
if job is None:
    job = AIAuditJob(submission=submission, attempt_count=0, max_attempts=settings.ai_max_attempts)
    db.add(job)

job.status = 'queued'
job.max_attempts = settings.ai_max_attempts
job.error_message = None
job.error_code = None
job.started_at = None
job.finished_at = None
job.config_snapshot_json = build_config_snapshot(submission.task)
job.prompt_snapshot = None
job.raw_response = None
submission.status = 'submitted'
db.commit()
db.refresh(submission)

celery_task_id = enqueue_ai_audit_job(job.id)
job.celery_task_id = celery_task_id
db.commit()

audit_payload = {
    'assignmentId': submission.assignment_id,
    'aiJobId': job.id,
    'celeryTaskId': celery_task_id,
}
write_audit_log(db, event_type='submission_submitted', entity_type='submission', entity_id=submission.id, actor_user_id=user.id, payload=audit_payload)
write_audit_log(db, event_type='ai_job_queued', entity_type='ai_audit_job', entity_id=job.id, actor_user_id=None, payload={'submissionId': submission.id})

return success({
    'submissionId': submission.id,
    'status': submission.status,
    'submittedAt': submission.updated_at,
    'aiJobStatus': job.status,
    'aiDecision': None,
})
```

- [ ] **Step 4: Re-run the test to verify it passes**

Run:
```bash
PYTHONPATH=backend pytest backend/tests/test_submissions_api.py::test_submit_enqueues_ai_job_and_returns_queued_status -q
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ai_audit.py backend/app/services/ai_job_runner.py backend/app/api/routes/submissions.py backend/tests/test_submissions_api.py
git commit -m "feat: enqueue ai audit jobs via celery"
```

---

### Task 4: 实现 worker 成功路径，保存 snapshot / raw response / AI result

**Files:**
- Modify: `backend/app/services/ai_job_runner.py`
- Modify: `backend/app/services/ai_audit.py`
- Modify: `backend/tests/test_submissions_api.py`
- Create: `backend/tests/test_ai_queue_flow.py`

- [ ] **Step 1: Write the failing worker success-path test**

```python
from app.services.ai_executor import AIExecutionResult
from app.services.ai_job_runner import process_ai_audit_job


def test_process_ai_audit_job_persists_result_and_marks_submission_ai_passed(db_session, seed_users, monkeypatch):
    submission = seed_submission_graph(db_session, seed_users)
    job = AIAuditJob(submission_id=submission.id, status='queued', max_attempts=2, config_snapshot_json={
        'promptTemplate': '请审查：{answers}',
        'scoreDimensions': [{'key': 'quality', 'label': '质量'}],
        'passThreshold': 4,
        'configVersion': 2,
    })
    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)

    class FakeExecutor:
        def execute(self, answers, prompt_template=None, score_dimensions=None, pass_threshold=None):
            return AIExecutionResult(
                scores=[{'dimension': 'quality', 'score': 4, 'reason': '内容完整'}],
                decision='pass',
                summary='通过 AI 预审。',
            )

    monkeypatch.setattr('app.services.ai_job_runner.build_executor', lambda: FakeExecutor())

    process_ai_audit_job(job.id)

    db_session.refresh(job)
    db_session.refresh(submission)
    assert job.status == 'succeeded'
    assert job.prompt_snapshot is not None
    assert submission.status == 'ai_passed'
    assert submission.ai_audit_result is not None
    assert submission.ai_audit_result.config_version == 2
    assert submission.ai_audit_result.decision == 'pass'
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
PYTHONPATH=backend pytest backend/tests/test_ai_queue_flow.py::test_process_ai_audit_job_persists_result_and_marks_submission_ai_passed -q
```
Expected: FAIL because `process_ai_audit_job()` does not exist and nothing writes `succeeded` or `prompt_snapshot`.

- [ ] **Step 3: Implement the worker success path**

`backend/app/services/ai_job_runner.py`
```python
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.models import AIAuditJob, Submission, utc_now
from app.services.ai_audit import build_failed_human_review_result, map_execution_result_to_submission_status, persist_ai_audit_result
from app.services.ai_executor import DeepSeekAIExecutor, LocalRuleAIExecutor
from app.services.audit_log import write_audit_log


def build_executor():
    return DeepSeekAIExecutor() if settings.ai_provider == 'deepseek' else LocalRuleAIExecutor()


def render_prompt(snapshot: dict, answers: dict) -> str:
    prompt_template = snapshot.get('promptTemplate') or '请审查：{answers}'
    pass_threshold = snapshot.get('passThreshold') or 3
    return prompt_template.format(pass_threshold=pass_threshold, answers=answers)


def process_ai_audit_job(job_id: int) -> None:
    db: Session = SessionLocal()
    try:
        job = db.get(AIAuditJob, job_id)
        if job is None or job.status not in {'queued', 'running'}:
            return

        submission = job.submission
        snapshot = job.config_snapshot_json or {}
        executor = build_executor()
        job.status = 'running'
        job.started_at = utc_now()
        job.attempt_count = (job.attempt_count or 0) + 1
        write_audit_log(db, event_type='ai_job_started', entity_type='ai_audit_job', entity_id=job.id, actor_user_id=None, payload={'submissionId': submission.id, 'attempt': job.attempt_count})
        db.commit()

        execution_result = executor.execute(
            submission.answers_json,
            prompt_template=snapshot.get('promptTemplate'),
            score_dimensions=snapshot.get('scoreDimensions'),
            pass_threshold=snapshot.get('passThreshold'),
        )
        job.prompt_snapshot = render_prompt(snapshot, submission.answers_json)
        job.raw_response = json.dumps(execution_result.__dict__, ensure_ascii=False)
        job.status = 'succeeded'
        job.error_message = None
        job.error_code = None
        job.finished_at = utc_now()
        persist_ai_audit_result(db, submission, job, execution_result, validation_status='valid')
        submission.status = map_execution_result_to_submission_status(execution_result.decision)
        write_audit_log(db, event_type='ai_audit_succeeded', entity_type='submission', entity_id=submission.id, actor_user_id=None, payload={'jobId': job.id, 'decision': execution_result.decision})
        db.commit()
    finally:
        db.close()
```

`backend/app/services/ai_audit.py`
```python
def map_execution_result_to_submission_status(ai_decision: str) -> str:
    if ai_decision == 'reject':
        return 'needs_revision'
    if ai_decision in {'pass', 'human_review'}:
        return 'ai_passed'
    raise RuntimeError(f'unsupported ai decision: {ai_decision}')
```

```python
def persist_ai_audit_result(db: Session, submission: Submission, job: AIAuditJob, execution_result: AIExecutionResult, validation_status: str) -> AIAuditResult:
    result = submission.ai_audit_result or AIAuditResult(job=job, submission=submission)
    snapshot = job.config_snapshot_json or {}
    result.scores_json = execution_result.scores
    result.decision = execution_result.decision
    result.summary = execution_result.summary
    result.prompt_snapshot = job.prompt_snapshot
    result.raw_response = job.raw_response
    result.validation_status = validation_status
    result.config_version = snapshot.get('configVersion', 1)
    db.add(result)
    return result
```

- [ ] **Step 4: Re-run the success-path test**

Run:
```bash
PYTHONPATH=backend pytest backend/tests/test_ai_queue_flow.py::test_process_ai_audit_job_persists_result_and_marks_submission_ai_passed -q
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ai_job_runner.py backend/app/services/ai_audit.py backend/tests/test_ai_queue_flow.py backend/tests/test_submissions_api.py
git commit -m "feat: persist ai audit worker success path"
```

---

### Task 5: 补齐 retry、幂等与人工兜底

**Files:**
- Modify: `backend/app/services/ai_job_runner.py`
- Modify: `backend/app/api/routes/submissions.py`
- Modify: `backend/tests/test_ai_queue_flow.py`
- Modify: `backend/tests/test_submissions_api.py`

- [ ] **Step 1: Write the failing retry and idempotency tests**

`backend/tests/test_ai_queue_flow.py`
```python
def test_process_ai_audit_job_retries_then_falls_back_to_human_review(db_session, seed_users, monkeypatch):
    submission = seed_submission_graph(db_session, seed_users)
    job = AIAuditJob(submission_id=submission.id, status='queued', max_attempts=2, config_snapshot_json={'promptTemplate': '请审查：{answers}', 'scoreDimensions': [], 'passThreshold': 3, 'configVersion': 1})
    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)

    class FailingExecutor:
        def execute(self, answers, prompt_template=None, score_dimensions=None, pass_threshold=None):
            raise RuntimeError('deepseek request failed: timeout')

    monkeypatch.setattr('app.services.ai_job_runner.build_executor', lambda: FailingExecutor())

    process_ai_audit_job(job.id)
    db_session.refresh(job)
    assert job.status == 'queued'
    assert job.attempt_count == 1

    process_ai_audit_job(job.id)
    db_session.refresh(job)
    db_session.refresh(submission)
    assert job.status == 'fallback_human_review'
    assert submission.ai_audit_result.decision == 'human_review'
    assert submission.status == 'ai_passed'
```

`backend/tests/test_submissions_api.py`
```python
def test_submit_reuses_existing_queued_job_for_same_submission(client, db_session, seed_users, monkeypatch):
    submission = seed_submission_graph(db_session, seed_users)
    existing_job = AIAuditJob(submission_id=submission.id, status='queued', max_attempts=2, config_snapshot_json={'promptTemplate': '', 'scoreDimensions': [], 'passThreshold': 3, 'configVersion': 1})
    db_session.add(existing_job)
    db_session.commit()
    db_session.refresh(existing_job)

    monkeypatch.setattr('app.api.routes.submissions.enqueue_ai_audit_job', lambda job_id: 'same-job')

    response = client.post(
        f'/api/v1/submissions/{submission.id}/submit',
        headers={'X-Demo-User': 'labeler_demo'},
        json={},
    )

    assert response.status_code == 200
    jobs = db_session.query(AIAuditJob).filter(AIAuditJob.submission_id == submission.id).all()
    assert len(jobs) == 1
    assert jobs[0].id == existing_job.id
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
PYTHONPATH=backend pytest backend/tests/test_ai_queue_flow.py::test_process_ai_audit_job_retries_then_falls_back_to_human_review -q
PYTHONPATH=backend pytest backend/tests/test_submissions_api.py::test_submit_reuses_existing_queued_job_for_same_submission -q
```
Expected: FAIL because the worker has no retry/fallback logic and submit does not reuse queued jobs.

- [ ] **Step 3: Implement retry, idempotency, and fallback**

`backend/app/api/routes/submissions.py`
```python
job = submission.ai_audit_job
if job and job.status in {'queued', 'running'}:
    return success({
        'submissionId': submission.id,
        'status': submission.status,
        'submittedAt': submission.updated_at,
        'aiJobStatus': job.status,
        'aiDecision': None,
    })

if job is None:
    job = AIAuditJob(submission=submission, attempt_count=0, max_attempts=settings.ai_max_attempts)
    db.add(job)
```

`backend/app/services/ai_job_runner.py`
```python
except RuntimeError as exc:
    job.error_message = str(exc)
    job.error_code = 'runtime_error'
    job.finished_at = utc_now()
    if job.attempt_count < job.max_attempts:
        job.status = 'queued'
        write_audit_log(db, event_type='ai_job_retried', entity_type='ai_audit_job', entity_id=job.id, actor_user_id=None, payload={'submissionId': submission.id, 'attempt': job.attempt_count, 'errorMessage': str(exc)})
        db.commit()
        return

    fallback_result = build_failed_human_review_result(str(exc))
    job.prompt_snapshot = render_prompt(snapshot, submission.answers_json)
    job.raw_response = str(exc)
    job.status = 'fallback_human_review'
    persist_ai_audit_result(db, submission, job, fallback_result, validation_status='fallback')
    submission.status = map_execution_result_to_submission_status(fallback_result.decision)
    write_audit_log(db, event_type='ai_audit_fallback_human_review', entity_type='submission', entity_id=submission.id, actor_user_id=None, payload={'jobId': job.id, 'errorMessage': str(exc)})
    db.commit()
```

- [ ] **Step 4: Re-run the retry and idempotency tests**

Run:
```bash
PYTHONPATH=backend pytest backend/tests/test_ai_queue_flow.py::test_process_ai_audit_job_retries_then_falls_back_to_human_review -q
PYTHONPATH=backend pytest backend/tests/test_submissions_api.py::test_submit_reuses_existing_queued_job_for_same_submission -q
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ai_job_runner.py backend/app/api/routes/submissions.py backend/tests/test_ai_queue_flow.py backend/tests/test_submissions_api.py
git commit -m "feat: add ai audit retry idempotency and fallback"
```

---

### Task 6: 做满 Owner 统计与数据集题目预览

**Files:**
- Modify: `backend/app/api/routes/tasks.py`
- Modify: `backend/tests/test_tasks_api.py`
- Modify: `frontend/src/services/api/datasets.ts`
- Modify: `frontend/src/types/domain.ts`
- Modify: `frontend/src/pages/owner/tasks/OwnerTasksPage.tsx`
- Modify: `frontend/src/pages/owner/tasks/OwnerTasksPage.test.tsx`

- [ ] **Step 1: Write the failing metrics and preview tests**

`backend/tests/test_tasks_api.py`
```python
def test_list_tasks_returns_item_progress_metrics(client, db_session, seed_users):
    submission = seed_submission_graph(db_session, seed_users)
    submission.status = 'review_passed'
    db_session.commit()

    response = client.get('/api/v1/tasks', headers={'X-Demo-User': 'owner_demo'})
    assert response.status_code == 200
    item = response.json()['data']['items'][0]
    assert item['itemCount'] == 1
    assert item['completedItemCount'] == 1
    assert item['passedItemCount'] == 1
    assert item['passRate'] == 100
```

`frontend/src/pages/owner/tasks/OwnerTasksPage.test.tsx`
```tsx
it('opens dataset item preview for the selected task', async () => {
  const user = userEvent.setup()
  renderOwnerTasksPage()

  expect(await screen.findByText('Demo Multi Item Task')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '预览题目' }))

  expect(await screen.findByText('数据集题目预览')).toBeInTheDocument()
  expect(screen.getByText('item-001')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
PYTHONPATH=backend pytest backend/tests/test_tasks_api.py::test_list_tasks_returns_item_progress_metrics -q
npm --prefix frontend test -- --run src/pages/owner/tasks/OwnerTasksPage.test.tsx
```
Expected: FAIL because `/tasks` does not return the aggregate metrics, and OwnerTasksPage has no preview interaction.

- [ ] **Step 3: Implement task metrics and dataset preview**

`backend/app/api/routes/tasks.py`
```python
from sqlalchemy import func


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
    pending = db.query(func.count(Submission.id)).filter(Submission.task_id == task.id, Submission.status.in_(['submitted', 'ai_passed'])).scalar() or 0
    pass_rate = int((passed / total) * 100) if total else 0
    return {
        'itemCount': total,
        'completedItemCount': completed,
        'passedItemCount': passed,
        'pendingReviewCount': pending,
        'passRate': pass_rate,
    }
```

```python
def task_to_dict(db: Session, task: Task) -> dict:
    metrics = build_task_metrics(db, task)
    return {
        'id': task.id,
        'title': task.title,
        'description': task.description,
        'status': task.status,
        'quota': task.quota,
        'deadline': task.deadline,
        'templateId': task.active_template_id,
        'datasetId': task.dataset_id,
        **metrics,
        'aiConfig': serialize_ai_config(task),
        'createdBy': task.owner_id,
        'createdAt': task.created_at,
        'updatedAt': task.updated_at,
    }
```

`frontend/src/services/api/datasets.ts`
```ts
type DatasetItemPreview = {
  id: number
  itemIndex: number
  sourceJson: Record<string, unknown>
}

type DatasetItemListResponse = {
  dataset: DatasetSummary
  items: DatasetItemPreview[]
  total: number
  page: number
  pageSize: number
}

export async function listDatasetItems(datasetId: number, keyword = '') {
  return apiGet<DatasetItemListResponse>(`/datasets/${datasetId}/items`, {
    keyword,
    page: 1,
    pageSize: 10,
  })
}
```

`frontend/src/pages/owner/tasks/OwnerTasksPage.tsx`
```tsx
const [previewTask, setPreviewTask] = useState<OwnerTask | null>(null)
const [previewItems, setPreviewItems] = useState<Array<{ id: number; itemIndex: number; sourceJson: Record<string, unknown> }>>([])
const [previewLoading, setPreviewLoading] = useState(false)
```

```tsx
async function openDatasetPreview(task: OwnerTask) {
  if (!task.datasetId) {
    return
  }
  setPreviewTask(task)
  setPreviewLoading(true)
  try {
    const result = await listDatasetItems(task.datasetId)
    setPreviewItems(result.items)
  } finally {
    setPreviewLoading(false)
  }
}
```

```tsx
<div className="meta-row">
  <span>题量：{task.itemCount ?? 0}</span>
  <span>已完成：{task.completedItemCount ?? 0}</span>
  <span>通过率：{task.passRate ?? 0}%</span>
</div>
<button type="button" onClick={() => void openDatasetPreview(task)} disabled={!task.datasetId}>
  预览题目
</button>
```

```tsx
{previewTask ? (
  <article className="card">
    <h3>数据集题目预览</h3>
    <p>{previewTask.title}</p>
    {previewLoading ? <p>题目加载中...</p> : previewItems.map((item) => <p key={item.id}>{`item-${String(item.itemIndex).padStart(3, '0')}`}</p>)}
    <button type="button" onClick={() => setPreviewTask(null)}>关闭预览</button>
  </article>
) : null}
```

- [ ] **Step 4: Re-run the metrics and preview tests**

Run:
```bash
PYTHONPATH=backend pytest backend/tests/test_tasks_api.py::test_list_tasks_returns_item_progress_metrics -q
npm --prefix frontend test -- --run src/pages/owner/tasks/OwnerTasksPage.test.tsx
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/tasks.py backend/tests/test_tasks_api.py frontend/src/services/api/datasets.ts frontend/src/types/domain.ts frontend/src/pages/owner/tasks/OwnerTasksPage.tsx frontend/src/pages/owner/tasks/OwnerTasksPage.test.tsx
git commit -m "feat: add owner task metrics and dataset preview"
```

---

### Task 7: 做满 Labeler 多题工作台状态、autosave 提示和未完成题汇总

**Files:**
- Modify: `backend/app/api/routes/workbench.py`
- Modify: `backend/tests/test_workbench_api.py`
- Modify: `frontend/src/types/domain.ts`
- Modify: `frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.tsx`
- Modify: `frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.test.tsx`

- [ ] **Step 1: Write the failing workbench tests**

`backend/tests/test_workbench_api.py`
```python
def test_workbench_items_include_item_status_and_last_saved_at(client, db_session, seed_users):
    submission = seed_submission_graph(db_session, seed_users)
    submission.status = 'needs_revision'
    db_session.commit()

    response = client.get(f'/api/v1/workbench/items?assignmentId={submission.assignment_id}', headers={'X-Demo-User': 'labeler_demo'})
    assert response.status_code == 200
    item = response.json()['data']['items'][0]
    assert item['draftSubmission']['statusLabel'] == 'needs_revision'
    assert item['draftSubmission']['savedAt'] is not None
```

`frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.test.tsx`
```tsx
it('shows autosave time, item status, and incomplete summary', async () => {
  const user = userEvent.setup()
  renderLabelerWorkbenchPage('/labeler/workbench?assignmentId=101')

  expect(await screen.findByText('第 1 / 3 题')).toBeInTheDocument()
  expect(screen.getByText('状态：待修改')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '保存草稿' }))
  expect(await screen.findByText(/已自动保存于/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '提交当前题' }))
  expect(await screen.findByText(/仍有未完成题目：第 2 题、第 3 题/)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
PYTHONPATH=backend pytest backend/tests/test_workbench_api.py::test_workbench_items_include_item_status_and_last_saved_at -q
npm --prefix frontend test -- --run src/pages/labeler/workbench/LabelerWorkbenchPage.test.tsx
```
Expected: FAIL because the API does not provide `statusLabel` / `savedAt`, and the page has no autosave timestamp or full-task summary.

- [ ] **Step 3: Implement the item status contract and UI feedback**

`backend/app/api/routes/workbench.py`
```python
def map_workbench_status(submission: Submission | None) -> str:
    if submission is None:
        return 'not_started'
    if submission.status == 'draft':
        return 'draft'
    if submission.status == 'submitted':
        return 'submitted'
    if submission.ai_audit_job and submission.ai_audit_job.status in {'queued', 'running'}:
        return 'ai_reviewing'
    if submission.status == 'needs_revision':
        return 'needs_revision'
    if submission.status == 'review_passed':
        return 'review_passed'
    return 'submitted'
```

```python
draft_submission = None
if submission:
    draft_submission = {
        'submissionId': submission.id,
        'status': submission.status,
        'statusLabel': map_workbench_status(submission),
        'answers': submission.answers_json,
        'savedAt': submission.updated_at,
        'aiJobStatus': submission.ai_audit_job.status if submission.ai_audit_job else None,
        'latestRejectReason': get_latest_reject_reason(submission),
    }
```

`frontend/src/types/domain.ts`
```ts
export type WorkbenchItemStatus = 'not_started' | 'draft' | 'submitted' | 'ai_reviewing' | 'needs_revision' | 'review_passed'
```

`frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.tsx`
```tsx
const [autosaveMessage, setAutosaveMessage] = useState('')
```

```tsx
function statusText(status: WorkbenchItemStatus | undefined) {
  if (status === 'draft') return '草稿'
  if (status === 'submitted') return '待 AI 处理'
  if (status === 'ai_reviewing') return 'AI 审核中'
  if (status === 'needs_revision') return '待修改'
  if (status === 'review_passed') return '已通过'
  return '未开始'
}
```

```tsx
setAutosaveMessage(`已自动保存于 ${new Date(result.savedAt).toLocaleTimeString('zh-CN', { hour12: false })}`)
setFeedback('草稿已保存')
```

```tsx
const incompleteItems = items
  .map((item, index) => ({ item, index }))
  .filter(({ item }) => validateAnswersForItem(item).length > 0)
  .map(({ index }) => `第 ${index + 1} 题`)

if (incompleteItems.length > 0) {
  setErrors([`仍有未完成题目：${incompleteItems.join('、')}`])
}
```

```tsx
<button type="button" onClick={() => void handleSubmit()} disabled={savingDraft || submitting}>
  {submitting ? '提交中...' : revisionReason ? '重新提交当前题' : '提交当前题'}
</button>
<p>{`状态：${statusText(currentItem.draftStatus)}`}</p>
{autosaveMessage ? <p className="feedback-message">{autosaveMessage}</p> : null}
```

- [ ] **Step 4: Re-run the workbench tests**

Run:
```bash
PYTHONPATH=backend pytest backend/tests/test_workbench_api.py::test_workbench_items_include_item_status_and_last_saved_at -q
npm --prefix frontend test -- --run src/pages/labeler/workbench/LabelerWorkbenchPage.test.tsx
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/workbench.py backend/tests/test_workbench_api.py frontend/src/types/domain.ts frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.tsx frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.test.tsx
git commit -m "feat: finish labeler multi-item workbench state flow"
```

---

### Task 8: 做满 Reviewer 多题列表、筛选与批量审核入口

**Files:**
- Modify: `backend/app/api/routes/reviews.py`
- Modify: `backend/tests/test_reviews_api.py`
- Modify: `frontend/src/types/domain.ts`
- Modify: `frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.tsx`
- Modify: `frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.test.tsx`

- [ ] **Step 1: Write the failing reviewer tests**

`backend/tests/test_reviews_api.py`
```python
def test_pending_reviews_supports_task_filter_and_bulk_approve(client, db_session, seed_users):
    first = seed_reviewable_submission(db_session, seed_users)
    second = seed_reviewable_submission(db_session, seed_users)

    pending = client.get(f'/api/v1/reviews/pending?taskId={first.task_id}', headers={'X-Demo-User': 'reviewer_demo'})
    assert pending.status_code == 200
    assert all(item['taskId'] == first.task_id for item in pending.json()['data']['items'])

    approve = client.post(
        '/api/v1/reviews/bulk/approve',
        headers={'X-Demo-User': 'reviewer_demo'},
        json={'submissionIds': [first.id, second.id], 'comment': '批量通过'},
    )
    assert approve.status_code == 200
    statuses = [db_session.get(Submission, first.id).status, db_session.get(Submission, second.id).status]
    assert statuses == ['review_passed', 'review_passed']
```

`frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.test.tsx`
```tsx
it('filters pending items and triggers bulk approve', async () => {
  const user = userEvent.setup()
  renderReviewerReviewsPage()

  expect(await screen.findByText('待审 2 项')).toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('任务筛选'), '38')
  await user.click(screen.getAllByRole('checkbox', { name: '选择待审项' })[0])
  await user.click(screen.getByRole('button', { name: '批量通过' }))

  expect(fetchMock).toHaveBeenCalledWith(
    '/reviews/bulk/approve',
    'POST',
    { submissionIds: [501], comment: '批量通过' },
  )
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
PYTHONPATH=backend pytest backend/tests/test_reviews_api.py::test_pending_reviews_supports_task_filter_and_bulk_approve -q
npm --prefix frontend test -- --run src/pages/reviewer/reviews/ReviewerReviewsPage.test.tsx
```
Expected: FAIL because the API has no filters/bulk endpoint and the page has no checkboxes or bulk button.

- [ ] **Step 3: Implement filters, correct item source, and bulk approve**

`backend/app/api/routes/reviews.py`
```python
class ReviewBulkApproveRequest(BaseModel):
    submissionIds: list[int]
    comment: str = ''
```

```python
@router.get('/pending')
def list_pending_reviews(taskId: int | None = None, aiDecision: str | None = None, keyword: str | None = None, authorization: str | None = Header(default=None), x_demo_user: str | None = Header(default=None), db: Session = Depends(get_db)) -> dict:
    user = get_demo_user(db, authorization, x_demo_user, default_username='reviewer_demo')
    require_role(user, {'reviewer'})

    query = db.query(Submission).filter(Submission.status.in_(['submitted', 'ai_passed']))
    if taskId is not None:
        query = query.filter(Submission.task_id == taskId)

    submissions = query.order_by(Submission.updated_at.desc()).all()
    items = []
    for submission in submissions:
        ai_result = get_ai_result(submission.id, db)
        if aiDecision and ai_result['decision'] != aiDecision:
            continue
        if keyword:
            haystack = f"{submission.task.title} {submission.user.display_name}".lower()
            if keyword.lower() not in haystack:
                continue
        items.append({
            'submissionId': submission.id,
            'taskId': submission.task_id,
            'itemId': submission.dataset_item_id,
            'labelerName': submission.user.display_name,
            'taskTitle': submission.task.title,
            'aiDecision': ai_result['decision'],
            'submissionStatus': submission.status,
            'submittedAt': submission.updated_at,
        })
    return success({'items': items, 'total': len(items)})
```

```python
@router.post('/bulk/approve')
def approve_reviews_in_bulk(payload: ReviewBulkApproveRequest, authorization: str | None = Header(default=None), x_demo_user: str | None = Header(default=None), db: Session = Depends(get_db)) -> dict:
    user = get_demo_user(db, authorization, x_demo_user, default_username='reviewer_demo')
    require_role(user, {'reviewer'})
    updated_ids: list[int] = []
    for submission_id in payload.submissionIds:
        submission = db.get(Submission, submission_id)
        if submission and reviewable_status(submission.status):
            submission.status = 'review_passed'
            db.add(ReviewRecord(submission_id=submission.id, reviewer_id=user.id, decision='approve', comment=payload.comment, reason=''))
            write_audit_log(db, event_type='review_approved', entity_type='submission', entity_id=submission.id, actor_user_id=user.id, payload={'reviewerId': user.id, 'comment': payload.comment, 'bulk': True})
            updated_ids.append(submission.id)
    db.commit()
    return success({'submissionIds': updated_ids, 'status': 'review_passed'})
```

```python
source = submission.dataset_item.source_json if submission.dataset_item else {'source_text': submission.task.description or '当前任务暂无原文内容。'}
```

`frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.tsx`
```tsx
const [selectedIds, setSelectedIds] = useState<number[]>([])
const [taskFilter, setTaskFilter] = useState('')
```

```tsx
function toggleSelected(submissionId: number) {
  setSelectedIds((current) =>
    current.includes(submissionId)
      ? current.filter((id) => id !== submissionId)
      : [...current, submissionId],
  )
}
```

```tsx
async function handleBulkApprove() {
  if (selectedIds.length === 0) {
    return
  }
  setActionLoading(true)
  try {
    await apiPost('/reviews/bulk/approve', { submissionIds: selectedIds, comment: '批量通过' })
    setPendingItems((items) => items.filter((item) => !selectedIds.includes(item.submissionId)))
    setSelectedIds([])
    setFeedback('已批量通过所选待审项。')
  } finally {
    setActionLoading(false)
  }
}
```

```tsx
<label className="form-field">
  <span>任务筛选</span>
  <select aria-label="任务筛选" value={taskFilter} onChange={(event) => setTaskFilter(event.target.value)}>
    <option value="">全部任务</option>
    {Array.from(new Set(pendingItems.map((item) => item.taskId))).map((taskId) => (
      <option key={taskId} value={String(taskId)}>{taskId}</option>
    ))}
  </select>
</label>
<button type="button" onClick={() => void handleBulkApprove()} disabled={selectedIds.length === 0 || actionLoading}>批量通过</button>
```

```tsx
<input
  aria-label="选择待审项"
  type="checkbox"
  checked={selectedIds.includes(item.submissionId)}
  onChange={() => toggleSelected(item.submissionId)}
/>
```

- [ ] **Step 4: Re-run the reviewer tests**

Run:
```bash
PYTHONPATH=backend pytest backend/tests/test_reviews_api.py::test_pending_reviews_supports_task_filter_and_bulk_approve -q
npm --prefix frontend test -- --run src/pages/reviewer/reviews/ReviewerReviewsPage.test.tsx
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/reviews.py backend/tests/test_reviews_api.py frontend/src/types/domain.ts frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.tsx frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.test.tsx
git commit -m "feat: finish reviewer multi-item filters and bulk entry"
```

---

### Task 9: 跑全量验证、补运行说明、同步路线图和上下文

**Files:**
- Modify: `README.md`
- Modify: `PLANROAD-A.md`
- Modify: `PLANROAD-B.md`
- Modify: `.claude/context/progress-A.md`
- Modify: `.claude/context/decisions-A.md`
- Modify: `.claude/context/architecture-A.md`

- [ ] **Step 1: Write the verification checklist into the docs task note**

```markdown
- [ ] Owner 能保存 Prompt 模板、评分维度、通过阈值
- [ ] submit 返回 aiJobStatus=queued，不同步返回 AI 结论
- [ ] Celery worker 能把 queued job 推进到 succeeded / fallback_human_review
- [ ] Labeler 工作台显示题目状态、自动保存时间、未完成题汇总
- [ ] Owner 看见题量、已完成、通过率，并能预览数据集题目
- [ ] Reviewer 能筛选 item 列表并执行批量通过
- [ ] PLANROAD / progress / README 与真实能力一致
```

- [ ] **Step 2: Run the focused automated tests**

Run:
```bash
PYTHONPATH=backend pytest backend/tests/test_database_schema.py backend/tests/test_tasks_api.py backend/tests/test_submissions_api.py backend/tests/test_ai_queue_flow.py backend/tests/test_workbench_api.py backend/tests/test_reviews_api.py -q
npm --prefix frontend test -- --run src/pages/owner/tasks/OwnerTasksPage.test.tsx src/pages/labeler/workbench/LabelerWorkbenchPage.test.tsx src/pages/reviewer/reviews/ReviewerReviewsPage.test.tsx
npm --prefix frontend run build
```
Expected: all targeted backend tests PASS, all targeted frontend tests PASS, frontend build PASS.

- [ ] **Step 3: Run the real local integration flow with Redis + Celery**

Run Redis:
```bash
docker run --rm -p 6379:6379 redis:7-alpine
```
Expected: terminal shows `Ready to accept connections`.

Run API:
```bash
cd backend && PYTHONPATH=. uvicorn app.main:app --reload
```
Expected: FastAPI starts with no import errors.

Run worker:
```bash
cd backend && PYTHONPATH=. python -m celery -A app.core.celery_app.celery_app worker --loglevel=INFO
```
Expected: worker registers `labelhub.ai.run_job`.

Run frontend:
```bash
npm --prefix frontend run dev
```
Expected: Vite dev server starts and Owner/Labeler/Reviewer pages load.

- [ ] **Step 4: Update docs and roadmap truthfully**

`README.md`
```md
## 本地异步 AI 审核启动
1. 启动 Redis：`docker run --rm -p 6379:6379 redis:7-alpine`
2. 启动后端：`cd backend && PYTHONPATH=. uvicorn app.main:app --reload`
3. 启动 Celery Worker：`cd backend && PYTHONPATH=. python -m celery -A app.core.celery_app.celery_app worker --loglevel=INFO`
4. 启动前端：`npm --prefix frontend run dev`
```

`PLANROAD-A.md`
```md
- [x] 展示每题的草稿、已提交、打回、通过状态
- [x] 支持自动保存提示
- [x] Owner 任务详情页展示数据集题目数量、完成数量、通过率
- [x] Owner 增加数据集题目预览页
- [x] Reviewer 审核页支持多题列表、筛选和批量操作入口
```

`PLANROAD-B.md`
```md
- [x] 新增 AI 审核配置表（如 `ai_audit_configs`）
- [x] 支持任务级 Prompt 模板配置
- [x] 支持任务级评分维度配置
- [x] 支持通过阈值配置
- [x] 保存 AI 调用时使用的原始 prompt
- [x] 保存 AI 原始响应
- [x] 引入 Celery / Redis 异步任务队列
- [x] AI job 状态从 `queued` → `running` → `succeeded` / `fallback_human_review`
- [x] 实现失败重试
- [x] 实现幂等控制
- [x] 增加人工兜底路径
```

`.claude/context/progress-A.md`
```md
- 阶段 2 严格收口完成：B2 已切为 Celery/Redis 异步 AI 审核流水线，A2 已补齐 Owner/Labeler/Reviewer 的多题任务完整视图。
- 新增验证证据：后端 queue/workbench/reviews/tasks 定向测试通过，前端 owner/workbench/reviewer 定向测试通过，frontend build 通过，Redis + Celery 本地真链路回放通过。
```

- [ ] **Step 5: Commit**

```bash
git add README.md PLANROAD-A.md PLANROAD-B.md .claude/context/progress-A.md .claude/context/decisions-A.md .claude/context/architecture-A.md
git commit -m "docs: sync stage2 full closure verification"
```

---

## Self-Review

### 1. Spec coverage
- **B2 AI 配置表 / Prompt 模板 / 评分维度 / 阈值** → Task 1, Task 2
- **Celery / Redis 异步队列** → Task 1, Task 3
- **原始 prompt / raw response 落库** → Task 4
- **重试 / 幂等 / 人工兜底 / 审计** → Task 5
- **Labeler 题目级状态 / 自动保存 / 未完成题汇总** → Task 7
- **Owner 题量 / 完成量 / 通过率 / 数据集题目预览** → Task 6
- **Reviewer 多题列表 / 筛选 / 批量入口** → Task 8
- **阶段 3 只预埋，不夸大已完成** → 通过 Task 9 的路线图/进度同步约束体现

### 2. Placeholder scan
- 没有使用 “TODO”“implement later”“similar to Task N”。
- 每个任务都给出了明确文件路径、测试代码、命令和最小实现片段。
- 最终联调命令已写死，不留“自己想办法启动 worker”之类空指令。

### 3. Type consistency
- 后端统一使用 `AIAuditConfig`, `config_snapshot_json`, `prompt_snapshot`, `raw_response`, `validation_status`。
- 前端统一使用 `TaskAIConfig`, `AIScoreDimension`, `WorkbenchItemStatus`。
- submit 返回字段统一为 `aiJobStatus`，不再同步返回真实 AI 结论。
- Workbench / Reviewer / Owner 的 item 级状态和聚合口径都围绕 `submission.dataset_item_id`。
