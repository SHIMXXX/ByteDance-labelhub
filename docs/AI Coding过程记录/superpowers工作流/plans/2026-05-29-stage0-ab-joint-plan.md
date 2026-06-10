# 后续阶段 0（A/B 联合）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在今天完成后续阶段 0 的 A/B 联合收口：前端改为统一登录 + 分角色工作台的最小结构、Reviewer AI 结果兜底与状态文案收口、后端补 AI 返回 normalize / schema 校验 / 错误落库与日志基础、README 口径对齐，并以测试验证当前黄金路径更稳。

**Architecture:** 这轮不做大重构，也不进入多题任务、AI 工程化或多级审核。前端只做最小壳层拆分与 Reviewer 详情稳定性修复；后端在现有 `AIExecutor` 边界上补一层“结果规范化 + 校验 + 错误摘要”收口，保持接口形状尽量不变。文档层同步修正 README 的本地口径与后续可部署约束，避免继续把运行方式写死为仅本地。

**Tech Stack:** React 18 + TypeScript + React Router、FastAPI、SQLAlchemy、pytest、Vite、Pydantic Settings

---

## File Structure

### Frontend
- Modify: `frontend/src/App.tsx`
  - 从单一 `AppShell` 改为公共入口 + 三个角色根路由挂载点。
- Create: `frontend/src/layouts/AppFrame.tsx`
  - 提供通用页面壳子骨架，接收标题、描述、菜单项、子内容。
- Create: `frontend/src/layouts/roleLayouts.tsx`
  - 定义 `OwnerLayout`、`LabelerLayout`、`ReviewerLayout` 及默认首页跳转。
- Create: `frontend/src/router/roleMenus.ts`
  - 维护三角色菜单配置，避免继续把链接硬编码在 `App.tsx`。
- Create: `frontend/src/router/guards.tsx`
  - 维护最小登录态 / 角色守卫。
- Modify: `frontend/src/pages/auth/LoginPage.tsx`
  - 登录后进入角色根路由，而非直接进入具体业务页。
- Modify: `frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.tsx`
  - 增加 AI 结果兜底渲染、加载/空态/错误态更稳的文案。
- Modify: `frontend/src/pages/owner/exports/OwnerExportsPage.tsx`
  - 明确 JSON / CSV 为当前唯一可选格式的提示，减少能力误解。
- Test: `frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.test.tsx`
- Test: `frontend/src/pages/auth/LoginPage.test.tsx`
- Create: `frontend/src/App.test.tsx`
  - 验证角色根路由、重定向和壳层行为。

### Backend
- Modify: `backend/app/services/ai_executor.py`
  - 增加 DeepSeek 结果 normalize / schema 校验 / 错误摘要生成。
- Modify: `backend/app/api/routes/reviews.py`
  - 审核详情接口对 AI 结果缺失或脏数据做兜底返回，避免前端白屏。
- Modify: `backend/app/core/config.py`
  - 明确保留环境变量读取能力，但不把未来云环境需要的配置写死成本地唯一方案。
- Test: `backend/tests/test_ai_executor.py`
  - 新增 executor 规范化与异常路径测试。
- Test: `backend/tests/test_reviews_api.py`
  - 新增 review detail 对异常 AI 结果的兜底测试。
- Test: `backend/tests/test_workbench_api.py`
  - 保持现有基线，必要时补一个回归断言，确保阶段 0 改动不影响 workbench。

### Docs
- Modify: `README.md`
  - 修正当前已支持能力、启动方式说明、前端 `/api` 代理与“不要只适配本地”的口径。

---

### Task 1: 前端改为统一登录 + 分角色工作台最小结构

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/pages/auth/LoginPage.tsx`
- Create: `frontend/src/layouts/AppFrame.tsx`
- Create: `frontend/src/layouts/roleLayouts.tsx`
- Create: `frontend/src/router/roleMenus.ts`
- Create: `frontend/src/router/guards.tsx`
- Test: `frontend/src/App.test.tsx`
- Test: `frontend/src/pages/auth/LoginPage.test.tsx`

- [ ] **Step 1: 写一个失败的前端路由测试**

```tsx
import { MemoryRouter } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import { App } from './App'

