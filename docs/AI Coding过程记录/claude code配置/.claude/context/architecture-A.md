# 架构记录（按时间顺序）

## 2026/06/09 - 桌面分辨率适配的最小收口策略
- 背景：项目当前已完成多角色产品化，但关键页面包含大量固定三栏/双栏布局、粘性侧栏和较保守的内容宽度；在 1280×800 下出现横向溢出与垂直压缩感，在 1920×1080 下又存在内容区过窄、留白偏多的问题。
- 决策：
  - 不重构路由壳层、不引入新布局系统，继续沿用现有 `AppFrame + styles.css + 页面内局部 inline style` 架构。
  - 全局先修 `body` / `content-inner` / `app-shell` 的宽度策略，再对 `Labeler Workbench`、`Reviewer Workbench`、`Owner 任务详情`、`Reviewer Dashboard`、`Owner 审核管理` 等关键页面补桌面断点。
  - JSX 层仅把少数高价值页面的固定 `gridTemplateColumns` 改为 class 入口，具体列数与断点逻辑统一沉淀到 `styles.css`，避免继续把响应式策略散落在页面内联样式里。
  - 适配目标明确收口到桌面演示分辨率 `1280×800` 与 `1920×1080`，不在本轮扩展到移动端重排。
- 影响范围：`frontend/src/styles.css`、`frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.tsx`、`frontend/src/pages/reviewer/dashboard/ReviewerDashboardPage.tsx`、`frontend/src/pages/owner/tasks/OwnerTaskDetailPage.tsx`、`frontend/src/pages/owner/reviews/OwnerReviewManagementPage.tsx`。

## 2026/06/08 - Labeler Workbench 差异视图与局部快捷键
- 背景：Labeler Workbench 已具备真实多题作答、自动保存与待修改重提链路，但在 AI reject / 人工打回后的“修改讲述性”与真实工作台操作质感上仍有明显缺口：用户只能看到打回理由，无法直接回答“这次改了什么”；同时高频动作只能依赖按钮点击。
- 决策：
  - 差异视图的基线统一采用“上次提交版本答案 (`SubmissionVersion`) vs 当前本地答案”，而不是 reviewer 最终答案或更复杂的文本级 diff；后端通过 `/workbench/items` 最小补出 `previousAnswers`、`diffItems`、`currentVersionNo`，前端在 Workbench 页面内基于本地 `itemAnswers` 实时重算字段级 diff。
  - 快捷键能力不抽全局框架，只局部收口在 `LabelerWorkbenchPage`：`Alt + ← / →` 切题，`Ctrl/Cmd + S` 保存草稿，`Ctrl/Cmd + Enter` 提交当前题；并通过 editable target guard、组合输入态与 source 预览弹窗保护避免误触。
  - 展示层默认只突出 changed / added / removed 字段，优先满足答辩与演示讲述性，不扩展到 token 级高亮、多版本切换器或全局时间线。
- 影响范围：`backend/app/api/routes/workbench.py`、`backend/tests/test_workbench_api.py`、`frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.tsx`、`frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.test.tsx`、`frontend/src/types/domain.ts`。

## 2026/06/07 - 沉浸式配置工作台 (Workspace) 模式
- 背景：随着系统功能深化（如 AI 预审、审核管理、模板设计器），简单的 CRUD 表单已无法承载“配置规则 -> 注入样本 -> 模拟运行 -> 观察结果”的闭环调试需求。
- 决策：
  - 复杂配置场景统一采用“沉浸式工作台”模式：脱离主导航壳层，提供全屏或大尺寸 Modal 空间。
  - 引入“实时调试 (Test Run)”架构：前端实时构造包含模拟数据的 payload，后端提供无副作用的执行接口并即时返回结果。
  - 布局标准化：左侧负责规则配置与逻辑编排，右侧负责实时预览、日志输出或调试结果。
- 影响范围：`OwnerTemplateDesignerPage`、`AIConfigWorkspace`、`OwnerReviewManagementPage`。

