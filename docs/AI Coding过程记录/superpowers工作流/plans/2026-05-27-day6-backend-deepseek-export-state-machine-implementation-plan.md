# Day 6 Backend DeepSeek and Export State Machine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修掉导出状态机的读接口副作用，把真实 AI 执行器切到 DeepSeek 本地配置，并补足对应状态机测试与进度同步。

**Architecture:** 保持 Day 5 已抽出的 `ai_executor` 边界，新增 DeepSeek executor 并通过本地 `.env` / 环境变量驱动选择；默认本地开发直接走 DeepSeek，配置缺失时显式报错而不是静默放行。导出链路从“GET 详情时推进状态”改成“显式执行完成路径推进状态”，让 `export_finished` 只在真正完成时产生。

**Tech Stack:** FastAPI, SQLAlchemy 2, Pydantic Settings, pytest, TestClient, SQLite in-memory tests, requests/httpx-compatible HTTP client, local `.env`

---

## File map

- Create: `backend/.env`
  - 本地专用，不进 git，保存 `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL` / `DEEPSEEK_BASE_URL`
- Modify: `backend/app/core/config.py`
  - 新增 DeepSeek 配置项与默认模型选择
- Modify: `backend/app/services/ai_executor.py`
  - 定义可替换 executor 协议，新增 `DeepSeekAIExecutor`
- Modify: `backend/app/api/routes/submissions.py`
  - 使用可配置 executor，并对配置/返回值做显式处理
- Modify: `backend/app/api/routes/exports.py`
  - 把“完成导出”的状态推进从 GET 中移出，新增明确完成路径
- Modify: `backend/tests/test_submissions_api.py`
  - 覆盖 executor 选择、未知 decision、防止静默放行
- Modify: `backend/tests/test_exports_api.py`
  - 覆盖 GET 只读、完成路径推进状态、审计时序
- Modify: `.claude/context/decisions-A.md`
  - 记录“当前默认模型从豆包切到 DeepSeek，后续支持自定义模型”的决策
- Modify: `.claude/context/progress-B.md`
  - 记录 Day 6 真实完成项与剩余风险
- Modify: `PLANROAD-B.md`
  - 按保守口径更新相关项

---

### Task 1: 建立本地 DeepSeek 配置并接入 executor 边界

**Files:**
- Create: `backend/.env`
- Modify: `backend/app/core/config.py`
- Modify: `backend/app/services/ai_executor.py`
- Test: `backend/tests/test_submissions_api.py`

- [ ] **Step 1: 先写失败测试，证明未知 decision 不能静默放行，且 executor 结果仍能决定状态**

在 `backend/tests/test_submissions_api.py` 保留并扩充这类测试：

```python
def test_map_submission_status_rejects_unknown_decision():
    try:
        map_submission_status('passed')
    except HTTPException as exc:
        assert exc.status_code == 500
        assert exc.detail == 'unsupported ai decision: passed'
    else:
        raise AssertionError('expected HTTPException for unsupported decision')
```

再补一个路由级可替换 executor 测试：

```python
def test_submit_uses_replaced_executor_result(client, db_session, seed_users, monkeypatch):
    submission = seed_submission_graph(db_session, seed_users)

    class FakeExecutor:
        def execute(self, answers):
            return AIExecutionResult(
                scores=[{'dimension': 'quality', 'score': 2, 'reason': 'fake'}],
                decision='human_review',
                summary='fake summary',
            )

    monkeypatch.setattr('app.api.routes.submissions.executor', FakeExecutor())

    response = client.post(
        f'/api/v1/submissions/{submission.id}/submit',
        headers={'X-Demo-User': 'labeler_demo'},
        json={},
    )

    assert response.status_code == 200
    assert response.json()['data']['aiDecision'] == 'human_review'
```

- [ ] **Step 2: 跑 submissions 测试，确认新测试先失败**

Run:

```bash
python -m pytest backend/tests/test_submissions_api.py -v
```

Expected:
- 至少新加的 executor 替换测试先失败
- 其他现有测试保持可运行