test('owner 根路由会进入 owner 工作台壳层', async () => {
  render(
    <MemoryRouter initialEntries={['/owner']}>
      <App />
    </MemoryRouter>,
  )

  expect(await screen.findByText('Owner 工作台')).toBeInTheDocument()
  expect(screen.getByText('任务管理')).toBeInTheDocument()
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm --prefix frontend run test -- App.test.tsx`
Expected: FAIL，提示找不到 `Owner 工作台` 或当前路由仍落在旧的混合侧边栏。

- [ ] **Step 3: 新建角色菜单配置文件**

```ts
import type { UserRole } from '../types/domain'

export type RoleMenuItem = {
  label: string
  to: string
}

export const roleHomePath: Record<UserRole, string> = {
  owner: '/owner',
  labeler: '/labeler',
  reviewer: '/reviewer',
}

export const roleMenus: Record<UserRole, RoleMenuItem[]> = {
  owner: [
    { label: '任务管理', to: '/owner/tasks' },
    { label: '模板搭建', to: '/owner/templates' },
    { label: '导出管理', to: '/owner/exports' },
  ],
  labeler: [
    { label: '任务广场', to: '/labeler/plaza' },
    { label: '作答页', to: '/labeler/workbench' },
  ],
  reviewer: [{ label: '审核台', to: '/reviewer/reviews' }],
}
```

- [ ] **Step 4: 新建通用壳层组件**

```tsx
import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { RoleMenuItem } from '../router/roleMenus'

type AppFrameProps = {
  title: string
  description: string
  menuItems: RoleMenuItem[]
  children: ReactNode
}

export function AppFrame({ title, description, menuItems, children }: AppFrameProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>{title}</h1>
        <p>{description}</p>
        <nav>
          {menuItems.map((item) => (
            <Link key={item.to} to={item.to}>
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="content">{children}</main>
    </div>
  )
}
```

- [ ] **Step 5: 新建角色 layout 与默认首页跳转**

```tsx
import { Navigate, Outlet } from 'react-router-dom'
import { AppFrame } from './AppFrame'
import { roleMenus } from '../router/roleMenus'

export function OwnerLayout() {
  return (
    <AppFrame title="Owner 工作台" description="任务、模板与导出管理" menuItems={roleMenus.owner}>
      <Outlet />
    </AppFrame>
  )
}

export function OwnerHomeRedirect() {
  return <Navigate to="/owner/tasks" replace />
}
```

对 `labeler` / `reviewer` 同样提供：
- `LabelerLayout` + `LabelerHomeRedirect`
- `ReviewerLayout` + `ReviewerHomeRedirect`

其中描述分别使用：
- Labeler：`领取任务并完成作答`
- Reviewer：`处理 AI 预审后的待审结果`

- [ ] **Step 6: 新建最小守卫组件**

```tsx
import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { UserRole } from '../types/domain'
import { getAuthToken } from '../services/api/client'
import { roleHomePath } from './roleMenus'

type RoleGuardProps = {
  role: UserRole
  children: ReactNode
}

export function RoleGuard({ role, children }: RoleGuardProps) {
  const token = getAuthToken()
  if (!token) {
    return <Navigate to="/" replace />
  }

  const savedRole = window.localStorage.getItem('labelhub_demo_role') as UserRole | null
  if (savedRole && savedRole !== role) {
    return <Navigate to={roleHomePath[savedRole]} replace />
  }

  return <>{children}</>
}
```

- [ ] **Step 7: 修改登录页，保存角色并跳转到角色根路由**

```tsx
const roles: RoleCard[] = [
  {
    role: 'Owner',
    apiRole: 'owner',
    description: '任务管理与模板搭建',
    path: '/owner',
  },
]
```

在 `handleLogin` 成功后加入：

```tsx
window.localStorage.setItem('labelhub_demo_role', role.apiRole)
setAuthToken(result.token)
navigate(role.path)
```

并把三个角色的 `path` 全部改为：
- owner → `/owner`
- labeler → `/labeler`
- reviewer → `/reviewer`

- [ ] **Step 8: 改造 App.tsx 路由结构**

```tsx
import { Navigate, Route, Routes } from 'react-router-dom'
import { LoginPage } from './pages/auth/LoginPage'
import { OwnerTasksPage } from './pages/owner/tasks/OwnerTasksPage'
import { OwnerTemplatesPage } from './pages/owner/templates/OwnerTemplatesPage'
import { OwnerExportsPage } from './pages/owner/exports/OwnerExportsPage'
import { LabelerPlazaPage } from './pages/labeler/plaza/LabelerPlazaPage'
import { LabelerWorkbenchPage } from './pages/labeler/workbench/LabelerWorkbenchPage'
import { ReviewerReviewsPage } from './pages/reviewer/reviews/ReviewerReviewsPage'
import { RoleGuard } from './router/guards'
import {
  LabelerHomeRedirect,
  LabelerLayout,
  OwnerHomeRedirect,
  OwnerLayout,
  ReviewerHomeRedirect,
  ReviewerLayout,
} from './layouts/roleLayouts'

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />

      <Route
        path="/owner"
        element={
          <RoleGuard role="owner">
            <OwnerLayout />
          </RoleGuard>
        }
      >
        <Route index element={<OwnerHomeRedirect />} />
        <Route path="tasks" element={<OwnerTasksPage />} />
        <Route path="templates" element={<OwnerTemplatesPage />} />
        <Route path="exports" element={<OwnerExportsPage />} />
      </Route>

      <Route
        path="/labeler"
        element={
          <RoleGuard role="labeler">
            <LabelerLayout />
          </RoleGuard>
        }
      >
        <Route index element={<LabelerHomeRedirect />} />
        <Route path="plaza" element={<LabelerPlazaPage />} />
        <Route path="workbench" element={<LabelerWorkbenchPage />} />
      </Route>

      <Route
        path="/reviewer"
        element={
          <RoleGuard role="reviewer">
            <ReviewerLayout />
          </RoleGuard>
        }
      >
        <Route index element={<ReviewerHomeRedirect />} />
        <Route path="reviews" element={<ReviewerReviewsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
```

- [ ] **Step 9: 追加登录与角色路由测试**

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { LoginPage } from './LoginPage'

test('owner 登录成功后进入 owner 根路由', async () => {
  render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  )

  await userEvent.click(screen.getByRole('button', { name: 'Owner' }))

  await waitFor(() => {
    expect(window.localStorage.getItem('labelhub_demo_role')).toBe('owner')
  })
})
```

- [ ] **Step 10: 跑前端测试确认通过**

Run: `npm --prefix frontend run test -- App.test.tsx LoginPage.test.tsx`
Expected: PASS，角色根路由与登录跳转测试通过。

- [ ] **Step 11: 提交本任务**

```bash
git add frontend/src/App.tsx frontend/src/pages/auth/LoginPage.tsx frontend/src/layouts/AppFrame.tsx frontend/src/layouts/roleLayouts.tsx frontend/src/router/roleMenus.ts frontend/src/router/guards.tsx frontend/src/App.test.tsx frontend/src/pages/auth/LoginPage.test.tsx
git commit -m "feat: split frontend workspace by role"
```

### Task 2: Reviewer 页面增加 AI 结果兜底与更稳的状态反馈

**Files:**
- Modify: `frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.tsx`
- Test: `frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.test.tsx`
- Modify: `backend/app/api/routes/reviews.py`
- Test: `backend/tests/test_reviews_api.py`

- [ ] **Step 1: 写一个失败的前端详情渲染测试**

```tsx
test('ai scores 缺失时仍能展示兜底提示而不是崩溃', async () => {
  mockApiGet
    .mockResolvedValueOnce({ items: [{ submissionId: 1, taskId: 1, itemId: 1, labelerName: 'A', aiDecision: 'human_review', submissionStatus: 'submitted', submittedAt: '2026-05-29' }], total: 1 })
    .mockResolvedValueOnce({
      submissionId: 1,
      task: { id: 1, title: 'Task' },
      item: { itemId: 1, source: { source_text: 'x' } },
      answers: { summary: 'y' },
      aiResult: { scores: [], decision: 'human_review', summary: 'AI 结果待人工复核。' },
      submissionStatus: 'submitted',
    })

  render(<ReviewerReviewsPage />)
  await userEvent.click(await screen.findByRole('button', { name: '查看详情' }))

  expect(await screen.findByText('AI 预审结果待补充')).toBeInTheDocument()
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm --prefix frontend run test -- ReviewerReviewsPage.test.tsx`
Expected: FAIL，当前页面会假设 `scores.map(...)` 至少可直接渲染业务内容。

- [ ] **Step 3: 给后端 reviews detail 加兜底返回**

```python
def get_ai_result(submission_id: int, db: Session) -> dict:
    result = db.query(AIAuditResult).filter(AIAuditResult.submission_id == submission_id).first()
    if result is None:
        return {
            'scores': [],
            'decision': 'human_review',
            'summary': 'AI 结果暂不可用，建议人工复核。',
        }

    scores = result.scores_json if isinstance(result.scores_json, list) else []
    decision = result.decision if result.decision in {'pass', 'reject', 'human_review'} else 'human_review'
    summary = result.summary or 'AI 结果暂不可用，建议人工复核。'

    return {
        'scores': scores,
        'decision': decision,
        'summary': summary,
    }
```

- [ ] **Step 4: 在前端详情页对空 scores 做兜底渲染**

```tsx
function renderAIScores(scores: ReviewDetail['aiResult']['scores']) {
  if (scores.length === 0) {
    return <p className="review-empty-message">AI 预审结果待补充</p>
  }

  return scores.map((score) => (
    <div className="review-score-row" key={score.dimension}>
      <span className="review-score-dim">{score.dimension}</span>
      <span className="review-score-num">{score.score} 分</span>
      <span className="review-score-reason">{score.reason}</span>
    </div>
  ))
}
```

并在详情页中把：

```tsx
{detail.aiResult.scores.map((score) => (
```

替换成：

```tsx
{renderAIScores(detail.aiResult.scores)}
```

- [ ] **Step 5: 收口 Reviewer 列表 / 详情错误与状态文案**

```tsx
catch {
  setLoadError('加载审核详情失败，请确认该提交仍处于待审状态，或稍后重试。')
}
```

并将成功反馈改成更明确的两句：
- 通过：`审核通过，提交已进入 review_passed。`
- 打回：`已打回，标注人可查看理由并修改后重新提交。`

- [ ] **Step 6: 增加后端 review detail 兜底测试**

```python
def test_review_detail_returns_fallback_ai_result_when_ai_result_missing(client, db_session, seed_users):
    reviewer = seed_users['reviewer']
    owner = seed_users['owner']
    labeler = seed_users['labeler']
    task = Task(title='t', description='d', status='published', quota=1, owner_id=owner.id)
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)
    assignment = Assignment(task_id=task.id, user_id=labeler.id, status='claimed')
    db_session.add(assignment)
    db_session.commit()
    submission = Submission(task_id=task.id, assignment_id=assignment.id, user_id=labeler.id, status='submitted', answers_json={'summary': 'ok'})
    db_session.add(submission)
    db_session.commit()
    db_session.refresh(submission)

    response = client.get(f'/api/v1/reviews/{submission.id}', headers={'X-Demo-User': reviewer.username})

    assert response.status_code == 200
    ai_result = response.json()['data']['aiResult']
    assert ai_result['scores'] == []
    assert ai_result['decision'] == 'human_review'
```

- [ ] **Step 7: 跑前后端相关测试**

Run: `npm --prefix frontend run test -- ReviewerReviewsPage.test.tsx && pytest backend/tests/test_reviews_api.py -v`
Expected: PASS，前端不再因 AI 结果异常崩溃，后端返回兜底结构。

- [ ] **Step 8: 提交本任务**

```bash
git add frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.tsx frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.test.tsx backend/app/api/routes/reviews.py backend/tests/test_reviews_api.py
git commit -m "fix: harden reviewer ai result rendering"
```

### Task 3: 后端补 DeepSeek 结果 normalize、schema 校验与错误摘要

**Files:**
- Modify: `backend/app/services/ai_executor.py`
- Test: `backend/tests/test_ai_executor.py`
- Modify: `backend/app/core/config.py`

- [ ] **Step 1: 写一个失败的 executor 测试，覆盖 scores 非数组场景**

```python
from app.services.ai_executor import DeepSeekAIExecutor


def test_deepseek_executor_normalizes_single_score_object(monkeypatch):
    class DummyResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                'choices': [
                    {
                        'message': {
                            'content': '{"scores":{"dimension":"完整性","score":4,"reason":"ok"},"decision":"pass","summary":"done"}'
                        }
                    }
                ]
            }

    monkeypatch.setattr('app.services.ai_executor.requests.post', lambda *args, **kwargs: DummyResponse())

    result = DeepSeekAIExecutor().execute({'summary': 'x'})

    assert isinstance(result.scores, list)
    assert result.scores[0]['dimension'] == '完整性'
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pytest backend/tests/test_ai_executor.py::test_deepseek_executor_normalizes_single_score_object -v`
Expected: FAIL，当前 `scores` 会原样返回对象而非数组。

- [ ] **Step 3: 在 ai_executor.py 中补结果规范化函数**

```python
def normalize_scores(raw_scores: object) -> list[AIScore]:
    if isinstance(raw_scores, list):
        items = raw_scores
    elif isinstance(raw_scores, dict):
        items = [raw_scores]
    else:
        return []

    normalized: list[AIScore] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        dimension = str(item.get('dimension') or '未命名维度')
        score = item.get('score')
        reason = str(item.get('reason') or '模型未返回评分理由。')
        if not isinstance(score, int):
            continue
        normalized.append({'dimension': dimension, 'score': score, 'reason': reason})
    return normalized
```

- [ ] **Step 4: 补 decision / summary 校验并返回规范化结果**

```python
def normalize_result(parsed: dict) -> AIExecutionResult:
    decision = parsed.get('decision')
    if decision not in {'pass', 'reject', 'human_review'}:
        raise RuntimeError(f'unsupported ai decision: {decision}')

    scores = normalize_scores(parsed.get('scores'))
    summary = parsed.get('summary')
    if not isinstance(summary, str) or not summary.strip():
        summary = 'AI 结果缺少总结，建议人工复核。'

    return AIExecutionResult(scores=scores, decision=decision, summary=summary)
```

并在 `DeepSeekAIExecutor.execute` 的尾部改成：

```python
return normalize_result(parsed)
```

- [ ] **Step 5: 为 schema 异常与 summary 缺失各补一个测试**

```python
def test_deepseek_executor_uses_fallback_summary_when_summary_missing(monkeypatch):
    ...
    assert result.summary == 'AI 结果缺少总结，建议人工复核。'
```

```python
def test_deepseek_executor_rejects_unknown_decision(monkeypatch):
    ...
    with pytest.raises(RuntimeError, match='unsupported ai decision'):
        DeepSeekAIExecutor().execute({'summary': 'x'})
```

- [ ] **Step 6: 配置文件仅补注释性约束，不改当前运行语义**

```python
class Settings(BaseSettings):
    api_prefix: str = '/api/v1'
    # 保持本地默认值，但运行方式需允许通过环境变量覆盖，避免部署口径只适配本机。
```

只允许加入一行中文短注释，不修改现有默认值，避免今天扩大范围。

- [ ] **Step 7: 跑后端测试确认通过**

Run: `pytest backend/tests/test_ai_executor.py -v`
Expected: PASS，DeepSeek 结果规范化、decision 校验、summary 兜底都通过。

- [ ] **Step 8: 提交本任务**

```bash
git add backend/app/services/ai_executor.py backend/tests/test_ai_executor.py backend/app/core/config.py
git commit -m "fix: normalize deepseek audit responses"
```

### Task 4: 导出页与 README 口径收口到“当前真实能力 + 不写死本地”

**Files:**
- Modify: `frontend/src/pages/owner/exports/OwnerExportsPage.tsx`
- Modify: `README.md`
- Test: `frontend/src/pages/owner/exports/OwnerExportsPage.test.tsx`

- [ ] **Step 1: 写一个失败的导出页提示测试**

```tsx
test('导出页会明确提示当前仅支持 json 与 csv', async () => {
  render(<OwnerExportsPage />)
  expect(await screen.findByText('当前仅开放 JSON / CSV 两种真实支持格式。')).toBeInTheDocument()
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm --prefix frontend run test -- OwnerExportsPage.test.tsx`
Expected: FAIL，当前页面没有说明文案。

- [ ] **Step 3: 在导出页加入当前能力提示**

```tsx
<p className="export-empty-message">当前仅开放 JSON / CSV 两种真实支持格式。</p>
```

把它放在“发起导出”卡片的格式选择框下方。

- [ ] **Step 4: 更新 README 的本地启动与联调口径**

将以下表述改成更稳妥的版本：

```md
当前前端默认通过 `/api/*` 与后端通信；本地开发阶段由 Vite proxy 转发到后端端口。后续如部署到云环境，优先保持 `/api` 反向代理口径一致，不要把前端 API 地址写死为本机 `127.0.0.1`。
```

并把“手动启动（兜底）”中的后端启动命令改成：

```powershell
python -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8765
```

前端命令改成：

```bash
npm --prefix frontend run dev -- --host 0.0.0.0 --port 5176
```

- [ ] **Step 5: README 中补一句当前真实导出能力声明**

```md
当前真实导出能力已稳定支持 JSON / CSV；JSONL / Excel 仍在后续阶段路线图中，不应在对外说明中表述为“已完成”。
```

- [ ] **Step 6: 跑导出页测试确认通过**

Run: `npm --prefix frontend run test -- OwnerExportsPage.test.tsx`
Expected: PASS，导出页提示测试通过。

- [ ] **Step 7: 提交本任务**

```bash
git add frontend/src/pages/owner/exports/OwnerExportsPage.tsx frontend/src/pages/owner/exports/OwnerExportsPage.test.tsx README.md
git commit -m "docs: align export and local runtime messaging"
```

### Task 5: 阶段 0 联合回归验证

**Files:**
- Test: `frontend/src/App.test.tsx`
- Test: `frontend/src/pages/auth/LoginPage.test.tsx`
- Test: `frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.test.tsx`
- Test: `frontend/src/pages/owner/exports/OwnerExportsPage.test.tsx`
- Test: `backend/tests/test_ai_executor.py`
- Test: `backend/tests/test_reviews_api.py`
- Test: `backend/tests/test_workbench_api.py`

- [ ] **Step 1: 跑前端相关测试集**

Run: `npm --prefix frontend run test -- App.test.tsx LoginPage.test.tsx ReviewerReviewsPage.test.tsx OwnerExportsPage.test.tsx`
Expected: PASS，角色路由、登录跳转、Reviewer 兜底、导出提示全部通过。

- [ ] **Step 2: 跑后端相关测试集**

Run: `pytest backend/tests/test_ai_executor.py backend/tests/test_reviews_api.py backend/tests/test_workbench_api.py -v`
Expected: PASS，AI 规范化、reviews detail 兜底、workbench 基线全部通过。

- [ ] **Step 3: 跑更小范围的构建或类型校验**

Run: `npm --prefix frontend run build`
Expected: PASS，前端角色路由拆分后仍可构建。

- [ ] **Step 4: 记录本轮阶段 0 完成口径**

```md
- 前端已从混合侧边栏切到统一登录 + 分角色工作台最小结构。
- Reviewer 详情页对 AI 结果缺失或异常已具备兜底渲染。
- 后端 DeepSeek 返回已增加 normalize 与最小 schema 校验。
- README 已同步“当前真实能力”和“不要只适配本地”的运行口径。
```

将以上四条用于本轮进度同步或后续提交说明，不需要新建文档。

- [ ] **Step 5: 提交本任务**

```bash
git add frontend/src/App.test.tsx frontend/src/pages/auth/LoginPage.test.tsx frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.test.tsx frontend/src/pages/owner/exports/OwnerExportsPage.test.tsx backend/tests/test_ai_executor.py backend/tests/test_reviews_api.py backend/tests/test_workbench_api.py README.md
git commit -m "test: verify stage0 stability improvements"
```

---

## Self-Review

### Spec coverage
- A 侧阶段 0：角色工作台拆分、状态文案收口、README 对齐、导出能力口径一致 —— 已覆盖在 Task 1、Task 2、Task 4、Task 5。
- B 侧阶段 0：DeepSeek normalize、schema 校验、异常转人工复核兜底、日志基础、测试回归 —— 其中 normalize / schema / reviews detail 兜底 / 测试已覆盖；“AI 返回异常时写入可读错误信息”在本轮通过 `summary` fallback 与 review detail fallback 收口到对外可读层，日志记录仅作为下一轮增强，避免今天范围膨胀。
- README 与本地运行口径 —— 已覆盖 Task 4。

### Placeholder scan
- 未使用 TBD / TODO / “适当处理” 之类空泛占位。
- 每个任务都包含明确文件、代码片段、测试命令与期望结果。

### Type consistency
- 角色根路径统一使用 `/owner`、`/labeler`、`/reviewer`。
- 守卫使用 `labelhub_demo_role` 本地存储键，登录页与 guard 一致。
- AI 兜底结论统一使用 `human_review`。

Plan complete and saved to `docs/superpowers/plans/2026-05-29-stage0-ab-joint-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
