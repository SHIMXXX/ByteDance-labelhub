# Owner 导出入口 — Day 2 设计稿

## 背景

A 侧第 2 周 Reviewer 审核台已完成。下一步补齐 Owner 导出入口：按钮 + 状态展示 + 导出历史壳子，mock 独立开发。

## 页面范围

单页布局：发起导出 + 导出历史，无视图切换。

## 数据模型

```ts
type ExportJob = {
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

复用现有 `ExportStatus`（queued / processing / done / failed），新增 `ExportFormat`（json / csv / jsonl / excel）。

## 接口对齐

对照契约第 7 节（docs/api-contracts/labelhub-v1.md）：

- `POST /api/v1/exports` → `{ taskId, format }` → `{ jobId, status: 'queued' }`
- `GET /api/v1/exports/{jobId}` → `ExportJob`
- `GET /api/v1/exports?taskId=101` → `ExportJob[]`

mock 阶段前端不真实请求。

## UI 设计

- 页面顶部：标题"导出管理"
- 两个 card 区域上下排列：

1. **发起导出** — task dropdown（从 mock 取可选任务）+ format dropdown（json/csv/jsonl/excel）+ "发起导出"按钮；点击后本地新增 queued job，下方显示反馈
2. **导出历史** — 卡片列表，每条显示 jobId、任务名、格式、状态 tag（queued=灰、processing=蓝、done=绿、failed=红），done 时显示"下载"按钮

- 空历史显示"暂无导出记录"

## 状态与反馈

- 发起导出后显示 feedback-message "导出任务已创建"
- mock 阶段不模拟异步状态变更，所有 job 保持初始状态
- 历史列表从本地 state 读取

## Mock 数据

2 条初始历史记录（done + failed），覆盖不同状态展示。

## 不做

- 不接真实接口
- 不生成真实文件
- 不做状态轮询
- 不做批量导出

## 影响文件

- `frontend/src/types/domain.ts` — 新增 `ExportFormat`、`ExportJob` 类型
- `frontend/src/mocks/exports.ts` — mock 历史记录
- `frontend/src/pages/owner/exports/OwnerExportsPage.tsx` — 新页面
- `frontend/src/pages/owner/exports/OwnerExportsPage.test.tsx` — 测试
- `frontend/src/App.tsx` — 加路由和侧边栏链接
- `frontend/src/styles.css` — 少量样式
