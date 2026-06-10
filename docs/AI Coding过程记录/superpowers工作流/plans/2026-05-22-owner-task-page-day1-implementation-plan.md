# Owner 任务管理页 Day 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 在现有任务管理页中完成“列表展示 + 新建任务”的前端最小闭环，并保证新增流程可通过自动化测试与构建验证。

**Architecture:** 保持单页实现，不新增路由、不引入额外状态管理层。先补最小前端测试基建，再通过组件测试驱动任务管理页的列表态、新建态、表单校验与本地新增流程，最后补样式并跑测试与构建收口。

**Tech Stack:** React 18、TypeScript、Vite 5、Vitest、Testing Library

---

## File Structure

### Existing files to modify
- `frontend/package.json` — 增加测试依赖与测试脚本。
- `frontend/src/pages/owner/tasks/OwnerTasksPage.tsx` — 实现任务列表 / 新建任务单页切换与本地状态。
- `frontend/src/mocks/tasks.ts` — 扩展 mock 任务字段，补齐截止时间。
- `frontend/src/types/domain.ts` — 增加任务管理页使用的前端任务类型。
- `frontend/src/styles.css` — 为表单区、错误提示、按钮占位补最小样式。

### New files to create
- `frontend/vitest.config.ts` — 配置 jsdom 测试环境。
- `frontend/src/test/setup.ts` — 注册 Testing Library 扩展。
- `frontend/src/pages/owner/tasks/OwnerTasksPage.test.tsx` — 任务管理页行为测试。

---

### Task 1: 补最小前端测试基建

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/src/test/setup.ts`

- [x] **Step 1: 先更新 `frontend/package.json`，增加测试脚本和依赖**

```json
{
  "name": "labelhub-frontend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.28.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.3",
    "jsdom": "^25.0.1",
    "typescript": "^5.6.3",
    "vite": "^5.4.10",
    "vitest": "^2.1.4"
  }
}
```

- [x] **Step 2: 新建 `frontend/vitest.config.ts`，声明测试环境**

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
})
```

- [x] **Step 3: 新建 `frontend/src/test/setup.ts`，注册 jest-dom 扩展**

```ts
import '@testing-library/jest-dom'
```

- [x] **Step 4: 安装新增依赖**

Run: `npm install`
Expected: 成功安装 vitest、testing-library、jsdom，命令退出码为 0

- [x] **Step 5: 运行空测试命令，确认测试基建已可执行**

Run: `npm run test`
Expected: 输出 `No test files found` 或 0 个测试文件的提示，但命令可以正常启动 Vitest

- [x] **Step 6: 提交本任务**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vitest.config.ts frontend/src/test/setup.ts
git commit -m "test: add frontend vitest setup"
```

---

### Task 2: 先写任务管理页失败测试

**Files:**
- Test: `frontend/src/pages/owner/tasks/OwnerTasksPage.test.tsx`

- [x] **Step 1: 新建 `frontend/src/pages/owner/tasks/OwnerTasksPage.test.tsx`，覆盖列表展示、视图切换、表单校验与新增成功**

```tsx
import { MemoryRouter } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OwnerTasksPage } from './OwnerTasksPage'

function renderOwnerTasksPage() {
  render(
    <MemoryRouter>
      <OwnerTasksPage />
    </MemoryRouter>,
  )
}