## 2026/06/07 - 模板系统升级到 schema v3
- 背景：当前模板系统虽然已具备组件编辑、容器编辑与运行态预览能力，但整体仍偏“表单编辑器”心智，无法自然承接“先绑数据集、看真实样本、设计原始数据展示区 + 作答区”的新流程。
- 决策：
  - 模板创建前必须先绑定一个数据集；
  - Designer 固定为上下双分区：上方 `sourceView`，下方 `answerView`；
  - schema 顶层升级为 `datasetBinding + layout + sourceView + answerView` 的 v3 结构；
  - 运行态继续兼容旧 v1/v2，并通过规范化层让 v3 接入现有 Renderer。
- 影响范围：`backend/app/models.py`、`backend/app/api/routes/templates.py`、`frontend/src/types/domain.ts`、`frontend/src/features/renderer/*`、`frontend/src/pages/owner/templates/*`、`frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.tsx`、`frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.tsx`。

## 2026/06/06 - Owner 端分级导航与分离式 Designer 外壳
- 背景：Owner 端页面产品化已基本齐备，但侧边导航仍为平铺结构，模板 Designer 也仍复用普通管理页壳层，削弱了信息层级和工作区沉浸感；同时任务、数据集、导出三个页面的主动作入口仍较分散，页面主体容易被“配置入口卡片”挤占。
- 决策：
  - Owner 左侧菜单改为“主页 + 标注管理分组”结构，四个业务子页默认展开，不做折叠树或二段导航。
  - 任务管理页继续沿用现有列表页，但把任务卡片重组为更清晰的运营面板布局；数据集解绑收口为仅 `paused` 状态允许的最小后端接口与前端确认弹窗。
  - 数据集页与导出管理页统一收口为“右上角主 CTA + 弹窗承接流程”，减少页面内常驻配置块；模板库保留资产页语义，Designer 改为独立工作区，不再复用 Owner 主菜单壳层。
- 影响范围：`frontend/src/router/roleMenus.ts`、`frontend/src/layouts/AppFrame.tsx`、`frontend/src/App.tsx`、`frontend/src/pages/owner/tasks/OwnerTasksPage.tsx`、`frontend/src/pages/owner/datasets/OwnerDatasetsPage.tsx`、`frontend/src/pages/owner/templates/OwnerTemplatesPage.tsx`、`frontend/src/pages/owner/templates/OwnerTemplateDesignerPage.tsx`、`frontend/src/pages/owner/exports/OwnerExportsPage.tsx`、`frontend/src/styles.css`、`backend/app/api/routes/tasks.py`。

## 2026/05/21 - MVP 边界与实现原则
- 背景：两人团队、使用 Claude Code、编程基础偏弱，需要在 3 周内稳完赛，同时避免因设计范围膨胀导致主链路失控。
- 决策：
  - 模板搭建器第一版采用严格字段白名单，不做高级联动和复杂属性系统。
  - AI 预审输出与业务状态采用固定映射，Reviewer 拥有最终裁决权。
  - 导出能力优先交付 JSON 与 CSV，其余格式后置。
  - 审计日志只记录关键事件，不做字段级细粒度审计。
  - 提交状态第一版简化，不额外引入 `ai_rejected` 与 `review_rejected`。
  - 第一版鉴权固定为 Bearer token，AI trigger 不进入前端正常调用链路。
  - 分工上将部分页面壳子与支撑任务转移给成员 B，减轻成员 A 的主链路压力。
- 影响范围：设计稿、实施计划、接口契约、`PLANROAD-A.md`、`PLANROAD-B.md`。

## 2026/05/25 - 开发主分支统一到 SM
- 背景：LWH 分支中有价值的后端真实接口能力已并入 SM，后续开发需要统一前后端联调入口，同时保留历史分支用于回溯。
- 决策：
  - 后续前后端整合开发统一在 `SM` 分支推进。
  - `LWH` 保留为参考 / 归档分支，不再作为默认执行分支。
  - 会话默认优先读取 A 侧上下文，同时按需读取 `PLANROAD-B.md` 与 `progress-B.md`。
- 影响范围：`CLAUDE.md`、`.claude/context/progress-A.md`、`.claude/context/decisions-A.md`、`PLANROAD-A.md`。

