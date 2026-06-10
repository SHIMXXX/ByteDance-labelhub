# LabelHub API 文档（V1）

> 本文档以当前仓库代码为准，生成时间：2026-06-10。  
> 主要依据：`backend/app/api/routes/*.py`、`backend/app/api/deps.py`、`backend/app/services/*.py`、相关测试用例。

## 1. 基本信息

- Base URL：`/api/v1`
- FastAPI 默认文档：
  - Swagger UI：`/docs`
  - OpenAPI JSON：`/openapi.json`
- 默认数据格式：`application/json`
- 时间字段：统一为 ISO 8601 UTC 字符串，例如 `2026-06-10T14:30:00Z`

## 2. 鉴权与返回约定

### 2.1 鉴权

- 生产态应统一使用 `Authorization: Bearer <jwt>`
- JWT 通过 `POST /auth/login` 获取
- 开发 / 测试环境中，部分接口支持 `X-Demo-User`，也有少量查询接口会回退到默认 demo 用户
- 前端主链路应始终按 Bearer Token 集成，不建议依赖 `X-Demo-User`

### 2.2 角色

- `owner`
- `labeler`
- `reviewer`

### 2.3 成功返回格式

除特别说明外，接口成功时返回统一 envelope：

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

### 2.4 错误返回格式

当前项目的大多数异常直接使用 FastAPI `HTTPException`，因此失败时通常是：

```json
{
  "detail": "error message"
}
```

说明：

- 不是所有错误都走 `code/message/data`
- 文件下载接口和 `/health` 也不走统一 envelope

## 3. 核心枚举

### 3.1 任务状态

- `draft`
- `published`
- `paused`
- `ended`

### 3.2 Submission 状态

- `draft`
- `submitted`
- `ai_passed`
- `needs_revision`
- `review_passed`

### 3.3 Workbench 展示状态

- `not_started`
- `draft`
- `ai_reviewing`
- `submitted`
- `manual_reviewing`
- `needs_revision`
- `review_passed`

### 3.4 AI 决策

- `pass`
- `reject`
- `human_review`

### 3.5 导出任务状态

- `queued`
- `processing`
- `done`
- `failed`

### 3.6 数据集导入模式

- `normal`
- `gold_sample`
- `demo`

### 3.7 导出格式

- `json`
- `csv`
- `jsonl`
- `excel`

## 4. 典型业务流程

1. `POST /auth/login` 登录，获取 JWT。
2. Owner 调 `POST /datasets/import` 导入数据集。
3. Owner 调 `POST /templates` 创建模板，再调 `POST /templates/{templateId}/versions` 保存模板版本。
4. Owner 调 `POST /tasks` 创建任务，必要时分配 reviewer / labeler，最后调 `PATCH /tasks/{taskId}/status` 发布。
5. Labeler 在 `GET /tasks/plaza` 查看可领取任务，并通过 `POST /tasks/{taskId}/claim` 领取。
6. Labeler 通过 `GET /workbench/items` 拉取标注题目，调用 `POST /submissions/draft` 保存草稿，完成后调用 `POST /submissions/{submissionId}/submit` 提交。
7. 系统在提交后自动创建 AI 审核任务；Reviewer 通过 `GET /reviews/pending` 查看待审列表，并调用 approve / reject 系列接口完成人审。
8. Owner 通过 `GET /owner-reviews/*` 查看全局进度，通过 `POST /exports` 或 `GET /exports/tasks/{taskId}/report` 导出结果与报告。

## 5. 接口清单

### 5.1 Health

#### `GET /health`

- 说明：健康检查，无鉴权
- 返回：不走 envelope

```json
{
  "status": "ok",
  "app": "LabelHub API"
}
```

### 5.2 Auth

#### `POST /auth/login`

- 说明：用户名密码登录
- 请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `username` | string | 是 | 用户名 |
| `password` | string | 是 | 密码 |
| `role` | string | 否 | 当前实现未参与鉴权判断 |

示例：