describe('OwnerTasksPage', () => {
  it('renders the initial mock task list', () => {
    renderOwnerTasksPage()

    expect(screen.getByRole('heading', { name: '任务管理' })).toBeInTheDocument()
    expect(screen.getByText('情感标注任务')).toBeInTheDocument()
    expect(screen.getByText('状态：draft')).toBeInTheDocument()
    expect(screen.getByText('截止时间：2026-05-31 18:00')).toBeInTheDocument()
  })

  it('switches to the create form and back to the list view', async () => {
    const user = userEvent.setup()
    renderOwnerTasksPage()

    await user.click(screen.getByRole('button', { name: '新建任务' }))

    expect(screen.getByLabelText('标题')).toBeInTheDocument()
    expect(screen.getByLabelText('描述')).toBeInTheDocument()
    expect(screen.getByLabelText('截止时间')).toBeInTheDocument()
    expect(screen.getByLabelText('配额')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '返回列表' }))

    expect(screen.getByRole('button', { name: '新建任务' })).toBeInTheDocument()
    expect(screen.queryByLabelText('标题')).not.toBeInTheDocument()
  })

  it('shows validation errors when required fields are missing', async () => {
    const user = userEvent.setup()
    renderOwnerTasksPage()

    await user.click(screen.getByRole('button', { name: '新建任务' }))
    await user.click(screen.getByRole('button', { name: '保存任务' }))

    expect(screen.getByText('标题不能为空')).toBeInTheDocument()
    expect(screen.getByText('截止时间不能为空')).toBeInTheDocument()
    expect(screen.getByText('配额必须是正数')).toBeInTheDocument()
  })

  it('creates a new draft task and prepends it to the list', async () => {
    const user = userEvent.setup()
    renderOwnerTasksPage()

    await user.click(screen.getByRole('button', { name: '新建任务' }))
    await user.type(screen.getByLabelText('标题'), '舆情分类任务')
    await user.type(screen.getByLabelText('描述'), '对社交媒体文本进行类别判断')
    await user.type(screen.getByLabelText('截止时间'), '2026-06-01 20:00')
    await user.clear(screen.getByLabelText('配额'))
    await user.type(screen.getByLabelText('配额'), '50')

    await user.click(screen.getByRole('button', { name: '保存任务' }))

    const taskTitles = screen.getAllByRole('heading', { level: 3 }).map((item) => item.textContent)
    expect(taskTitles[0]).toBe('舆情分类任务')
    expect(screen.getByText('状态：draft')).toBeInTheDocument()
    expect(screen.getByText('截止时间：2026-06-01 20:00')).toBeInTheDocument()
  })
})
```

- [x] **Step 2: 运行单测，确认它先失败**

Run: `npm run test -- src/pages/owner/tasks/OwnerTasksPage.test.tsx`
Expected: FAIL，原因应包含缺少截止时间展示、缺少表单字段、缺少保存逻辑等

- [x] **Step 3: 提交本任务**

```bash
git add frontend/src/pages/owner/tasks/OwnerTasksPage.test.tsx
git commit -m "test: add owner tasks page specs"
```

---

### Task 3: 补齐任务 mock 与类型定义

**Files:**
- Modify: `frontend/src/mocks/tasks.ts`
- Modify: `frontend/src/types/domain.ts`
- Test: `frontend/src/pages/owner/tasks/OwnerTasksPage.test.tsx`

- [x] **Step 1: 在 `frontend/src/types/domain.ts` 中增加任务管理页专用类型**

```ts
export type UserRole = 'owner' | 'labeler' | 'reviewer'

export type TaskStatus = 'draft' | 'published' | 'paused' | 'ended'

export type SubmissionStatus =
  | 'draft'
  | 'submitted'
  | 'ai_passed'
  | 'needs_revision'
  | 'review_passed'

export type AIDecision = 'pass' | 'reject' | 'human_review'

export type ExportStatus = 'queued' | 'processing' | 'done' | 'failed'

export type OwnerTask = {
  id: number
  title: string
  description: string
  status: TaskStatus
  quota: number
  deadline: string
}
```

- [x] **Step 2: 在 `frontend/src/mocks/tasks.ts` 中改用共享类型并补截止时间**

```ts
import type { OwnerTask } from '../types/domain'

