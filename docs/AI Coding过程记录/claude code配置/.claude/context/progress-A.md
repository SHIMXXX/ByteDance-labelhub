# 当前进度状态

## 最后更新：2026-06-09

### 2026-06-09（新增：Labeler Workbench 画布与差异视图体验优化）
- **差异视图 (Diff View) 彻底重构**：针对“上次提交 vs 当前修改”场景，将原本纵向堆叠的 Diff 卡片重构为“左右双栏对比”布局。引入了更明确的字段标签与状态标识（新增/修改/删除），显著提升了在高频重提修改场景下的对比效率。
- **工作台顶部架构优化**：
  - 压缩了顶部 Header 高度，引入了更紧凑的 `Workplace` 风格设计，减少垂直空间占用。
  - 重组了 `Summary Strip` 指标条，统一了指标间距与视觉权重，使当前进度、必填完成度等关键信息一目了然。
  - 增强了顶部工具栏的视觉平衡，采用按钮组 (Button Group) 替代零散分布的链接。
- **技术收口与验证**：
  - 样式表解耦：将 Workbench 专用的 Diff 样式从页面内联或通用样式中抽离，沉淀到 `styles.css` 的专用区块。
  - 自动化验证：通过 `LabelerWorkbenchPage.test.tsx` 完整回归测试，并成功完成 `npm run build` 全量构建。

### 2026-06-09（新增：数据集界面全方位优化与预览限额突破）
- **数据集列表页 (OwnerDatasetsPage)**：
  - 重构为响应式 Grid 布局，引入全新卡片设计，突出显示题量、最后更新时间与数据格式。
  - 优化了搜索与刷新交互，增加“详情”、“绑定任务”、“删除”等快捷操作入口。
- **数据集详情页 (OwnerDatasetDetailPage)**：
  - **预览限额突破**：通过同步调整前后端 `pageSize`（后端上限提升至 1000，前端默认请求 100），彻底解决了原先只能预览 10 条数据的问题。
  - **全新侧边栏布局**：引入“左侧滚动列表 + 右侧详情预览”的专业分栏模式，支持快速切换样本。
  - **增强功能**：新增样本内容搜索过滤功能，优化了 JSON 字段的 KV 级展示，并集成了 `MediaValue` 以支持富媒体内容预览。
- **技术改进与修复**：
  - 修复了 `formatDate` 未导出导致的编译错误。
  - 修正了 `styles.css` 中的语法警告。
  - 通过 `npm run build` 全量验证，确保类型安全与构建无警告。

### 2026-06-09（新增：Owner 导出弹窗体验优化）
- 已完成 Owner 导出弹窗一轮用户体验优化，重点补齐“从任务直接发起导出”的闭环与弹窗内信息架构：
  - `OwnerExportsPage` 已支持读取 `/owner/exports?taskId=...`，合法任务会默认预选，并在首次进入时自动打开导出弹窗。
  - 原本仅存在于状态中的 `exportScope` 已正式暴露到 UI，支持“全量导出 / 仅导出已审核通过”两种范围选择。
  - 导出弹窗已重组为“基础配置 / 附加内容 / 字段映射 / 导出摘要”四段式结构，新增字段启用计数与提交前摘要，降低首次使用理解成本。
  - 字段映射区保留现有分组与数据结构，但补充了更明确的说明文案与 alias 提示，不改后端导出链路。
- 本轮验证已通过：
  - 前端测试：`npm --prefix frontend run test -- src/pages/owner/exports/OwnerExportsPage.test.tsx`，12 个用例通过。
  - 前端构建：`npm --prefix frontend run build` 通过。
- 当前边界：
  - 弹窗仍保留在 `OwnerExportsPage` 页内，未拆为独立组件；当前优先保证最小改动与测试稳定。
  - `OwnerExportsPage.test.tsx` 下载用例的既存 jsdom navigation warning 仍在，但测试本身通过。

### 2026-06-09（新增：时间筛选功能全量修复）
- 修复了全站时间筛选栏（TimeRangeFilter）在部分页面“无效”的问题，重点是使指标摘要同步响应：
  - **标注员概览 (LabelerDashboardPage)**: 顶部指标卡片（已领取、完成率、通过率、能力评分）现已根据时间筛选自动重算，不再显示全量历史总和。
  - **我的贡献 (MyContributionPage)**: 能力画像、标注能力评分、审核结果分布图表现已完整支持时间筛选，实现能力趋势的区间观察。
  - **任务广场 (LabelerPlazaPage)**: 移除了冗余的隐藏筛选器，确保 UI 逻辑清晰。
  - 确认并优化了 **Owner Dashboard / Reviewer Stats / Exports / My Tasks** 等页面的筛选一致性，确保指标与列表同步。
- 技术收口：
  - 前端构建：`npm --prefix frontend run build` 通过，指标重构逻辑类型安全。
  - 验证逻辑：采用“从已过滤列表派生指标”而非“直接使用后端预聚合指标”的方案，解决了前后端统计口径在时间维度上的脱节。

### 2026-06-09（新增：1280×800 / 1920×1080 分辨率适配收口）
- 已完成一轮以最小改动为原则的桌面分辨率适配，重点覆盖 Owner / Labeler / Reviewer 的核心演示页面：
  - 全局移除 `body` 的强制 `min-width: 1280px`，修复 1280×800 下页面出现横向溢出的根问题；`content-inner` 上限提高到 `1520px`，改善 1920×1080 下内容区过窄、留白过多的问题。
  - `AppFrame` 相关布局在 1439px 以下收口为更紧凑的侧栏与内容区宽度；Workbench / Reviewer 三栏工作台在较窄桌面宽度下缩减左右栏宽度、间距与粘性区域高度，降低 1280×800 下的压缩感。
  - Owner 任务详情、Reviewer Dashboard、Owner 审核管理等页面，把原先内联固定双栏/卡片布局改为可由样式表统一控制的响应式 grid，并在 1439px / 1320px 断点下按单列或更紧凑列数回落。
  - 登录页、统计卡、批量结果、贡献看板等高信息密度模块增加桌面窄高场景兜底，避免顶部区块过高或多卡片并排过挤。
- 本轮验证结果：
  - 前端测试：`npm --prefix frontend run test -- src/pages/owner/tasks/OwnerTaskDetailPage.test.tsx src/pages/reviewer/reviews/ReviewerReviewsPage.test.tsx` 通过，16 个用例通过。
  - 前端构建：`npm --prefix frontend run build` 通过。
  - 浏览器实测：已在 1280×800 下检查 Reviewer Dashboard / Reviewer Reviews / Owner Dashboard / Owner Task Detail / Labeler Workbench，无横向溢出；已在 1920×1080 下确认关键页面内容区展开更充分。
- 当前边界：
  - 本轮主要收口桌面演示分辨率（1280×800、1920×1080），未扩展到移动端重构。
  - 仍保留现有页面内联样式较多的现状，仅把高收益布局抽到样式表，不做大规模组件拆分。

