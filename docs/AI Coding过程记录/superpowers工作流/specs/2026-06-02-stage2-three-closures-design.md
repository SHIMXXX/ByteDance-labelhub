# 阶段二全量收口与阶段三预埋设计稿

## 背景
当前仓库已完成阶段 0 / 阶段 1 收口，并具备阶段 2 的最小真实闭环：多题任务模型、数据集导入、多题 Labeler workbench、最小 Reviewer 审核链路、Owner 最小 AI 配置入口都已存在。但按 `PLANROAD-A.md` 与 `PLANROAD-B.md` 的严格口径看，阶段 2 仍未做满：

- A 侧仍缺题目级状态总览、自动保存提示、Owner 数据集题目预览、Reviewer 多题列表/筛选/批量入口，以及对应测试与状态收敛。
- B 侧仍缺 AI 审核配置表、评分维度配置、原始 prompt/response 落库、异步队列、自动重试、幂等治理、失败兜底与完整测试。

本轮目标不是做“今天版压缩闭环”，而是把 **A/B 两侧阶段 2 严格做满**；同时只对阶段 3 做结构预埋，不把阶段 3 未完成能力夸大为已完成。

## 已确认的约束与决策
### 用户确认
1. 本轮主目标：**A/B 两侧阶段 2 都严格做满**。
2. 执行顺序：**先做 B 侧阶段 2，再补 A 侧阶段 2**。
3. B2 异步方案：**直接上 Celery / Redis**，不采用 BackgroundTasks 过渡版。
4. 阶段 2 完成口径：**按路线图条目与验证证据严格打勾**，不是“最小闭环视角”。
5. 阶段 3 本轮策略：**只做设计预埋，不正式实现阶段 3 功能**。
6. 工作量允许尽量加大，但切分方式按**阶段 / 任务包**组织，不按天数拆分。

### 本轮坚持的原则
- 只在主工作区串行完成真实开发、测试、联调与文档回写。
- 不做与阶段 2 无关的大规模重构。
- 不让前端接长期不存在或不稳定的后端口径。
- 不用“有页面壳子”“有测试 mock”代替真实完成。

## 本轮总目标
本轮要把阶段 2 收口为一个完整子项目，形成三层结果：

1. **B2 AI Agent 工程化完成**：任务级配置、Celery/Redis 异步执行、重试、幂等、原始 prompt/response 持久化、失败转人工兜底全部落地。
2. **A2 多题任务前台体验补满**：Labeler 工作台状态化、Owner 数据集题目预览与聚合统计、Reviewer 多题列表/筛选/批量入口全部落地。
3. **阶段 3 预埋完成**：数据结构、页面骨架、状态语义和审计事件为下一轮高级模板与多轮审核能力留下稳定扩展位。

## 本轮明确不做
- 不正式实现阶段 3 的条件显示、联动校验、分组容器、多 Tab。
- 不正式实现阶段 3 的多轮审核记录、答案 diff、完整审计时间线。
- 不推进阶段 4 的导出增强、JWT/RBAC、答辩材料大包。
- 不做与当前目标无关的全局重构。

## B2：AI Agent 工程化设计

### 目标
把当前“提交后同步最小审核”的链路升级为“真实异步、可配置、可追溯、可失败兜底”的 AI 审核流水线。

### B2 完成后必须具备的能力
- 每个任务可维护独立 AI 审核配置。
- Labeler 提交后创建 AI job，并异步交给 Celery worker 执行。
- 每次 AI 审核都保存配置快照、原始 prompt、原始响应与结构化结果。
- 同一 submission 不会无意义重复产生多条有效审核任务。
- 网络失败、模型失败、结构化失败等异常有清晰重试与转人工兜底语义。

### 模块边界
#### 1. AI 配置层
新增独立配置实体（如 `ai_audit_configs`），至少覆盖：
- `task_id`
- `prompt_template`
- `score_dimensions`
- `pass_threshold`
- `enabled`
- `version`
- `created_at` / `updated_at`

配置层职责：
- 保存任务当前生效的 AI 审核规则。
- 为 job 执行生成稳定的配置快照。
- 支撑 Owner 侧的读取、保存、回显。

`score_dimensions` 从第一版起就采用结构化 JSON，而不是简单字符串数组，单个维度至少包含：
- `key`
- `label`
- `description`
- `weight`
- `enabled`

