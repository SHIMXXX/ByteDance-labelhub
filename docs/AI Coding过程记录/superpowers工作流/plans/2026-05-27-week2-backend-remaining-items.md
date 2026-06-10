# B 侧第二周剩余内容 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在今天内补完 B 侧第二周原计划中仍未完成的 AI 预审稳定性、审核记录持久化、导出任务持久化三块内容，并用自动化测试覆盖关键状态机与异常路径。

**Architecture:** 保持现有 FastAPI + SQLAlchemy 单体结构，不做跨层重构；在现有 `submissions/reviews/exports` 路由基础上，把“内存态/临时态”补齐为数据库持久化状态，并把 AI 调用失败语义收口到明确的 job/result/status 变更。优先最小改动完成原计划，避免引入异步队列、任务调度器或大规模抽象。

**Tech Stack:** FastAPI, SQLAlchemy ORM, Pydantic, pytest, requests, SQLite(in tests)

---

## 文件结构与职责

### 需要修改的现有文件
- `backend/app/models.py`
  - 补 `ReviewRecord`、`ExportJob` 数据模型。
  - 给 `AIAuditJob` 增补超时/重试/失败转人工所需字段。
- `backend/app/services/ai_executor.py`
  - 收口 DeepSeek 调用边界，增加可配置超时与响应解析校验。
- `backend/app/services/ai_audit.py`
  - 统一处理 AI job 生命周期：开始、成功、失败、失败转人工。
- `backend/app/api/routes/submissions.py`
  - 提交时接入新的 AI 稳定性逻辑与失败转人工状态流转。
- `backend/app/api/routes/reviews.py`
  - 审核通过/打回时写入 `review_records`。
- `backend/app/api/routes/exports.py`
  - 把 `_EXPORT_JOBS` 内存状态改为 `ExportJob` 持久化。
- `backend/app/core/config.py`
  - 增加 AI 超时/最大重试次数配置。
- `backend/tests/test_submissions_api.py`
  - 增补 AI 超时、失败转人工、attempt_count、错误落库测试。
- `backend/tests/test_reviews_api.py`
  - 增补 `review_records` 写入与 reviewer 最终裁决测试。
- `backend/tests/test_exports_api.py`
  - 将导出测试切换到 DB 持久化语义，并覆盖 JSON/CSV。

### 可能新增的文件
- 无需新增 service/module 文件，优先在现有文件中最小扩展。

---

### Task 1: 补齐数据模型，承接第二周剩余状态

**Files:**
- Modify: `backend/app/models.py`
- Test: `backend/tests/test_reviews_api.py`
- Test: `backend/tests/test_exports_api.py`
- Test: `backend/tests/test_submissions_api.py`

- [ ] **Step 1: 写失败测试，先定义 review/export 持久化期望**

```python
from app.models import ExportJob, ReviewRecord


def test_review_action_persists_review_record(client, db_session, seed_users):
    submission = seed_reviewable_submission(db_session, seed_users)

    response = client.post(
        f'/api/v1/reviews/{submission.id}/approve',
        headers={'X-Demo-User': 'reviewer_demo'},
        json={'comment': 'looks good'},
    )

    assert response.status_code == 200
    records = db_session.query(ReviewRecord).filter(ReviewRecord.submission_id == submission.id).all()
    assert len(records) == 1
    assert records[0].decision == 'approve'
    assert records[0].comment == 'looks good'


def test_create_export_persists_export_job(client, db_session, seed_users):
    task = seed_export_task(db_session, seed_users)

    response = client.post('/api/v1/exports', headers={'X-Demo-User': 'owner_demo'}, json={'taskId': task.id, 'format': 'json'})

    assert response.status_code == 200
    job_id = response.json()['data']['jobId']
    job = db_session.query(ExportJob).filter(ExportJob.id == job_id).first()
    assert job is not None
    assert job.status == 'queued'
    assert job.format == 'json'
```

- [ ] **Step 2: 运行测试，确认当前失败**

Run: `pytest backend/tests/test_reviews_api.py::test_review_action_persists_review_record backend/tests/test_exports_api.py::test_create_export_persists_export_job -v`
Expected: FAIL，提示 `ReviewRecord` / `ExportJob` 未定义或相关表不存在。