### 2026-06-08（新增：Labeler Workbench 差异视图与快捷键）
- 已完成 Labeler Workbench 两项对标补强：
  - `/workbench/items` 已补最小 diff 基线字段：`previousAnswers`、`diffItems`、`currentVersionNo`，供前端承接“上次提交 vs 当前修改”视图。
  - Workbench 前端已新增“答案差异”卡片：在待修改 / 有历史提交版本时展示“上次提交 vs 当前修改”，默认只突出 changed / added / removed 字段。
  - Workbench 已补页面级快捷键：`Alt + ← / →` 切题，`Ctrl/Cmd + S` 保存草稿，`Ctrl/Cmd + Enter` 提交当前题；并补输入态 / source 预览弹窗防误触保护。
- 本轮验证已通过：
  - 后端：`pytest backend/tests/test_workbench_api.py -q`，9 个用例通过。
  - 前端：`npm --prefix frontend run test -- src/pages/labeler/workbench/LabelerWorkbenchPage.test.tsx`，27 个用例通过。
- 当前边界：
  - 差异视图当前为字段级对比，不做文本级 / token 级高亮。
  - 快捷键当前仅收口在 Labeler Workbench 页面内，不扩展为全局快捷键体系。

### 2026-06-07（补充：dataset item 契约与读取口径统一收口）
- 已完成 dataset import / template schema / dataset item 运行态读取的一轮统一收口：
  - 后端 `dataset_import.py` 已新增统一 helper，集中提供 `source / metadata / referenceAnswer / merged context` 读取，`serialize_dataset_item()` 也已改为复用同一口径。
  - `tasks.py` 中 AI 配置测试运行已从旧 `DatasetItem.sequence` 切到真实 `item_index`，并统一通过 helper 读取 `source` 与 `referenceAnswer`。
  - `reviews.py`、`workbench.py`、`export_service.py`、`ai_job_runner.py` 已全部收口为消费统一 helper，不再散落直连 dataset item 旧字段；其中 review / workbench 展示统一消费合并后的 context，导出与 AI 审计继续保留 `source` / `referenceAnswer` 的分层语义。
- 本轮定向验证已通过：
  - 后端：`pytest backend/tests/test_workbench_api.py backend/tests/test_reviews_api.py backend/tests/test_tasks_api.py backend/tests/test_exports_api.py backend/tests/test_submissions_api.py` 共 92 个用例通过。
- 当前保留边界：
  - `dataset_items.metadata_json` 仍作为 legacy 存储兼容层保留，当前只做读取合并与 API 语义收口，不做数据库删列。
  - 后端请求模型里既存的 Pydantic `alias` / `validation_alias` warning 仍在，本轮未扩大到统一模型重写。

### 2026-06-07（新增：AI 审计工作台与审核管理收口）
- 已完成 Owner 端多项专业化能力重构，显著提升了作为“数据运营平台”的深度：
  - AI 预审配置：从简单表单重构为专业的 `AIConfigWorkspace`，支持 Prompt 预设库、动态多维度管理，以及基于真实样本与模拟答案的“测试运行 (Test Run)”调试能力。
  - 审核管理中心：新增集成看板，支持“审核任务进度（题量统计/进度条）”、“人工审查队列（员工作量/积压监控）”与“AI 审核监控（流水线日志/错误排查）”三位一体监控。
  - 新建任务向导：重构为三阶段向导（基础 -> 数据模板 -> AI 配置），引入了可视化日期滚动选择器，并支持在创建阶段指定 `aiModel`。
- 架构与稳定性加固：
  - AI 模型库更新：全站默认模型切至 `deepseek-v4-flash`，并支持 `minimax-m3`。
  - 数据库自动修补：`patch_schema` 已支持自动补齐 `ai_audit_configs.ai_model` 字段，解决了开发环境旧数据导致的 500 崩溃。
  - 鉴权标准化：`tasks` 相关接口已全面适配 Demo 模式鉴权口径。
  - 设计器交互：引入 `DragOverlay` 解决了物料拖拽被遮挡的问题，并实现了全屏自适应工作台布局。
- 本轮验证已通过：
  - 后端：`pytest backend/tests/test_tasks_api.py` 及定向编译校验通过。
  - 前端：`npm --prefix frontend run test -- OwnerTasksPage.test.tsx OwnerTemplateDesignerPage.test.tsx` 共 24 个用例全部通过。
  - 前端：`npm --prefix frontend run build` 通过。

### 2026-06-07（新增：dataset import / template schema 收口执行计划）
- 用户决策已固定：
  - `metadata` 从产品语义与 API 契约中彻底移除，不再作为导入映射、模板设计、导出配置或前端类型的一部分暴露。
  - 数据集导入改成“字段 -> `source` / `referenceAnswer`”两栏映射；除参考答案类字段外，其余字段统一进入 `source`。
  - Template Designer 预览字段全集改为读取 `source`，`compare_panel` 不再使用 `metadataFields` 命名。
- 本轮实现按“契约迁移优先、物理存储兼容兜底”推进：
  - 后端不在本轮尝试物理删除 `dataset_items.metadata_json` 列；当前仓库只有增量补列式 schema patch，没有安全的删列迁移框架。
  - 运行态统一把旧 `metadata_json` 视为 legacy 输入，在读取/序列化时并入 `source`，保证历史数据、历史模板和历史测试样本仍能显示。
- 计划中的后端改动：
  - `backend/app/services/dataset_import.py`：删除 `METADATA_FIELDS` 分类出口；新增“effective source”辅助函数；`serialize_dataset_item()` 改为仅返回 `source` 与 `referenceAnswer`；`build_dataset_search_text()` 不再单独索引 `metadata`。
  - `backend/app/schemas/dataset.py` 与 `backend/app/api/routes/datasets.py`：导入请求增加字段映射载荷，支持前端两栏分配结果回传；未传映射时保留兼容默认规则。
  - `backend/app/api/routes/reviews.py`、`backend/app/api/routes/workbench.py`、`backend/app/services/export_service.py`：所有读取 dataset item 的路径统一改为消费合并后的 `source`；导出项移除顶层 `metadata` 字段。
- 计划中的前端改动：
  - `frontend/src/pages/owner/datasets/OwnerDatasetsImportPage.tsx`：现有三步导入向导改成“上传解析 -> 字段映射 -> 导入结果”；第二步展示解析出的字段清单，并把每个字段指派到 `source` 或 `referenceAnswer`。
  - `frontend/src/services/api/datasets.ts` 与 `frontend/src/types/dataset.ts`：补导入映射请求类型，移除 `DatasetItemPreview.metadata`。
  - `frontend/src/pages/owner/templates/OwnerTemplateDesignerPage.tsx`、`frontend/src/types/domain.ts`、`frontend/src/features/renderer/Renderer.tsx`：把 `metadataFields` 重命名为更中性的 `contextFields`（或同义命名），读取时兼容旧 schema，保存时输出新 schema。
  - `frontend/src/pages/owner/exports/OwnerExportsPage.tsx`：移除 `metadata` 导出字段与相关文案，导出说明改为“原始题面字段均来自 `source`”。