这样可以避免阶段 3 的审核标准配置再做迁移。

#### 2. AI Job 调度层
现有 `ai_audit_jobs` 升级为真正的调度实体，建议字段包含：
- `submission_id`
- `task_id`
- `status`：`queued | running | succeeded | failed | fallback_human_review`
- `attempt`
- `max_attempts`
- `celery_task_id`
- `config_snapshot`
- `prompt_snapshot`
- `raw_response`
- `error_code`
- `error_message`
- `started_at`
- `finished_at`

职责：
- 创建 job
- 管理状态流转
- 承载幂等判断
- 保存执行级审计快照

#### 3. Celery Worker 执行层
保留现有 `AIExecutor` / `DeepSeekAIExecutor` 作为 provider 边界，但新增 `JobExecutor` 或 `AuditRunner` 负责：
- 从 job 读取 submission 与 config snapshot
- 组装最终 prompt
- 调用 provider
- 保存原始响应
- 进行结构化校验
- 回写结果
- 更新 submission 状态
- 处理重试与人工兜底

职责分层：
- `AIExecutor`：只负责“给 prompt 拿模型输出”。
- `AuditRunner`：负责“状态流转、校验、落库、重试、兜底”。

这样既满足本轮实现，也为后续替换 provider 或调整队列基础设施保留边界。

#### 4. 结果回写层
保留并扩展 `ai_audit_results`，至少能稳定提供：
- `job_id`
- `submission_id`
- `task_id`
- `config_version`
- `scores`
- `decision`
- `summary`
- `prompt_snapshot`
- `raw_response`
- `validation_status`
- `created_at`

职责：
- 供 Reviewer / Owner / Export 查询
- 为阶段 3 多轮审核与后续导出复用

#### 5. 人工兜底层
以下情况必须明确进入人工兜底：
- 模型调用失败且达到最大重试次数
- 返回结果结构持续不合法
- 核心字段缺失导致结果不可消费
- 其他被归类为不可恢复的执行失败

兜底结果必须有明确业务语义：
- job 状态为 `fallback_human_review` 或 `failed`
- submission 进入可人工处理状态
- 写入可读错误信息和审计日志

### 核心数据流
目标链路固定为：

```text
Labeler submit
  -> 创建/更新 submission
  -> 读取任务当前 AI 配置
  -> 生成 config snapshot
  -> 创建 ai_audit_job(status=queued)
  -> 投递 Celery task
  -> submit 响应立即返回
  -> worker 消费任务
  -> status=running
  -> 调模型并保存原始 prompt/response
  -> 结构化校验
      -> 成功：写 ai_audit_result + 更新 submission 状态 + status=succeeded
      -> 可重试失败：retry
      -> 达上限或不可恢复失败：fallback_human_review / failed
```

关键点：**提交成功与 AI 审核完成彻底解耦**。

### 幂等策略
采用“双层幂等”：

#### 业务幂等
- 同一 submission 存在 `queued/running` job 时，不再重复创建新的有效 job。
- 同一 submission 若已 `succeeded` 且内容未变化，不重复审核。
- submission 在“待修改后重新提交”时，允许产生新的审核链路。

#### 任务幂等
worker 执行前再次校验 job 当前状态：
- 非 `queued/running` 的 job 不再继续执行
- 防止重复消费导致多次回写

### 重试策略
#### 可重试错误
- 网络超时
- provider 短暂错误
- worker/Redis 临时异常
- 模型响应为空或暂时性不可用

#### 不可重试错误
- AI 配置缺失或非法
- prompt 组装失败
- 业务数据缺失
- 明确的结构化契约错误且可判定为非暂时性

策略：
- 统一 `max_attempts`（第一版可先固定为 3）
- 每次 retry 都记录 `attempt`、`error_code`、`error_message`
- 达到上限后自动转人工兜底

### B2 对前台的直接影响
- Labeler 提交后不会同步等待完整 AI 结果。
- workbench / reviewer / owner 读到更清晰的 AI 状态：
  - `queued`
  - `running`
  - `succeeded`
  - `fallback_human_review`
- Owner 的最小 AI 配置入口将升级为完整阶段 2 配置表单。
- Reviewer 后续可读取更完整的 AI 审核上下文。

## A2：多题任务前台补满设计