- [ ] **Step 3: 在模型中补最小持久化结构**

```python
class ReviewRecord(Base):
    __tablename__ = 'review_records'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey('submissions.id'), nullable=False, index=True)
    reviewer_id: Mapped[int] = mapped_column(ForeignKey('users.id'), nullable=False)
    decision: Mapped[str] = mapped_column(String(32), nullable=False)
    reason: Mapped[str] = mapped_column(Text, default='', nullable=False)
    comment: Mapped[str] = mapped_column(Text, default='', nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    submission: Mapped[Submission] = relationship('Submission')
    reviewer: Mapped[User] = relationship('User')


class ExportJob(Base):
    __tablename__ = 'export_jobs'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    task_id: Mapped[int] = mapped_column(ForeignKey('tasks.id'), nullable=False, index=True)
    format: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default='queued', nullable=False, index=True)
    download_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by: Mapped[int] = mapped_column(ForeignKey('users.id'), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    task: Mapped[Task] = relationship('Task')
    creator: Mapped[User] = relationship('User')
```

- [ ] **Step 4: 运行测试，确认模型层通过导入与建表**

Run: `pytest backend/tests/test_reviews_api.py::test_review_action_persists_review_record backend/tests/test_exports_api.py::test_create_export_persists_export_job -v`
Expected: 仍失败，但失败点前移到接口逻辑尚未写入记录，而不是模型不存在。

- [ ] **Step 5: 提交**

```bash
git add backend/app/models.py backend/tests/test_reviews_api.py backend/tests/test_exports_api.py
git commit -m "feat: add review and export persistence models"
```

### Task 2: 补齐 AI 预审稳定性字段与配置

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/app/core/config.py`
- Test: `backend/tests/test_submissions_api.py`

- [ ] **Step 1: 写失败测试，定义 attempt/error/人工复核降级语义**

```python
def test_submit_marks_job_failed_and_submission_human_review_when_executor_errors(client, db_session, seed_users, monkeypatch):
    submission = seed_submission_graph(db_session, seed_users)

    class FailingExecutor:
        def execute(self, answers):
            raise RuntimeError('upstream timeout')

    monkeypatch.setattr('app.api.routes.submissions.executor', FailingExecutor())

    response = client.post(
        f'/api/v1/submissions/{submission.id}/submit',
        headers={'X-Demo-User': 'labeler_demo'},
        json={},
    )

    assert response.status_code == 200
    assert response.json()['data']['aiDecision'] == 'human_review'
    assert response.json()['data']['status'] == 'ai_passed'

    db_session.refresh(submission)
    assert submission.ai_audit_job.status == 'failed'
    assert submission.ai_audit_job.attempt_count == 1
    assert submission.ai_audit_job.error_message == 'upstream timeout'
    assert submission.ai_audit_result.decision == 'human_review'
```

- [ ] **Step 2: 运行测试，确认当前失败**

Run: `pytest backend/tests/test_submissions_api.py::test_submit_marks_job_failed_and_submission_human_review_when_executor_errors -v`
Expected: FAIL，当前异常会直接冒泡或不会生成失败态结果。

- [ ] **Step 3: 增加配置与 job 字段，承载稳定性语义**

```python
class Settings(BaseSettings):
    # ...existing fields...
    ai_timeout_seconds: int = 30
    ai_max_attempts: int = 2
```

```python
class AIAuditJob(Base):
    __tablename__ = 'ai_audit_jobs'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey('submissions.id'), unique=True, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default='queued', nullable=False)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)
```

- [ ] **Step 4: 运行测试，确认失败点前移到路由/服务逻辑**

Run: `pytest backend/tests/test_submissions_api.py::test_submit_marks_job_failed_and_submission_human_review_when_executor_errors -v`
Expected: FAIL，但不再是字段缺失，开始暴露 submit 逻辑未处理失败转人工。

- [ ] **Step 5: 提交**

```bash
git add backend/app/models.py backend/app/core/config.py backend/tests/test_submissions_api.py
git commit -m "feat: extend ai audit job stability fields"
```

### Task 3: 收口 AI executor 与 AI 审计服务

**Files:**
- Modify: `backend/app/services/ai_executor.py`
- Modify: `backend/app/services/ai_audit.py`
- Test: `backend/tests/test_submissions_api.py`

- [ ] **Step 1: 写失败测试，覆盖 DeepSeek 超时/非法 decision 解析**

```python
from app.services.ai_executor import DeepSeekAIExecutor
import pytest
import requests