## 2026/06/03 - 阶段 3 的数据、模板与导出架构收口
- 背景：阶段 3 同时要求前端补齐高级模板与 Reviewer 工作台，也要求后端提供可追溯审核历史和可配置导出；如果沿用阶段 2 的平铺模板与单层审核记录，无法同时满足 diff、时间线与字段映射需求。
- 决策：
  - 审核链路采用 `Submission` 当前态 + `SubmissionVersion` 历史层双结构：当前态负责 workbench / reviewer 列表 / owner 统计，历史层负责重提版本、diff 与时间线。
  - 模板继续保留现有线性组件作为 v1，同时引入最小 `schema v2`：`group`、`tab_container`、`visibleWhen`、`validationRules`；Renderer 通过纯函数规则层执行条件显示与联动校验，不引入复杂 DSL。
  - 导出系统继续只承诺 `json / csv` 两种真实格式，但把字段映射、AI/人工审核记录开关和范围选择固化到 `ExportJob` 快照中，避免导出口径随任务配置漂移。
  - 阶段 3 收口阶段的验证口径固定为：`Submission` 当前态负责业务主链路展示，`SubmissionVersion` 与 `ReviewRecord` 负责追溯，时间线只保留与当前 submission 业务相关的审计事件，模板页必须显式展示 schema v1/v2 兼容信息。
- 影响范围：`models`、`submissions/reviews/templates/tasks/exports` 路由与服务层，`Renderer`、Owner 模板页、Labeler/Reviewer 工作台、导出页。

## 2026/06/04 - 阶段 5 资源归属与 reviewer 分配
- 背景：阶段五要求在不引入完整 ACL / RBAC 的前提下，先把 Owner / Labeler / Reviewer 三角色的真实资源访问边界补到主链路，并让 Owner 页面具备最小 reviewer 分配入口。
- 决策：
  - Owner / Labeler 的访问控制继续复用现有归属字段（`owner_id`、`created_by`、`user_id`、`assignment.user_id`），统一沉淀到显式 `access_control` helper 中，而不是散落在各路由内。
  - Reviewer 的访问控制主依据改为 `task_reviewer_assignments`，由 Owner 在任务页按 task 维度覆盖式保存 reviewer 列表；本轮不采用通用 ACL / RBAC，也不把 submission 级分配作为主判定口径。
  - Owner 任务列表接口需直接返回 `reviewers` 摘要，确保分配成功后的页面回显由 `/tasks` 主列表一次性驱动，避免前端额外串行读取 reviewer 明细接口。
- 影响范围：`access_control`、`tasks/reviews/submissions/workbench/users` 路由，`OwnerTasksPage`、领域类型与接口契约。

## 2026/06/04 - 认证旁路、会话失效与运行时授权收口
- 背景：阶段五第一轮资源归属完成后，质量审查指出正式接口仍可通过 `get_demo_user()` 的默认 demo 回退和 `X-Demo-User` 旁路访问；同时前端登录失败残留旧 token、401 后仍停留在受保护页面，也会削弱权限边界的真实性。
- 决策：
  - 正式运行路径统一要求 Bearer JWT；`get_demo_user()` 仅在 `APP_ENV=test` 时保留测试旁路。
  - JWT secret 默认值保护放在应用 startup 时执行，而不是模块导入期；测试环境可豁免，真实运行继续 fail fast。
  - 前端 401 失效处理统一放到 API client：收到 401 即清空登录态并派发 `labelhub:auth-expired` 事件；`RoleGuard` 监听后立即回登录页。
  - `OwnerTasksPage` 的 reviewer 目录改为按需加载；登录页在失败分支与进入页时清理旧会话，防止旧 token 残留影响 route guard 判定。
- 影响范围：认证依赖、`main/config`、测试底座、`API client`、`RoleGuard`、登录页、Owner 任务页、README、接口契约。

## 2026/06/04 - 剩余功能缺口前端收口与产品化小补强
- 背景：在阶段 3 / 阶段 5 的主功能缺口补完后，前端仍有几处“功能已通但体验不顺”的薄弱点，包括 Designer 容器编辑仍偏原始、Labeler 自动保存缺少真实失败回放、认证体验缺少多标签同步与用户名回填、Reviewer 分配失败路径缺少浏览器级运行证据。
- 决策：
  - `Renderer` 的 `tab_container` 从“全部展开渲染兜底”升级为最小 Tab 切换；Designer 侧继续沿用现有大文件边界，不拆新组件，仅在 `OwnerTemplatesPage` 内小步补上 `visibleWhen` / `validationRules` 结构化编辑、group/tab children 可视编辑、常用子组件快捷添加与 children 基础排序。
  - Labeler workbench 的保存逻辑统一收口到 `saveDraftForItem()`，自动保存、切题前保存与手动保存共用一套路径；失败场景继续通过仅 DEV 生效的 failure injection 辅助浏览器回放，而不扩大为正式业务能力。
  - 认证体验第二轮维持最小产品化策略：`AppFrame` 统一退出入口、`LoginPage` 一次性失效提示与上次用户名回填、`RoleGuard` 通过 auth sync 监听做多标签基础同步，不扩到 refresh token / remember me / 服务端会话中心。
  - Reviewer 分配错误语义固定为局部区块处理，页面级 `pageError` 不再承载 reviewer 列表加载失败或保存失败路径。