export const ownerTasksMock: OwnerTask[] = [
  {
    id: 101,
    title: '情感标注任务',
    description: '判断文本情感倾向',
    status: 'draft',
    quota: 100,
    deadline: '2026-05-31 18:00',
  },
]
```

- [x] **Step 3: 运行失败测试，确认失败原因已经收敛到页面逻辑缺失**

Run: `npm run test -- src/pages/owner/tasks/OwnerTasksPage.test.tsx`
Expected: 仍然 FAIL，但不再是类型或 mock 字段缺失，主要失败点应集中在页面行为未实现

- [x] **Step 4: 提交本任务**

```bash
git add frontend/src/types/domain.ts frontend/src/mocks/tasks.ts
git commit -m "refactor: align owner task mock shape"
```

---

### Task 4: 实现任务管理页最小闭环

**Files:**
- Modify: `frontend/src/pages/owner/tasks/OwnerTasksPage.tsx`
- Test: `frontend/src/pages/owner/tasks/OwnerTasksPage.test.tsx`

- [x] **Step 1: 用下面的完整实现替换 `frontend/src/pages/owner/tasks/OwnerTasksPage.tsx`**

```tsx
import { useState } from 'react'
import { ownerTasksMock } from '../../../mocks/tasks'
import type { OwnerTask } from '../../../types/domain'

type ViewMode = 'list' | 'create'

type TaskFormState = {
  title: string
  description: string
  deadline: string
  quota: string
}

const initialFormState: TaskFormState = {
  title: '',
  description: '',
  deadline: '',
  quota: '1',
}

