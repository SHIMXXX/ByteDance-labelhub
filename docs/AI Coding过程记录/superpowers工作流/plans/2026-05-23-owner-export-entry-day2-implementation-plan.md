# Owner 导出入口 Day 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Owner 侧新增导出管理页，完成发起导出 + 导出历史展示的前端最小闭环，mock 独立开发。

**Architecture:** 新路由 `/owner/exports`，单页两区域（发起 + 历史）。复用现有 `ExportStatus` 枚举，新增 `ExportFormat`、`ExportJob` 类型。侧边栏加导航链接。

**Tech Stack:** React 18、TypeScript、Vite 5、Vitest、Testing Library

---

## File Structure

### Existing files to modify
- `frontend/src/types/domain.ts` — 新增 `ExportFormat`、`ExportJob` 类型。
- `frontend/src/App.tsx` — 加路由和侧边栏链接。
- `frontend/src/styles.css` — 新增导出页专用样式。

### New files to create
- `frontend/src/mocks/exports.ts` — mock 导出历史记录。
- `frontend/src/pages/owner/exports/OwnerExportsPage.tsx` — 新页面。
- `frontend/src/pages/owner/exports/OwnerExportsPage.test.tsx` — 测试。

---

### Task 1: 补齐类型、mock 与路由

**Files:**
- Modify: `frontend/src/types/domain.ts`
- Create: `frontend/src/mocks/exports.ts`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: 在 `frontend/src/types/domain.ts` 末尾追加导出相关类型**

```ts
export type ExportFormat = 'json' | 'csv' | 'jsonl' | 'excel'

export type ExportJob = {
  jobId: number
  taskId: number
  taskTitle: string
  format: ExportFormat
  status: ExportStatus
  downloadUrl?: string
  createdAt: string
  finishedAt?: string
}
```

- [ ] **Step 2: 新建 `frontend/src/mocks/exports.ts`**

```ts
import type { ExportJob } from '../types/domain'

export const exportJobsMock: ExportJob[] = [
  {
    jobId: 801,
    taskId: 101,
    taskTitle: '情感标注任务',
    format: 'json',
    status: 'done',
    downloadUrl: '/downloads/export-801.json',
    createdAt: '2026-05-21T15:00:00Z',
    finishedAt: '2026-05-21T15:01:00Z',
  },
  {
    jobId: 802,
    taskId: 101,
    taskTitle: '情感标注任务',
    format: 'csv',
    status: 'failed',
    createdAt: '2026-05-21T16:00:00Z',
    finishedAt: '2026-05-21T16:01:00Z',
  },
]
```

- [ ] **Step 3: 更新 `frontend/src/App.tsx`，在 import 和 Routes 中加导出页，在 sidebar nav 中加链接**

在文件顶部 import 区加：
```ts
import { OwnerExportsPage } from './pages/owner/exports/OwnerExportsPage'
```

在 sidebar nav 中（`<Link to="/reviewer/reviews">审核台</Link>` 之后）加：
```tsx
<Link to="/owner/exports">导出管理</Link>
```

在 Routes 中（`<Route path="/reviewer/reviews" ... />` 之后）加：
```tsx
<Route path="/owner/exports" element={<OwnerExportsPage />} />
```

- [ ] **Step 4: 运行类型检查确认无报错**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无类型错误，退出码 0

- [ ] **Step 5: 提交本任务**

```bash
git add frontend/src/types/domain.ts frontend/src/mocks/exports.ts frontend/src/App.tsx
git commit -m "feat: add export types, mock data and route"
```

---

### Task 2: 先写导出页失败测试

**Files:**
- Create: `frontend/src/pages/owner/exports/OwnerExportsPage.test.tsx`

- [ ] **Step 1: 新建 `frontend/src/pages/owner/exports/OwnerExportsPage.test.tsx`**

```tsx
import { MemoryRouter } from 'react-router-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { OwnerExportsPage } from './OwnerExportsPage'

function renderOwnerExportsPage() {
  render(
    <MemoryRouter>
      <OwnerExportsPage />
    </MemoryRouter>,
  )
}

describe('OwnerExportsPage', () => {
  it('renders the page header and create export section', () => {
    renderOwnerExportsPage()

    expect(screen.getByRole('heading', { name: '导出管理' })).toBeInTheDocument()
    expect(screen.getByText('发起导出')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '发起导出' })).toBeInTheDocument()
  })

  it('renders the export history list', () => {
    renderOwnerExportsPage()

    expect(screen.getByText('导出历史')).toBeInTheDocument()

    const cards = screen.getAllByRole('article')
    expect(cards.length).toBeGreaterThanOrEqual(1)

    expect(screen.getByText('#801')).toBeInTheDocument()
    expect(screen.getByText('json')).toBeInTheDocument()
    expect(screen.getByText('done')).toBeInTheDocument()
    expect(screen.getByText('下载')).toBeInTheDocument()
  })

  it('creates a new export job on submit', async () => {
    const user = userEvent.setup()
    renderOwnerExportsPage()

    await user.click(screen.getByRole('button', { name: '发起导出' }))

    expect(screen.getByText('导出任务已创建')).toBeInTheDocument()
    expect(screen.getByText('queued')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 运行测试，确认全部失败**

Run: `cd frontend && npm run test -- src/pages/owner/exports/OwnerExportsPage.test.tsx`
Expected: FAIL，3 个测试全部失败

- [ ] **Step 3: 提交本任务**

```bash
git add frontend/src/pages/owner/exports/OwnerExportsPage.test.tsx
git commit -m "test: add owner exports page specs"
```

---

### Task 3: 实现导出页完整逻辑

**Files:**
- Create: `frontend/src/pages/owner/exports/OwnerExportsPage.tsx`

- [ ] **Step 1: 新建 `frontend/src/pages/owner/exports/OwnerExportsPage.tsx`**

```tsx
import { useState } from 'react'
import { exportJobsMock } from '../../../mocks/exports'
import type { ExportFormat, ExportJob, ExportStatus } from '../../../types/domain'