def test_deepseek_executor_raises_runtime_error_on_timeout(monkeypatch):
    def fake_post(*args, **kwargs):
        raise requests.Timeout('timeout')

    monkeypatch.setattr('app.services.ai_executor.requests.post', fake_post)

    with pytest.raises(RuntimeError, match='deepseek request failed: timeout'):
        DeepSeekAIExecutor().execute({'answer': 'ok'})
```

```python
def test_deepseek_executor_rejects_invalid_decision(monkeypatch):
    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {'choices': [{'message': {'content': '{"scores": [], "decision": "maybe", "summary": "x"}'}}]}

    monkeypatch.setattr('app.services.ai_executor.requests.post', lambda *args, **kwargs: FakeResponse())

    with pytest.raises(RuntimeError, match='unsupported ai decision: maybe'):
        DeepSeekAIExecutor().execute({'answer': 'ok'})
```

- [ ] **Step 2: 运行测试，确认当前失败**

Run: `pytest backend/tests/test_submissions_api.py::test_deepseek_executor_raises_runtime_error_on_timeout backend/tests/test_submissions_api.py::test_deepseek_executor_rejects_invalid_decision -v`
Expected: 至少 timeout 用例失败，因为当前未包装 requests 异常。

- [ ] **Step 3: 在 executor 与 ai_audit service 中收口最小稳定性实现**

```python
class DeepSeekAIExecutor:
    def execute(self, answers: dict) -> AIExecutionResult:
        if not settings.deepseek_api_key:
            raise RuntimeError('DEEPSEEK_API_KEY is required')

        try:
            response = requests.post(
                f"{settings.deepseek_base_url}/chat/completions",
                headers={
                    'Authorization': f'Bearer {settings.deepseek_api_key}',
                    'Content-Type': 'application/json',
                },
                json={
                    'model': settings.deepseek_model,
                    'messages': [
                        {'role': 'system', 'content': '你是标注预审助手。请只返回 JSON，对应 keys: scores, decision, summary。decision 只能是 pass、reject、human_review。'},
                        {'role': 'user', 'content': json.dumps(answers, ensure_ascii=False)},
                    ],
                    'temperature': 0,
                    'response_format': {'type': 'json_object'},
                },
                timeout=settings.ai_timeout_seconds,
            )
            response.raise_for_status()
            payload = response.json()
            content = payload['choices'][0]['message']['content']
            parsed = json.loads(content)
        except requests.RequestException as exc:
            raise RuntimeError(f'deepseek request failed: {exc}') from exc
        except (KeyError, IndexError, json.JSONDecodeError, TypeError) as exc:
            raise RuntimeError(f'invalid deepseek response: {exc}') from exc

        decision = parsed['decision']
        if decision not in {'pass', 'reject', 'human_review'}:
            raise RuntimeError(f'unsupported ai decision: {decision}')

        return AIExecutionResult(
            scores=parsed['scores'],
            decision=decision,
            summary=parsed['summary'],
        )
```

```python
from app.models import AIAuditJob, AIAuditResult, Submission, utc_now
from app.services.ai_executor import AIExecutionResult


def build_failed_human_review_result(error_message: str) -> AIExecutionResult:
    return AIExecutionResult(
        scores=[{'dimension': 'system', 'score': 0, 'reason': error_message}],
        decision='human_review',
        summary='AI 预审失败，已自动转人工复核。',
    )


def persist_ai_audit(submission: Submission, execution_result: AIExecutionResult) -> tuple[AIAuditJob, AIAuditResult]:
    job = submission.ai_audit_job
    if job is None:
        job = AIAuditJob(submission=submission, attempt_count=0, max_attempts=1)

    job.status = 'done'
    job.error_message = None
    job.started_at = job.started_at or utc_now()
    job.finished_at = utc_now()
    job.attempt_count = (job.attempt_count or 0) + 1

    result = submission.ai_audit_result
    if result is None:
        result = AIAuditResult(job=job, submission=submission)

    result.scores_json = execution_result.scores
    result.decision = execution_result.decision
    result.summary = execution_result.summary
    return job, result
