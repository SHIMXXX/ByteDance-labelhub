# LabelHub 稳完赛版设计说明（A 初版，可升级）

- 日期：2026-05-21
- 目标：3 周内稳定完赛，优先跑通端到端链路
- 团队：2 人，均使用 Claude Code，编程基础偏弱

## 1. 设计目标与范围

### 1.1 目标
- 完成 Owner / Labeler / Reviewer 三角色闭环。
- 完成数据链路：建任务 → 搭模板 → 发布 → 领取 → 作答提交 → AI 预审 → 人工复审 → 导出。
- 保持实现简单、沟通成本低、可演示、可追溯。

### 1.2 本期范围（必须做）
- 演示账号登录。
- 任务管理（草稿/发布/暂停/结束）与先到先得领取。
- 低配模板搭建器（组件配置 + 预览渲染 + Schema 持久化）。
- 标注作答（草稿保存、提交校验）。
- 豆包真实 LLM 预审（结构化输出）。
- 人工复审（通过/打回，打回理由必填）。
- 四种导出（JSON/JSONL/CSV/Excel），但实现顺序固定为：JSON → CSV → JSONL → Excel；若时间不足，优先保证前两种稳定可用
- 审计日志可追溯。

### 1.3 本期不做（明确砍掉）
- 复杂拖拽布局（分组/Tab/高级联动设计器）。
- 完整注册体系与找回密码。
- 多级组织权限系统。
- 分布式多服务拆分。

## 2. 技术选型

- 前端：React + TypeScript
- 后端：FastAPI（Python）
- 数据库：MySQL
- AI：豆包（结构化结果）
- 文件存储：本地/MinIO（后续可替换云 OSS）

选择理由：开发节奏快、学习负担低、便于两人协作，且可在后续平滑升级。

## 3. 架构方案（A 初版）

### 3.1 总体
- 单前端应用 + 单 FastAPI 服务 + 单 MySQL。
- 后端内部承载业务 API 与轻量任务处理。

### 3.2 后端模块边界
- auth：演示账号登录、角色识别
- task：任务管理与领取
- template：模板与版本
- annotation：草稿与提交
- audit：AI 预审任务与结果回写
- review：人工复审
- export：导出任务
- timeline：审计日志

### 3.3 可升级预留
- AI 与导出均采用“任务表驱动”，不依赖纯内存状态。
- LLM 调用经统一 `LLMClient` 抽象。
- 任务执行器抽象为 `JobExecutor`，后续可替换为 Celery/Redis。

## 4. 核心数据模型与状态机

## 4.1 核心表
- users
- tasks
- task_items
- templates
- template_versions
- assignments
- submissions
- ai_audit_jobs
- ai_audit_results
- review_records
- export_jobs
- audit_logs

## 4.2 状态机

### 任务状态
`draft -> published -> paused -> ended`

### 提交状态
`draft -> submitted -> ai_passed -> review_passed`
`submitted -> needs_revision -> resubmitted -> submitted`
`ai_passed -> needs_revision -> resubmitted -> submitted`

### AI 任务状态
`queued -> processing -> success | failed`

### 导出任务状态
`queued -> processing -> done | failed`

## 4.3 关键约束
- 同一 submission 仅允许一个活跃 AI job（幂等）。
- 所有关键状态迁移写入 audit_logs。
- AI 失败可重试，超阈值转人工复核路径。

### 4.3.1 第一版审计日志范围
第一版只记录以下关键事件，不做字段级细粒度审计：
- 任务创建
- 任务发布 / 暂停 / 结束
- 任务领取
- 提交答案
- AI 预审完成
- Reviewer 通过 / 打回
- 导出创建 / 完成

## 5. 页面与接口边界

## 5.1 页面
- Owner：任务管理、模板搭建、验收/导出
- Labeler：任务广场、作答页、我的数据
- Reviewer：待审列表、复审详情

## 5.2 最小 API 集
- auth: `POST /auth/login`, `GET /auth/me`
- task: `GET /tasks`, `POST /tasks`, `PATCH /tasks/{id}/status`, `POST /tasks/{id}/claim`
- template: `POST /templates`, `POST /templates/{id}/versions`, `GET /templates/{id}/active-version`
- submission: `GET /workbench/items`, `POST /submissions/draft`, `POST /submissions/{id}/submit`
- audit: `POST /ai-audit/trigger/{submission_id}`, `GET /ai-audit/result/{submission_id}`
- review: `GET /reviews/pending`, `POST /reviews/{submission_id}/approve`, `POST /reviews/{submission_id}/reject`
- export: `POST /exports`, `GET /exports/{job_id}`

