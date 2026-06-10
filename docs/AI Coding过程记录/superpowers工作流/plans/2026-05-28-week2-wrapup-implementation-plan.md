# Week 2 A+B Wrap-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在今天内收口 A 侧与 B 侧路线图中第二周全部未完成项，用最小改动补齐真实缺口，并同步计划、契约、进度三类文档，使第二周完成状态可被代码与验证证据支撑。

**Architecture:** 保持当前前后端结构不变，优先做“盘点 → 最小补码 → 验证 → 回写文档”的收口流程。A 侧先解决计划/契约/真实联调状态不同步的问题，B 侧再补齐第二周判定所需的最小后端能力与测试，不进入第三周范围。

**Tech Stack:** React, TypeScript, Vite, FastAPI, SQLAlchemy, Pydantic, pytest

---

## 文件结构与职责

### 需要重点核验或修改的文件
- `PLANROAD-A.md`
  - A 侧第二周完成项的最终勾选与说明。
- `PLANROAD-B.md`
  - B 侧第二周完成项的最终勾选与说明。
- `.claude/context/progress-A.md`
  - 记录本次第二周收尾结果与证据。
- `.claude/context/progress-B.md`
  - 如需要，补 B 侧历史同步信息，确保与路线图一致。
- `.claude/context/decisions-A.md`
  - 仅在本次产生新的判定口径或边界决策时更新。
- `docs/api-contracts/labelhub-v1.md`
  - 补齐导出接口契约，核对登录/任务/模板/提交契约是否足以支撑第二周完成判定。
- `frontend/src/**`
  - 仅在盘点后发现 A 侧真实缺口时做最小修补。
- `backend/app/**`
  - 仅在盘点后发现 B 侧第二周判定缺口时做最小修补。
- `backend/tests/**`
  - 与后端最小修补对应的验证用例。

### 本计划的执行原则
- 先盘点，不先写代码。
- 只有当路线图未勾项对应真实缺口时，才做代码修改。
- 每完成一类收口，就立刻补文档证据，不把“代码已好、计划未改”拖到最后。

---

### Task 1: 盘点 A 侧第二周未勾项，区分“未同步”和“真缺口”

**Files:**
- Read: `PLANROAD-A.md`
- Read: `.claude/context/progress-A.md`
- Read: `docs/api-contracts/labelhub-v1.md`
- Read: `frontend/src/**`（仅必要范围）

- [ ] **Step 1: 列出 A 侧第二周全部未勾项**

需要逐项列出：

```text
- 第 2 周交付物：前端主要页面已接真实接口
- 第 2 周依赖 B 的内容：导出接口契约
- 第 2 周依赖 B 的内容：登录接口说明
- 第 2 周依赖 B 的内容：任务/模板/提交 接口契约（与 B 对齐具体字段）
```

- [ ] **Step 2: 核对 progress-A 中已有证据，建立判定表**

按下面结构整理：

```text
1. 前端主要页面已接真实接口 → 证据候选：任务列表/新建任务/模板/广场/草稿保存/提交/Reviewer/导出链路真实联调记录
2. 导出接口契约 → 证据候选：labelhub-v1.md 是否已有 exports 章节
3. 登录接口说明 → 证据候选：labelhub-v1.md auth 章节
4. 任务/模板/提交接口契约 → 证据候选：labelhub-v1.md 对应章节
```

- [ ] **Step 3: 运行一次针对前端真实接口接通的代码搜索**

Run: `python - <<'PY'
from pathlib import Path
roots = [Path('frontend/src')]
keywords = ['getTasks', 'createTask', 'saveTemplate', 'claimTask', 'saveDraft', 'submitSubmission', 'getPendingReviews', 'createExportJob']
for root in roots:
    for path in root.rglob('*.ts*'):
        text = path.read_text(encoding='utf-8')
        hits = [kw for kw in keywords if kw in text]
        if hits:
            print(path.as_posix(), '->', ', '.join(hits))
PY`
Expected: 输出真实 API 调用落点，能支撑“主要页面已接真实接口”的初步判断。

- [ ] **Step 4: 写出 A 侧盘点结论**

按以下三类归档：

```text
- 已完成但未同步：
- 部分完成，需补最小实现：
- 今天不应纳入第二周完成定义：
```

- [ ] **Step 5: 提交盘点结论到执行记录（不改代码）**

```bash
git status --short
```

Expected: 仅有计划文档新增，无业务代码改动。

### Task 2: 盘点 B 侧第二周未勾项，明确最小收口边界

