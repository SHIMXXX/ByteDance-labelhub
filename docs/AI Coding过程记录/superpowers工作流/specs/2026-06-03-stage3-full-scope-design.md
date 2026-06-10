# LabelHub 阶段三全量完成设计稿

## 背景
当前仓库已经完成阶段 0、阶段 1、阶段 2 的主链路收口，具备：

- 三角色主工作台（Owner / Labeler / Reviewer）
- 多题任务与多题 Labeler workbench
- 任务级 AI 配置、Celery / Redis 异步 AI 审核
- 最小 Reviewer 审核链路与 Owner 导出能力

但按 `PLANROAD-A.md` 与 `PLANROAD-B.md` 的严格口径，阶段三仍未完成。当前主要缺口集中在三块：

1. 高级模板能力：条件显示、基础联动校验、分组容器、多 Tab 布局、schema 兼容展示
2. 审核工作台能力：多轮审核记录、答案 diff、完整审计时间线、批量打回、Reviewer 分配、状态机与轮次模型
3. Owner 配置与导出能力：审核标准配置、评分维度配置、导出字段映射、包含 AI / 人工审核记录的导出配置

本轮目标不是做“展示版阶段三”，而是按路线图口径把 **A / B 两侧阶段三都完整做满**，并以“代码完成 + 测试通过 + 文档回写 + 浏览器验收证据”作为最终验收标准。

## 已确认约束与原则

### 用户确认
1. 本轮目标：**两端完全完成阶段三**。
2. 完成口径：**代码 + 测试 + 文档回写 + 浏览器验收证据**。
3. 阶段三拆为 3 个串行子项目推进。
4. 推进顺序：**审核工作台 → 高级模板 → Owner 配置与导出**。
5. 依赖策略：**尽量零新增依赖**，优先复用现有技术栈。

### 本轮坚持的原则
- 只在当前主工作区串行完成真实开发、测试、文档回写与验收。
- 不做与阶段三无关的大规模重构。
- 不推翻现有页面骨架和任务主链路。
- 所有新增能力都优先服务于最终验收与导出复用。
- 每个子项目都必须独立完成：代码、测试、浏览器验收、文档回写。

## 总体范围与实施顺序
阶段三拆成三个相对独立、但数据上可衔接的子项目：

1. **审核工作台子项目**
   - 后端补多轮提交版本、多轮审核记录、时间线聚合、diff 数据结构、批量打回与分配能力
   - 前端把 Reviewer 页从“最小审核页”升级为“审核工作台”
2. **高级模板子项目**
   - 在现有 Designer + Renderer 结构上补条件显示、基础联动校验、分组容器、多 Tab、schema v2 兼容
3. **Owner 配置与导出子项目**
   - 补审核标准配置、评分维度完整配置、字段映射、导出包含项开关，并消费前两步新增数据

选择这个顺序的原因：

- 审核工作台对状态机、轮次、审计与导出结构影响最大，先做可以给后续导出和配置提供稳定数据口径。
- 高级模板主要影响前端 schema、Renderer 与 workbench 校验，放在审核工作台之后更易控风险。
- Owner 配置与导出天然依赖前两步新增的数据结构，最后收口返工最少。

## 子项目一：审核工作台增强

### 目标
把当前“单轮最小审核页”升级为“可追溯审核工作台”，补齐多轮提交、多轮审核、答案 diff、完整审计时间线和批量操作增强。

### 当前基线
- `Submission` 仍是每个 `assignment + dataset_item` 的当前工作态记录。
- `ReviewRecord` 只记录最小通过 / 打回历史，没有轮次与阶段语义。
- Reviewer 前端只有列表、详情、单条通过 / 打回、批量通过。

### 设计原则
- 不把“每次重提”建成新的 `Submission`，保持当前唯一键口径不变。
- `Submission` 继续承担“当前态聚合入口”。
- 新增历史层来承载版本与审核轮次，避免打碎现有 workbench / 统计 / 导出链路。

### 数据结构设计
#### 1. SubmissionVersion
新增提交版本快照表，用来记录每次“提交当前题”的可追溯版本：

- `id`
- `submission_id`
- `version_no`
- `answers_json`
- `template_version_id`
- `submitted_by`
- `submitted_at`

职责：
- 每次提交时写入快照
- 为 diff 与时间线提供稳定版本来源
- 支撑“当前轮 vs 上一轮”对比

#### 2. Submission 当前态字段扩展
在 `Submission` 上补当前轮次与审核态语义：

- `current_version_no`
- `current_review_stage`（`initial | second | final`）
- `current_review_round`
- `assigned_reviewer_id`（最小分配能力）

职责：
- 保持前端列表仍可直接读当前态
- 避免所有页面都改成历史驱动查询

