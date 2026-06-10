# Day 5 B Backend Acceleration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Day 4 的最小后端闭环推进为“AI 执行器可替换 + review/export 审计闭环 + 最小证明性测试”的 Day 5 加速版成果。

**Architecture:** 保持当前 FastAPI + SQLAlchemy 结构不大改，只在 `backend/app/services/` 下补一层最薄 AI executor 边界，让 `submissions.submit` 从“直接内嵌规则”变为“调用默认本地 executor 并持久化结果”。同时沿用现有 `write_audit_log` helper，把 review / export 关键事件补到审计链路里，并用最小测试证明新增行为成立。

**Tech Stack:** FastAPI, SQLAlchemy 2, Pydantic, pytest, TestClient, SQLite in-memory tests

---

## File map

- Modify: `backend/app/api/routes/submissions.py` — 继续收口 submit 路由，只保留协调逻辑
- Modify: `backend/app/api/routes/reviews.py` — 在 approve / reject 路径补 audit log
- Modify: `backend/app/api/routes/exports.py` — 在 create / status finish 路径补 audit log
- Create or Modify: `backend/app/services/ai_executor.py` — 定义最小 AI executor 接口与默认本地实现
- Modify: `backend/app/services/ai_audit.py` — 只负责持久化 job/result，不再承担决策逻辑
- Modify: `backend/app/services/audit_log.py` — 保持 helper 简单，必要时补轻量复用函数
- Modify: `backend/tests/test_submissions_api.py` — 证明 submit 通过 executor 生成持久化结果
- Modify: `backend/tests/test_reviews_api.py` — 证明 review 写入 audit log
- Modify: `backend/tests/test_exports_api.py` — 证明 export 写入 audit log
- Modify: `.claude/context/progress-B.md` — 同步 Day 5 进度
- Modify: `PLANROAD-B.md` — 只按保守口径同步状态

---

### Task 1: 抽出最薄 AI executor 边界

**Files:**
- Create: `backend/app/services/ai_executor.py`
- Modify: `backend/app/api/routes/submissions.py`
- Modify: `backend/app/services/ai_audit.py`
- Test: `backend/tests/test_submissions_api.py`

- [ ] **Step 1: 写一个失败测试，证明 submit 仍会持久化 AI 结果且走统一执行器输出**

```python
def test_submit_marks_submission_ai_passed_for_valid_answer(client, db_session, seed_users):
    submission = seed_submission_graph(db_session, seed_users)

    response = client.post(
        f'/api/v1/submissions/{submission.id}/submit',
        headers={'X-Demo-User': 'labeler_demo'},
        json={},
    )

    assert response.status_code == 200
    body = response.json()['data']
    assert body['status'] == 'ai_passed'
    assert body['aiDecision'] == 'pass'

    db_session.refresh(submission)
    assert submission.ai_audit_job is not None
    assert submission.ai_audit_job.status == 'done'
    assert submission.ai_audit_result is not None
    assert submission.ai_audit_result.decision == 'pass'
```

- [ ] **Step 2: 跑测试确认当前基线仍可复现**

Run:

```bash
python -m pytest backend/tests/test_submissions_api.py -v
```

Expected: 现有用例通过，作为后续重构保护网。

- [ ] **Step 3: 写最小 executor 文件，定义统一输入输出边界**

`backend/app/services/ai_executor.py`

```python
from dataclasses import dataclass


@dataclass
class AIExecutionResult:
    scores: list
    decision: str
    summary: str


class LocalRuleAIExecutor:
    def execute(self, answers: dict) -> AIExecutionResult:
        values = [value for value in (answers or {}).values() if value not in (None, '', [])]
        if not values:
            return AIExecutionResult(scores=[], decision='human_review', summary='答案为空，转人工审核。')

        short_text_only = all(isinstance(value, str) and len(value.strip()) < 2 for value in values)
        if short_text_only:
            return AIExecutionResult(
                scores=[{'dimension': 'completeness', 'score': 1, 'reason': 'answer too short'}],
                decision='reject',
                summary='答案过短，需要补充后再提交。',
            )

        return AIExecutionResult(
            scores=[{'dimension': 'completeness', 'score': 4, 'reason': 'answer looks valid'}],
            decision='pass',
            summary='答案已通过最小规则检查，进入后续审核。',
        )
```

- [ ] **Step 4: 让 submit 路由调用 executor，再把结果交给持久化函数**

