# Reviewer 审核台 — Day 2 设计稿

## 背景

A 侧第 1 周已完成 Labeler 提交前主链路 mock 版。第 2 周需补齐 Reviewer 审核页面，这是黄金路径（提交 → AI 预审 → 人工审核）的关键一环。B 侧审核接口尚未实现，先用 mock 数据独立开发。

## 页面范围

单页切换模式（同 OwnerTasksPage），包含两个视图：

1. **待审列表** — Reviewer 视角的待处理提交列表
2. **审核详情** — 原始题目 + 标注结果 + AI 预审结果 + 审核操作

## 数据模型

### 待审列表项

```ts
type ReviewAnswerValue = string | string[]

type ReviewPendingItem = {
  submissionId: number
  taskId: number
  itemId: number
  labelerName: string
  aiDecision: AIDecision
  submissionStatus: SubmissionStatus
  submittedAt: string
}
```

### 审核详情

```ts
type ReviewDetail = {
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

复用现有枚举：`AIDecision`（pass / reject / human_review）、`SubmissionStatus`（submitted / ai_passed / needs_revision / review_passed）。待审队列第一版只展示 `ai_passed` 或 `submitted + human_review` 一类需要人工处理的数据，`reject` 映射到 `needs_revision` 后不进入待审列表。

## 接口对齐

对照契约文档第 6 节（docs/api-contracts/labelhub-v1.md），前端 mock 结构直接对齐接口响应：

- `GET /api/v1/reviews/pending` → `ReviewPendingItem[]`
- `GET /api/v1/reviews/{submissionId}` → `ReviewDetail`
- `POST /api/v1/reviews/{submissionId}/approve` → `{ comment? }` → 成功后本地移除
- `POST /api/v1/reviews/{submissionId}/reject` → `{ reason }` → 成功后本地移除

- mock 阶段列表项可从本地 mock detail 表按 `taskId/submissionId` 补出任务标题；不要求 B 的 pending 接口额外返回 `taskTitle`

## UI 设计

### 列表态

- 页面顶部：标题"审核台" + 待审计数
- 卡片列表，每张卡片展示：
  - submissionId + 任务标题（mock 阶段从详情数据补出，真实接口阶段可进入详情后展示）
  - 标注人名称
  - AI 决策 tag（tag-pill 样式，pass=绿、human_review=黄）
  - 提交时间
  - "查看详情"按钮
- 空列表时显示"暂无待审核项"

### 详情态

- 顶部"← 返回列表"按钮
- 四个区域从上到下排列，每个区域用 card 包裹：

1. **原始题目** — 以 key-value 列表渲染 item.source
2. **标注结果** — 以 key-value 列表渲染 answers
3. **AI 预审结果** — 评分列表（维度 / 分数 / 理由）+ 决策 tag + 总结文本
4. **审核操作** — "通过"按钮 + "打回"按钮；点击打回展开 reason textarea（必填），确认后执行

### 状态与反馈

- 操作成功后显示 feedback-message（绿色提示），用户手动返回列表
- mock 阶段不模拟异步延迟，按钮无需 loading 态
- 详情加载失败：显示错误信息 + 返回列表按钮

## Mock 数据

3 条待审项，覆盖 pass 和 human_review 两种决策（reject 不进待审队列），对应 3 套完整详情数据。

## 不做

- 不接真实接口（B 侧接口未就绪）
- 不做分页（列表项 ≤ 20 时不需要）
- 不做批量审核
- 不做审核历史记录页
- 不做 Reviewer 角色校验（登录 mock 阶段不强制）

## 影响文件

- `frontend/src/types/domain.ts` — 新增 ReviewPendingItem、ReviewDetail 类型
- `frontend/src/mocks/reviews.ts` — 新增 mock 数据文件
- `frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.tsx` — 替换壳子为完整实现
- `frontend/src/styles.css` — 新增少量审核页专用样式
- `frontend/src/App.tsx` — 无需改动，路由已就位