```json
{
  "username": "owner_demo",
  "password": "demo-owner-123"
}
```

返回 `data`：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `token` | string | JWT |
| `user.id` | number | 用户 ID |
| `user.username` | string | 用户名 |
| `user.displayName` | string | 展示名 |
| `user.role` | string | 角色 |

Demo 账号（测试中已覆盖）：

- `owner_demo / demo-owner-123`
- `labeler_demo / demo-labeler-123`
- `labeler_demo2 / demo-labeler2-123`
- `reviewer_demo / demo-reviewer-123`
- `reviewer_demo2 / demo-reviewer2-123`

#### `GET /auth/me`

- 说明：读取当前 Bearer Token 对应用户
- 鉴权：必须 Bearer Token

### 5.3 Users

#### `GET /users/reviewers`

- 角色：`owner`
- 说明：返回 reviewer 列表
- 返回 `data`：
  - `items[]`: `id`、`username`、`displayName`、`role`
  - `total`

#### `GET /users/labelers`

- 角色：`owner`
- 说明：返回 labeler 列表
- 返回结构同上

### 5.4 Datasets

#### `POST /datasets/import`

- 角色：`owner`
- 说明：导入数据集
- 支持文件类型：
  - `.json`
  - `.jsonl`
  - `.xlsx`
- 请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `name` | string | 是 | 数据集名称 |
| `description` | string | 否 | 描述 |
| `fileName` | string | 是 | 文件名，用于识别导入格式 |
| `contentBase64` | string | 是 | 文件内容 Base64 |
| `importMode` | string | 否 | `normal \| gold_sample \| demo`，默认 `normal` |

返回 `data`：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `dataset` | object | 数据集摘要 |
| `summary.total` | number | 导入样本数 |
| `errors` | string[] | 当前实现通常为空 |
| `previewItems` | array | 前 5 条预览 |

数据集摘要字段：

- `id`
- `name`
- `description`
- `sourceType`
- `importMode`
- `itemCount`
- `createdAt`
- `updatedAt`

预览项字段：

- `id`
- `sequence`
- `source`
- `metadata`
- `referenceAnswer`

#### `GET /datasets`

- 角色：`owner`
- 查询参数：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `keyword` | string | 按数据集名称模糊搜索 |
| `page` | number | 页码，默认 `1` |
| `pageSize` | number | 每页数量，默认 `10`，最大 `100` |

- 返回 `data`：
  - `items[]`
  - `total`
  - `page`
  - `pageSize`

#### `GET /datasets/{datasetId}/items`

- 角色：`owner`
- 查询参数：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `keyword` | string | 按 `search_text` 模糊搜索 |
| `page` | number | 默认 `1` |
| `pageSize` | number | 默认 `10`，最大 `1000` |

- 返回 `data`：
  - `dataset`
  - `items[]`
  - `total`
  - `page`
  - `pageSize`

数据项字段：

- `id`
- `sequence`
- `source`
- `metadata`
- `referenceAnswer`

#### `DELETE /datasets/{datasetId}`

- 角色：`owner`
- 说明：删除数据集
- 限制：若数据集已绑定任务，返回 `409`
- 成功返回：`{ "datasetId": number }`

### 5.5 Templates

#### 模板 Schema 说明

当前模板支持两类结构：

- 旧版：`schema.components`
- 新版：`schema.version = 3`，并使用：
  - `datasetBinding`
  - `layout`
  - `sourceView.components`
  - `answerView.components`

允许的组件类型：

- `text_input`
- `textarea`
- `single_select`
- `multi_select`
- `tag_select`
- `image_upload`
- `show_item`
- `compare_panel`
- `rich_text`
- `json_editor`
- `llm_assist`
- `group`
- `tab_container`
- `field_display`
- `field_textarea`
- `field_tags`
- `field_hyperlink`
- `field_image`
- `field_video`
- `field_markdown`

可见性与校验规则：