const exportableTasks = [
  { id: 101, title: '情感标注任务' },
  { id: 102, title: '商品分类任务' },
]

const formats: ExportFormat[] = ['json', 'csv', 'jsonl', 'excel']

const statusClassName: Record<ExportStatus, string> = {
  queued: 'export-status-queued',
  processing: 'export-status-processing',
  done: 'export-status-done',
  failed: 'export-status-failed',
}

function renderStatusBadge(status: ExportStatus) {
  return <span className={`tag-pill ${statusClassName[status]}`}>{status}</span>
}

export function OwnerExportsPage() {
  const [jobs, setJobs] = useState<ExportJob[]>(exportJobsMock)
  const [selectedTaskId, setSelectedTaskId] = useState(101)
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('json')
  const [feedback, setFeedback] = useState('')

  function handleCreateExport() {
    const task = exportableTasks.find((t) => t.id === selectedTaskId)
    const newJob: ExportJob = {
      jobId: Date.now(),
      taskId: selectedTaskId,
      taskTitle: task?.title ?? '未知任务',
      format: selectedFormat,
      status: 'queued',
      createdAt: new Date().toISOString(),
    }
    setJobs((prev) => [newJob, ...prev])
    setFeedback('导出任务已创建')
    setTimeout(() => setFeedback(''), 3000)
  }

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>导出管理</h2>
        </div>
      </header>

      <div className="card-list">
        <article className="card">
          <h3>发起导出</h3>
          <div className="form-grid">
            <label className="form-field">
              <span>任务</span>
              <select
                value={selectedTaskId}
                onChange={(e) => setSelectedTaskId(Number(e.target.value))}
              >
                {exportableTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>导出格式</span>
              <select
                value={selectedFormat}
                onChange={(e) => setSelectedFormat(e.target.value as ExportFormat)}
              >
                {formats.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="button-row">
            <button type="button" onClick={handleCreateExport}>
              发起导出
            </button>
          </div>
          {feedback ? <p className="feedback-message">{feedback}</p> : null}
        </article>

        <article className="card">
          <h3>导出历史</h3>
          {jobs.length === 0 ? (
            <p className="export-empty-message">暂无导出记录</p>
          ) : (
            <div className="card-list">
              {jobs.map((job) => (
                <article className="card" key={job.jobId}>
                  <h4>#{job.jobId}</h4>
                  <p>{job.taskTitle}</p>
                  <div className="meta-row">
                    <span>格式：{job.format}</span>
                    <span>状态：</span>
                    {renderStatusBadge(job.status)}
                  </div>
                  <div className="meta-row">
                    <span>创建时间：{job.createdAt}</span>
                  </div>
                  {job.status === 'done' && job.downloadUrl ? (
                    <div className="button-row">
                      <a href={job.downloadUrl} className="button" download>
                        下载
                      </a>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </article>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: 运行测试，确认全部通过**

Run: `cd frontend && npm run test -- src/pages/owner/exports/OwnerExportsPage.test.tsx`
Expected: PASS，3 个测试全部通过

- [ ] **Step 3: 提交本任务**

```bash
git add frontend/src/pages/owner/exports/OwnerExportsPage.tsx
git commit -m "feat: implement owner exports page"
```

---

### Task 4: 补最小样式并收口验证

**Files:**
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: 在 `frontend/src/styles.css` 末尾追加导出页专用样式**

```css
.export-status-queued {
  color: #787671;
  border-color: #787671;
  background: #f6f5f4;
}

.export-status-processing {
  color: #1a56db;
  border-color: #1a56db;
  background: #eff6ff;
}

.export-status-done {
  color: #067647;
  border-color: #067647;
  background: #ecfdf3;
}

.export-status-failed {
  color: #b42318;
  border-color: #b42318;
  background: #fef3f2;
}

.export-empty-message {
  color: #787671;
}
```

- [ ] **Step 2: 跑全量前端测试**

Run: `cd frontend && npm run test`
Expected: PASS，所有测试通过

- [ ] **Step 3: 跑前端构建**

Run: `cd frontend && npm run build`
Expected: PASS

- [ ] **Step 4: 手工验证**

Run: `cd frontend && npm run dev -- --host 127.0.0.1 --port 4173`

检查：
- 侧边栏出现"导出管理"链接，可点击进入
- 页面显示发起导出区（task select + format select + 按钮）
- 点击"发起导出"后出现反馈文案和新的 queued job
- 导出历史显示初始 2 条 + 新增的记录
- done 状态显示"下载"按钮

- [ ] **Step 5: 提交本任务**

```bash
git add frontend/src/styles.css
git commit -m "style: polish owner exports page"
```