## 6. 模板搭建器（低配可用）

### 6.1 第一版组件
- 单行文本
- 多行文本
- 单选
- 多选
- 标签选择
- 图片上传
- 展示项（ShowItem，不入提交）

### 6.2 交互方式
- 左侧组件清单
- 中间配置列表（顺序编辑）
- 右侧属性面板
- 下方预览渲染

### 6.2.1 第一版字段白名单
第一版每个组件只允许配置以下最小字段，不继续扩展：
- 通用：`label`、`field`、`required`
- 单选 / 多选 / 标签选择：额外允许 `options`
- 图片上传：额外允许 `maxCount`
- 展示项：额外允许 `content`

第一版明确不做：高级校验规则、条件显示、组件嵌套、复杂拖拽、富属性系统。

### 6.3 产物
- JSON Schema（可版本化）
- 同一 Schema 可用于预览与标注渲染

## 7. AI 预审策略（豆包）

### 7.1 输入
- 题目原文
- 标注答案
- 任务评分维度配置

### 7.2 输出（结构化）
- `scores`: 维度评分数组
- `decision`: `pass | reject | human_review`
- `summary`: 结论说明

### 7.2.1 AI 结论到业务状态的固定映射
- `pass`：进入 Reviewer 待审队列
- `reject`：进入待修改状态，允许 Labeler 修改后重新提交
- `human_review`：进入 Reviewer 待审队列
- Reviewer 永远拥有最终裁决权，可对 AI 的结论进行覆盖

### 7.3 稳态保护
- 超时控制
- 重试计数
- 失败原因入库
- 任务失败时自动转人工路径

## 8. 分工策略（不均分，按稳定性交付）

## 8.1 分工原则
- 不追求 50/50 均分，追求关键路径最稳。
- 以“一个人主链路、一个人保质量与并行模块”的方式降低阻塞。

## 8.2 建议分工

### 成员 A（主链路 Owner）
- 任务管理 + 领取
- 模板搭建器（低配）
- 标注提交流程
- 前端主流程联调

### 成员 B（质量与支撑 Owner）
- FastAPI 基础架构与数据库模型
- 演示登录与角色入口页壳子
- AI 预审模块（豆包接入、重试与幂等）
- 人工复审模块
- 导出模块、导出历史页壳子与审计日志

## 8.3 协作规则
- 不强制每日对齐；当双方都在推进时，默认每 2~3 天进行一次 15~20 分钟短对齐，若遇到接口/状态机变更则立即补一次。
- 所有状态变更先对齐状态机再写代码。
- 任一模块改接口必须同步更新 API 文档与示例。
- 联调顺序固定为：登录 → 任务管理 → 任务领取 → 模板渲染 → 作答提交 → AI 预审 → 人工复审 → 导出。

## 9. 三周里程碑

### 第 1 周
- 登录、任务管理、先到先得、低配模板、草稿与提交

### 第 2 周
- 豆包 AI 预审、人工复审、导出、审计日志
- 周末准备最小云演示环境

### 第 3 周
- 缺陷修复、交互优化、演示视频、README/API 文档/过程记录
- 预留一部分时间做 A 初版后的可控升级，例如：将轻量任务执行器替换为更稳定的队列、补充模板组件、优化审核体验，但前提是不影响黄金路径稳定性

## 10. 风险与升级路径

### 10.1 当前风险
- 单体内长任务可能影响接口响应。
- 轻量任务执行器监控能力有限。

### 10.2 对策
- 任务表驱动 + 幂等 + 重试 + 超时。
- 明确 `JobExecutor` 和 `LLMClient` 抽象边界。

### 10.3 升级步骤
- 保持业务表与 API 不变。
- 将任务消费层替换为 Celery/Redis。
- 逐步将 AI 与导出任务外置。

## 11. 验收口径

- Owner 完成：建任务→搭模板→发布→看结果→导出
- Labeler 完成：领任务→作答→提交→看打回→修改
- Reviewer 完成：查看 AI 评审→通过/打回
- 全链路可追溯、可录屏演示