- 影响文件：
  - `frontend/src/features/renderer/Renderer.tsx`
  - `frontend/src/features/renderer/Renderer.test.tsx`
  - `frontend/src/pages/owner/templates/OwnerTemplatesPage.tsx`
  - `frontend/src/pages/owner/templates/OwnerTemplatesPage.test.tsx`
  - `frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.tsx`
  - `frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.test.tsx`
  - `frontend/src/services/api/client.ts`
  - `frontend/src/router/guards.tsx`
  - `frontend/src/layouts/AppFrame.tsx`
  - `frontend/src/pages/auth/LoginPage.tsx`
  - `frontend/src/pages/auth/LoginPage.test.tsx`
  - `frontend/src/pages/owner/tasks/OwnerTasksPage.tsx`
  - `frontend/src/pages/owner/tasks/OwnerTasksPage.test.tsx`

## 2026/06/04 - 最终阶段路线统一收口到演示产品化总表
- 背景：原 `PLANROAD-A.md` / `PLANROAD-B.md` 已完整承载前期开发路线与历史阶段记录，但当前阶段目标已从“继续补开发”切换为“演示产品化与答辩交付收口”；此时若继续在 A/B 两份路线图中分别叠加最终冲刺任务，会削弱统一执行与优先级管理。
- 决策：
  - 新增 `PLANROAD-FINAL.md` 作为最终阶段统一执行总表，集中承接视觉升级、核心页面产品化、角色闭环补齐、演示样本、文档与环境收口任务。
  - `PLANROAD-A.md` / `PLANROAD-B.md` 继续保留为历史路线、完成基线与参考归档，不再承担最终阶段的主执行计划角色。
  - 最终阶段默认降级安全深化、完整会话体系、通用 RBAC/ACL 等低演示收益事项，优先推进高观感、高体验、高讲述性的页面和交付物。
- 影响范围：`PLANROAD-FINAL.md`、`PLANROAD-A.md`、`PLANROAD-B.md`、README、demo-script、用户手册、演示环境说明。

## 2026/06/05 - P0 产品化工作台架构落地
- 背景：`PLANROAD-FINAL.md` 已把最终阶段 P0 定义为“登录页 / Dashboard / Owner 任务详情 / Labeler Workbench / Reviewer 详情 / 我的贡献中心”的产品化升级；现有代码已具备真实主链路，但入口仍是“登录页 → 功能页直达”，且页面观感与信息架构仍偏课程作品。
- 决策：
  - 保持现有 `AppFrame + RoleGuard + roleLayouts + styles.css` 骨架，不引入新的 UI 框架、全局状态库或组件库体系；本轮通过统一全局样式原语与新增少量页面实现产品化升级。
  - 角色根路由统一改为先进入 Dashboard；Owner/Labeler/Reviewer 的“概览”作为一级导航固定入口，形成“Dashboard → 主功能页 → 详情/工作台”的更稳定信息架构。
  - Owner 端通过新增独立任务详情页承接复杂配置与统计，而不是继续把任务列表页扩成超大单文件；Reviewer 端则继续沿用单页 list/detail 双态，优先在现有详情态上强化 diff、AI 结论、时间线与审核摘要展示。
  - Labeler Workbench 保持 `Renderer` 作为唯一字段渲染与规则执行层，工作台页面只重构布局和反馈层次，不把自动保存、切题前保存、提交状态机下沉进渲染器。
  - 为支撑 Labeler Dashboard 与我的贡献中心，后端新增最小聚合接口 `/workbench/summary`，避免前端靠现有 plaza/workbench 接口硬拼统计结果。