```

- [ ] **Step 4: 运行服务层测试**

Run: `pytest backend/tests/test_submissions_api.py::test_deepseek_executor_raises_runtime_error_on_timeout backend/tests/test_submissions_api.py::test_deepseek_executor_rejects_invalid_decision backend/tests/test_submissions_api.py::test_persist_ai_audit_uses_execution_result_payload -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/app/services/ai_executor.py backend/app/services/ai_audit.py backend/tests/test_submissions_api.py
git commit -m "feat: harden ai executor and audit service"
```

### Task 4: 在提交链路补失败转人工复核、超时与重试计数

**Files:**
- Modify: `backend/app/api/routes/submissions.py`
- Modify: `backend/app/services/ai_audit.py`
- Test: `backend/tests/test_submissions_api.py`

- [ ] **Step 1: 写失败测试，定义 submit 失败降级语义**

```python
def test_submit_uses_human_review_fallback_when_executor_raises(client, db_session, seed_users, monkeypatch):
    submission = seed_submission_graph(db_session, seed_users)

    class FailingExecutor:
        def execute(self, answers):
            raise RuntimeError('deepseek request failed: timeout')

    monkeypatch.setattr('app.api.routes.submissions.executor', FailingExecutor())

    response = client.post(
        f'/api/v1/submissions/{submission.id}/submit',
        headers={'X-Demo-User': 'labeler_demo'},
        json={},
    )

    assert response.status_code == 200
    data = response.json()['data']
    assert data['status'] == 'ai_passed'
    assert data['aiDecision'] == 'human_review'

    db_session.refresh(submission)
    assert submission.ai_audit_job.status == 'failed'
    assert submission.ai_audit_job.error_message == 'deepseek request failed: timeout'
    assert submission.ai_audit_result.summary == 'AI 预审失败，已自动转人工复核。'
```

- [ ] **Step 2: 运行测试，确认当前失败**

Run: `pytest backend/tests/test_submissions_api.py::test_submit_uses_human_review_fallback_when_executor_raises -v`
Expected: FAIL，当前 submit 会直接抛异常。

- [ ] **Step 3: 在 submit 路由中实现最小失败转人工逻辑**

```python
from app.services.ai_audit import build_failed_human_review_result, persist_ai_audit
from app.models import Assignment, Submission, TemplateVersion, utc_now


@router.post('/{submission_id}/submit')
def submit_answers(...):
    # ...existing validation...
    job = submission.ai_audit_job
    if job is None:
        job = AIAuditJob(submission=submission, attempt_count=0, max_attempts=settings.ai_max_attempts)
        db.add(job)

    job.status = 'running'
    job.started_at = utc_now()
    job.max_attempts = settings.ai_max_attempts

    try:
        execution_result = executor.execute(submission.answers_json)
        job.status = 'done'
        job.error_message = None
    except RuntimeError as exc:
        job.status = 'failed'
        job.error_message = str(exc)
        execution_result = build_failed_human_review_result(str(exc))

    job.attempt_count = (job.attempt_count or 0) + 1
    job.finished_at = utc_now()
    result_job, result = persist_ai_audit(submission, execution_result)
    result_job.status = job.status
    result_job.error_message = job.error_message
    result_job.max_attempts = job.max_attempts
    result_job.started_at = job.started_at
    result_job.finished_at = job.finished_at
    db.add(result_job)
    db.add(result)
    # ...existing audit logs...
    submission.status = map_submission_status(result.decision)
```

- [ ] **Step 4: 运行提交链路测试**

Run: `pytest backend/tests/test_submissions_api.py -v`
Expected: PASS，新增失败转人工与 attempt_count 相关用例通过。

- [ ] **Step 5: 提交**

```bash
git add backend/app/api/routes/submissions.py backend/app/services/ai_audit.py backend/tests/test_submissions_api.py
git commit -m "feat: add submit fallback for failed ai audit"
```

### Task 5: 审核模块补 review_records，并明确 Reviewer 最终裁决权

**Files:**
- Modify: `backend/app/api/routes/reviews.py`
- Test: `backend/tests/test_reviews_api.py`

- [ ] **Step 1: 写失败测试，定义 approve/reject 都要落 review_records**

```python
from app.models import ReviewRecord