- `visibleWhen.operator`：`eq`、`neq`、`not_empty`、`includes`
- `validationRules.type`：
  - `required_if`
  - `min_selected`
  - `json_valid`
  - `min_length`
  - `equals_if`
  - `not_equals_if`

字段约束：

- 非 `show_item` 组件的 `field` 不能重复
- `compare_panel.children_left` / `children_right` 必须为数组
- `group.children`、`tab_container.tabs[].children` 必须为数组

#### `GET /templates`

- 角色：`owner`
- 返回 `data.items[]` 字段：
  - `id`
  - `name`
  - `description`
  - `latestVersion`
  - `latestTemplateVersionId`
  - `taskUsageCount`
  - `updatedAt`
  - `datasetId`
  - `sampleItemId`

#### `POST /templates`

- 角色：`owner`
- 请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `name` | string | 是 | 模板名 |
| `description` | string | 否 | 描述 |
| `taskId` | number | 否 | 若传入，会绑定到该任务 |
| `datasetId` | number | 否 | 用于模板设计态样本绑定 |

- 返回 `data`：
  - `id`
  - `name`
  - `description`
  - `datasetId`
  - `sampleItemId`

#### `PATCH /templates/{templateId}`

- 角色：`owner`
- 说明：更新模板基础信息与设计态数据集 / 样本绑定
- 请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `name` | string | 是 | 模板名 |
| `description` | string | 是 | 描述 |
| `datasetId` | number \| null | 否 | 传 `null/0` 可解绑 |
| `sampleItemId` | number \| null | 否 | 传 `null/0` 可清空样本 |

#### `DELETE /templates/{templateId}`

- 角色：`owner`
- 限制：模板仍被任务绑定时返回 `409`
- 成功返回：`{ "templateId": number }`

#### `POST /templates/{templateId}/duplicate`

- 角色：`owner`
- 说明：复制模板；若源模板存在版本，则复制最新版本为新模板的 `version=1`

#### `POST /templates/{templateId}/versions`

- 角色：`owner`
- 请求体：

```json
{
  "schema": {
    "version": 3,
    "datasetBinding": {
      "datasetId": 301,
      "sampleItemId": 9001,
      "sampleStrategy": "first_item"
    },
    "layout": {
      "type": "stacked-source-answer"
    },
    "sourceView": {
      "components": []
    },
    "answerView": {
      "components": []
    }
  }
}
```

- 返回 `data`：
  - `templateVersionId`
  - `templateId`
  - `version`

#### `GET /templates/{templateId}/active-version`

- 角色：`owner`
- 说明：获取当前模板最新版本；若还没有版本，返回一个默认的空白 V3 schema
- 返回 `data`：
  - `templateId`
  - `templateVersionId`
  - `datasetBinding`
  - `schema`

### 5.6 Tasks

#### 任务对象常用字段

- `id`
- `title`
- `description`
- `taskBrief`
- `taskTags`
- `rewardRule`
- `status`
- `quota`
- `deadline`
- `templateId`
- `templateName`
- `datasetId`
- `datasetName`
- `itemCount`
- `completedItemCount`
- `passedItemCount`
- `pendingReviewCount`
- `passRate`
- `labelers`
- `reviewers`
- `aiPromptTemplate`
- `aiPassThreshold`
- `aiConfig`
- `activeTemplateVersionId`
- `activeTemplateVersionNumber`
- `latestTemplateVersionId`
- `latestTemplateVersionNumber`
- `createdBy`
- `createdAt`
- `updatedAt`

#### `GET /tasks`

- 角色：`owner`
- 查询参数：
  - `status`
  - `keyword`

#### `POST /tasks`

- 角色：`owner`
- 鉴权：必须 Bearer Token
- 请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `title` | string | 是 | 任务标题 |
| `description` | string | 否 | 描述 |
| `taskBrief` | string | 否 | 任务简述 |
| `taskTags` | string[] | 否 | 标签 |
| `rewardRule` | string | 否 | 奖励规则 |
| `quota` | number | 否 | 领取名额，默认 `1` |
| `deadline` | datetime | 否 | 截止时间 |
| `templateId` | number | 否 | 当前绑定模板 |
| `datasetId` | number | 否 | 当前绑定数据集 |
| `aiPromptTemplate` | string | 否 | 兼容旧 AI 配置字段 |
| `aiPassThreshold` | number | 否 | 兼容旧 AI 配置字段 |
| `aiModel` | string | 否 | 当前实现创建时未真正落库使用 |