#### 3. ReviewRecord 扩展
在现有审核记录上补足轮次与版本归属：

- `submission_version_id`
- `review_stage`
- `review_round`
- `assignee_reviewer_id`
- 保留已有 `decision / reason / comment / reviewer_id / created_at`

职责：
- 明确每条审核记录对应的是哪一轮提交版本
- 支撑多轮审核记录、时间线与导出复用

#### 4. AuditLog payload 增强
保持 `audit_logs` 表不大改，只增强阶段三相关事件：

- `submission_version_created`
- `submission_resubmitted`
- `review_assigned`
- `review_stage_changed`
- `review_approved`
- `review_rejected`

职责：
- 提供完整时间线素材
- 为最终浏览器验收与审计链路说明提供依据

### 状态与轮次语义
- 每次 Labeler 提交都会产生新的 `SubmissionVersion`
- 首次提交进入 `current_review_stage=initial`
- 打回后 Labeler 修改并重提，`current_review_round` 递增
- 审核阶段固定为 `initial / second / final`，不做任意配置化工作流引擎

### diff 设计
阶段三只做**字段级 diff**，不做富文本逐字符 diff。

diff 输出结构最小包含：
- `field`
- `previousValue`
- `currentValue`
- `changeType`（`added | changed | unchanged | removed`）

生成逻辑：
- 有上一轮版本时，对比上一轮 `answers_json` 与当前轮 `answers_json`
- 无上一轮时返回空 diff，并在前端显示“首轮提交暂无对比版本”

### API 设计
#### 1. 待审列表增强
`GET /reviews/pending`

返回补充：
- `currentReviewStage`
- `currentReviewRound`
- `hasPreviousVersion`
- `assignedReviewer`
- `latestAiSummary`

#### 2. 审核详情增强
`GET /reviews/{submission_id}`

返回补充：
- 当前版本信息
- 上一版本信息摘要
- `diffItems`
- `reviewHistory`
- `timeline`
- `availableActions`

#### 3. 批量打回
`POST /reviews/bulk/reject`

要求：
- 理由必填
- 与批量通过保持相同口径

#### 4. Reviewer 分配
最小新增：
- `POST /reviews/{submission_id}/assign`
- 可选批量分配接口

只做“分配给某 reviewer”的最小能力，不做复杂抢单系统。

### 前端 Reviewer 工作台设计
#### 列表页增强
每个待审项卡片展示：
- 当前审核阶段
- 当前轮次
- 是否存在上一轮可 diff
- AI 结论摘要
- 分配 reviewer
- 批量通过 / 批量打回 / 批量分配入口

#### 详情页增强
详情页分为六个区块：
1. 原始题目
2. 当前答案
3. 上一轮答案 vs 当前答案 diff
4. AI 审核结果
5. 审核时间线与多轮审核记录
6. 审核操作区

### 测试与验收
#### 后端
- 多轮提交生成版本快照
- 重提后轮次号正确递增
- 审核记录正确绑定版本与阶段
- 时间线顺序正确
- diff 在“有上一轮 / 无上一轮”两种情况下都正确
- 批量打回理由必填
- 非法状态跳转被拦截

#### 前端
- Reviewer 列表正确展示轮次 / 阶段 / 分配 / 历史标记
- 详情页展示 diff / 时间线 / 多轮记录
- 批量通过 / 批量打回交互正确
- 无上一轮时空态清晰
- 接口失败时页面不崩溃

#### 浏览器验收
至少走通：
- Labeler 提交第 1 轮
- Reviewer 打回
- Labeler 修改并重提第 2 轮
- Reviewer 查看 diff / 时间线
- Reviewer 最终通过

### 明确不做
- 不做富文本字符级 diff
- 不做复杂 reviewer 权限编排
- 不做任意配置化工作流引擎
- 不单独新建一套事件存储系统

## 子项目二：高级模板增强

### 目标
在现有模板 Designer + Renderer 结构上补齐条件显示、基础联动校验、分组容器、多 Tab 布局与 schema 版本兼容展示。

### 当前基线
- 当前 schema 是线性组件数组
- 当前 Renderer 只按数组顺序渲染
- 模板类型系统没有容器类组件，也没有规则字段

### 设计原则
- 扩展当前 schema，不重写整个模板系统
- 不做无限嵌套与复杂规则 DSL
- 预览模式与作答模式继续共用同一个 Renderer
- 规则判断与校验逻辑用纯函数封装，避免散落在 UI 内部

### schema 版本策略
- 老模板继续视为 `version: 1`
- 新结构保存为 `version: 2`
- 前端读取时：
  - `version <= 1`：按旧平铺结构 hydrate
  - `version >= 2`：按新结构 hydrate