**Files:**
- Read: `PLANROAD-B.md`
- Read: `.claude/context/progress-B.md`
- Read: `.claude/context/progress-A.md`
- Read: `backend/app/**`（按需）
- Read: `backend/tests/**`（按需）

- [ ] **Step 1: 列出 B 侧第二周全部未勾项**

需要逐项列出：

```text
- 补最小调用封装（当前为 AIExecutor / DeepSeekAIExecutor 边界，不是完整 LLMClient）
- 完成请求级超时控制
- 完成重试计数落库（未实现自动重试）
- 完成同步链路内失败转人工复核
- 通过唯一约束保证一个 submission 仅持有一条 AI job 记录
- 再完成 JSONL 导出
- 最后完成 Excel 导出
- 完成导出任务创建、状态查询、占位下载地址接口（未完成真实文件生成）
- 黄金路径后端已完整打通
```

- [ ] **Step 2: 先把不该纳入今天范围的项剥离出来**

按既有决策“时间不足优先保证 JSON / CSV 稳定”，先标记：

```text
- JSONL 导出 → 不纳入今天第二周收尾
- Excel 导出 → 不纳入今天第二周收尾
```

- [ ] **Step 3: 运行一次针对后端关键实现的代码搜索**

Run: `python - <<'PY'
from pathlib import Path
searches = {
    'AIExecutor': 'backend/app',
    'DeepSeekAIExecutor': 'backend/app',
    'timeout=': 'backend/app',
    'attempt_count': 'backend/app',
    'max_attempts': 'backend/app',
    'human_review': 'backend/app',
    'unique=True': 'backend/app',
    'ExportJob': 'backend/app',
}
for needle, root in searches.items():
    print(f'## {needle}')
    for path in Path(root).rglob('*.py'):
        text = path.read_text(encoding='utf-8')
        if needle in text:
            print(path.as_posix())
PY`
Expected: 能快速看出最小调用封装、超时、attempt/max_attempts、唯一约束、导出持久化的现状。

- [ ] **Step 4: 跑后端测试确认当前基线**

Run: `pytest backend/tests -q`
Expected: 当前测试通过，或只暴露与第二周剩余项直接相关的问题。

- [ ] **Step 5: 写出 B 侧盘点结论**

按以下结构整理：

```text
- 已完成但未同步：
- 部分完成，需补最小实现：
- 按既有决策保留到后续：JSONL / Excel
```

### Task 3: 补齐 A/B 共用接口契约，优先收导出接口说明

**Files:**
- Modify: `docs/api-contracts/labelhub-v1.md`

- [ ] **Step 1: 写出契约缺口检查清单**

需要核验以下章节是否齐全：

```text
- auth：POST /auth/login、GET /auth/me
- tasks：列表、创建、状态更新、广场、领取
- templates：保存、读取、版本
- submissions/workbench：保存草稿、提交、作答页读取
- reviews：待审核、详情、通过、打回
- exports：列表、创建、详情、完成态字段
```

- [ ] **Step 2: 如果 exports 章节缺口存在，先写失败对照稿**

在工作笔记中先明确目标结构：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "jobId": 1,
    "taskId": 101,
    "taskTitle": "情感标注任务",
    "format": "json",
    "status": "queued",
    "createdAt": "2026-05-28T10:00:00Z",
    "finishedAt": null,
    "downloadUrl": null
  }
}
```

- [ ] **Step 3: 在契约文档中补齐导出接口章节**

需要补齐以下最小内容：

```markdown
## X. 导出接口（exports）

### X.1 导出列表
GET /api/v1/exports

### X.2 创建导出任务
POST /api/v1/exports

Request
```json
{
  "taskId": 101,
  "format": "json"
}
```

### X.3 导出详情
GET /api/v1/exports/{jobId}

### X.4 导出完成态
当 status = done 时，downloadUrl 返回可下载地址；未完成时为 null。
```

- [ ] **Step 4: 核对登录/任务/模板/提交契约是否足以支撑 A 侧未勾项**

Run: `python - <<'PY'
from pathlib import Path
text = Path('docs/api-contracts/labelhub-v1.md').read_text(encoding='utf-8')
checks = ['POST /api/v1/auth/login', 'GET /api/v1/tasks', 'POST /api/v1/templates', '/api/v1/submissions', '/api/v1/exports']
for c in checks:
    print(c, '->', c in text)