- 约束：
  - `datasetId` 必须属于当前 owner
  - `templateId` 必须属于当前 owner

- 成功返回：`{ "id": number, "status": "draft" }`

#### `GET /tasks/plaza`

- 角色：`labeler`
- 查询参数：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `keyword` | string | 标题 / 描述模糊搜索 |
| `claimStatus` | string | `claimed` 或 `available` |

- 说明：
  - 当前实现会展示 `published` 和 `paused` 的任务
  - `paused` 任务仍允许 claim

- 返回项字段：
  - `id`
  - `title`
  - `description`
  - `status`
  - `quota`
  - `claimedCount`
  - `claimedByCurrentUser`
  - `assignmentId`
  - `itemCount`
  - `deadline`
  - `createdAt`
  - `updatedAt`

#### `GET /tasks/{taskId}`

- 角色：`owner`
- 返回完整任务详情

#### `GET /tasks/{taskId}/analytics`

- 角色：`owner`
- 返回 `data`：
  - `task`
  - `metrics`
  - `statusBreakdown`
  - `reviewers`
  - `dataset`
  - `template`
  - `aiConfigEnabled`

#### `PATCH /tasks/{taskId}`

- 角色：`owner`
- 说明：更新任务基础信息
- 可更新字段：
  - `title`
  - `description`
  - `taskBrief`
  - `taskTags`
  - `rewardRule`
  - `quota`
  - `deadline`
  - `datasetId`
  - `templateId`

- 如果切换了 `templateId`，后端会自动刷新 `activeTemplateVersionId`

#### `PATCH /tasks/{taskId}/status`

- 角色：`owner`
- 请求体：

```json
{
  "status": "published"
}
```

- 允许值：`draft`、`published`、`paused`、`ended`
- `published` 校验：
  - 必须绑定 `dataset`
  - 数据集必须至少有 1 条 item
  - 必须绑定 `template`
  - 模板必须至少存在 1 个版本
- `ended` 校验：
  - 所有 item 必须 `review_passed`
  - 不能还有待审核项

#### `PATCH /tasks/{taskId}/ai-config`

- 角色：`owner`
- 鉴权：必须 Bearer Token
- 请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `promptTemplate` | string | 是 | 必须包含 `{answers}` 占位符 |
| `scoreDimensions` | array | 否 | AI 评分维度 |
| `passThreshold` | number | 否 | 0-100，默认 `80` |
| `reviewGuideline` | string | 否 | 人审指引 |
| `aiModel` | string | 否 | 默认 `qwen3.6-flash` |

`scoreDimensions[]` 字段：

- `key`
- `label`
- `description`
- `weight`
- `enabled`

返回 `data`：

- `taskId`
- `aiConfig`

#### `POST /tasks/{taskId}/ai-config/test-run`

- 角色：`owner`
- 鉴权：必须 Bearer Token
- 说明：测试 AI 配置，不会修改任务状态
- 请求体在 `ai-config` 基础上新增：
  - `itemId`
  - `mockAnswers`

- 返回：
  - `scores`
  - `overallScore`
  - `decision`
  - `summary`

#### `PATCH /tasks/{taskId}/dataset-binding`

- 角色：`owner`
- 请求体：

```json
{
  "datasetId": 301
}
```

或解绑：

```json
{
  "datasetId": null
}
```

- 约束：
  - 解绑时任务必须处于 `paused`

#### `POST /tasks/{taskId}/template-version/refresh`

- 角色：`owner`
- 说明：将任务绑定的模板版本刷新为该模板最新版本
- 返回 `data`：
  - `task`
  - `previousTemplateVersionId`
  - `activeTemplateVersionId`
  - `activeTemplateVersionNumber`