- [ ] **Step 3: 创建本地 `.env` 文件，不提交到 git**

Create `backend/.env` with local-only content:

```env
DEEPSEEK_API_KEY=replace-with-local-real-key
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

要求：
- 只在本地创建
- 不要 git add
- 如果仓库里已有 `.gitignore` 忽略规则，保持 `.env` 不被提交

- [ ] **Step 4: 在配置层增加 DeepSeek 相关字段**

`backend/app/core/config.py` 中加入类似：

```python
class Settings(BaseSettings):
    app_name: str = 'LabelHub Backend'
    api_prefix: str = '/api/v1'
    database_url: str = 'mysql+pymysql://root:root@127.0.0.1:3306/labelhub'

    deepseek_api_key: str | None = None
    deepseek_model: str = 'deepseek-chat'
    deepseek_base_url: str = 'https://api.deepseek.com'
```

并确保 `env_file` 会读取 `backend/.env`。

- [ ] **Step 5: 在 `ai_executor.py` 中引入可替换 executor 协议与 DeepSeek 实现**

目标结构：

```python
from dataclasses import dataclass
from typing import Literal, Protocol, TypedDict

import requests

from app.core.config import settings


class AIScore(TypedDict):
    dimension: str
    score: int
    reason: str


AIDecision = Literal['pass', 'reject', 'human_review']


@dataclass(frozen=True)
class AIExecutionResult:
    scores: list[AIScore]
    decision: AIDecision
    summary: str


class AIExecutor(Protocol):
    def execute(self, answers: dict) -> AIExecutionResult: ...


class LocalRuleAIExecutor:
    def execute(self, answers: dict) -> AIExecutionResult:
        ...


class DeepSeekAIExecutor:
    def execute(self, answers: dict) -> AIExecutionResult:
        if not settings.deepseek_api_key:
            raise RuntimeError('DEEPSEEK_API_KEY is required')

        response = requests.post(
            f"{settings.deepseek_base_url}/chat/completions",
            headers={
                'Authorization': f'Bearer {settings.deepseek_api_key}',
                'Content-Type': 'application/json',
            },
            json={
                'model': settings.deepseek_model,
                'messages': [
                    {'role': 'system', 'content': '你是标注预审助手，只返回结构化 JSON。'},
                    {'role': 'user', 'content': str(answers)},
                ],
                'temperature': 0,
            },
            timeout=30,
        )
        response.raise_for_status()
        payload = response.json()
        content = payload['choices'][0]['message']['content']
        parsed = json.loads(content)
        return AIExecutionResult(
            scores=parsed['scores'],
            decision=parsed['decision'],
            summary=parsed['summary'],
        )
```

要求：
- 保持实现最小，不做完整 SDK 层
- 对 `decision` 做显式值校验，不接受未知值

- [ ] **Step 6: 让 `submissions.py` 通过配置选择 executor**

在 `backend/app/api/routes/submissions.py` 中使用：

```python
from app.core.config import settings
from app.services.ai_executor import DeepSeekAIExecutor, LocalRuleAIExecutor


executor = DeepSeekAIExecutor() if settings.deepseek_api_key else LocalRuleAIExecutor()
```

并保留现有：

```python
execution_result = executor.execute(submission.answers_json)
job, result = persist_ai_audit(submission, execution_result)
```

- [ ] **Step 7: 跑 submissions 测试确认通过**

Run:

```bash
python -m pytest backend/tests/test_submissions_api.py -v
```

Expected:
- 所有 submissions 测试通过
- executor 替换测试通过

- [ ] **Step 8: 提交这一小步**

```bash
git add backend/app/core/config.py backend/app/services/ai_executor.py backend/app/api/routes/submissions.py backend/tests/test_submissions_api.py
git commit -m "feat: add deepseek-backed ai executor"
```

---

### Task 2: 修正导出状态机，让 GET 只读

**Files:**
- Modify: `backend/app/api/routes/exports.py`
- Modify: `backend/tests/test_exports_api.py`

- [ ] **Step 1: 写失败测试，证明 GET 详情不能推进状态**

在 `backend/tests/test_exports_api.py` 中添加：

```python
def test_export_detail_does_not_mutate_queued_job(client, db_session, seed_users):
    task = seed_export_task(db_session, seed_users)

    created = client.post('/api/v1/exports', headers={'X-Demo-User': 'owner_demo'}, json={'taskId': task.id, 'format': 'json'})
    job_id = created.json()['data']['jobId']

    detail = client.get(f'/api/v1/exports/{job_id}', headers={'X-Demo-User': 'owner_demo'})

    assert detail.status_code == 200
    assert detail.json()['data']['status'] == 'queued'