`backend/app/api/routes/submissions.py`

```python
from app.services.ai_audit import persist_ai_audit
from app.services.ai_executor import LocalRuleAIExecutor


executor = LocalRuleAIExecutor()


# inside submit_answers
execution_result = executor.execute(submission.answers_json)
job, result = persist_ai_audit(submission, execution_result)
```

`backend/app/services/ai_audit.py`

```python
from app.models import AIAuditJob, AIAuditResult, Submission
from app.services.ai_executor import AIExecutionResult


def persist_ai_audit(submission: Submission, execution_result: AIExecutionResult) -> tuple[AIAuditJob, AIAuditResult]:
    job = AIAuditJob(submission_id=submission.id, status='done', attempt_count=1)
    result = AIAuditResult(
        submission_id=submission.id,
        job=job,
        scores_json=execution_result.scores,
        decision=execution_result.decision,
        summary=execution_result.summary,
    )
    return job, result
```

- [ ] **Step 5: 跑 submissions 测试确认 executor 边界没打坏现有闭环**

Run:

```bash
python -m pytest backend/tests/test_submissions_api.py -v
```

Expected: 全绿。

- [ ] **Step 6: 提交这一小步**

```bash
git add backend/app/services/ai_executor.py backend/app/services/ai_audit.py backend/app/api/routes/submissions.py backend/tests/test_submissions_api.py
git commit -m "feat: extract local ai executor boundary"
```

---

### Task 2: 为 review 链路补审计日志

**Files:**
- Modify: `backend/app/api/routes/reviews.py`
- Modify: `backend/tests/test_reviews_api.py`
- Test: `backend/tests/test_reviews_api.py`

- [ ] **Step 1: 写一个失败测试，证明 reject 会写 audit log**

```python
from app.models import AuditLog


def test_reject_writes_audit_log(client, db_session, seed_users):
    submission = seed_reviewable_submission(db_session, seed_users)

    response = client.post(
        f'/api/v1/reviews/{submission.id}/reject',
        headers={'X-Demo-User': 'reviewer_demo'},
        json={'reason': 'needs more detail'},
    )

    assert response.status_code == 200
    logs = db_session.query(AuditLog).filter(AuditLog.entity_id == submission.id).all()
    assert any(log.event_type == 'review_rejected' for log in logs)
```

- [ ] **Step 2: 跑测试确认它先失败**

Run:

```bash
python -m pytest backend/tests/test_reviews_api.py::test_reject_writes_audit_log -v
```

Expected: FAIL，原因是当前 review 路径还没写审计。

- [ ] **Step 3: 在 approve / reject 路径写最小审计事件**

`backend/app/api/routes/reviews.py`

```python
from app.services.audit_log import write_audit_log


write_audit_log(
    db,
    event_type='review_approved',
    entity_type='submission',
    entity_id=submission.id,
    actor_user_id=user.id,
    payload={'reviewerId': user.id},
)

write_audit_log(
    db,
    event_type='review_rejected',
    entity_type='submission',
    entity_id=submission.id,
    actor_user_id=user.id,
    payload={'reviewerId': user.id, 'reason': payload.reason},
)
```

- [ ] **Step 4: 再补一个 approve 审计测试**

```python
def test_approve_writes_audit_log(client, db_session, seed_users):
    submission = seed_reviewable_submission(db_session, seed_users)

    response = client.post(
        f'/api/v1/reviews/{submission.id}/approve',
        headers={'X-Demo-User': 'reviewer_demo'},
        json={},
    )

    assert response.status_code == 200
    logs = db_session.query(AuditLog).filter(AuditLog.entity_id == submission.id).all()
    assert any(log.event_type == 'review_approved' for log in logs)
```

- [ ] **Step 5: 跑 review 测试确认通过**

Run:

```bash
python -m pytest backend/tests/test_reviews_api.py -v
```

Expected: 全绿。

- [ ] **Step 6: 提交这一小步**

```bash
git add backend/app/api/routes/reviews.py backend/tests/test_reviews_api.py
git commit -m "feat: log review audit events"
```

---

### Task 3: 为 export 链路补审计日志

**Files:**
- Modify: `backend/app/api/routes/exports.py`
- Modify: `backend/tests/test_exports_api.py`
- Test: `backend/tests/test_exports_api.py`

- [ ] **Step 1: 写一个失败测试，证明创建导出会写 audit log**