#### `POST /tasks/{taskId}/reviewers`

- 角色：`owner`
- 说明：覆盖式保存 reviewer 列表
- 请求体：

```json
{
  "reviewerIds": [3, 4]
}
```

- 返回：`taskId`、`reviewerIds`

#### `GET /tasks/{taskId}/reviewers`

- 角色：`owner`
- 返回 `items[]`：
  - `reviewerId`
  - `username`
  - `displayName`

#### `POST /tasks/{taskId}/labelers`

- 角色：`owner`
- 说明：覆盖式保存 labeler 列表
- 请求体：

```json
{
  "labelerIds": [2, 5]
}
```

- 约束：
  - 分配人数不能超过 `quota`
  - 移除已有提交记录的 labeler 时返回 `409`

- 返回 `data`：
  - `taskId`
  - `labelerIds`
  - `labelers`

`labelers[]` 字段：

- `labelerId`
- `username`
- `displayName`
- `assignmentId`

#### `GET /tasks/{taskId}/labelers`

- 角色：`owner`
- 返回当前任务的 labeler / assignment 摘要

#### `DELETE /tasks/{taskId}`

- 角色：`owner`
- 约束：
  - 已有 assignment 时不可删
  - 已有 submission 时不可删

#### `POST /tasks/{taskId}/claim`

- 角色：`labeler`
- 说明：领取任务
- 限制：
  - 任务状态必须为 `published` 或 `paused`
  - 已满额时返回 `409`

- 返回 `data`：
  - `assignmentId`
  - `taskId`
  - `userId`
  - `progressTotal`
  - `progressCompleted`
  - `claimedAt`

#### `POST /tasks/{taskId}/unclaim`

- 角色：`labeler`
- 说明：取消领取；当前实现会级联清理该 assignment 下的 submission、review record、AI job、AI result、version
- 返回：`{ "taskId": number, "unclaimed": true }`

### 5.7 Workbench

#### `GET /workbench/summary`

- 角色：`labeler`
- 返回 `data`：
  - `metrics`
  - `assignments`
  - `recentSubmissions`

`metrics`：

- `claimedTaskCount`
- `submittedItemCount`
- `reviewPassedItemCount`
- `needsRevisionItemCount`

#### `GET /workbench/history`

- 角色：`labeler`
- 返回自己的 submission 历史

#### `GET /workbench/items`

- 角色：`labeler`
- 查询参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `assignmentId` | number | 是 | 领取记录 ID |

- 返回 `data`：
  - `assignmentId`
  - `task`
  - `template`
  - `items`
  - `progress`

`template` 字段：

- `templateId`
- `templateVersionId`
- `schema`

`items[]` 字段：

- `itemId`
- `index`
- `source`
- `draftSubmission`

`draftSubmission` 可能为 `null`。非空时包含：

- `submissionId`
- `status`
- `statusLabel`
- `savedAt`
- `answers`
- `previousAnswers`
- `diffItems`
- `currentVersionNo`
- `latestRejectReason`

#### `POST /workbench/llm-assist`

- 角色：`labeler`
- 说明：生成字段级辅助内容
- 请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `assignmentId` | number | 是 | assignment ID |
| `itemId` | number | 是 | 数据项 ID |
| `field` | string | 是 | 当前字段 |
| `prompt` | string | 是 | 辅助提示词 |
| `currentAnswers` | object | 否 | 当前答案 |
| `source` | object | 否 | 若不传则后端自动取样本上下文 |

### 5.8 Submissions

#### `GET /submissions`

- 角色：`owner`
- 查询参数：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `taskId` | number | 按任务过滤 |
| `userId` | number | 按标注人过滤 |
| `status` | string | 按 submission 状态过滤 |

