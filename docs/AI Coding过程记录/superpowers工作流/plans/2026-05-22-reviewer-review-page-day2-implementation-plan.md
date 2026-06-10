# Reviewer 审核台 Day 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 ReviewerReviewsPage 壳子中完成待审列表 + 审核详情 + 通过/打回操作的前端最小闭环，mock 独立开发。

**Architecture:** 单页两视图切换（同 OwnerTasksPage 模式），不新增路由、不接后端。数据层补充类型与 mock，页面用本地 state 管理列表、选中项和审核操作。测试覆盖列表渲染、详情导航、通过、打回四条核心路径。

**Tech Stack:** React 18、TypeScript、Vite 5、Vitest、Testing Library

---

## File Structure

### Existing files to modify
- `frontend/src/types/domain.ts` — 新增 ReviewAnswerValue、ReviewPendingItem、ReviewDetail 类型。
- `frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.tsx` — 替换壳子为完整实现。
- `frontend/src/styles.css` — 新增审核页专用样式（AI tag、评分表、审核操作区）。

### New files to create
- `frontend/src/mocks/reviews.ts` — mock 待审列表与详情数据，对齐契约第 6 节。
- `frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.test.tsx` — 覆盖列表、详情、通过、打回行为。

---

### Task 1: 补齐类型与 mock 数据

**Files:**
- Modify: `frontend/src/types/domain.ts`
- Create: `frontend/src/mocks/reviews.ts`

- [ ] **Step 1: 在 `frontend/src/types/domain.ts` 末尾追加审核相关类型**

```ts
export type ReviewAnswerValue = string | string[]

export type ReviewPendingItem = {
  submissionId: number
  taskId: number
  itemId: number
  labelerName: string
  aiDecision: AIDecision
  submissionStatus: SubmissionStatus
  submittedAt: string
}

export type ReviewDetail = {
  submissionId: number
  task: { id: number; title: string }
  item: { itemId: number; source: Record<string, string> }
  answers: Record<string, ReviewAnswerValue>
  aiResult: {
    scores: { dimension: string; score: number; reason: string }[]
    decision: AIDecision
    summary: string
  }
  submissionStatus: SubmissionStatus
}
```

- [ ] **Step 2: 新建 `frontend/src/mocks/reviews.ts`**

```ts
import type { ReviewDetail, ReviewPendingItem } from '../types/domain'

export const reviewPendingItemsMock: ReviewPendingItem[] = [
  {
    submissionId: 601,
    taskId: 101,
    itemId: 501,
    labelerName: 'labeler_demo_1',
    aiDecision: 'pass',
    submissionStatus: 'ai_passed',
    submittedAt: '2026-05-21T13:05:00Z',
  },
  {
    submissionId: 602,
    taskId: 101,
    itemId: 502,
    labelerName: 'labeler_demo_1',
    aiDecision: 'human_review',
    submissionStatus: 'ai_passed',
    submittedAt: '2026-05-21T14:10:00Z',
  },
  {
    submissionId: 603,
    taskId: 102,
    itemId: 503,
    labelerName: 'labeler_demo_2',
    aiDecision: 'pass',
    submissionStatus: 'ai_passed',
    submittedAt: '2026-05-21T15:30:00Z',
  },
]

export const reviewDetailsMock: Record<number, ReviewDetail> = {
  601: {
    submissionId: 601,
    task: { id: 101, title: '情感标注任务' },
    item: {
      itemId: 501,
      source: { source_text: '这个产品非常好用，客服响应也很快。' },
    },
    answers: { sentiment: '正向', reason: '表达明显积极' },
    aiResult: {
      scores: [
        { dimension: 'accuracy', score: 4, reason: '判断与文本语义一致' },
        { dimension: 'format', score: 5, reason: '字段完整' },
      ],
      decision: 'pass',
      summary: '整体标注质量较好，建议进入人工复审',
    },
    submissionStatus: 'ai_passed',
  },
  602: {
    submissionId: 602,
    task: { id: 101, title: '情感标注任务' },
    item: {
      itemId: 502,
      source: { source_text: '物流太慢了，等了整整一周才到货。' },
    },
    answers: { sentiment: '负向', reason: '物流体验差' },
    aiResult: {
      scores: [
        { dimension: 'accuracy', score: 2, reason: '情感判断可能有误，需人工确认' },
      ],
      decision: 'human_review',
      summary: 'AI 判断置信度较低，建议人工仔细审核',
    },
    submissionStatus: 'ai_passed',
  },
  603: {
    submissionId: 603,
    task: { id: 102, title: '商品分类任务' },
    item: {
      itemId: 503,
      source: { product_name: '无线蓝牙耳机', category_hint: '电子产品' },
    },
    answers: { category: '电子产品', sub_category: '音频设备' },
    aiResult: {
      scores: [{ dimension: 'accuracy', score: 5, reason: '分类正确' }],
      decision: 'pass',
      summary: '标注准确，建议通过',
    },
    submissionStatus: 'ai_passed',
  },
}
```