- 模板页明确显示当前 schema 版本与兼容说明

### 结构组件设计
新增两类结构组件：

1. `group`
   - `label`
   - `description`
   - `children`

2. `tab_container`
   - `label`
   - `tabs: [{ key, label, children }]`

普通字段组件保留现有属性，并新增可选规则字段：
- `visibleWhen`
- `validationRules`

### 条件显示规则
`visibleWhen` 最小规则结构：
- `field`
- `operator`
- `value`

支持操作符：
- `eq`
- `neq`
- `not_empty`
- `includes`

规则组合关系固定为 **AND**，不做自由表达式。

### 基础联动校验规则
`validationRules` 最小支持：
- `required_if`
- `min_selected`
- `json_valid`

语义：
- `required_if`：依赖字段满足条件时当前字段必填
- `min_selected`：多选 / 标签选择至少选 N 项
- `json_valid`：JSON 编辑器必须为合法 JSON

### Designer 设计
#### 左栏：物料区
新增：
- 添加分组容器
- 添加 Tab 容器

#### 中栏：画布
- group 显示为容器块，内部列出 children
- tab_container 显示为容器卡片与 tab 列表
- 仅支持最小粒度排序：
  - 顶层排序
  - group 内排序
  - tab 内排序

不做跨层级自由拖拽，降低复杂度与返工风险。

#### 右栏：属性面板
根据选中项类型切换：
- 普通字段：标题、字段名、必填、选项、条件显示、联动校验
- group：标题、说明
- tab_container：tab 管理与名称编辑

### Renderer / Workbench 设计
Renderer 从线性渲染器升级为结构化渲染器：
- 普通字段：沿用现有渲染逻辑
- `group`：渲染标题与子字段区块
- `tab_container`：渲染 tab 切换与当前 tab 下字段
- 渲染前先判断 `visibleWhen`
- 提交前统一执行 `validationRules`

校验结果统一返回字段级错误 map，供 workbench 与模板预览复用。

### 测试与验收
#### 前端
- 条件显示满足 / 不满足时渲染正确
- `required_if` / `min_selected` / `json_valid` 校验正确
- group 与 tab_container 渲染正确
- v1 / v2 模板都能加载、回显、保存
- 保存新结构时 schema version 为 2

#### 后端
- 模板 schema 可原样持久化 version 2
- active version 读取不破坏旧模板
- 若存在白名单校验，同步放开 v2 新字段

#### 浏览器验收
至少走通：
- Owner 创建带 group + tab + 条件显示 + 联动校验的模板
- Labeler 打开 workbench
- 条件显示正常
- 不满足联动校验时提交失败并提示
- 修正后成功保存 / 提交

### 明确不做
- 不做复杂公式表达式
- 不做跨层级自由拖拽
- 不做无限嵌套容器
- 不做图形化规则编排器
- 不做后端独立规则引擎

## 子项目三：Owner 配置与导出增强

### 目标
把阶段二已有的最小 AI 配置和最小导出能力升级为阶段三要求的“可配置输出层”：补审核标准、评分维度完整配置、字段映射、导出包含项开关，并消费前两步新增数据。

### 当前基线
- 后端已有 `AIAuditConfig`，支持 `promptTemplate / scoreDimensions / passThreshold`
- 前端已有最小 AI 配置入口与最小导出页
- 导出当前只有任务 + 格式（json/csv）+ 导出历史
- 导出内容仍是固定字段拼装

### 设计原则
- 任务级配置与导出任务快照分离
- 任务级配置负责长期语义
- 导出任务快照负责本次导出口径，避免历史记录受后续配置变动影响

### 任务级配置设计
在现有 `Task / AIAuditConfig` 基础上补审核标准语义：
- `review_guideline`（文本）
- 保留 `prompt_template`
- 保留 `score_dimensions_json`
- 保留 `pass_threshold`

说明：
- 第一版审核标准优先使用文本，不额外引入复杂 JSON 规则模型
- 评分维度继续使用结构化数组，作为可配置评分标准主体

### 导出任务快照设计
在 `ExportJob` 上补：
- `field_mapping_json`
- `include_ai_audit`
- `include_review_records`
- `export_scope`（最小可选，如 `all | review_passed`）

职责：
- 创建导出任务时固化本次映射与包含项
- `complete` 时按快照生成导出内容
- 确保历史导出口径稳定
- 阶段三的导出增强仅作用于当前真实支持的 `json / csv` 两种格式，不提前引入 JSONL / Excel 能力

### Owner 前端设计
#### 1. 任务 AI / 审核配置区
优先扩展现有任务配置入口，不单独再造新页面，配置区包含：
- Prompt 模板
- 评分维度列表（key / label / description / weight / enabled）
- 通过阈值
- 审核标准说明（文本域）