- 返回项字段：
  - `submissionId`
  - `taskId`
  - `assignmentId`
  - `datasetItemId`
  - `userId`
  - `labelerName`
  - `status`
  - `answers`
  - `finalAnswers`
  - `currentVersionNo`
  - `currentReviewStage`
  - `currentReviewRound`
  - `assignedReviewerId`
  - `aiDecision`
  - `aiSummary`
  - `latestReviewDecision`
  - `latestReviewComment`
  - `latestReviewReason`
  - `createdAt`
  - `updatedAt`

#### `POST /submissions/draft`

- 角色：`labeler`
- 说明：保存草稿
- 请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `assignmentId` | number | 是 | assignment ID |
| `itemId` | number \| null | 否 | 数据项 ID |
| `templateVersionId` | number \| null | 否 | 前端兼容字段，后端以任务当前有效模板为准 |
| `answers` | object | 是 | 当前答案 |

- 限制：
  - 已经 `submitted` / `ai_passed` / `review_passed` 的 submission 不能再保存为草稿

- 返回：
  - `submissionId`
  - `status`
  - `savedAt`

#### `POST /submissions/{submissionId}/submit`

- 角色：`labeler`
- 说明：正式提交；提交后自动创建 / 重置 AI 审核 job
- 请求体：

```json
{
  "answers": {
    "answer": "..."
  }
}
```

- 行为说明：
  - 若请求体传了 `answers`，会先覆盖当前草稿答案
  - 后端会按模板校验必填、条件必填、最小长度、JSON 合法性等规则
  - 提交成功后：
    - `submission.status = submitted`
    - 创建一条 `SubmissionVersion`
    - 创建或重置 `AIAuditJob`
    - 异步入队 AI 审核

- 返回：
  - `submissionId`
  - `status`
  - `submittedAt`
  - `aiJobStatus`
  - `aiDecision`（提交成功时固定为 `null`）

补充说明：

- 当前公开 API 中没有单独暴露 `/ai-audit/*` 路由
- AI 审核由 `submit` 之后自动触发

### 5.9 Reviews

#### Reviewable 条件

Reviewer 端详情、审批、分配接口都要求：

- `submission.status == ai_passed`
- AI job 不处于 `queued/running`
- submission 已经具备 AI 结果

#### `GET /reviews/quality-stats`

- 角色：`reviewer`
- 返回：
  - `approvalRate`
  - `decisionCounts`
  - `topRejectReasons`
  - `historyReviews`

#### `GET /reviews/pending`

- 角色：`reviewer`
- 查询参数：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `taskId` | number | 按任务过滤 |
| `aiDecision` | string | `pass/reject/human_review` |
| `keyword` | string | 任务标题 / 标注人名模糊搜索 |

- 返回项字段：
  - `submissionId`
  - `taskId`
  - `itemId`
  - `labelerName`
  - `taskTitle`
  - `aiDecision`
  - `submissionStatus`
  - `submittedAt`
  - `currentReviewStage`
  - `currentReviewRound`
  - `hasPreviousVersion`
  - `assignedReviewer`
  - `latestAiSummary`
  - `reviewPriorityScore`
  - `reviewPriorityLevel`
  - `reviewPriorityFactors`

#### `GET /reviews/{submissionId}`

- 角色：`reviewer`
- 返回 `data`：
  - `submissionId`
  - `task`
  - `template`
  - `item`
  - `answers`
  - `finalAnswers`
  - `aiResult`
  - `submissionStatus`
  - `currentReviewStage`
  - `currentReviewRound`
  - `currentVersionNo`
  - `diffItems`
  - `reviewHistory`
  - `timeline`

#### `POST /reviews/{submissionId}/approve`

- 角色：`reviewer`
- 当前实现：单级审批，approve 后直接进入 `review_passed`
- 请求体：

```json
{
  "comment": "通过",
  "finalAnswers": {
    "answer": "reviewer final answer"
  }
}
```

- `finalAnswers` 不传时默认使用当前 `answers`
- 返回：
  - `submissionId`
  - `status`
  - `comment`
  - `currentReviewStage`
  - `currentReviewRound`

#### `POST /reviews/{submissionId}/reject`