export function OwnerTasksPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [tasks, setTasks] = useState<OwnerTask[]>(ownerTasksMock)
  const [form, setForm] = useState<TaskFormState>(initialFormState)
  const [errors, setErrors] = useState<string[]>([])

  function handleChange(field: keyof TaskFormState, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function handleBackToList() {
    setViewMode('list')
    setForm(initialFormState)
    setErrors([])
  }

  function validateForm() {
    const nextErrors: string[] = []

    if (!form.title.trim()) {
      nextErrors.push('标题不能为空')
    }

    if (!form.deadline.trim()) {
      nextErrors.push('截止时间不能为空')
    }

    const quota = Number(form.quota)
    if (!form.quota.trim() || Number.isNaN(quota) || quota <= 0) {
      nextErrors.push('配额必须是正数')
    }

    return nextErrors
  }

  function handleSaveTask() {
    const nextErrors = validateForm()
    if (nextErrors.length > 0) {
      setErrors(nextErrors)
      return
    }

    const newTask: OwnerTask = {
      id: Date.now(),
      title: form.title.trim(),
      description: form.description.trim(),
      status: 'draft',
      quota: Number(form.quota),
      deadline: form.deadline.trim(),
    }

    setTasks((current) => [newTask, ...current])
    setForm(initialFormState)
    setErrors([])
    setViewMode('list')
  }

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>任务管理</h2>
          <p>第一版先用 mock 数据支撑页面骨架。</p>
        </div>
        {viewMode === 'list' ? (
          <button type="button" onClick={() => setViewMode('create')}>
            新建任务
          </button>
        ) : (
          <div className="button-row">
            <button type="button" onClick={handleBackToList}>
              返回列表
            </button>
            <button type="button" onClick={handleSaveTask}>
              保存任务
            </button>
          </div>
        )}
      </header>

      {viewMode === 'create' ? (
        <article className="card task-form-card">
          <div className="form-grid">
            <label className="form-field">
              <span>标题</span>
              <input
                value={form.title}
                onChange={(event) => handleChange('title', event.target.value)}
              />
            </label>
            <label className="form-field">
              <span>描述</span>
              <textarea
                value={form.description}
                onChange={(event) => handleChange('description', event.target.value)}
              />
            </label>
            <label className="form-field">
              <span>截止时间</span>
              <input
                value={form.deadline}
                onChange={(event) => handleChange('deadline', event.target.value)}
              />
            </label>
            <label className="form-field">
              <span>配额</span>
              <input
                type="number"
                min="1"
                value={form.quota}
                onChange={(event) => handleChange('quota', event.target.value)}
              />
            </label>
          </div>

          {errors.length > 0 ? (
            <ul className="error-list">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}
        </article>
      ) : (
        <div className="card-list">
          {tasks.map((task) => (
            <article className="card" key={task.id}>
              <h3>{task.title}</h3>
              <p>{task.description}</p>
              <div className="meta-row">
                <span>状态：{task.status}</span>
                <span>配额：{task.quota}</span>
              </div>
              <div className="meta-row">
                <span>截止时间：{task.deadline}</span>
              </div>
              <div className="button-row">
                <button type="button">发布</button>
                <button type="button">暂停</button>
                <button type="button">结束</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
```

- [x] **Step 2: 运行单测，确认页面行为测试全部通过**

Run: `npm run test -- src/pages/owner/tasks/OwnerTasksPage.test.tsx`
Expected: PASS，4 个测试全部通过

- [x] **Step 3: 提交本任务**

```bash
git add frontend/src/pages/owner/tasks/OwnerTasksPage.tsx
git commit -m "feat: implement owner tasks day1 flow"
```

---

### Task 5: 补最小样式并完成收口验证

**Files:**
- Modify: `frontend/src/styles.css`
- Modify: `frontend/src/pages/owner/tasks/OwnerTasksPage.tsx`
- Test: `frontend/src/pages/owner/tasks/OwnerTasksPage.test.tsx`

- [x] **Step 1: 在 `frontend/src/styles.css` 末尾追加任务页需要的最小样式**

```css
.task-form-card {
  display: grid;
  gap: 16px;
}

.form-grid {
  display: grid;
  gap: 16px;
}

.form-field {
  display: grid;
  gap: 8px;
  color: #37352f;
  font-size: 14px;
}

.form-field input,
.form-field textarea {
  width: 100%;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px 12px;
  font: inherit;
  background: #ffffff;
}

.form-field textarea {
  min-height: 96px;
  resize: vertical;
}

.error-list {
  margin: 0;
  padding-left: 20px;
  color: #b42318;
}
```

- [x] **Step 2: 跑全量前端测试，确认没有回归**

Run: `npm run test`
Expected: PASS，包含 `OwnerTasksPage.test.tsx` 在内的全部测试通过

- [x] **Step 3: 跑前端构建，确认类型与打包通过**

Run: `npm run build`
Expected: PASS，输出 Vite build 成功结果

- [x] **Step 4: 启动前端并手工验证黄金路径**

Run: `npm run dev -- --host 127.0.0.1 --port 4173`
Expected: 本地开发服务器启动成功，可在浏览器打开任务管理页

手工检查清单：
- 打开默认页面后能看到任务管理列表。
- 点击“新建任务”后显示 4 个字段表单。
- 留空保存时能看到错误提示。
- 填完表单保存后回到列表态。
- 新任务出现在列表顶部，状态为 `draft`。
- 列表中可看到“发布 / 暂停 / 结束”占位按钮。

- [x] **Step 5: 提交本任务**

```bash
git add frontend/src/styles.css
git commit -m "style: polish owner tasks page form"
```

---

## Self-Review Notes

### Spec coverage
- 列表态 / 新建态切换：Task 2、Task 4
- 4 字段表单：Task 2、Task 4
- 本地 mock state：Task 3、Task 4
- 新增任务后回列表：Task 2、Task 4
- 最小校验：Task 2、Task 4
- 按钮占位：Task 4
- 自动化验证与构建：Task 1、Task 5

### Placeholder scan
- 已避免 TBD / TODO / “自行实现”。
- 每个代码步骤都给出了完整内容或明确命令。

### Type consistency
- 任务类型统一使用 `OwnerTask`。
- 表单字段统一为 `title`、`description`、`deadline`、`quota`。
- 截止时间展示统一为 `deadline`。