- 影响文件：
  - `frontend/src/App.tsx`
  - `frontend/src/layouts/AppFrame.tsx`
  - `frontend/src/layouts/roleLayouts.tsx`
  - `frontend/src/router/roleMenus.ts`
  - `frontend/src/styles.css`
  - `frontend/src/pages/auth/LoginPage.tsx`
  - `frontend/src/pages/owner/dashboard/OwnerDashboardPage.tsx`
  - `frontend/src/pages/owner/tasks/OwnerTaskDetailPage.tsx`
  - `frontend/src/pages/labeler/dashboard/LabelerDashboardPage.tsx`
  - `frontend/src/pages/labeler/MyContributionPage.tsx`
  - `frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.tsx`
  - `frontend/src/pages/reviewer/dashboard/ReviewerDashboardPage.tsx`
  - `frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.tsx`
  - `backend/app/api/routes/workbench.py`

## 2026/06/05 - P0 高优问题修复：提交状态保护与配额语义收口
- 背景：P0 产品化完成后的只读质量审查指出两类高优问题：一是 Labeler 提交成功后仍可能被 autosave 或手动“保存草稿”回滚成 `draft`，二是 plaza 页面已经展示 quota/remaining，但后端仍按“单任务单领取”处理，导致前后端语义不一致。
- 决策：
  - submission 一旦进入 `submitted / ai_passed / review_passed`，前后端都不允许再通过 `/submissions/draft` 回退成 `draft`；前端在提交成功后立即清掉 autosave timer、dirty 标记和 autosave 反馈，后端 `save_draft` 对非草稿可编辑状态直接返回 409。
  - 保留 quota 作为“可领取人数上限”的产品语义：后端 `claim_task` 改为按 `claimed_count < quota` 判定是否还能领取，plaza 的 `claimStatus=claimed/available` 也同步改为围绕“当前用户是否已领取”与“是否仍有剩余额度”工作。
  - `Assignment` 模型移除单 `task_id` 唯一约束，只保留 `(task_id, user_id)` 去重，允许同一任务被多个不同 labeler 按 quota 领取。
  - Workbench 的进度展示文案从“已完成”改成“已通过”，保持与后端 `progress.completed` 当前实际口径一致；Owner 新建任务页移除误导性的独立“保存 AI 配置”按钮，避免 create 态产生必然失败动作。
- 影响文件：
  - `backend/app/models.py`
  - `backend/app/api/routes/tasks.py`
  - `backend/app/api/routes/submissions.py`
  - `backend/tests/test_tasks_api.py`
  - `backend/tests/test_submissions_api.py`
  - `frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.tsx`
  - `frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.test.tsx`
  - `frontend/src/pages/owner/tasks/OwnerTasksPage.tsx`
  - `frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.tsx`

## 2026/06/05 - P0 收口后的状态与语义校正
- 背景：P0 页面产品化主体完成后，浏览器真实回放仍暴露出一类“页面看起来允许继续操作，但状态语义与后端真实状态不一致”的问题，尤其集中在 Labeler Workbench 的待修改重提链路与任务广场 quota 语义上。
- 决策：
  - Workbench 前端不再仅依赖 `statusLabel`，而是当后端未显式返回 `statusLabel` 时回退使用真实 `status`，确保 `needs_revision / submitted / review_passed / draft` 都能被稳定映射到页面状态。
  - `latestRejectReason` 的后端暴露条件收口为仅在 `needs_revision` 时返回，避免 Reviewer/Labeler 看到历史 reject reason 与当前 submission 状态脱节。
  - P0 收口阶段的优先级从“继续扩新页面”切换为“校正当前页面和后端状态语义”，确保浏览器真实链路中的按钮、状态 badge、进度文案和后端状态机完全一致。
- 影响文件：
  - `frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.tsx`
  - `frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.test.tsx`
  - `backend/app/api/routes/workbench.py`
  - `backend/app/api/routes/tasks.py`
  - `backend/app/api/routes/submissions.py`