```

- [ ] **Step 2: 跑测试确认当前先失败**

Run:

```bash
python -m pytest backend/tests/test_exports_api.py::test_export_detail_does_not_mutate_queued_job -v
```

Expected:
- FAIL，因为当前 GET 会把 queued 变成 done

- [ ] **Step 3: 给 exports 增加明确完成路径**

在 `backend/app/api/routes/exports.py` 新增一个最小完成接口，例如：

```python
@router.post('/{job_id}/complete')
def complete_export(
    job_id: int,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user)
    require_role(user, {'owner'})

    job = next((item for item in _EXPORT_JOBS if item['jobId'] == job_id), None)
    if not job:
        raise HTTPException(status_code=404, detail='export job not found')
    if job['status'] != 'queued':
        return success(job)

    completed = {
        **job,
        'status': 'done',
        'downloadUrl': build_download_url(job_id, job['format']),
        'finishedAt': utc_now_iso(),
    }
    for index, item in enumerate(_EXPORT_JOBS):
        if item['jobId'] == job_id:
            _EXPORT_JOBS[index] = completed
            break

    write_audit_log(
        db,
        event_type='export_finished',
        entity_type='export_job',
        entity_id=job_id,
        actor_user_id=None,
        payload={'status': completed['status'], 'format': completed['format']},
    )
    db.commit()
    return success(completed)
```

并把 `GET /{job_id}` 改成只读当前 job，不再推进状态。

- [ ] **Step 4: 更新测试为“先 create，再 complete，再 detail”**

把旧测试改成类似：

```python
def test_export_detail_moves_from_queued_to_done_after_complete(client, db_session, seed_users):
    task = seed_export_task(db_session, seed_users)

    created = client.post('/api/v1/exports', headers={'X-Demo-User': 'owner_demo'}, json={'taskId': task.id, 'format': 'json'})
    job_id = created.json()['data']['jobId']
    assert created.json()['data']['status'] == 'queued'

    completed = client.post(f'/api/v1/exports/{job_id}/complete', headers={'X-Demo-User': 'owner_demo'})
    assert completed.status_code == 200
    assert completed.json()['data']['status'] == 'done'

    detail = client.get(f'/api/v1/exports/{job_id}', headers={'X-Demo-User': 'owner_demo'})
    assert detail.status_code == 200
    assert detail.json()['data']['status'] == 'done'
```

- [ ] **Step 5: 补失败路径和审计时序断言**

再加一个测试：

```python
def test_export_finished_audit_is_written_only_on_complete(client, db_session, seed_users):
    task = seed_export_task(db_session, seed_users)

    created = client.post('/api/v1/exports', headers={'X-Demo-User': 'owner_demo'}, json={'taskId': task.id, 'format': 'json'})
    job_id = created.json()['data']['jobId']

    client.get(f'/api/v1/exports/{job_id}', headers={'X-Demo-User': 'owner_demo'})
    logs_before = db_session.query(AuditLog).filter(AuditLog.entity_id == job_id).all()
    assert not any(log.event_type == 'export_finished' for log in logs_before)

    client.post(f'/api/v1/exports/{job_id}/complete', headers={'X-Demo-User': 'owner_demo'})
    logs_after = db_session.query(AuditLog).filter(AuditLog.entity_id == job_id).all()
    assert sum(1 for log in logs_after if log.event_type == 'export_finished') == 1