- 计划中的测试收口：
  - 后端：更新 `backend/tests/test_dataset_import_service.py`、`test_datasets_api.py`、`test_export_contract.py`、`test_exports_api.py`、`test_workbench_api.py`，新增 legacy `metadata_json` 并入 `source` 的兼容断言。
  - 前端：更新 `OwnerDatasetsImportPage.test.tsx`、`OwnerDatasetsPage.test.tsx`、`OwnerTemplateDesignerPage.test.tsx`、`OwnerTemplatesPage.test.tsx`、`Renderer.test.tsx`，删除对 `metadata` 可见性的断言并补旧 schema 兼容用例。
- 关键风险与边界：
  - 若 `source_json` 与 `metadata_json` 存在重名键，默认以后导入/新数据的 `source_json` 优先，需补测试锁定优先级。
  - 导出契约删除 `metadata` 属于对外行为变化，需同步更新页面默认字段与测试快照，避免旧导出模板误引用失效。
  - 本轮不做数据库删列；若后续确认需要物理清理 `metadata_json`，应在引入正式 migration 机制后单独处理。

### 2026-06-07（补充：全量问题排查与第一轮修复）
- 已完成一轮围绕 12 个问题的全量排查与高优修复，重点收口了主链路与前端展示两侧：
  - 后端：`/submissions` 已补 owner 视角按任务查询；任务广场与领取已放宽为 `published + paused`；Reviewer `pending` 队列已收口为“任务级 reviewer 可见未专属分配 submission”；workbench assignment 进度与 item 进度已统一按“已触达/已提交过”口径实时聚合；task metrics 中待审核数已改为按题目去重；导出默认字段已补 `answers/finalAnswer` 主内容字段。
  - 前端：Designer 已接入真实 dataset items 预览，并在绑定数据集时显示真实数据集名称与样本数；组件物料区已改为分组紧凑布局；模板库与导出页时间显示已统一为更短的人性化本地格式；导出弹窗已重构为“分组字段映射”布局并暴露答题内容字段。
- 本轮验证已通过：
  - 后端：`pytest backend/tests/test_submissions_api.py backend/tests/test_reviews_api.py backend/tests/test_tasks_api.py backend/tests/test_workbench_api.py backend/tests/test_exports_api.py -q` 共 91 个用例通过。
  - 前端：`npm --prefix frontend run test -- App.test.tsx OwnerTemplateDesignerPage.test.tsx OwnerTemplatesPage.test.tsx OwnerExportsPage.test.tsx` 共 39 个用例通过。
  - 前端：`npm --prefix frontend run build` 通过。
- 当前仍保留的边界/后续项：
  - Reviewer“未分配时完全不可审”的根问题目前已通过 pending 队列可见性缓解一部分，但 submission 级 assign 仍是 reviewer 发起模型，若要彻底消除自举死锁，后续更适合补 owner 侧直接 assign 或发布前 reviewer 强校验。
  - `OwnerExportsPage.test.tsx` 下载测试仍有既存 jsdom navigation warning，但测试本身通过。
  - 后端请求模型仍有既存 Pydantic alias warning，本轮未扩大到统一模型改写。

### 2026-06-07（补充：第二轮前端体验收口）
- 已继续完成第二轮前端体验收口：
  - Owner Dashboard 统计摘要已改为更贴近真实运营状态：进行中任务包含 `published + paused`，整体通过率改为按题量加权后的真实口径。
  - Designer 相关前端测试已同步收口到当前真实交互：保留真实数据集样本预览、分组物料区、Tab/Group 容器摘要与当前实际 UI 文案。
- 本轮验证已通过：
  - 前端：`npm --prefix frontend run test -- OwnerDashboardPage.test.tsx App.test.tsx OwnerTemplateDesignerPage.test.tsx OwnerTemplatesPage.test.tsx OwnerExportsPage.test.tsx` 共 40 个用例通过。
  - 前端：`npm --prefix frontend run build` 通过。
- 当前仍保留的边界：
  - Designer 业务导航上下文仍是“页面内返回模板库 + 编辑工作区”模式，未切回完整 Owner 壳层；当前测试与实现已对齐，但若后续要彻底解决“独立工作区缺少侧栏导航”，仍需决定是否把 Designer 路由重新并回 OwnerLayout。

### 2026-06-07
- 已完成模板设计流程 v3 第一轮升级：
  - 模板创建已改为先绑定已有数据集 / 导入新数据集，再进入 Designer。
  - 后端模板模型已新增设计期数据集绑定字段，`/templates` 与 `/templates/{id}/active-version` 已返回绑定数据集与参考样本信息。
  - 模板 schema 已正式支持 v3 顶层结构：`datasetBinding + layout + sourceView + answerView`，同时保持旧 v1/v2 运行态兼容。
  - Renderer / rules 已支持消费 v3 双分区结构；Labeler workbench 也已兼容新的 `TemplateSchema` 类型。
  - Designer 页面已改为固定上下双分区成品画布，标题下方显示绑定数据集、当前样本与 `schema v3`，并加入常驻样本切换器。
- 本轮验证已通过：
  - 前端：`npm --prefix frontend run test -- OwnerTemplatesPage.test.tsx OwnerTemplateDesignerPage.test.tsx Renderer.test.tsx rules.test.ts` 共 22 个用例通过。
  - 后端：`pytest backend/tests/test_templates_api.py -q` 共 10 个用例通过。
  - 前端：`npm --prefix frontend run build` 通过。
- 当前仍保留的已知边界：
  - v3 Designer 目前已建立“数据集先绑 + 双分区 + 样本驱动”主模型，但展示类 / 作答类物料的严格分区拖拽与独立序列化仍以当前组件数组的近似实现承接，后续若继续打磨，可再做更彻底的 `sourceView` / `answerView` 状态拆分。

### 2026-06-06
- 已完成 Owner 端 UI 改版一轮收口：
  - Owner 左侧菜单已改为“主页 + 标注管理分组”结构，模板 Designer 路由已脱离主侧栏壳层。
  - 任务管理卡片已重组为更清晰的分区布局；暂停态支持解绑数据集；结束态突出审核进度与导出入口。
  - 数据集页已改为“新建数据集”弹窗入口，并复用现有导入流程在页内完成导入。
  - 模板库已新增“新建模板”主 CTA，并可直接进入独立 Designer 工作区。
  - 导出管理已改为右上角发起导出弹窗，最近结果卡已移除，仅保留摘要卡与历史列表。
- 本轮验证已通过：
  - 前端：`npm --prefix frontend run test -- OwnerTasksPage.test.tsx OwnerDatasetsPage.test.tsx OwnerTemplatesPage.test.tsx OwnerTemplateDesignerPage.test.tsx OwnerExportsPage.test.tsx` 共 43 个用例通过。
  - 后端：`pytest backend/tests/test_tasks_api.py -q` 共 22 个用例通过。
  - 前端：`npm --prefix frontend run build` 通过。
- 当前仍有两个已知轻微技术噪音未在本轮范围内处理：
  - `OwnerExportsPage.test.tsx` 下载测试下存在 jsdom navigation warning，但测试本身通过。
  - `backend/tests/test_tasks_api.py` 仍有既存 Pydantic alias warning，本轮未扩大到统一请求模型清理。