## 2026/06/05 - Owner 数据入口第一批三段式落地
- 背景：P1/P2 已明确缺少独立数据集管理页、导入向导与详情承接页，Owner 侧数据生产入口无法独立讲述；继续把数据集能力塞在任务页里，会继续放大 `OwnerTasksPage` 的复杂度。
- 决策：沿用现有 `AppFrame + styles.css + React Router + datasets API` 架构，新增数据集管理页、导入向导、详情/预览页三段式结构，并通过 `datasetId` query 最小打通“列表/详情 → 任务绑定”回流；后端仅最小补齐 `createdAt/updatedAt` 契约字段，不新增额外导入预解析接口。
- 影响范围：`frontend/src/App.tsx`、`frontend/src/router/roleMenus.ts`、`frontend/src/services/api/datasets.ts`、`frontend/src/types/dataset.ts`、`frontend/src/pages/owner/datasets/*`、`frontend/src/pages/owner/tasks/OwnerTasksPage.tsx`、`backend/app/services/dataset_import.py`、`docs/api-contracts/labelhub-v1.md`。

## 2026/06/05 - 第二批页面强化采用“局部中心页 + 高信息密度面板”策略
- 背景：P1/P2 的下一阶段重点已经从“补通最小链路”转向“把已有链路包装成更像产品的工作台”；Export Center、Labeler Plaza、Reviewer Queue 与被打回任务中心都属于高观感、高讲述性页面。
- 决策：继续沿用现有 `AppFrame + styles.css` 与局部页面架构，不引入新 UI 框架；通过新增摘要卡、最近结果/批量处理面板、任务市场卡片和待修改中心页，把分散能力收口成更强的中心页表达。
- 影响范围：`frontend/src/pages/owner/exports/OwnerExportsPage.tsx`、`frontend/src/pages/labeler/plaza/LabelerPlazaPage.tsx`、`frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.tsx`、`frontend/src/pages/labeler/RevisionCenterPage.tsx`、`frontend/src/router/roleMenus.ts`、`frontend/src/App.tsx`、`frontend/src/styles.css`。

## 2026/06/05 - Owner P2 采用“任务补充信息 + analytics + 模板库 + 分离式 Designer”结构收口
- 背景：Owner 端在 P1/P2 剩余缺口中，最明显的问题不再是链路能否跑通，而是任务信息不完整、缺少运营分析页、模板缺少资产库心智、Designer 与模板列表耦合过紧。
- 决策：
  - `Task` 新增 `task_brief / task_tags_json / reward_rule`，把任务说明、标签、奖励规则收口为真实持久化字段，而不是继续停留在前端占位展示。
  - 新增 `/tasks/{task_id}/analytics` 与前端 `/owner/tasks/:taskId/analytics`，用最小聚合接口承接总题量、通过率、待审核数与状态分布，不引入新图表库。
  - `/owner/templates` 收口为模板库资产页，强调模板名称、描述、最近版本、使用数与复制能力；独立 `/owner/templates/:templateId/designer` 承担后续 Designer 2.0 强化。
  - 整体仍复用现有 `AppFrame + styles.css + Renderer + React Router` 骨架，不做新 UI 框架或大规模状态管理重构。
- 影响范围：`backend/app/models.py`、`backend/app/core/database.py`、`backend/app/api/routes/tasks.py`、`backend/app/api/routes/templates.py`、`frontend/src/pages/owner/tasks/*`、`frontend/src/pages/owner/templates/*`、`frontend/src/types/domain.ts`、`frontend/src/App.tsx`、`frontend/src/router/roleMenus.ts`、`frontend/src/styles.css`。

## 2026/06/05 - Owner Designer 2.0 第二轮产品化收口
- 背景：Owner 侧 P1/P2 页面大部分已落地后，`PLANROAD-FINAL.md` 中剩余的 Owner 端未完成项基本只剩 Designer 2.0 的两处体验缺口：`group/tab` 容器编辑仍偏原始，以及预览区无法直观看到运行态效果。
- 决策：
  - 保持现有独立 `OwnerTemplateDesignerPage` 架构，不拆新的编辑器子模块或状态层；继续复用现有 `Renderer + styles.css + dnd-kit` 组合做小步增强。
  - 属性区中，`group` / `tab_container` 统一补数量摘要、空状态提示、层级卡片与显式操作区，优先提升容器组件的可理解性与可讲述性。
  - 预览区升级为“预览态 / 运行态预览”双模式：预览态用于看版式，运行态挂示例题面与示例答案，直接复用 `Renderer` 观察运行态语义，而不是另造一套演示渲染器。
  - `Renderer` 的文本输入统一收口为受控值，避免 Designer 在只读预览与运行态切换时产生 uncontrolled/controlled warning。