### 目标
把当前“最小能跑”的多题前台收口为路线图定义的完整阶段 2 形态，重点不在新页面数量，而在**多题状态模型统一、真实工作台体验补齐、Owner/Reviewer 真正看见 item 级任务**。

### A2 范围
#### Labeler 侧
- 展示每题草稿 / 已提交 / 待修改 / 通过等状态
- 自动保存提示
- 未完成题提示与提交前汇总增强
- 多题切换、草稿恢复、提交汇总测试补齐
- 长列表可用性检查与必要微调

#### Owner 侧
- 任务详情页展示：
  - 数据集题目数量
  - 完成数量
  - 通过率
- 增加数据集题目预览入口与预览页/抽屉

#### Reviewer 侧
- 审核页支持 item 级列表
- 支持筛选
- 支持批量操作入口
- 保持单条审核详情链路稳定

### Labeler Workbench 结构
沿用现有 workbench 结构，增强为三块信息区：

1. **左侧题目导航区**
   - 题号列表
   - 每题状态标记
   - 当前题高亮
   - 总进度统计

2. **中间题目内容区**
   - 原始数据展示
   - Renderer 渲染表单
   - 当前题保存/提交反馈
   - AI / 打回原因提示

3. **顶部或右上角状态反馈区**
   - 自动保存状态
   - 最近保存时间
   - 当前题状态
   - 未完成题数量

目标是在不重构页面骨架的前提下，把体验补到“真实标注工作台”视角。

### 题目级状态模型
前端统一收敛 item 级展示状态为：
- `not_started`
- `draft`
- `submitted`
- `ai_reviewing`
- `needs_revision`
- `review_passed`

必要时搭配辅助字段：
- `hasDraft`
- `lastSavedAt`
- `aiDecision`
- `reviewDecision`
- `rejectReason`

原则：
- 后端保留业务真实状态语义
- 前端聚合为工作台可理解状态
- 不让多个页面各自拼装状态

### 自动保存提示
本轮只做明确反馈，不扩展到离线同步或草稿版本系统。

状态至少包括：
- `正在自动保存...`
- `已自动保存于 HH:mm:ss`
- `自动保存失败，请重试`
- 主动保存与自动保存的提示区分

交互原则：
- 切题前若有未落库变更，优先触发一次保存
- 切题失败时明确提示，不静默丢数据
- 提交后状态反馈应切换到“已提交/待审核/待修改”，不继续显示草稿成功

### 未完成题汇总与提交语义
保持现有设计决策：**不把当前题提交升级为强制整任务最终提交**。

本轮增强为：
- 当前题提交后若仍有未完成题，明确展示剩余题数
- 提供跳转到第一道未完成题的快捷入口
- 汇总面板列出未完成题号
- 全部完成时明确提示“当前任务全部题目已完成”

### Owner 数据集题目预览
不扩展为完整数据集管理后台，而是围绕“任务已绑定的数据集”做精准预览。

建议形态：
- 任务详情卡片展示聚合指标
- 点击“预览题目”进入数据集 item 预览视图（子页或抽屉均可）

预览最小能力：
- 列表
- 分页
- 搜索
- 展示 item 原始内容摘要
- 如后端具备聚合能力，可显示当前任务下的 item 状态摘要

### Reviewer 多题列表 / 筛选 / 批量入口
目标不是提前做阶段 3 的完整高级审核台，而是把阶段 2 做满。

页面建议分成两层：
1. **列表层**
   - item 级待审列表
   - 按状态、任务、关键词筛选
   - 展示 item 数量 / 待审数量
2. **详情层**
   - 点击进入单 item 审核详情
   - 查看原始题目、答案、AI 结果
   - 做通过 / 打回

批量入口策略：
- 本轮必须提供多选与批量操作入口
- 最小能力优先覆盖批量通过
- 批量打回可做最小实现或清晰入口预留，但仍以真实可联调为准

## 阶段 3 预埋策略
本轮不正式实现阶段 3，但必须完成三类预埋：

### 1. 数据结构预埋
- `score_dimensions` 使用结构化 JSON，避免后续迁移
- `ai_audit_results` 保留 `task_id`、`submission_id`、`config_version` 等稳定关联键
- 为后续审核轮次 / diff / 时间线保留明确关联语义