- [ ] **Step 3: 运行类型检查确认类型与导入无报错**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无类型错误，退出码 0

- [ ] **Step 4: 提交本任务**

```bash
git add frontend/src/types/domain.ts frontend/src/mocks/reviews.ts
git commit -m "feat: add reviewer types and mock data"
```

---

### Task 2: 先写 Reviewer 页面失败测试

**Files:**
- Create: `frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.test.tsx`

- [ ] **Step 1: 新建 `frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.test.tsx`**

```tsx
import { MemoryRouter } from 'react-router-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ReviewerReviewsPage } from './ReviewerReviewsPage'

function renderReviewerReviewsPage() {
  render(
    <MemoryRouter>
      <ReviewerReviewsPage />
    </MemoryRouter>,
  )
}

describe('ReviewerReviewsPage', () => {
  it('renders the pending review list', () => {
    renderReviewerReviewsPage()

    expect(screen.getByRole('heading', { name: '审核台' })).toBeInTheDocument()
    expect(screen.getByText('待审 3 项')).toBeInTheDocument()

    const cards = screen.getAllByRole('article')
    expect(cards).toHaveLength(3)

    expect(within(cards[0]).getByText('#601')).toBeInTheDocument()
    expect(within(cards[0]).getByText('情感标注任务')).toBeInTheDocument()
    expect(within(cards[0]).getByText('pass')).toBeInTheDocument()

    expect(within(cards[1]).getByText('#602')).toBeInTheDocument()
    expect(within(cards[1]).getByText('human_review')).toBeInTheDocument()
  })

  it('navigates to review detail and back to list', async () => {
    const user = userEvent.setup()
    renderReviewerReviewsPage()

    await user.click(screen.getAllByRole('button', { name: '查看详情' })[0])

    expect(screen.getByText('← 返回列表')).toBeInTheDocument()
    expect(screen.getByText('原始题目')).toBeInTheDocument()
    expect(screen.getByText('标注结果')).toBeInTheDocument()
    expect(screen.getByText('AI 预审结果')).toBeInTheDocument()
    expect(screen.getByText('审核操作')).toBeInTheDocument()

    await user.click(screen.getByText('← 返回列表'))

    expect(screen.getByRole('heading', { name: '审核台' })).toBeInTheDocument()
    expect(screen.queryByText('← 返回列表')).not.toBeInTheDocument()
  })

  it('shows original item source and answers in detail view', async () => {
    const user = userEvent.setup()
    renderReviewerReviewsPage()

    await user.click(screen.getAllByRole('button', { name: '查看详情' })[0])

    expect(screen.getByText('这个产品非常好用，客服响应也很快。')).toBeInTheDocument()
    expect(screen.getByText('正向')).toBeInTheDocument()
    expect(screen.getByText('表达明显积极')).toBeInTheDocument()
  })

  it('approves a submission and removes it from the pending count', async () => {
    const user = userEvent.setup()
    renderReviewerReviewsPage()

    await user.click(screen.getAllByRole('button', { name: '查看详情' })[0])
    await user.click(screen.getByRole('button', { name: '通过' }))

    expect(screen.getByText('审核通过，已从待审列表移除')).toBeInTheDocument()

    await user.click(screen.getByText('← 返回列表'))

    expect(screen.getByText('待审 2 项')).toBeInTheDocument()
    expect(screen.queryByText('#601')).not.toBeInTheDocument()
  })

  it('rejects a submission with required reason', async () => {
    const user = userEvent.setup()
    renderReviewerReviewsPage()

    await user.click(screen.getAllByRole('button', { name: '查看详情' })[0])
    await user.click(screen.getByRole('button', { name: '打回' }))

    const reasonTextarea = screen.getByLabelText('打回理由')
    expect(reasonTextarea).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '确认打回' }))
    expect(screen.getByText('打回理由不能为空')).toBeInTheDocument()

    await user.type(reasonTextarea, '理由不充分，请补充依据')
    await user.click(screen.getByRole('button', { name: '确认打回' }))

    expect(screen.getByText('已打回，标注人可修改后重新提交')).toBeInTheDocument()

    await user.click(screen.getByText('← 返回列表'))

    expect(screen.getByText('待审 2 项')).toBeInTheDocument()
    expect(screen.queryByText('#601')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 运行测试，确认它先失败**

Run: `cd frontend && npm run test -- src/pages/reviewer/reviews/ReviewerReviewsPage.test.tsx`
Expected: FAIL，5 个测试失败，原因集中在 Reviewer 页面仍是壳子，缺少待审计数、详情区和审核操作。

- [ ] **Step 3: 提交本任务**

```bash
git add frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.test.tsx
git commit -m "test: add reviewer reviews page specs"
```

---

### Task 3: 实现 Reviewer 页面完整逻辑

**Files:**
- Modify: `frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.tsx`

- [ ] **Step 1: 用下面的完整实现替换 `frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.tsx`**

```tsx
import { useState } from 'react'
import { reviewDetailsMock, reviewPendingItemsMock } from '../../../mocks/reviews'
import type { AIDecision, ReviewAnswerValue, ReviewDetail, ReviewPendingItem } from '../../../types/domain'