- 影响范围：
  - `frontend/src/pages/owner/templates/OwnerTemplateDesignerPage.tsx`
  - `frontend/src/pages/owner/templates/OwnerTemplateDesignerPage.test.tsx`
  - `frontend/src/features/renderer/Renderer.tsx`
  - `frontend/src/styles.css`

## 2026/06/05 - Reviewer 质检统计页与 Labeler 作答历史页第二轮收口
- 背景：两页都已有最小路由与接口，但仍停留在“能展示数据”的层面；当前目标不是扩后端能力，而是用最小前端改动把它们补成可演示、可讲述的产品页。
- 决策：
  - 保持现有 `/reviews/quality-stats` 与 `/workbench/history` 契约不变，不新增后端聚合字段；Reviewer 质检统计页与 Labeler 历史页都只基于当前返回结构做前端产品化增强。
  - Reviewer 质检统计页补四张摘要卡（总审核数 / 通过率 / 通过数 / 打回数）并保留打回原因列表与空状态，优先提升页面的讲述性与完整度。
  - Labeler 作答历史页补四张摘要卡（历史记录数 / 已通过 / 待修改 / 审核中），继续保留历史记录卡片与返回作答入口，优先形成“个人回顾中心”心智而非新流程页。
  - 整体继续复用现有 `AppFrame + styles.css + status badge` 体系，不引入新图表库、分页或筛选接口。
- 影响范围：
  - `frontend/src/pages/reviewer/ReviewerQualityStatsPage.tsx`
  - `frontend/src/pages/reviewer/ReviewerQualityStatsPage.test.tsx`
  - `frontend/src/pages/labeler/LabelerHistoryPage.tsx`
  - `frontend/src/pages/labeler/LabelerHistoryPage.test.tsx`

## 2026/06/05 - Labeler 被打回任务中心方案 B 收口
- 背景：`RevisionCenterPage` 已具备最小任务列表与打回理由展示，但仍无法回答“最近被打回的是哪一题、什么时候打回、当前还有哪几题待修改”，因此页面还缺少真正可执行的处理指引。
- 决策：
  - 保持现有 `/workbench/summary` 路由，不新增独立 revision API；仅在 assignment 聚合层补 `latestRejectItemId`、`latestRejectAt`、`revisionItemIds` 三个字段。
  - 字段口径统一按“展示给标注员的题号”输出：优先使用 `dataset_item.item_index`，否则回退现有 submission 关联键，避免前端直接暴露数据库内部 id。
  - `RevisionCenterPage` 在现有摘要卡与任务卡基础上补最近打回题号、最近打回时间与待修改题号列表，继续复用当前 `AppFrame + styles.css + status badge` 体系，不扩分页/筛选/新状态机。
- 影响范围：
  - `backend/app/api/routes/workbench.py`
  - `backend/tests/test_workbench_api.py`
  - `frontend/src/types/domain.ts`
  - `frontend/src/pages/labeler/RevisionCenterPage.tsx`
  - `frontend/src/pages/labeler/RevisionCenterPage.test.tsx`

## 2026/06/06 - `preference_compare` 专项流程最小闭环补齐
- 背景：`PLANROAD-FINAL.md` 第十节要求补齐 `preference_compare` 的真实数据链路缺口，但现有系统只有“通用 Dataset + 通用模板 + Submission 当前态/历史层 + AI 审核 + Reviewer + 导出”的最小骨架，无法直接承接带 Gold / demo 结果的偏好对比任务。
- 决策：
  - 数据层不新建专表，继续沿用 `Dataset / DatasetItem / Submission` 主结构，只做增量扩展：
    - `Dataset.import_mode`
    - `DatasetItem.metadata_json`
    - `DatasetItem.reference_answer_json`
    - `Submission.final_answer_json / finalized_by / finalized_at / final_submission_version_no`
  - 数据导入继续复用现有 `dataset_import.py` 入口，但在导入阶段按约定字段名做角色拆分，把题面、元信息、参考答案分流，避免把 Gold/demo 结果直接暴露给 Labeler。
  - 模板层新增轻量 `compare_panel`，通过 `promptField / leftField / rightField / metadataFields` 表达 A/B 对比题面；不引入通用字段可见性引擎。
  - 规则层继续复用当前 `visibleWhen + validationRules` 架构，只增补 `min_length / equals_if / not_equals_if` 三种规则类型来承接偏好对比场景。
  - AI 审核继续沿用当前 `AIAuditJob / AIAuditResult` 管道，不新增 Gold 质检专表；执行器输入扩展为 `answers + source + reference_answer`，以最小逻辑实现 Gold 冲突转人工。
  - Reviewer 修订并通过与最终结果快照在同一轮实现；导出优先输出 `finalAnswer`，并把 `source / metadata / referenceAnswer` 一并带出。