#### 2. 导出配置区
扩展 `OwnerExportsPage` 的“发起导出”区域，新增：
- 字段映射配置
- 是否包含 AI 审核结果
- 是否包含人工审核记录
- 导出范围（默认全部，可最小支持仅 `review_passed`）

### 字段映射设计
不做任意表达式映射，采用“固定候选字段勾选 + 可改别名”。

预置字段候选：
- `submissionId`
- `taskId`
- `datasetItemId`
- `labelerName`
- `submissionStatus`
- `answers`
- `aiDecision`
- `aiSummary`
- `reviewDecision`
- `reviewComment`
- `reviewReason`
- `reviewStage`
- `reviewRound`
- `currentVersionNo`

每个映射项最小结构：
- `sourceKey`
- `enabled`
- `targetLabel`

### 导出内容策略
#### JSON
- 保留结构化输出
- 包含基础字段
- 可选带 AI / review 信息
- 若开启人工审核记录，可附带最近一轮审核结果与轮次信息

#### CSV
- 保持扁平化输出
- 只导出启用字段
- `answers / source` 等复杂结构转成字符串
- 不把完整多轮时间线摊平成多行历史表

#### 多轮审核导出口径
阶段三固定导出“当前最新态”。
若开启人工审核记录，则导出：
- 当前轮审核结论
- 当前轮评论 / 理由
- 当前审核阶段
- 当前审核轮次

不在阶段三做完整时间线平铺导出。

### API 设计
#### 1. 任务配置
继续扩展现有：
`PATCH /tasks/{task_id}/ai-config`

新增支持：
- `reviewGuideline`

#### 2. 导出创建
扩展现有：
`POST /exports`

新增请求字段：
- `fieldMapping`
- `includeAiAudit`
- `includeReviewRecords`
- `exportScope`

### 测试与验收
#### 后端
- 任务配置保存 / 读取包含 `reviewGuideline`
- 导出任务保存字段映射与包含项快照
- JSON / CSV 按配置输出正确字段
- 未勾选 AI / 人工审核记录时不输出对应字段
- 勾选后输出正确
- 历史导出任务不受后续任务配置修改影响

#### 前端
- 评分维度可新增 / 编辑 / 删除 / 回显
- 审核标准说明可保存与回显
- 导出页字段映射 UI 正确
- 包含项开关正确传给后端
- 导出历史仍可查看

#### 浏览器验收
至少走通：
- Owner 保存审核标准 + 评分维度
- 发起一条带字段映射和包含项开关的导出
- 导出结果内容与勾选项一致

### 明确不做
- 不做导出模板 marketplace
- 不做任意脚本 / 表达式映射
- 不做完整历史时间线平铺导出
- 不做复杂列级权限系统
- 不在阶段三提前补 JSONL / Excel 导出实现，继续以前后端当前真实支持的 `json / csv` 为准

## 最终验收与回写要求

### 工程验收
阶段三完成后必须满足：
1. 后端定向测试通过
2. 前端定向测试通过
3. 前端 build 通过
4. 浏览器真实链路验收通过

### 文档回写
需要同步更新：
- `PLANROAD-A.md`
- `PLANROAD-B.md`
- `.claude/context/progress-A.md`
- `.claude/context/decisions-A.md`
- `.claude/context/architecture-A.md`
- README（若能力口径变化）

### 浏览器验收主链路
至少保留三段真实证据：
1. 审核工作台：打回 → 修改 → 重提 → diff → 通过
2. 高级模板：条件显示 / 联动校验 / group / tab 的真实渲染与提交
3. Owner 配置与导出：保存审核标准与评分维度 → 发起带映射和包含项开关的导出 → 核对结果

## 风险与取舍

### 主要风险
1. 审核工作台涉及后端状态机与前端详情页联动，影响面最大。
2. 高级模板若做成复杂规则引擎，极易超出阶段三收口边界。
3. 导出若尝试完整平铺多轮历史，会显著增加复杂度和测试成本。

### 本设计的主要取舍
- 审核工作台以“Submission 当前态 + SubmissionVersion 历史层”实现，而不是新建多条 Submission。
- 模板规则只做最小表达能力，不做复杂 DSL。
- 导出只导出“当前最新态 + 可选审核信息”，不做完整时间线平铺。
- 所有阶段三增强都以复用当前骨架为前提，不做无关重构。

## 结论
本设计以“审核工作台 → 高级模板 → Owner 配置与导出”的顺序收口阶段三，能够在不推翻现有基线、不大规模引入依赖的前提下，把 `PLANROAD-A.md` 与 `PLANROAD-B.md` 中阶段三的核心能力完整补齐，并为最终测试、文档回写与浏览器验收提供可执行边界。