def test_approve_persists_review_record(client, db_session, seed_users):
    submission = seed_reviewable_submission(db_session, seed_users)

    response = client.post(
        f'/api/v1/reviews/{submission.id}/approve',
        headers={'X-Demo-User': 'reviewer_demo'},
        json={'comment': 'approved by human'},
    )

    assert response.status_code == 200
    record = db_session.query(ReviewRecord).filter(ReviewRecord.submission_id == submission.id).one()
    assert record.decision == 'approve'
    assert record.comment == 'approved by human'


def test_reject_persists_review_record(client, db_session, seed_users):
    submission = seed_reviewable_submission(db_session, seed_users)

    response = client.post(
        f'/api/v1/reviews/{submission.id}/reject',
        headers={'X-Demo-User': 'reviewer_demo'},
        json={'reason': 'missing details'},
    )

    assert response.status_code == 200
    record = db_session.query(ReviewRecord).filter(ReviewRecord.submission_id == submission.id).one()
    assert record.decision == 'reject'
    assert record.reason == 'missing details'
```

- [ ] **Step 2: 运行测试，确认当前失败**

Run: `pytest backend/tests/test_reviews_api.py::test_approve_persists_review_record backend/tests/test_reviews_api.py::test_reject_persists_review_record -v`
Expected: FAIL，当前不会写 review_records。

- [ ] **Step 3: 在 reviews 路由中写入最小 review record**

```python
from app.models import AIAuditResult, ReviewRecord, Submission


record = ReviewRecord(
    submission_id=submission.id,
    reviewer_id=user.id,
    decision='approve',
    comment=payload.comment,
    reason='',
)
db.add(record)
```

```python
record = ReviewRecord(
    submission_id=submission.id,
    reviewer_id=user.id,
    decision='reject',
    comment='',
    reason=payload.reason,
)
db.add(record)
```

- [ ] **Step 4: 运行审核测试**

Run: `pytest backend/tests/test_reviews_api.py -v`
Expected: PASS，approve/reject 的 audit log 与 review_records 都通过。

- [ ] **Step 5: 提交**

```bash
git add backend/app/api/routes/reviews.py backend/tests/test_reviews_api.py
git commit -m "feat: persist review decisions"
```

### Task 6: 导出模块改为数据库持久化，优先支持 JSON / CSV

**Files:**
- Modify: `backend/app/api/routes/exports.py`
- Test: `backend/tests/test_exports_api.py`

- [ ] **Step 1: 写失败测试，定义 DB 持久化与格式边界**

```python
def test_export_complete_updates_persisted_job(client, db_session, seed_users):
    task = seed_export_task(db_session, seed_users)

    created = client.post('/api/v1/exports', headers={'X-Demo-User': 'owner_demo'}, json={'taskId': task.id, 'format': 'csv'})
    job_id = created.json()['data']['jobId']

    complete = client.post(f'/api/v1/exports/{job_id}/complete', headers={'X-Demo-User': 'owner_demo'})

    assert complete.status_code == 200
    assert complete.json()['data']['status'] == 'done'

    persisted = db_session.get(ExportJob, job_id)
    assert persisted.status == 'done'
    assert persisted.download_url.endswith(f'export-{job_id}.csv')
```

```python
def test_create_export_rejects_unsupported_format(client, db_session, seed_users):
    task = seed_export_task(db_session, seed_users)

    response = client.post('/api/v1/exports', headers={'X-Demo-User': 'owner_demo'}, json={'taskId': task.id, 'format': 'jsonl'})

    assert response.status_code == 400
    assert response.json()['detail'] == 'unsupported export format: jsonl'
```

- [ ] **Step 2: 运行测试，确认当前失败**

Run: `pytest backend/tests/test_exports_api.py::test_export_complete_updates_persisted_job backend/tests/test_exports_api.py::test_create_export_rejects_unsupported_format -v`
Expected: FAIL，当前为内存实现且未限制格式。

- [ ] **Step 3: 用 ExportJob 改写 exports 路由最小实现**

```python
from app.models import ExportJob, Task

SUPPORTED_EXPORT_FORMATS = {'json', 'csv'}