PY`
Expected: 所有检查项均为 `True`。

- [ ] **Step 5: 提交**

```bash
git add docs/api-contracts/labelhub-v1.md
git commit -m "docs: complete week2 api contract coverage"
```

### Task 4: 仅在盘点确认有真实缺口时，补 A 侧最小代码或状态证据

**Files:**
- Modify: `frontend/src/**`（仅真实缺口对应文件）
- Test: `frontend/src/**` 对应测试文件

- [ ] **Step 1: 如果 A 侧没有真实代码缺口，明确跳过代码修改**

执行标准：

```text
若“前端主要页面已接真实接口”已有代码与 progress-A 证据支撑，则本任务不改前端代码，只进入路线图同步。
```

- [ ] **Step 2: 如果存在单个真实缺口，先写失败测试或失败检查**

示例命令模板：

```bash
pnpm test -- --runInBand <相关测试文件>
```

Expected: 暴露该页面仍使用 mock 或字段不匹配的具体失败。

- [ ] **Step 3: 在目标文件写最小实现，不做额外重构**

实现原则：

```text
- 只把对应页面切到真实接口或修正契约字段
- 不顺手清理相邻代码
- 不引入第三周体验优化
```

- [ ] **Step 4: 运行相关前端测试或构建验证**

Run: `pnpm --dir frontend test --runInBand`
Expected: 相关测试通过；若项目命令不支持该参数，则退回项目当前可用测试命令。

- [ ] **Step 5: 提交**

```bash
git add frontend/src
git commit -m "fix: close remaining week2 frontend gaps"
```

### Task 5: 仅在盘点确认有真实缺口时，补 B 侧最小后端闭环

**Files:**
- Modify: `backend/app/**`（按真实缺口定位）
- Test: `backend/tests/**`

- [ ] **Step 1: 如果 B 侧真实缺口为零，明确跳过代码修改**

执行标准：

```text
若最小调用封装、timeout、attempt/max_attempts、失败转人工、单 submission 单 AI job、导出创建/状态查询/下载地址、黄金路径后端完整打通均已有代码与测试支撑，则本任务不改后端代码。
```

- [ ] **Step 2: 如果存在真实缺口，先写失败测试**

示例测试骨架：

```python
def test_submit_falls_back_to_human_review_when_executor_fails(client, db_session, seed_users, monkeypatch):
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
    assert response.json()['data']['aiDecision'] == 'human_review'
```

- [ ] **Step 3: 运行单测确认失败点**

Run: `pytest backend/tests/test_submissions_api.py::test_submit_falls_back_to_human_review_when_executor_fails -v`
Expected: FAIL，并精确指向当前真实缺口。

- [ ] **Step 4: 写最小实现并补对应测试通过**

实现原则：

```text
- 仅补第二周判定缺口
- 不进入 JSONL / Excel
- 不引入后台任务系统、异步队列或大重构
```

- [ ] **Step 5: 跑相关后端测试并提交**

Run: `pytest backend/tests/test_submissions_api.py backend/tests/test_reviews_api.py backend/tests/test_exports_api.py -v`
Expected: PASS

```bash
git add backend/app backend/tests
git commit -m "fix: close remaining week2 backend gaps"
```

### Task 6: 回写 A/B 路线图，完成第二周勾选

**Files:**
- Modify: `PLANROAD-A.md`
- Modify: `PLANROAD-B.md`

- [ ] **Step 1: 在 A 路线图中勾掉已确认完成的第二周条目**

需要处理的目标条目：

```markdown
- [x] 前端主要页面已接真实接口
- [x] 导出接口契约
- [x] 登录接口说明
- [x] 任务/模板/提交 接口契约（与 B 对齐具体字段）
```

- [ ] **Step 2: 在 B 路线图中只勾掉今天完成定义范围内的条目**

优先目标示例：

```markdown
- [x] 补最小调用封装（当前为 AIExecutor / DeepSeekAIExecutor 边界）
- [x] 完成请求级超时控制
- [x] 完成重试计数落库（未实现自动重试）
- [x] 完成同步链路内失败转人工复核
- [x] 通过唯一约束保证一个 submission 仅持有一条 AI job 记录
- [x] 完成导出任务创建、状态查询、占位下载地址接口（或按当前真实生成能力更新为更准确表述）
- [x] 黄金路径后端已完整打通
```

- [ ] **Step 3: 明确保留到后续的条目不要误勾**

必须保持未完成：

```markdown
- [ ] 再完成 JSONL 导出
- [ ] 最后完成 Excel 导出
```

- [ ] **Step 4: 运行差异检查**

Run: `git diff -- PLANROAD-A.md PLANROAD-B.md`
Expected: 只包含第二周勾选、措辞校正和最小说明更新。

- [ ] **Step 5: 提交**

```bash
git add PLANROAD-A.md PLANROAD-B.md
git commit -m "docs: mark week2 roadmap items complete"
```

### Task 7: 同步进度上下文，确保后续会话能直接读取第二周完成状态

**Files:**
- Modify: `.claude/context/progress-A.md`
- Modify: `.claude/context/progress-B.md`
- Modify: `.claude/context/decisions-A.md`（仅必要时）

- [ ] **Step 1: 在 progress-A 中补本次第二周收尾结果**

至少写入以下内容：

```markdown
- 2026-05-28 已完成第二周 A/B 收尾：A 侧第二周未勾项已与真实接口、统一契约和联调证据对齐；B 侧第二周完成判定所需最小闭环已补齐/核实完成。
- 当前第二周范围内保留到后续的仅有 JSONL / Excel 导出等既定后续项，不再算作本轮第二周阻塞项。
```

- [ ] **Step 2: 在 progress-B 中同步历史视角说明**

至少写入以下内容：

```markdown
- 2026-05-28 已从统一 SM 分支视角完成第二周收尾判定：AI 最小调用边界、timeout、attempt/max_attempts、失败转人工、单 submission 单 AI job、导出最小闭环均已具备代码/测试/文档依据。
```

- [ ] **Step 3: 仅当本次形成新的判定口径时，更新 decisions-A**

可选写入模板：

```markdown
| 2026-05-28 | 第二周完成判定以 JSON/CSV 稳定闭环为准，JSONL/Excel 保留到后续 | 与既有“时间不足优先保证 JSON / CSV 稳定”决策保持一致，避免收尾范围失控 | 路线图勾选、第二周完成口径、后续排期 |
```

- [ ] **Step 4: 运行上下文差异自检**

Run: `git diff -- .claude/context/progress-A.md .claude/context/progress-B.md .claude/context/decisions-A.md`
Expected: 只包含第二周收尾状态同步，不夸大第三周完成度。

- [ ] **Step 5: 提交**

```bash
git add .claude/context/progress-A.md .claude/context/progress-B.md .claude/context/decisions-A.md
git commit -m "docs: sync week2 completion context"
```

### Task 8: 最终验证第二周完成判定，并清点剩余仅属于第三周/后续项

**Files:**
- Verify: `PLANROAD-A.md`
- Verify: `PLANROAD-B.md`
- Verify: `.claude/context/progress-A.md`
- Verify: `docs/api-contracts/labelhub-v1.md`

- [ ] **Step 1: 跑后端全量测试**

Run: `pytest backend/tests -v`
Expected: PASS

- [ ] **Step 2: 跑前端构建验证**

Run: `pnpm --dir frontend build`
Expected: PASS

- [ ] **Step 3: 检查第二周路线图是否全部收口**

Run: `python - <<'PY'
from pathlib import Path
for file in ['PLANROAD-A.md', 'PLANROAD-B.md']:
    print(f'## {file}')
    text = Path(file).read_text(encoding='utf-8').splitlines()
    in_week2 = False
    for line in text:
        if '第 2 周' in line:
            in_week2 = True
        elif line.startswith('## 第 3 周') or line.startswith('---') and in_week2:
            pass
    print('请人工确认第二周未勾项仅剩明确保留到后续的条目。')
PY`
Expected: 人工复核后，A 第二周全部完成；B 第二周仅保留明确后续项，且不再阻塞第二周完成判定。

- [ ] **Step 4: 查看最终差异，确认未混入演示/第三周改动**

Run: `git diff --stat`
Expected: 只包含契约、路线图、上下文，以及必要的最小前后端修补。

- [ ] **Step 5: 整理最终结论（不提交代码）**

输出模板：

```text
- A 第二周：已完成
- B 第二周：已完成（JSONL / Excel 按既有决策留待后续，不再视为本轮阻塞）
- 今日新增验证：后端测试 / 前端构建 / 契约同步 / 路线图同步
- 下一步：进入第三周稳定性与答辩收口
```

---

## 自检结果

- **Spec coverage:** 已覆盖设计稿中的范围边界、A 侧收口、B 侧收口、契约补齐、路线图同步、进度同步、最终验证七个部分。未把演示、录屏、第三周体验优化带入计划。
- **Placeholder scan:** 已去除 TBD/TODO；凡是涉及代码修改的任务都先要求盘点，再按真实缺口写测试、补最小实现。对可能“无需改代码”的任务，明确写成可跳过条件，避免伪任务。
- **Type consistency:** 计划统一使用 `AIExecutor`、`DeepSeekAIExecutor`、`attempt_count`、`max_attempts`、`human_review`、`ExportJob` 等已有命名，不引入新的命名漂移。