type ViewMode = 'list' | 'detail'

const decisionClassName: Record<AIDecision, string> = {
  pass: 'review-decision-pass',
  human_review: 'review-decision-human',
  reject: 'review-decision-reject',
}

function formatAnswerValue(value: ReviewAnswerValue) {
  return Array.isArray(value) ? value.join('、') : value
}

function renderDecisionBadge(decision: AIDecision) {
  return <span className={`tag-pill ${decisionClassName[decision]}`}>{decision}</span>
}

function renderSource(source: Record<string, string>) {
  return Object.entries(source).map(([key, value]) => (
    <div className="review-kv-item" key={key}>
      <span className="review-kv-key">{key}</span>
      <p className="review-kv-value">{value}</p>
    </div>
  ))
}

function renderAnswers(answers: Record<string, ReviewAnswerValue>) {
  return Object.entries(answers).map(([key, value]) => (
    <div className="review-kv-item" key={key}>
      <span className="review-kv-key">{key}</span>
      <p className="review-kv-value">{formatAnswerValue(value)}</p>
    </div>
  ))
}

export function ReviewerReviewsPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [pendingItems, setPendingItems] = useState<ReviewPendingItem[]>(reviewPendingItemsMock)
  const [detail, setDetail] = useState<ReviewDetail | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectInput, setShowRejectInput] = useState(false)
  const [rejectError, setRejectError] = useState('')
  const [feedback, setFeedback] = useState('')

  function handleViewDetail(submissionId: number) {
    setDetail(reviewDetailsMock[submissionId])
    setShowRejectInput(false)
    setRejectReason('')
    setRejectError('')
    setFeedback('')
    setViewMode('detail')
  }

  function handleBackToList() {
    setViewMode('list')
    setDetail(null)
    setShowRejectInput(false)
    setRejectReason('')
    setRejectError('')
    setFeedback('')
  }

  function removeCurrentSubmission() {
    if (!detail) {
      return
    }
    setPendingItems((items) => items.filter((item) => item.submissionId !== detail.submissionId))
  }

  function handleApprove() {
    removeCurrentSubmission()
    setFeedback('审核通过，已从待审列表移除')
  }

  function handleReject() {
    if (!rejectReason.trim()) {
      setRejectError('打回理由不能为空')
      return
    }

    removeCurrentSubmission()
    setShowRejectInput(false)
    setRejectReason('')
    setRejectError('')
    setFeedback('已打回，标注人可修改后重新提交')
  }

  if (viewMode === 'detail' && detail) {
    return (
      <section>
        <header className="page-header">
          <div>
            <h2>审核台</h2>
            <p>
              提交 #{detail.submissionId} — {detail.task.title}
            </p>
          </div>
        </header>

        <div className="review-back-row">
          <button type="button" onClick={handleBackToList}>
            ← 返回列表
          </button>
        </div>

        <div className="card-list">
          <article className="card">
            <h3>原始题目</h3>
            {renderSource(detail.item.source)}
          </article>

          <article className="card">
            <h3>标注结果</h3>
            {renderAnswers(detail.answers)}
          </article>

          <article className="card">
            <h3>AI 预审结果</h3>
            <div className="review-score-list">
              {detail.aiResult.scores.map((score) => (
                <div className="review-score-row" key={score.dimension}>
                  <span className="review-score-dim">{score.dimension}</span>
                  <span className="review-score-num">{score.score} 分</span>
                  <span className="review-score-reason">{score.reason}</span>
                </div>
              ))}
            </div>
            <div className="meta-row">
              <span>结论：</span>
              {renderDecisionBadge(detail.aiResult.decision)}
            </div>
            <p className="review-summary">{detail.aiResult.summary}</p>
          </article>

          <article className="card">
            <h3>审核操作</h3>
            {feedback ? (
              <p className="feedback-message">{feedback}</p>
            ) : (
              <>
                <div className="button-row">
                  <button className="review-action-approve" type="button" onClick={handleApprove}>
                    通过
                  </button>
                  <button className="review-action-reject" type="button" onClick={() => setShowRejectInput(true)}>
                    打回
                  </button>
                </div>

                {showRejectInput ? (
                  <div className="review-reject-box">
                    <label className="form-field">
                      <span>打回理由</span>
                      <textarea
                        value={rejectReason}
                        onChange={(event) => {
                          setRejectReason(event.target.value)
                          setRejectError('')
                        }}
                        placeholder="请填写打回理由（必填）"
                      />
                    </label>
                    {rejectError ? <p className="review-error-message">{rejectError}</p> : null}
                    <div className="button-row">
                      <button type="button" onClick={handleReject}>
                        确认打回
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowRejectInput(false)
                          setRejectReason('')
                          setRejectError('')
                        }}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </article>
        </div>
      </section>
    )
  }

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>审核台</h2>
          <p>待审 {pendingItems.length} 项</p>
        </div>
      </header>

      {pendingItems.length === 0 ? (
        <article className="card">
          <p className="review-empty-message">暂无待审核项</p>
        </article>
      ) : (
        <div className="card-list">
          {pendingItems.map((item) => (
            <article className="card" key={item.submissionId}>
              <h3>#{item.submissionId}</h3>
              <p>{reviewDetailsMock[item.submissionId].task.title}</p>
              <div className="meta-row">
                <span>标注人：{item.labelerName}</span>
                <span>提交时间：{item.submittedAt}</span>
              </div>
              <div className="meta-row">
                <span>AI 结论：</span>
                {renderDecisionBadge(item.aiDecision)}
              </div>
              <div className="button-row">
                <button type="button" onClick={() => handleViewDetail(item.submissionId)}>
                  查看详情
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 2: 运行测试，确认全部通过**

Run: `cd frontend && npm run test -- src/pages/reviewer/reviews/ReviewerReviewsPage.test.tsx`
Expected: PASS，5 个测试全部通过

- [ ] **Step 3: 提交本任务**

```bash
git add frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.tsx
git commit -m "feat: implement reviewer reviews page"
```

---

### Task 4: 补最小样式并收口验证

**Files:**
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: 在 `frontend/src/styles.css` 末尾追加审核页专用样式**

```css
.review-back-row,
.review-reject-box {
  margin-top: 16px;
}

.review-back-row {
  margin-bottom: 16px;
}

.review-kv-item {
  margin-bottom: 8px;
}

.review-kv-key {
  color: #787671;
  font-size: 13px;
}

.review-kv-value {
  margin: 4px 0 0;
}

.review-score-list {
  display: grid;
  gap: 10px;
}

.review-score-row {
  display: grid;
  grid-template-columns: 120px 60px 1fr;
  gap: 12px;
  align-items: center;
  font-size: 14px;
}

.review-score-dim {
  color: #37352f;
  font-weight: 500;
}

.review-score-num {
  color: #5645d4;
  font-weight: 600;
}

.review-score-reason,
.review-summary,
.review-empty-message {
  color: #787671;
}

.review-decision-pass {
  color: #067647;
  border-color: #067647;
  background: #ecfdf3;
}

.review-decision-human {
  color: #b54708;
  border-color: #b54708;
  background: #fffbeb;
}

.review-decision-reject {
  color: #b42318;
  border-color: #b42318;
  background: #fef3f2;
}

.review-action-approve {
  color: #067647;
  border-color: #067647;
}

.review-action-reject,
.review-error-message {
  color: #b42318;
}

.review-action-reject {
  border-color: #b42318;
}

.review-error-message {
  margin: 8px 0 0;
  font-size: 13px;
}
```

- [ ] **Step 2: 跑全量前端测试，确认没有回归**

Run: `cd frontend && npm run test`
Expected: PASS，原有测试 + 新增 5 个 Reviewer 测试全部通过

- [ ] **Step 3: 跑前端构建，确认类型与打包通过**

Run: `cd frontend && npm run build`
Expected: PASS，输出 Vite build 成功结果

- [ ] **Step 4: 手工验证清单**

Run: `cd frontend && npm run dev -- --host 127.0.0.1 --port 4173`

手工检查：
- 打开 Reviewer 审核台页面，看到 3 条待审项
- 每张卡片显示 submissionId、任务标题、标注人、AI 结论 tag、提交时间
- 点击"查看详情"进入详情态，显示原始题目/标注结果/AI 预审/审核操作
- AI 预审区域显示评分表、决策 tag、总结文本
- 点击"通过"显示反馈，手动返回列表后该项已移除
- 点击"打回"展开理由输入，留空提交显示错误，填理由后确认成功，手动返回列表后该项已移除
- 空列表时显示"暂无待审核项"

- [ ] **Step 5: 提交本任务**

```bash
git add frontend/src/styles.css
git commit -m "style: polish reviewer reviews page"
```

---

## Self-Review Notes

### Spec coverage
- 待审列表渲染：Task 2、Task 3
- 审核详情四区域：Task 2、Task 3
- AI 决策 tag 颜色区分：Task 3、Task 4
- 通过操作 + 反馈：Task 2、Task 3
- 打回操作 + 理由必填校验：Task 2、Task 3
- 空列表状态：Task 3
- 返回到列表：Task 2、Task 3
- 样式收口：Task 4

### Placeholder scan
- 无 TBD / TODO / "自行实现"。
- 每个代码步骤都给出完整内容。
- 每个命令步骤都有明确预期结果。

### Type consistency
- `ReviewAnswerValue` 在 Task 1 定义，Task 3 的 `formatAnswerValue` / `renderAnswers` 使用。
- `ReviewPendingItem` / `ReviewDetail` 在 Task 1 定义，Task 2 测试和 Task 3 实现一致引用。
- AI 决策颜色映射使用 spec 中约定的 pass=绿、human_review=黄。

### Simplification decisions
- 不模拟异步接口延迟，mock 阶段直接更新本地状态。
- 通过/打回后显示反馈，用户手动返回列表。
- 不保留不可达的详情加载失败分支，mock 数据保证详情存在。