### 2. 页面结构预埋
- Owner 审核配置页按“审核规则配置面板”组织：基础信息、Prompt 配置、评分维度、判定规则、预留高级规则区
- Reviewer 页按“左侧列表 / 右侧详情”工作台结构布局
- Labeler 状态区预留“最近一次审核反馈摘要”位置

### 3. 状态机与审计预埋
统一审计事件命名，为阶段 3 时间线复用：
- `submission_submitted`
- `ai_job_queued`
- `ai_job_started`
- `ai_job_retried`
- `ai_audit_succeeded`
- `ai_audit_fallback_human_review`
- `review_decision_recorded`

目标：下一轮做多轮审核、diff、时间线时，不需要先返工阶段 2。

## 统一数据流与状态流

### 统一数据流

```text
Owner 配置任务与 AI 规则
  -> Labeler 领取任务
  -> Labeler 按 dataset_item 作答 / 保存草稿 / 提交
  -> 提交生成或更新 submission
  -> 后端创建 AI job 并异步审核
  -> AI result 回写 submission 展示态
  -> Reviewer 基于 item 列表进入审核
  -> 审核决定继续影响 submission/assignment 聚合状态
  -> Owner 查看任务聚合指标与数据集进度
```

原则：阶段 3 只是在这条主线上加信息，不再新造平行链路。

### 统一状态流
#### 后端真实状态
- `draft`
- `submitted`
- `ai_passed`
- `needs_revision`
- `review_passed`
- 以及 AI job：
  - `queued`
  - `running`
  - `succeeded`
  - `failed`
  - `fallback_human_review`

#### 前端展示状态
- `not_started`
- `draft`
- `submitted`
- `ai_reviewing`
- `needs_revision`
- `review_passed`

分层原则：后端保留真实业务语义，前端聚合为工作台可理解状态。

### 聚合口径统一
#### Owner 关心
- 总题数
- 已完成数
- 通过数
- 通过率
- 待处理数

#### Labeler 关心
- 当前任务总进度
- 还有多少题未完成
- 哪些题待修改
- 哪些题已通过

#### Reviewer 关心
- 当前待审 item 数
- 已筛选结果集
- 可批量处理数量

阶段 2 做满时必须统一这三侧口径，避免阶段 3 再次分叉。

## 测试、联调与验收标准

### B2 后端必须验证的事实
#### 配置层
- Owner 可为任务保存 Prompt 模板、评分维度、通过阈值
- 提交时会读取并保存配置快照

#### 调度层
- submit 创建 `ai_audit_job`
- AI 审核与请求链路解耦
- job 初始状态为 `queued`
- Celery task id 可记录

#### 执行层
- worker 可消费 job
- job 真实经历 `queued -> running -> succeeded/failed/fallback_human_review`
- 原始 prompt / response 能查询
- 结构化校验真实发生

#### 重试与幂等
- 同一 submission 不会无意义重复创建多条有效 job
- retry 真实发生而非仅计数落库
- 达上限后能转人工兜底

#### 结果回写
- Reviewer / Workbench / Owner 聚合读取口径一致
- result 结构可直接给后续 Reviewer 和导出复用

### A2 前端必须验证的事实
#### Labeler Workbench
- 题号导航展示题目级状态
- 切题后状态回显正确
- 自动保存有清晰提示
- 提交后状态更新清晰
- 未完成题有汇总提示
- 待修改题能看到 AI 或人工反馈

#### Owner
- 任务详情展示总题数、完成数量、通过率
- 可进入数据集题目预览
- 预览支持分页/搜索

#### Reviewer
- item 级待审列表可见
- 支持筛选
- 支持批量入口
- 单条详情审核稳定

### 统一联调标准剧本
最终联调以这条剧本为准：
1. Owner 创建或编辑任务
2. Owner 配置 AI 审核规则
3. Owner 绑定数据集并确认题量
4. Labeler 领取任务
5. Labeler 在多题 workbench 中切题、保存草稿、提交若干题
6. 后端创建 AI job
7. Celery worker 异步执行
8. Reviewer 列表看到待审 item
9. Reviewer 进入详情做通过/打回
10. Labeler 看到待修改/通过状态回显
11. Owner 在任务详情中看到聚合指标更新

只有这条链路真实跑通，才能声称阶段 2 做满。

### 测试分层建议
1. **模型/服务单测**
   - 配置快照生成
   - prompt 组装
   - 状态迁移 helper
   - 错误分类
   - 重试策略