```

- [ ] **Step 6: 跑 exports 测试确认通过**

Run:

```bash
python -m pytest backend/tests/test_exports_api.py -v
```

Expected:
- 所有 exports 测试通过
- GET 不再改变状态
- complete 才写 finished audit

- [ ] **Step 7: 提交这一小步**

```bash
git add backend/app/api/routes/exports.py backend/tests/test_exports_api.py
git commit -m "fix: separate export completion from export reads"
```

---

### Task 3: 补充 review/export/submission 状态机测试并同步决策

**Files:**
- Modify: `backend/tests/test_reviews_api.py`
- Modify: `backend/tests/test_exports_api.py`
- Modify: `.claude/context/decisions-A.md`
- Modify: `.claude/context/progress-B.md`
- Modify: `PLANROAD-B.md`

- [ ] **Step 1: 补 review 审计 payload 断言测试**

在 `backend/tests/test_reviews_api.py` 把断言增强成：

```python
assert any(
    log.event_type == 'review_rejected'
    and log.actor_user_id is not None
    and log.payload_json.get('reason') == 'needs more detail'
    for log in logs
)
```

approve 测试也补 `comment` / `reviewerId` 断言。

- [ ] **Step 2: 跑 review 测试确认先红后绿**

Run:

```bash
python -m pytest backend/tests/test_reviews_api.py -v
```

Expected:
- 若 payload 结构与断言不一致，先失败
- 修正后再通过

- [ ] **Step 3: 把“默认模型切到 DeepSeek，后续支持可自定义模型”写进决策**

在 `.claude/context/decisions-A.md` 追加一行表格记录：

```md
| 2026-05-27 | 当前默认真实模型从豆包切到 DeepSeek，并通过本地环境变量读取 API 配置；后续如继续扩展，再把模型名抽成可自定义配置，而不是继续写死在 executor 中 | 先满足当前真实接入需求，同时避免今天过早做完整多模型配置系统 | AI executor、后端配置、后续模型切换策略 |
```

- [ ] **Step 4: 更新 progress-B 记录 Day 6 完成项**

追加类似内容到 `.claude/context/progress-B.md`：

```md
- Day 6 已把导出状态机从“GET 驱动完成”改为“显式 complete 路径驱动完成”，`export_finished` 现在只在完成路径写入。
- Day 6 已把默认真实模型切到 DeepSeek，本地通过 `backend/.env` / 环境变量读取 `DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL`、`DEEPSEEK_BASE_URL`。
- Day 6 已补强 submissions / reviews / exports 的状态机测试与审计断言。
```

- [ ] **Step 5: 更新 PLANROAD-B，按保守口径同步**

至少检查这些项是否可从 `[-]` 变 `[x]`：

```md
- [x] 固定 Reviewer 拥有最终裁决权
- [x] 完成 AI 执行逻辑
- [x] 完成结果回写
- [x] 修复 AI / 审核 / 导出的高频问题
- [x] 补状态机测试
```

若证据不够，就保持 `[-]` 或 `[ ]`，不要夸大。

- [ ] **Step 6: 跑 Day 6 后端总回归**

Run:

```bash
python -m pytest backend/tests/test_submissions_api.py backend/tests/test_reviews_api.py backend/tests/test_exports_api.py -v
```

Expected:
- 全绿
- 若有 DeepSeek 配置相关测试，不能依赖真实 key 才能通过

- [ ] **Step 7: 提交文档和测试收口**

```bash
git add backend/tests/test_reviews_api.py backend/tests/test_exports_api.py .claude/context/decisions-A.md .claude/context/progress-B.md PLANROAD-B.md
git commit -m "docs: sync day6 backend decisions and progress"
```

---

## Self-review

- Spec coverage: 已覆盖 Day 6 三条主线：DeepSeek 本地接入、导出状态机收口、状态机测试补强与决策同步。
- Placeholder scan: 无 TBD / TODO / “类似 Task N” 等占位内容。
- Type consistency: 计划中统一使用 `AIExecutionResult`、`AIDecision`、`DeepSeekAIExecutor`、`complete_export` 等命名，前后保持一致。