- 角色：`reviewer`
- 请求体：

```json
{
  "reason": "请补充证据"
}
```

- 行为：将 submission 置为 `needs_revision`

#### `POST /reviews/bulk/approve`

- 角色：`reviewer`
- 请求体：

```json
{
  "submissionIds": [601, 602],
  "comment": "批量通过"
}
```

- 说明：实际会把可审批 submission 更新为 `review_passed`
- 当前返回 `status` 字段历史上仍写成 `ai_passed`，属于实现细节，前端应以每条 submission 的实际状态为准

#### `POST /reviews/bulk/reject`

- 角色：`reviewer`
- 请求体：

```json
{
  "submissionIds": [601, 602],
  "reason": "请补充证据"
}
```

- 返回：`submissionIds`、`status=needs_revision`

#### `POST /reviews/{submissionId}/assign`

- 角色：`reviewer`
- 请求体：

```json
{
  "reviewerId": 3
}
```

- 约束：
  - 目标用户必须存在
  - 目标用户角色必须是 reviewer
  - 目标 reviewer 必须已被分配到该 task

#### `POST /reviews/{submissionId}/unassign`

- 角色：`reviewer`
- 行为：清空 `assignedReviewerId`

### 5.10 Owner Reviews / 监控视图

#### `GET /owner-reviews/tasks`

- 角色：`owner`
- 说明：返回 owner 任务审核总览
- 返回项字段：
  - `taskId`
  - `title`
  - `status`
  - `createdAt`
  - `updatedAt`
  - `stats.total`
  - `stats.pending_ai`
  - `stats.pending_manual`
  - `stats.approved`
  - `stats.rejected`

#### `GET /owner-reviews/tasks/{taskId}/details`

- 角色：`owner`
- 说明：返回单任务下所有 submission 的全量审核明细
- 返回 `data`：
  - `task`
  - `summary`
  - `submissions`

`submissions[]` 中包含：

- 基础信息：`submissionId`、`taskId`、`assignmentId`、`datasetItemId`
- `item.source`
- `labeler`
- `assignedReviewer`
- `finalizedBy`
- `status`
- `answers`
- `finalAnswers`
- `currentVersionNo`
- `currentReviewStage`
- `currentReviewRound`
- `finalSubmissionVersionNo`
- `finalizedAt`
- `versions`
- `diffItems`
- `aiAudit`
- `reviewHistory`
- `timeline`

#### `GET /owner-reviews/reviewers`

- 角色：`owner`
- 说明：查看 reviewer 工作负载
- 返回项字段：
  - `reviewerId`
  - `displayName`
  - `latestUpdatedAt`
  - `stats.assigned_count`
  - `stats.completed_count`
  - `stats.pending_count`

#### `GET /owner-reviews/labelers`

- 角色：`owner`
- 说明：查看 labeler 表现
- 返回项字段：
  - `labelerId`
  - `displayName`
  - `username`
  - `latestUpdatedAt`
  - `metrics`
  - `assignments`

#### `GET /owner-reviews/ai-jobs`

- 角色：`owner`
- 说明：查看最近 100 条 AI 审核作业
- 返回项字段：
  - `jobId`
  - `submissionId`
  - `taskTitle`
  - `status`
  - `flowStatus`
  - `aiDecision`
  - `submissionStatus`
  - `attemptCount`
  - `errorReason`
  - `updatedAt`

### 5.11 Exports

#### 导出结果对象

导出 job 返回 `data` 字段通常包含：

- `jobId`
- `taskId`
- `taskTitle`
- `format`
- `status`
- `createdAt`
- `finishedAt`
- `downloadUrl`
- `content`

#### `GET /exports`

- 角色：`owner`
- 查询参数：
  - `taskId`

#### `POST /exports`