### 2026-05-21
- 完成 LabelHub 稳完赛版设计稿与中文实施计划，拆出 `PLANROAD-A.md` / `PLANROAD-B.md` 与统一接口契约文档。
- 固定关键边界：模板字段白名单、AI 决策映射、导出优先级、提交状态简化、Bearer token、AI trigger 不进入前端正常调用链路。

### 2026-05-22
- 前端骨架初始化完成：目录、路由、角色入口壳子、任务管理页、模板搭建器第一版完成。
- 模板搭建器已支持 7 类组件白名单、增删改、上下移动和预览渲染。

### 2026-05-23
- Labeler mock 主链路完成：任务广场、领取、作答页、草稿保存、提交校验、上一题 / 下一题。
- Reviewer mock 审核页与 Owner 导出入口壳子完成。

### 2026-05-24
- 前端主要 mock 页面联调通过，关键测试集通过，构建通过。
- 明确后续优先从 mock 切真实接口，再补审核与导出链路。

### 2026-05-25
- 统一转到 `SM` 分支继续推进，`LWH` 保留为参考分支。
- 后端真实链路（auth / tasks / templates / submissions / workbench）价值能力已并入 `SM`。

### 2026-05-26
- 完成 Template 真实链路联调：模板读取、版本保存、任务绑定模板、发布冻结版本、Labeler 真实草稿保存与提交。
- 浏览器已完成 Labeler 真实主链路回放。

### 2026-05-27
- 打通 Reviewer 真实最小链路与导出真实最小链路。
- 后端补测试底座、`AIAuditJob` / `AIAuditResult` 持久化与最小 `audit_log` 骨架。

### 2026-05-28
- 第二周 A/B 收尾核查完成：AI executor 边界、失败转人工、JSON/CSV 导出闭环、契约同步完成。
- 浏览器完成一次从清空业务数据开始的真实回归：Owner / Labeler / Reviewer / 导出最小链路可见。

### 2026-05-29
- 前端阶段 0 稳定收口完成：统一登录 + 分角色工作台、独立 layout、route guard、Reviewer 空 `scores` 兜底、README 口径同步。
- 前端阶段 0 相关测试通过，build 通过。

### 2026-05-30
- 修完阶段 0 / 阶段 1 的最后一批已知 FAIL：模板字段唯一性校验、任务广场搜索/筛选/状态标签、打回后重提、`aiDecision=human_review` 提示、导出格式收窄为 `json | csv`。
- 主仓库关键后端测试、前端关键测试和前端 build 通过。

### 2026-05-31
- 重写主智能体与三个 Agent 提示词，明确仅使用当前仓库主工作区，不再把隔离 worktree 作为日常开发流程。
- 清理旧 worktree，改成主工作区连续推进模式，避免候选改动与验收基线分裂。

### 2026-06-01
- 完成阶段 0 / 阶段 1 核心代码收口：
  - 后端：datasets / dataset_items、JSON/JSONL/Excel 导入、datasets API、任务绑定数据集、多题 assignment/submission、AI 调用日志、seed demo 脚本。
  - 前端：数据集绑定、三栏模板页、统一 Renderer、多题 Labeler Workbench、我的贡献页、Reviewer 文案与信息架构收口。
- 阶段 1 最小可演示闭环完成：
  - 新增 `rich_text`、`json_editor`、`llm_assist` 三类组件，并打通 Designer + Renderer + Labeler Workbench 最小闭环。
  - 增强 `show_item`，可直接按 key-value 渲染原始题目对象。
  - `image_upload` 增加最小真实前端交互，支持选择文件并回显文件名。
  - 模板页接入 `dnd-kit`，补上画布拖拽句柄与排序逻辑。
  - 修正前端本地 Vite 代理端口到 `8765`，恢复浏览器联调口径。
- 阶段 2 当天范围内收口完成：
  - 多题 workbench、题号切换、任务进度条、广场领取状态刷新回显已通过真实浏览器验证。
  - Labeler 已完成真实领取 → 作答 → 保存草稿 → 提交 → AI reject → 返回待修改 → 原答案保留 → 重新提交闭环。
  - workbench 已补齐 AI reject 的待修改理由展示；无人工打回记录时回退显示 AI summary。
  - 本地 demo 已恢复为单 task 多题真实 seed；Owner 已补最小 AI 配置入口（Prompt 模板、通过阈值）；Reviewer 前端已补最小 item 级列表可见性。
- 当前已通过：后端关键测试 33 个、前端关键测试 33 个、阶段 1 定向前端测试 22 个、前端 build，以及 seed / plaza 领取态 / workbench AI reject 理由回传回归。
- 浏览器已确认：应用可启动；Owner 模板页可真实添加富文本 / JSON 编辑器 / LLM 辅助 / 图片上传组件；Labeler 登录、领取、作答、多题切换、草稿保存、提交、AI reject 待修改展示、原答案保留与重提均已走通。

### 2026-06-02
- 按 `docs/superpowers/plans/2026-06-02-stage2-three-closures-implementation-plan.md` 完成阶段 2 主工作区收口：
  - B2：新增 `AIAuditConfig`，扩展 `AIAuditJob` / `AIAuditResult` 字段，接入 Celery / Redis，submit 改为入队，并完成 worker 成功路径、retry、幂等复用、人工兜底、队列相关审计日志与测试同步。
  - A2：Owner 任务列表补齐完成数 / 通过率 / 数据集题目预览；Labeler workbench 补齐状态文案、自动保存提示与“提交当前题”语义；Reviewer 补齐任务筛选、多选与批量通过入口。
- 本轮验证结果：
  - 后端定向回归 `test_database_schema.py test_tasks_api.py test_submissions_api.py test_ai_queue_flow.py test_workbench_api.py test_reviews_api.py` 共 34 个用例通过。
  - 前端定向回归 `OwnerTasksPage.test.tsx`、`LabelerWorkbenchPage.test.tsx`、`ReviewerReviewsPage.test.tsx` 共 32 个用例通过。
  - `npm --prefix frontend run build` 通过。
- README 已同步：明确本地异步 AI 审核需要 Redis + Celery Worker，并补 Owner / Labeler / Reviewer 当前真实能力与阶段 3 未完成限制。

### 2026-06-03
- 阶段 3 关键架构口径已收口并写入决策：
  - 审核链路采用 `Submission` 当前态 + `SubmissionVersion` 历史层。
  - 高级模板仅支持 `visibleWhen` / `validationRules` 最小规则层，并保持 schema v1/v2 双兼容。
  - Reviewer 验证口径继续沿用“当前态驱动 + 历史层追溯 + 审计时间线过滤”。
- 当前阶段重点从“扩功能”转为“围绕既定架构补测试、补异常态、补兼容展示”。