2. **接口/集成测试**
   - submit -> job 创建
   - reviewer 列表查询
   - owner 聚合统计
   - dataset preview 查询

3. **前端页面测试**
   - 多题 workbench 状态
   - 自动保存提示
   - reviewer 筛选与批量入口
   - owner 数据集预览

4. **真实联调验证**
   - Redis + Celery worker 真启动
   - seed 数据可复现
   - 浏览器回放完整主链路

### 路线图打勾规则
#### 可以标记完成
- 有真实代码落地
- 有测试或浏览器联调证据
- 前后端口径一致
- 用户可感知能力已形成闭环

#### 不能标记完成
- 只有页面壳子
- 只有 mock 测试
- 只有接口字段，没有消费链路
- 只是结构预埋但未形成阶段 2 功能

## 按阶段 / 任务包切分

### P1：B2 配置与数据模型补齐
包含：
- `ai_audit_configs` 模型与迁移
- prompt 模板持久化
- 评分维度配置持久化
- 阈值配置统一
- config snapshot 设计
- Owner 配置接口与最小前端表单对齐

完成标志：任务级 AI 配置可保存、可读取、可用于提交链路。

### P2：B2 Celery / Redis 异步执行闭环
包含：
- Redis 接入
- Celery app / worker 配置
- job 投递
- worker 消费
- job 状态流转
- prompt 组装
- 原始 prompt / raw response 落库

完成标志：提交后能通过真实 worker 异步完成 AI 审核。

### P3：B2 重试、幂等、人工兜底与审计补齐
包含：
- retry 策略
- 幂等控制
- 错误分类
- fallback 到人工审核
- AI job / result / audit 事件补齐
- B2 核心测试补齐

完成标志：失败不会卡死，重复不会乱写，日志可追。

### P4：A2 Labeler 工作台状态化收口
包含：
- item 级状态模型统一
- 题号导航状态展示
- 自动保存提示
- 未完成题汇总
- 待修改反馈展示收口
- 长列表可用性微调
- 对应前端测试

完成标志：Labeler 工作台具有清晰状态反馈与多题完成视角。

### P5：A2 Owner / Reviewer 多题视角补满
包含：
- Owner 任务详情聚合指标
- 数据集题目预览页
- Reviewer item 列表
- Reviewer 筛选
- Reviewer 批量入口
- 所需后端聚合查询补齐
- 对应页面测试与接口测试

完成标志：Owner、Reviewer 都真正进入 item 级多题视角。

### P6：统一联调、回归、文档回写、阶段 3 预埋检查
包含：
- Redis + Celery + 前后端真实联调
- 浏览器回放标准剧本
- 回归测试
- 更新 `PLANROAD-A.md`
- 更新 `PLANROAD-B.md`
- 更新 `.claude/context/progress-A.md`
- 视情况补 `decisions-A.md` / `architecture-A.md`
- 检查阶段 3 预埋是否挡路

完成标志：可以保守且可验证地把阶段 2 条目标记为完成。

## 风险与控制
### 风险 1：Celery / Redis 接入把范围拉爆
控制：保持 `AIExecutor` 边界不重写，只新增 `AuditRunner` 与调度层，不顺手重构整个 AI service。

### 风险 2：前后端在 item 状态与聚合口径上再次分叉
控制：先定义统一状态流与 Owner/Labeler/Reviewer 聚合口径，再开始页面补齐。

### 风险 3：Reviewer 批量入口膨胀成阶段 3 审核工作台
控制：本轮只交付阶段 2 的列表、筛选、多选与最小批量入口，不提前实现多轮记录、diff、时间线。

### 风险 4：阶段 3 预埋被当成阶段 2 完成
控制：所有文档与进度记录只把“真实可用能力”标记完成，结构预埋必须单独描述，不算完成功能。

## 成功标准
本轮结束时，应满足：
- `PLANROAD-A` 阶段 2 条目全部有真实代码与验证依据。
- `PLANROAD-B` 阶段 2 条目全部有真实代码与验证依据。
- Celery / Redis 异步 AI 审核链路可在本地真实跑通。
- Labeler / Owner / Reviewer 三侧都能在多题任务下看到一致、可解释的 item 级状态与聚合结果。
- 阶段 3 下一轮可直接进入功能实现，而不需要先返工阶段 2 的数据结构或页面骨架。