- 角色：`owner`
- 说明：创建导出 job
- 请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `taskId` | number | 是 | 任务 ID |
| `format` | string | 是 | `json/csv/jsonl/excel` |
| `fieldMapping` | array | 否 | 字段映射 |
| `includeAiAudit` | boolean | 否 | 是否附带 AI 审核信息 |
| `includeReviewRecords` | boolean | 否 | 是否附带人审信息 |
| `exportScope` | string | 否 | `all` 或 `review_passed` |

`fieldMapping[]`：

- `sourceKey`
- `targetLabel`
- `enabled`

说明：

- 当前接口依赖 Redis / Celery 队列可用
- 若队列不可用，返回 `503`

#### `POST /exports/{jobId}/complete`

- 角色：`owner`
- 说明：同步完成导出；若 job 仍是 `queued`，会立即执行导出逻辑
- 适合本地联调或测试

#### `GET /exports/{jobId}`

- 角色：`owner`
- 说明：查询导出任务详情，不会自动推进 job 状态

#### `GET /exports/{jobId}/download`

- 角色：`owner`
- 说明：下载导出文件
- 限制：只有 `status=done` 时可下载
- 返回：文件流，不走 envelope

下载类型：

- `json` -> `application/json`
- `csv` -> `text/csv`
- `jsonl` -> `application/jsonl`
- `excel` -> `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

#### `GET /exports/tasks/{taskId}/report`

- 角色：`owner`
- 说明：生成并下载任务 HTML 报告
- 返回：`text/html` 文件流，不走 envelope

报告内容包含：

- 任务概览
- AI 预审分数分布
- 标注员贡献
- 常见问题类型
- 最近导出文件信息
- 最终结论

## 6. 关键对象字段补充

### 6.1 DatasetItem 的上下文字段

当前项目会把导入样本拆成三部分：

- `source`
- `metadata`
- `referenceAnswer`

其中：

- `source`：题面、上下文、候选回答等主展示内容
- `metadata`：分类、模型名、样本编号等附加信息
- `referenceAnswer`：gold / demo / preferred 等参考答案信息

Workbench、Review、Export 都会复用这些字段。

### 6.2 导出默认字段

如果不传 `fieldMapping`，导出默认字段来自 submission 聚合结果，通常包括：

- `submissionId`
- `taskId`
- `datasetItemId`
- `labelerName`
- `submissionStatus`
- `source`
- `metadata`
- `referenceAnswer`
- `answers`
- `finalAnswer`
- `currentVersionNo`
- `reviewStage`
- `reviewRound`

若开启附加选项，还会加入：

- `aiDecision`
- `aiOverallScore`
- `aiSummary`
- `reviewDecision`
- `reviewComment`
- `reviewReason`

## 7. 已知实现特征

- `/health` 不使用统一 envelope。
- 错误返回主要走 FastAPI 默认 `detail` 格式。
- 当前公开 API 没有单独的 `/ai-audit/*` 路由；AI 审核由 `submit` 自动触发。
- `GET /tasks/plaza` 与 `POST /tasks/{taskId}/claim` 当前允许 `paused` 任务继续被领取。
- `POST /reviews/bulk/approve` 的返回字段 `status` 与单条 submission 最终状态不完全一致，联调时应以实际 submission 状态为准。
- 开发 / 测试环境存在 `X-Demo-User` 和默认 demo 用户回退逻辑，但前端主链路不应依赖它。

## 8. 推荐联调顺序

1. 登录拿 token：`/auth/login`
2. 导入数据：`/datasets/import`
3. 建模板：`/templates`、`/templates/{id}/versions`
4. 建任务：`/tasks`
5. 分配 reviewer / labeler：`/tasks/{id}/reviewers`、`/tasks/{id}/labelers`
6. 发布任务：`/tasks/{id}/status`
7. 标注作答：`/tasks/plaza`、`/tasks/{id}/claim`、`/workbench/items`、`/submissions/draft`、`/submissions/{id}/submit`
8. 人审：`/reviews/pending`、`/reviews/{id}`、`/reviews/{id}/approve|reject`
9. 导出与复盘：`/exports`、`/exports/{id}/download`、`/exports/tasks/{taskId}/report`