### 2026-06-04
- 阶段 5 认证基础层与资源归属第一轮收口完成：
  - 后端已补 `User.password_hash`、`jwt_secret_key` / `jwt_expire_minutes` 与 `auth_security.py`，`/auth/login` 已切到用户名 / 密码登录，`/auth/me` 已切到 Bearer JWT 返回当前用户。
  - demo 用户默认密码已在测试 fixture 与 `seed_demo_users()` 真实初始化路径中补齐：`owner_demo / demo-owner-123`、`labeler_demo / demo-labeler-123`、`reviewer_demo / demo-reviewer-123`。
  - `tasks.py` 的关键 Owner 入口与对应测试已迁到 JWT 当前用户语义，reviewer token 访问 Owner `/tasks` 会被 403 拦住。
  - 前端 `LoginPage` 已升级为账号密码表单 + 演示账号快捷填充；`RoleGuard` 已切到 `token + labelhub_role`` 的最小真实登录态语义。
- 阶段五安全 / 一致性第二轮收口完成：
  - `get_demo_user()` 已收口为仅 `APP_ENV=test` 时允许 `X-Demo-User` / 默认 demo 用户回退；正式运行路径统一要求 Bearer JWT。
  - `/reviews/{submission_id}/assign` 已补目标 reviewer 合法性校验。
  - 前端登录失败已补旧会话清理；`OwnerTasksPage` 已将 reviewer 选项改为按需加载。
  - 新增定向验证已通过：后端 `test_auth_api.py test_tasks_api.py test_reviews_api.py test_submissions_api.py test_workbench_api.py test_datasets_api.py test_exports_api.py` 共 81 个用例；前端 `LoginPage.test.tsx OwnerTasksPage.test.tsx App.test.tsx` 共 22 个用例；前端 build 通过。
  - 关键运行时回归已确认：登录失败后旧 token 会被清空；Owner 任务页主列表不再依赖 reviewer 目录接口首屏成功；无 token 访问正式接口 `/api/v1/datasets` 会返回 401。
- 全局审查 + 浏览器回归收口完成：
  - 主进程已完成一次只读质量审查 Agent + 真实浏览器多角色回放，重点覆盖 reviewer 批量审核权限、template 归属、submission 模板版本校验、Labeler/Reviewer 运行态显示一致性。
  - 后端已修复 reviewer 批量审核越权、template owner 校验缺失、submission 模板版本过度信任前端三类高优问题。
  - 前端已修复 Labeler 提交后状态不即时更新、Reviewer 详情页最新打回理由显示旧值、登录表单无真实 form 语义等问题。
  - 新增验证已通过：后端 `test_reviews_api.py test_templates_api.py test_submissions_api.py` 共 39 个用例；前端 `ReviewerReviewsPage.test.tsx LoginPage.test.tsx LabelerWorkbenchPage.test.tsx` 共 30 个用例；前端 build 通过。
  - 浏览器回归已确认：Owner 登录与模板保存可用；Labeler 重提后会即时提示“提交成功，等待 AI 预审”；Reviewer 可看到重提后的 diff、历史轮次与最新打回理由。
- 剩余已发现 bug 第二轮收口完成：
  - 后端任务发布已补前置校验：创建任务时校验 dataset/template 必须归属当前 owner；发布前要求已绑定 dataset、dataset 至少 1 题、已绑定 template 且存在有效 template version，避免空壳任务进入 plaza/workbench。
  - `workbench.py` 已修正最近一次打回理由聚合逻辑，按时间倒序后仅保留每个 submission 的第一条最新 reject record。
  - Renderer 已修复 `tab_container` 只渲染首个 tab 的问题，当前会展开渲染全部 tab children；并新增前端测试覆盖第二个 tab 字段可见性。
  - 前端 API client 已补 401 统一会话失效处理：任一请求返回 401 时清空本地 token/role 并派发 `labelhub:auth-expired`，`RoleGuard` 监听后会把当前受保护页面重定向回登录页。
  - 本轮新增验证已通过：后端 `test_tasks_api.py test_workbench_api.py test_submissions_api.py` 共 38 个用例；前端 `App.test.tsx OwnerTasksPage.test.tsx LoginPage.test.tsx LabelerWorkbenchPage.test.tsx ReviewerReviewsPage.test.tsx Renderer.test.tsx` 共 57 个用例；前端 build 通过。
### 2026-06-04（补充：剩余前端缺口收口 + 小幅产品化补强）
- 前端已完成原剩余功能缺口收口，并补齐对应测试 / build / 浏览器验证：
  - Owner 模板页已补 `visibleWhen` / `validationRules` 结构化编辑，`group children` / `tab children` 可视编辑，`tab_container` 已从展开兜底升级为最小 Tab 切换。
  - Labeler workbench 已补真实自动保存：debounce 自动保存、切题前自动保存、失败提示与手动保存共存。
  - 认证体验第二轮已补统一退出登录、登录失效提示、旧会话清理；后续又补上次用户名回填与多标签基础登录态同步。
  - Owner 任务页 reviewer 分配错误已从页面级下沉为局部错误，并完成浏览器失败场景回放。
- 为了完成真实浏览器失败场景验证，前端 `api client` 已加入仅 DEV 生效的 failure injection 开关：
  - `labelhub_dev_fail_save_draft`
  - `labelhub_dev_fail_get_reviewers`
  - `labelhub_dev_fail_save_reviewers`
  用于回放 draft 自动保存失败、reviewer 列表加载失败与 reviewer 保存失败；当前保留为开发辅助能力，不进入正式产品语义。
- Designer / Tab 在原收口后继续做了一轮小幅产品化补强：
  - group / tab children 已支持更多常用子组件快捷添加（单行文本 / 多行文本 / 单选）。
  - group children、tab children 已支持基础上移 / 下移；tab 本身已支持左移 / 右移。
  - 容器型组件属性面板已去掉无意义的 `字段名 / 必填` 编辑入口，聚焦 children / tab 管理。
- 本轮新增验证已通过：
  - `npm --prefix frontend run test -- Renderer.test.tsx OwnerTemplatesPage.test.tsx LabelerWorkbenchPage.test.tsx LoginPage.test.tsx App.test.tsx OwnerTasksPage.test.tsx` 共 67 个用例通过。
  - 追加补强验证：`npm --prefix frontend run test -- App.test.tsx OwnerTemplatesPage.test.tsx`、`LoginPage.test.tsx OwnerTemplatesPage.test.tsx`、`App.test.tsx LoginPage.test.tsx OwnerTasksPage.test.tsx LabelerWorkbenchPage.test.tsx` 均通过。
  - `npm --prefix frontend run build` 多轮通过。
- 本轮浏览器已确认：
  - 登录失效提示会在登录页一次性显示；退出登录会回到登录页。
  - Owner 模板页可真实新增 group/tab 子组件、编辑规则，并看到最小 Tab 切换交互。
  - Labeler workbench 可真实观察自动保存成功；通过 DEV 开关可真实回放“自动保存失败”和“切题前保存失败停留当前题”。
  - Owner 任务页可通过 DEV 开关真实回放 reviewer 列表加载失败与 reviewer 保存失败，且错误保持在局部分配区块内。

### 2026-06-05
- `PLANROAD-FINAL.md` 中的 P0 开发任务已完成并完成浏览器级回放，当前主链路已升级为“登录产品首页 + 三角色 Dashboard + Owner 任务详情 + Labeler 工作台 + Reviewer 详情亮点页 + 我的贡献中心”的产品化形态。
- 本轮前端产品化改造已落地：
  - 登录页已升级为基于 `DESIGN.md` Notion 风格的产品入口页，保留账号密码登录与演示账号快捷填充。
  - 三角色已补 Dashboard，并把默认根路由从功能页直达改为先进入 Dashboard；侧边导航已同步加入“概览”入口。
  - Owner 已补独立任务详情页，集中承载任务配置、进度统计、Reviewer 分配、AI 配置摘要与数据集预览。
  - Labeler Workbench 已改为更完整的三栏工作台结构；我的贡献页已从占位入口升级为真实统计与记录页。
  - Reviewer 已补 Dashboard，并把审核详情页强化为分区清晰的摘要 / diff / AI 结论 / 时间线 / 历史 / 审核操作亮点页。
- 为支撑 Labeler Dashboard 与我的贡献中心，后端 `workbench.py` 已新增 `/workbench/summary` 聚合接口，并补齐定向测试。
- 本轮新增验证已通过：
  - 前端：`npm --prefix frontend run test -- App.test.tsx LoginPage.test.tsx OwnerTasksPage.test.tsx LabelerWorkbenchPage.test.tsx ReviewerReviewsPage.test.tsx Renderer.test.tsx` 共 63 个用例通过。
  - 后端：`pytest backend/tests/test_workbench_api.py -q` 共 5 个用例通过。
  - 前端：`npm --prefix frontend run build` 通过。
- 本轮浏览器回归已确认：
  - 登录页可见新的产品入口样式、能力标签、三角色说明与演示账号快捷入口。
  - Owner 登录后可进入 Dashboard，并可继续进入任务详情页查看配置、统计、Reviewer 分配与数据集预览。
  - Reviewer 登录后可进入 Dashboard、审核列表与详情页，并能看到审核摘要、原题、答案、diff、AI 结论、时间线与审核历史。
- 浏览器回归中发现并已修复一个真实问题：Owner 任务详情页数据集预览最初错误读取 `itemIndex/sourceJson`，已收口为后端真实返回的 `sequence/source` 字段。
- 随后基于质量审查继续完成一轮高优修复收口：
  - Labeler 提交成功后会清理 autosave timer 与 dirty 标记，前端不再在提交后继续自动回写草稿；后端 `/submissions/draft` 也已新增状态保护，禁止将 `submitted / ai_passed / review_passed` 回退成 `draft`。
  - 任务广场的 quota / claim 语义已统一：后端 `claim_task` 允许在 `claimed_count < quota` 时继续领取，`claimStatus=claimed/available` 过滤也已对齐“当前用户是否已领取”与“是否仍有剩余额度”的真实语义；`Assignment` 已去掉单 `task_id` 唯一约束，仅保留 `(task_id, user_id)` 去重。
  - Owner 新建任务页中误导性的“保存 AI 配置”按钮已移除，避免在未创建 task 的情况下触发必然失败的配置保存。
  - Labeler Workbench 的进度文案已从“已完成”收口为“已通过”，降低与后端 `progress.completed` 实际口径（仅统计 `review_passed`）之间的误解。
  - Reviewer 批量通过返回契约的前端类型已放宽到 `'review_passed' | 'ai_passed'`，消除当前实现与类型之间的漂移。
- 高优修复后的新增验证已通过：
  - 前端：`npm --prefix frontend run test -- OwnerTasksPage.test.tsx LabelerWorkbenchPage.test.tsx ReviewerReviewsPage.test.tsx` 共 47 个用例通过。
  - 后端：`pytest backend/tests/test_tasks_api.py backend/tests/test_submissions_api.py backend/tests/test_workbench_api.py -q` 共 40 个用例通过。
  - 前端：`npm --prefix frontend run build` 再次通过。

- 高优修复后的继续收口完成：
  - Labeler Workbench 已补 `statusLabel` 缺失时对真实 `status` 的回退映射，`needs_revision` 真实链路不再被误判为“未开始”，浏览器中“最近一次打回理由 + 重新提交”语义已恢复一致。
  - `workbench.py` 的 `latestRejectReason` 已收口为仅在 `needs_revision` 时暴露，避免非待修改状态混入旧打回理由。
  - 新增验证已通过：后端 `pytest backend/tests/test_workbench_api.py -q` 5 个用例；前端 `npm --prefix frontend run test -- LabelerWorkbenchPage.test.tsx` 20 个用例；前端 build 再次通过。
- Labeler 浏览器全链路补充回放已完成：
  - 登录 → Dashboard → 我的贡献 → 返回作答 → Workbench 页面状态、打回理由与重提语义已核对。
  - 浏览器中已确认此前“待修改却被错误显示为未开始并导致重提失败”的问题已修复。

- 本轮已新增并优化 `PLANROAD-FINAL.md`，将最终阶段统一收口为“当前系统摘要 + 首轮冲刺（P0）+ 分角色产品化 + 交付收口”的执行结构，减少重复任务并强化可执行性；原 `PLANROAD-A.md` / `PLANROAD-B.md` 继续保留为历史路线、完成基线与参考归档。

### 2026-06-05（补充：P1/P2 第一批 Owner 数据入口）
- 已完成 P1/P2 第一批 Owner 数据入口前端实现：
  - 新增 Owner 一级导航“数据集”入口与三条真实路由：`/owner/datasets`、`/owner/datasets/import`、`/owner/datasets/:datasetId`
  - 新增数据集管理页，支持列表、搜索、空状态、导入入口与“查看详情 / 去绑定任务”操作
  - 新增三步导入向导（上传文件 → 格式确认 → 导入结果），复用真实 `/datasets/import` 接口；导入成功后返回列表并高亮新数据集
  - 新增数据集详情 / 预览页，支持样本预览、关键词过滤与回流到任务绑定
  - `OwnerTasksPage` 已支持从 query 中读取 `datasetId`，新建任务时可默认预选数据集
- 为支撑该批页面，数据集契约已最小扩展：`DatasetSummary` / 导入结果新增 `createdAt`、`updatedAt` 字段；前端 `datasets.ts` 已新增 `importDataset()` 并把列表/预览查询统一为可传关键词与分页参数。
- 本轮新增验证已通过：
  - 后端：`pytest backend/tests/test_datasets_api.py -q`，4 个用例通过
  - 前端：`npm --prefix frontend run test -- App.test.tsx OwnerTasksPage.test.tsx OwnerDatasetsPage.test.tsx OwnerDatasetsImportPage.test.tsx OwnerDatasetDetailPage.test.tsx`，33 个用例通过
  - 前端：`npm --prefix frontend run build` 通过
- 当前仍未完成：该批页面的真实浏览器回放、对应截图资产，以及 P1/P2 其他批次（Designer/Export/广场/审核台强化、模板库、质检统计、作答历史、README/手册/部署说明等）

### 2026-06-05（补充：Owner / Designer P2 第二轮收口 + 浏览器验收）
- 已完成 Owner Designer 2.0 第二轮产品化收口：
  - 容器组件编辑体验已进一步强化，`group` / `tab_container` 在属性侧增加数量摘要、空状态提示、层级卡片与更清晰的选择/排序/删除操作区。
  - Designer 预览区已从单一只读预览升级为“预览态 / 运行态预览”双模式；运行态会挂载示例题面与示例答案，便于直接观察容器结构与 Renderer 真实呈现是否一致。
  - 画布中的组件摘要已从简单 field 回显，收口为更贴近产品语义的摘要（如子组件数量 / Tab 数量 / 展示说明），降低容器组件可理解性门槛。
  - `Renderer` 已修正预览态只读 input 与运行态受控 input 切换时的 uncontrolled/controlled warning，避免 Designer 运行态切换产生运行时噪音。
- 本轮新增验证已通过：
  - 前端：`npm --prefix frontend run test -- OwnerTemplateDesignerPage.test.tsx`，3 个用例通过。
  - 前端：`npm --prefix frontend run build` 通过。
- 本轮浏览器回放已确认：
  - Owner 登录后可进入模板库并打开 Designer 2.0；新增 group / tab 容器后，属性区会正确显示数量摘要、空状态提示与子组件列表。
  - Designer 运行态预览可切换展示示例题面，group / tab 容器中的新增字段会在运行态预览中真实渲染，无只读/受控切换告警。
  - 数据集管理页、数据集详情页与 Export Center 已完成 Owner 视角浏览器回放：数据集列表/详情搜索与 Export Center 摘要卡、最近结果、字段别名编辑均可正常交互。
- 当前口径更新：`PLANROAD-FINAL.md` 中 Owner 端剩余的 Designer 2.0 两项（容器编辑体验、预览态/运行态统一）已完成真实代码落地、测试、构建与浏览器级验收；Owner 端产品化页面未完成项现已收口。

### 2026-06-05（补充：P1/P2 第二批页面产品化强化）
- 已继续完成多项 P1/P2 页面强化与对应验证：
  - Export Center 已升级为更完整的集中导出中心，新增摘要卡、最近结果面板与更清晰的历史卡片表达。
  - Labeler 任务广场已重构为更像任务市场的卡片页，新增可领取任务数 / 已领取任务数 / 总剩余额度摘要与更明确的领取 CTA。
  - Reviewer 审核台已补待审核总数 / 需人工复核 / 当前已选摘要卡，并把筛选区升级为更显性的批量处理面板。
  - Labeler 已新增独立“待修改任务”中心 `/labeler/revisions`，集中展示 `needs_revision` 任务并直达继续作答。
- 本轮新增验证已通过：
  - 前端：`npm --prefix frontend run test -- OwnerExportsPage.test.tsx`，7 个用例通过
  - 前端：`npm --prefix frontend run test -- LabelerPlazaPage.test.tsx`，5 个用例通过
  - 前端：`npm --prefix frontend run test -- ReviewerReviewsPage.test.tsx`，10 个用例通过
  - 前端：`npm --prefix frontend run test -- App.test.tsx RevisionCenterPage.test.tsx`，10 个用例通过
  - 前端：多轮 `npm --prefix frontend run build` 均通过
- 当前口径更新：P1 中除 Designer 2.0 外，Export Center、数据集管理页、任务广场卡片重设计、审核队列页 / 批量审核面板、被打回任务中心均已完成一轮真实代码落地；P2 中数据集导入向导已完成。
- 当前仍未完成：Designer 2.0 的进一步强化、模板库页面、任务进度分析页、质检统计页、作答历史页，以及演示数据 / Demo Script / 截图资产 / 部署说明等交付物收口。

### 2026-06-05（补充：Reviewer 质检统计页 + Labeler 作答历史页收口）
- 已完成 Reviewer 质检统计页与 Labeler 作答历史页的第二轮产品化收口：
  - Reviewer 质检统计页已从最小统计页升级为更完整的质量面板，补入总审核数、通过率、通过数、打回数四张摘要卡，并保留常见打回原因区与空状态。
  - Labeler 作答历史页已从纯历史列表升级为个人回顾页，补入历史记录数、已通过、待修改、审核中四张摘要卡，并保留历史记录卡片与返回作答入口。
- 本轮新增验证已通过：
  - 前端：`npm --prefix frontend run test -- ReviewerQualityStatsPage.test.tsx LabelerHistoryPage.test.tsx`，共 4 个用例通过。
  - 前端：`npm --prefix frontend run build` 通过。
- 本轮浏览器回放已确认：
  - Reviewer 登录后可进入 `/reviewer/quality-stats`，页面能展示摘要卡与常见打回原因列表，无明显布局错位。
  - Labeler 登录后可进入 `/labeler/history`，页面能展示历史摘要卡、状态记录与返回作答入口。
- 当前口径更新：`PLANROAD-FINAL.md` 中 Reviewer 质检统计页与 Labeler 作答历史页已完成真实代码落地、测试、构建与浏览器级验收；当前主要剩余项已进一步收口到被打回任务中心之外的交付物与演示资产。
### 2026-06-05（补充：Owner / Designer P2 批次第一轮落地）
- 已完成 Owner / Designer P2 第一轮真实代码落地：
  - 后端 `Task` 已补 `task_brief / task_tags_json / reward_rule`，Owner 新建任务、任务列表与详情页已可真实持久化并展示任务说明、标签、奖励规则。
  - 后端已新增 `/tasks/{task_id}/analytics` 聚合接口，前端已新增独立任务进度分析页 `/owner/tasks/:taskId/analytics`，可展示总题量、已完成进度、通过率、待审核数、运营摘要与状态分布。
  - `/templates` 已从旧的单页搭建器入口收口为模板库资产页，支持模板列表、搜索、最近版本、关联任务数与复制模板。
  - 已新增独立 Designer 2.0 路由 `/owner/templates/:templateId/designer`，当前已完成三栏页面骨架与入口打通，为后续继续迁移旧编辑器逻辑和强化容器编辑体验打下基础。
- 本轮新增验证已通过：
  - 后端：`pytest backend/tests/test_tasks_api.py backend/tests/test_templates_api.py -q`，25 个用例通过。
  - 前端：`npm --prefix frontend run test -- OwnerTasksPage.test.tsx OwnerTaskDetailPage.test.tsx OwnerTaskAnalyticsPage.test.tsx OwnerTemplatesPage.test.tsx OwnerTemplateDesignerPage.test.tsx App.test.tsx`，36 个用例通过。
  - 前端：`npm --prefix frontend run build` 通过。
- 当前口径更新：Owner 侧“任务信息补齐 / 任务进度分析页 / 模板库页面”已完成一轮真实代码落地；Designer 2.0 已完成独立信息架构与路由壳层，但容器编辑深化与预览统一仍有后续强化空间。
- 当前仍未完成：Designer 2.0 将现有编辑器逻辑完整迁移到独立页、group/tab 容器编辑继续强化、Reviewer 质检统计页、Labeler 作答历史页，以及演示数据 / Demo Script / 截图资产 / 部署说明等交付物收口。

### 2026-06-05（补充：Labeler 被打回任务中心方案 B 收口）
- 已完成 Labeler 被打回任务中心的第二轮口径收口：
  - 后端 `/workbench/summary` assignment 聚合已补 `latestRejectItemId`、`latestRejectAt`、`revisionItemIds` 三个字段，用于表达最近被打回题号、最近打回时间与当前待修改题号列表。
  - 前端 `RevisionCenterPage` 已接入新字段，待修改任务卡片可直接展示“最近打回题目 / 最近打回时间 / 待修改题号”，让页面从任务列表升级为可执行的待修改中心。
- 本轮新增验证已通过：
  - 后端：`pytest backend/tests/test_workbench_api.py -q`，7 个用例通过。
  - 前端：`npm --prefix frontend run test -- RevisionCenterPage.test.tsx`，3 个用例通过。
  - 联合验证：`pytest backend/tests/test_workbench_api.py -q && npm --prefix frontend run test -- RevisionCenterPage.test.tsx` 通过。
  - 前端：`npm --prefix frontend run build` 通过。
- 本轮浏览器回放已确认：
  - Labeler 登录后可进入 `/labeler/revisions`；当前本地演示数据下页面展示为空状态，说明页面仍能稳定工作，但由于本地无真实 `needs_revision` 数据，暂未在浏览器中直接看到新增三字段的视觉呈现。
- 当前口径更新：`PLANROAD-FINAL.md` 中“被打回任务中心”已完成真实代码落地、测试、构建与浏览器级验收；当前主要剩余项已进一步转向演示数据与交付物收口。

### 2026-06-05（补充：基于 `preference_compare` 真实测试流程的缺口盘点）
- 已读取 `preference_compare_workflow.md` 并按“真实测试数据 → 模板 → 标注 → AI 预审 → Reviewer → 导出”链路对照当前实现，识别出一批当前仍无法直接承接、且与原计划不重复的缺口。
- 已将去重后的新增实现点追加到 `PLANROAD-FINAL.md` 末尾，重点补充：数据导入模式与字段角色识别、Gold / 演示答案承载、偏好对比专用展示与角色可见性、跨字段校验、Gold 参与 AI 预审、Reviewer 直接修订并通过、独立最终结果快照层、全链路重组导出等。
- 当前判断：现有系统已能承接“普通数据集 + 通用表单”的最小真实链路，但若要用 `preference_compare` 这类自带答案的偏好对比数据稳定演示“更像真实标注平台”的完整流程，仍需要上述专门能力补齐。

### 2026-06-06
- 已完成 `PLANROAD-FINAL.md` 第十节“基于 `preference_compare` 真实测试数据的流程缺口补充”的最小可演示版实现，并形成可验证闭环。
- 后端已完成本轮专项能力补齐：
  - 数据集导入支持 `importMode=normal | gold_sample | demo`。
  - `DatasetItem` 已新增 `metadata_json / reference_answer_json`，导入时会按约定字段自动拆分题面、元信息与参考答案，避免把 Gold / demo 结果直接暴露给 Labeler。
  - 模板后端白名单已新增 `compare_panel`，提交校验已新增 `min_length / equals_if / not_equals_if` 三类规则。
  - AI 预审已从“只看 `answers_json`”扩展为同时读取 `answers + source + reference_answer`；本地规则执行器已补最小 Gold 冲突转人工逻辑。
  - Reviewer 审核已支持传 `finalAnswers` 实现“直接修订并通过”；`Submission` 已新增 `final_answer_json / finalized_by / finalized_at / final_submission_version_no` 形成最终结果快照层。
  - 导出 payload 已补 `source / metadata / referenceAnswer / finalAnswer`，不再只依赖原始 `answers_json`。
- 前端已完成对应产品化承接：
  - 数据集导入页新增导入模式选择。
  - Designer 2.0 已支持 `compare_panel` 的物料添加与字段配置。
  - Renderer 已支持偏好对比双栏展示。
  - Reviewer 详情页已支持进入修订模式，直接编辑答案后“保存修订并通过”。
- 本轮验证已通过：
  - 后端：`pytest backend/tests/test_dataset_import_service.py backend/tests/test_datasets_api.py backend/tests/test_submissions_api.py backend/tests/test_reviews_api.py backend/tests/test_export_contract.py`，共 54 个用例通过。
  - 前端：`npm --prefix frontend run test -- src/features/renderer/Renderer.test.tsx src/features/renderer/rules.test.ts src/pages/owner/datasets/OwnerDatasetsImportPage.test.tsx src/pages/labeler/workbench/LabelerWorkbenchPage.test.tsx src/pages/reviewer/reviews/ReviewerReviewsPage.test.tsx`，共 46 个用例通过。
  - 前端：`npm --prefix frontend run build` 通过。
- 当前范围明确未扩到通用 taskType / ACL / 独立 FinalResult 表 / 更复杂 Gold 风险筛选；本轮口径为“第十节新增实现点的最小可演示版已完成”。

### 2026-06-06（补充：Owner 审核管理页 + reviewer/导出口径校正）
- 已完成 Owner 审核管理第一轮真实落地与口径收口：
  - 前端新增 `/owner/reviews` 页面与侧边栏入口，Owner 可集中查看任务审核进度、reviewer 工作负载与 AI 审核任务监控。
  - 后端新增 `/owner-reviews/tasks`、`/owner-reviews/reviewers`、`/owner-reviews/ai-jobs` 三个 owner 聚合接口，以及 owner 侧 `/submissions` 列表接口，便于按任务直接查看提交结果与最终答案快照。
  - reviewer 详情页题面来源已统一改为 `dataset_item_context`，避免 source / metadata 拆分后详情页继续丢字段；待审列表也已恢复“任务已分配 reviewer 但 submission 尚未显式指派时仍可见”的口径。
  - workbench 完成度统计已按真实 submission 状态重算，避免仅 `review_passed` 才计完成导致 owner / labeler 视图完成量偏低。
  - 导出默认内容已补 `answers + finalAnswer` 兜底校验，确保 reviewer 修订快照没有时也不会丢默认答案字段。
- 本轮验证结果：
  - 后端：已通过 `pytest backend/tests/test_reviews_api.py backend/tests/test_submissions_api.py backend/tests/test_exports_api.py backend/tests/test_workbench_api.py -q`，共 70 个用例通过。
  - 前端：已修正 `App.test.tsx` 中登录页文案断言漂移，相关路由测试可继续作为 owner/review 页面回归基线。
  - 当前已知剩余噪音：前端测试仍可能出现 React Router future flag warning，但不影响断言通过。

## 下一步
- 建议先调用 `labelhub-quality-review-agent` 做一次只读全流程质量审查，重点检查 `preference_compare` 导入 → 标注 → AI 预审 → Reviewer 修订 → 导出的链路一致性与边界问题。
- 质量审查后，再根据结果决定是否需要继续补真实浏览器全链路演示回放与截图资产。
- 若准备本地提交，需同步检查 `.claude/context/decisions-A.md`、`.claude/context/architecture-A.md` 与 `PLANROAD-FINAL.md` 口径是否完全一致。