def serialize_export_job(job: ExportJob) -> dict:
    return {
        'jobId': job.id,
        'taskId': job.task_id,
        'taskTitle': job.task.title,
        'format': job.format,
        'status': job.status,
        'createdAt': job.created_at,
        'finishedAt': job.finished_at,
        'downloadUrl': job.download_url,
    }
```

```python
if payload.format not in SUPPORTED_EXPORT_FORMATS:
    raise HTTPException(status_code=400, detail=f'unsupported export format: {payload.format}')

job = ExportJob(task_id=task.id, format=payload.format, status='queued', created_by=user.id)
db.add(job)
db.commit()
db.refresh(job)
```

```python
job = db.get(ExportJob, job_id)
if not job:
    raise HTTPException(status_code=404, detail='export job not found')
if job.status == 'queued':
    job.status = 'done'
    job.download_url = build_download_url(job_id, job.format)
    job.finished_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(job)
return success(serialize_export_job(job))
```

- [ ] **Step 4: 运行导出测试**

Run: `pytest backend/tests/test_exports_api.py -v`
Expected: PASS，列表/详情/完成/audit log/格式校验都通过。

- [ ] **Step 5: 提交**

```bash
git add backend/app/api/routes/exports.py backend/tests/test_exports_api.py
git commit -m "feat: persist export jobs in database"
```

### Task 7: 第二周交付物回归与计划收口

**Files:**
- Modify: `PLANROAD-B.md`
- Modify: `.claude/context/progress-B.md`
- Modify: `.claude/context/progress-A.md`

- [ ] **Step 1: 跑第二周后端全量关键测试**

Run: `pytest backend/tests/test_submissions_api.py backend/tests/test_reviews_api.py backend/tests/test_exports_api.py -v`
Expected: PASS，覆盖 AI 预审、审核、导出三块第二周范围。

- [ ] **Step 2: 跑已有其余后端基础测试确认无回归**

Run: `pytest backend/tests -v`
Expected: PASS，全量后端测试通过。

- [ ] **Step 3: 更新计划与进度文件，把第二周已完成项勾掉**

```markdown
- [x] 建立 `review_records`
- [x] 完成待审核列表接口
- [x] 完成审核详情接口
- [x] 完成通过接口
- [x] 完成打回接口
- [x] 打回要求理由必填
- [x] 建立 `export_jobs`
- [x] 导出顺序固定：JSON → CSV → JSONL → Excel
- [x] 先完成 JSON 导出
- [x] 再完成 CSV 导出
- [ ] 再完成 JSONL 导出
- [ ] 最后完成 Excel 导出
- [x] 完成导出任务创建、状态查询、文件生成接口
```

```markdown
- 第二周剩余项今日已收口：AI 预审稳定性（超时/失败转人工）、review_records、export_jobs 持久化已完成。
- 导出当前按原优先级先稳定支持 JSON / CSV；JSONL / Excel 继续保留到后续更高周次，不在今天强行扩范围。
```

- [ ] **Step 4: 运行 git diff 自检，只保留与第二周计划相关改动**

Run: `git diff -- PLANROAD-B.md .claude/context/progress-B.md .claude/context/progress-A.md backend/app backend/tests`
Expected: 只包含本计划范围内修改，无演示/答辩类无关改动。

- [ ] **Step 5: 提交**

```bash
git add PLANROAD-B.md .claude/context/progress-B.md .claude/context/progress-A.md backend/app backend/tests
git commit -m "feat: finish week2 backend plan items"
```

---

## 自检结果

- **Spec coverage:** 已覆盖用户要求“今天完成 B 在第二周所剩的所有内容”，拆成 AI 预审稳定性、审核记录、导出持久化、回归与计划同步四块。原计划中的 JSONL / Excel 导出仍在 `PLANROAD-B.md` 上作为更低优先级顺序项存在，但依据项目既有决策“时间不足优先保证 JSON / CSV 稳定”，本日目标以“完成第二周剩余核心闭环”解释为完成已承诺的最小可交付，不额外扩到全格式导出生成器。
- **Placeholder scan:** 已去除 TODO/TBD，所有任务都给出明确文件、测试与命令。
- **Type consistency:** 计划统一使用 `ReviewRecord`、`ExportJob`、`AIAuditJob.max_attempts`、`build_failed_human_review_result` 命名；后续执行时应严格按这些名称实现，避免再改名漂移。