```python
from app.models import AuditLog


def test_create_export_writes_audit_log(client, db_session, seed_users):
    response = client.post(
        '/api/v1/exports',
        headers={'X-Demo-User': 'owner_demo'},
        json={'taskId': 1, 'format': 'json'},
    )

    assert response.status_code == 200
    export_id = response.json()['data']['id']
    logs = db_session.query(AuditLog).filter(AuditLog.entity_id == export_id).all()
    assert any(log.event_type == 'export_created' for log in logs)
```

- [ ] **Step 2: 跑测试确认它先失败**

Run:

```bash
python -m pytest backend/tests/test_exports_api.py::test_create_export_writes_audit_log -v
```

Expected: FAIL，原因是当前 exports 路径未写审计。

- [ ] **Step 3: 在 create / finish 路径写最小审计事件**

`backend/app/api/routes/exports.py`

```python
from app.services.audit_log import write_audit_log


write_audit_log(
    db,
    event_type='export_created',
    entity_type='export_job',
    entity_id=job.id,
    actor_user_id=user.id,
    payload={'taskId': payload.task_id, 'format': payload.format},
)

write_audit_log(
    db,
    event_type='export_finished',
    entity_type='export_job',
    entity_id=job.id,
    actor_user_id=None,
    payload={'status': job.status},
)
```

- [ ] **Step 4: 再补一个 finish 审计测试**

```python
def test_export_detail_done_writes_finish_audit_log(client, db_session, seed_users):
    job = seed_export_job(db_session, seed_users, status='done')

    response = client.get(
        f'/api/v1/exports/{job.id}',
        headers={'X-Demo-User': 'owner_demo'},
    )

    assert response.status_code == 200
    logs = db_session.query(AuditLog).filter(AuditLog.entity_id == job.id).all()
    assert any(log.event_type == 'export_finished' for log in logs)
```

- [ ] **Step 5: 跑 export 测试确认通过**

Run:

```bash
python -m pytest backend/tests/test_exports_api.py -v
```

Expected: 全绿。

- [ ] **Step 6: 提交这一小步**

```bash
git add backend/app/api/routes/exports.py backend/tests/test_exports_api.py
git commit -m "feat: log export audit events"
```

---

### Task 4: 跑最小回归并同步 Day 5 B 侧文档

**Files:**
- Modify: `.claude/context/progress-B.md`
- Modify: `PLANROAD-B.md`
- Test: `backend/tests/test_submissions_api.py`
- Test: `backend/tests/test_reviews_api.py`
- Test: `backend/tests/test_exports_api.py`

- [ ] **Step 1: 跑 Day 5 关键后端回归**

Run:

```bash
python -m pytest backend/tests/test_submissions_api.py backend/tests/test_reviews_api.py backend/tests/test_exports_api.py -v
```

Expected: 全绿。

- [ ] **Step 2: 更新 progress-B，明确 Day 5 完成内容**

追加类似内容到 `.claude/context/progress-B.md`：

```markdown
- Day 5 已把最小 AI 预审升级为可替换边界：新增 `ai_executor` service，默认仍使用本地规则执行器，但 submit 路径已不再直接内嵌决策逻辑。
- Day 5 已补 review / export 审计闭环：approve / reject / export create / export finish 均会写入 `AuditLog`。
- Day 5 已补最小证明性测试，确保 executor 与新增 audit log 事件可回归验证。
```

- [ ] **Step 3: 更新 PLANROAD-B，只按保守口径同步**

至少检查这些项是否可从 `[-]` 变 `[x]`：

```markdown
- [x] 保证同一 submission 仅有一个活跃 AI job
- [x] 建立 `audit_logs`
- [x] Reviewer 可处理审核结果
- [x] 配合完善 README / API 文档 / 演示脚本
```

若仍未完全完成，则保持 `[-]`，不要夸大。

- [ ] **Step 4: 提交文档同步**

```bash
git add .claude/context/progress-B.md PLANROAD-B.md
git commit -m "docs: sync day5 backend progress"
```

---

## Self-review

- Spec coverage: 已覆盖 Day 5 加速版三件事：AI 薄边界、review/export 审计闭环、最小证明性测试与文档同步。
- Placeholder scan: 没有使用 TBD/TODO/“类似 Task N” 这类占位写法。
- Type consistency: `AIExecutionResult`、`persist_ai_audit(submission, execution_result)`、`write_audit_log(...)` 命名在所有任务内保持一致。