- 影响范围：`backend/app/models.py`、`backend/app/core/database.py`、`dataset_import`、`templates/submissions/reviews` 路由、`ai_executor/ai_job_runner`、`export_service`、`Renderer`、Designer 2.0、Reviewer 详情页、导入页、相关前后端测试。

## 2026/06/06 - `llm_assist` 真实接入与可编辑状态边界收口
- 背景：模板组件 `llm_assist` 原先只是前端本地 stub，无法满足“按 `backend/.env` 接真实大模型”的目标；接成真实链路后，又暴露出一个状态边界问题：已提交/审核中的题目仍允许写回 AI 建议，从而触发 autosave 失败。
- 决策：
  - 保持现有模板组件与 Workbench UI 结构，不新增新页面、不改模板 schema；新增最小后端代理接口 `POST /workbench/llm-assist`，统一由后端读取 `DEEPSEEK_API_KEY / DEEPSEEK_MODEL / DEEPSEEK_BASE_URL` 调用 DeepSeek。
  - 后端新增独立 `llm_assist` helper，而不是强复用现有面向 AI 审核 JSON 输出的 executor 逻辑，避免把审核用 prompt/response_format 约束硬套到文本建议生成链路。
  - 前端 `LabelerWorkbenchPage` 中，`generateLLMAnswer()` 改为异步调用后端接口；同时新增可编辑状态边界保护，仅允许 `draft / needs_revision / not_started` 题目生成并写回 AI 建议，避免 dirty 标记进入不可保存状态。
  - `Renderer` 的用户可见文案统一收口为“AI 辅助建议”，README 也同步明确它已经是后端代理真实大模型链路，而非本地 stub。
- 影响范围：
  - `backend/app/services/llm_assist.py`
  - `backend/app/api/routes/workbench.py`
  - `backend/tests/test_workbench_api.py`
  - `frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.tsx`
  - `frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.test.tsx`
  - `frontend/src/features/renderer/Renderer.tsx`
  - `README.md`

## 2026/06/04 - 模板版本、审核权限与发布校验统一收口
- 背景：本轮通过质量审查与真实浏览器回归，集中暴露了 reviewer 批量审核越权、template 归属校验缺失、submission 模板版本信任前端、空壳任务可发布，以及部分运行态展示与后端真实状态不一致等问题。
- 决策：
  - `/reviews/bulk/approve` 与 `/reviews/bulk/reject` 统一复用 `require_reviewer_submission_access()`；如果 submission 已显式分配给其他 reviewer，则当前 reviewer 无权批量处理。
  - template 的 PATCH 与 active-version GET 全部改成 owner-only，并统一通过 owner 归属校验收口。
  - submission 的模板版本选择改为“优先使用 submission 上且属于当前 task 模板的版本，否则回退 task 当前冻结/最新有效版本”；若 task 没有有效模板版本，则 submit 直接返回冲突错误，不再静默跳过校验。
  - task 发布采用后端 fail-fast：必须存在 owner 自有 dataset、dataset 至少 1 题、owner 自有 template 且能冻结到有效 template version，否则直接拒绝发布。
  - workbench 的“最近一次打回理由”以 reject record 时间倒序后的首条为准，避免显示旧值。
  - `tab_container` 当前阶段不补复杂切换器，先在 Renderer 中把全部 tab children 展开渲染，优先保证字段可见、可答、可提交。
- 影响范围：`reviews/templates/submissions/tasks/workbench` 路由与测试，`Renderer`、Labeler/Reviewer 运行态页面。
