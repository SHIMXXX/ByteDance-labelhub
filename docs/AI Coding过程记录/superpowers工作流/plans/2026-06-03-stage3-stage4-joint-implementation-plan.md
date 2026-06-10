# Stage 3 / Stage 4 Joint Implementation Plan

> **执行方式建议：** 先用 `/goal` 按本计划逐段推进；每次只拿一个小切片执行，完成后立刻跑验证并回写结果。

**Goal:** 先把 LabelHub 阶段三从“功能基本具备”收口到“测试、异常态、兼容展示、文档口径完整一致”，再推进阶段四：A 侧答辩与产品化交付，B 侧导出系统增强。

**Architecture:** 继续沿用现有 `Submission 当前态 + SubmissionVersion 历史层 + ReviewRecord 多轮记录 + ExportJob 快照导出` 结构；阶段四-B 导出增强复用 AI 的 Celery/Redis 异步执行样板；阶段四-A 在既有前端工作台和 Designer/Renderer 基础上做产品化与答辩材料沉淀，不引入阶段五认证/部署主线。

**Tech Stack:** FastAPI, SQLAlchemy ORM, MySQL, Celery, Redis, pytest, React 18, Vite, Vitest, @testing-library/react, Chrome DevTools MCP

---

## Scope Check

本计划覆盖两个连续阶段，但执行上必须保持“小步闭环”：

- **先做阶段三收口**：因为阶段四-A 的说明材料与阶段四-B 的导出增强都依赖阶段三数据结构、页面形态与真实能力边界。
- **后做阶段四**：阶段四再分 A/B 两条主线，但仍建议每轮只推进其中一个清晰子目标。
- **不混入阶段五**：JWT / RBAC / Docker Compose / Nginx 不是本计划范围。

---

## File Map

### 阶段三收口：前端审核与模板
- Modify: `frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.tsx`
- Modify: `frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.test.tsx`
- Modify: `frontend/src/features/renderer/Renderer.tsx`
- Modify: `frontend/src/features/renderer/rules.ts`
- Modify: `frontend/src/features/renderer/Renderer.test.tsx`
- Modify: `frontend/src/features/renderer/rules.test.ts`
- Modify: `frontend/src/pages/owner/templates/OwnerTemplatesPage.tsx`
- Modify: `frontend/src/pages/owner/templates/OwnerTemplatesPage.test.tsx`
- Modify: `frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.tsx`
- Modify: `frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.test.tsx`
- Modify: `frontend/src/types/domain.ts`

### 阶段三收口：后端审核测试与口径
- Modify: `backend/tests/test_reviews_api.py`
- Modify: `backend/tests/test_submissions_api.py`
- Modify: `backend/tests/test_workbench_api.py`
- Modify: `backend/tests/test_database_schema.py`
- Modify: `.claude/context/decisions-A.md`
- Modify: `.claude/context/architecture-A.md`

### 阶段四-B：导出系统增强
- Modify: `backend/app/api/routes/exports.py`
- Create or Modify: `backend/app/services/export_service.py`
- Create or Modify: `backend/app/services/export_job_runner.py`
- Modify: `backend/app/core/celery_app.py`
- Modify: `backend/app/models.py`（仅当确需新增导出状态/产物字段）
- Modify: `backend/app/core/database.py`（仅当 schema patch 需扩展）
- Modify: `backend/tests/test_exports_api.py`
- Modify: `backend/tests/test_export_contract.py`
- Modify: `frontend/src/pages/owner/exports/OwnerExportsPage.tsx`
- Modify: `frontend/src/pages/owner/exports/OwnerExportsPage.test.tsx`
- Modify: `frontend/src/types/domain.ts`

### 阶段四-A：产品化与答辩交付
- Modify: `frontend/src/pages/**`（按实际需要做视觉统一与响应式收口）
- Modify: `README.md`
- Create: `docs/superpowers/specs/2026-06-03-stage4-frontend-delivery-design.md`（如需要拆子稿）
- Create: `docs/superpowers/plans/2026-06-03-stage4-frontend-delivery-plan.md`（如需要拆子计划）
- Create: 用户手册 / 架构说明 / 演示脚本等文档（按最终选定位置）

### 统一回写
- Modify: `PLANROAD-A.md`
- Modify: `PLANROAD-B.md`
- Modify: `.claude/context/progress-A.md`
- Modify: `.claude/context/decisions-A.md`
- Modify: `.claude/context/architecture-A.md`
- Modify: `README.md`

---

## P1：阶段三口径收口

### Task 1: 收口 Reviewer 工作台的测试、异常态与亮点页表达

**Files:**
- `frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.tsx`
- `frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.test.tsx`
- `backend/tests/test_reviews_api.py`

- [ ] 补齐 Reviewer 列表/详情对轮次、阶段、分配、diff、时间线的断言
- [ ] 明确“首轮无上一版本”的前端空态文案与测试
- [ ] 补齐批量打回、批量通过、分配 reviewer 的接口测试
- [ ] 优化 Reviewer 页面信息密度，使其更接近“审核工作台”而不是“详情页拼接”
- [ ] 跑后端 reviews 定向测试 + 前端 Reviewer 页面测试

**验证：**
- `pytest backend/tests/test_reviews_api.py -q`
- Reviewer 页面相关 Vitest 定向回归
- 浏览器真实检查：至少能看到阶段、轮次、diff、时间线、批量操作入口

### Task 2: 收口模板 schema v1/v2 展示、联动校验与异常态

**Files:**
- `frontend/src/features/renderer/Renderer.tsx`
- `frontend/src/features/renderer/rules.ts`
- `frontend/src/features/renderer/Renderer.test.tsx`
- `frontend/src/features/renderer/rules.test.ts`
- `frontend/src/pages/owner/templates/OwnerTemplatesPage.tsx`
- `frontend/src/pages/owner/templates/OwnerTemplatesPage.test.tsx`
- `frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.tsx`
- `frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.test.tsx`
- `frontend/src/types/domain.ts`

- [ ] 明确 schema v1/v2 在模板页的版本显示与回显规则
- [ ] 为 `visibleWhen`、`required_if`、`min_selected`、`json_valid` 补齐测试
- [ ] 为“规则不满足”“首轮模板无规则”“旧模板回显”补异常态和空态测试
- [ ] 回归确认 Designer / Preview / Workbench 对同一套规则层表现一致

**验证：**
- Renderer / rules / templates / workbench 定向前端测试
- 浏览器真实检查：模板页能明确看出 schema 版本，workbench 能看到联动与校验反馈

### Task 3: 收口阶段三后端测试与口径文档

**Files:**
- `backend/tests/test_submissions_api.py`
- `backend/tests/test_workbench_api.py`
- `backend/tests/test_database_schema.py`
- `.claude/context/decisions-A.md`
- `.claude/context/architecture-A.md`

- [ ] 补齐状态机合法性测试
- [ ] 补齐轮次递增、版本绑定、时间线顺序测试
- [ ] 确认 `Submission / SubmissionVersion / ReviewRecord / AIAudit*` 的关联键设计已稳定
- [ ] 将阶段三的最终结构口径写入 decisions / architecture

**验证：**
- `pytest backend/tests/test_submissions_api.py backend/tests/test_workbench_api.py backend/tests/test_database_schema.py -q`

---

## P2：阶段四-B 主线——导出系统增强

### Task 4: 完成导出异步化最小闭环

**Files:**
- `backend/app/api/routes/exports.py`
- `backend/app/services/export_service.py`
- `backend/app/services/export_job_runner.py`
- `backend/app/core/celery_app.py`
- `backend/tests/test_exports_api.py`
- `frontend/src/pages/owner/exports/OwnerExportsPage.tsx`
- `frontend/src/pages/owner/exports/OwnerExportsPage.test.tsx`

- [ ] 抽出导出 payload 构建和 job 执行逻辑
- [ ] 增加导出 runner，复用 AI 的 Celery/Redis 执行样板
- [ ] `POST /exports` 改为创建后立即入队
- [ ] 前端改为创建后轮询状态，不再依赖 `/complete`
- [ ] 弱化或兼容保留 `/complete`，但不再作为主流程依赖

**验证：**
- `pytest backend/tests/test_exports_api.py -q`
- 导出页前端测试
- 浏览器 / API 验证：Owner 发起导出后状态从 queued/processing 自动进入 done/failed

### Task 5: 扩展 JSONL / Excel 与 `review_passed` 验收闭环

**Files:**
- `backend/app/api/routes/exports.py`
- `backend/app/services/export_service.py`
- `backend/tests/test_exports_api.py`
- `backend/tests/test_export_contract.py`
- `frontend/src/pages/owner/exports/OwnerExportsPage.tsx`
- `frontend/src/pages/owner/exports/OwnerExportsPage.test.tsx`
- `frontend/src/types/domain.ts`

- [ ] 在当前字段映射/包含项逻辑上扩 JSONL payload
- [ ] 增 Excel 导出格式
- [ ] 补 `review_passed` 混合状态过滤测试
- [ ] 补前后端格式契约更新
- [ ] 前端补新格式选择与提示文案

**验证：**
- `pytest backend/tests/test_exports_api.py backend/tests/test_export_contract.py -q`
- 导出页前端测试

### Task 6: 下载、历史、快照测试与清理策略

**Files:**
- `backend/app/models.py`（如需要）
- `backend/app/core/database.py`（如需要）
- `backend/app/api/routes/exports.py`
- `backend/tests/test_exports_api.py`
- `frontend/src/pages/owner/exports/OwnerExportsPage.tsx`
- `frontend/src/pages/owner/exports/OwnerExportsPage.test.tsx`
- `README.md`

- [ ] 确定下载产物的最小落地方式（继续落库或文件路径）
- [ ] 补下载入口与失败态展示
- [ ] 补导出内容快照测试
- [ ] 写清导出产物存储与清理策略
- [ ] 确认历史列表在阶段四口径下可验收

**验证：**
- 导出相关 pytest 全量定向回归
- 浏览器真实下载或最小下载链路验证
- README / 文档口径审阅

---

## P3：阶段四-A 主线——答辩与产品化交付

### Task 7: 统一前端视觉与双分辨率适配

**Files:**
- `frontend/src/pages/**`
- 相关样式文件

- [ ] 收口 Notion 风格一致性
- [ ] 覆盖 1280×800 与 1920×1080
- [ ] 如风险可控，补角色切换入口、未授权页、面包屑或统计卡片体系

**验证：**
- 浏览器双分辨率检查
- 关键页面截图留档

### Task 8: 产出答辩与说明材料

**Files:**
- `README.md`
- 用户手册文档
- 演示视频脚本文档
- 前端架构说明文档
- Designer / Renderer 设计说明文档

- [ ] 写用户操作手册
- [ ] 写 5–10 分钟演示视频脚本
- [ ] 整理关键页面截图
- [ ] 写前端架构说明
- [ ] 写 Designer / Renderer 设计说明
- [ ] 整理答辩亮点稿

**验证：**
- 文档自审
- 与真实页面、真实能力逐项对照

---

## P4：统一回归与文档回写

### Task 9: 阶段三/四统一验收与文档同步

**Files:**
- `PLANROAD-A.md`
- `PLANROAD-B.md`
- `.claude/context/progress-A.md`
- `.claude/context/decisions-A.md`
- `.claude/context/architecture-A.md`
- `README.md`

- [ ] 汇总阶段三/四实际完成项
- [ ] 核对 README / PLANROAD / progress / decisions / architecture 与真实代码能力一致
- [ ] 仅在真实测试、build、浏览器/API 验证通过后勾选路线项
- [ ] 如准备提交前，建议再做一次质量审查

**验证：**
- 路线图与代码能力人工对照
- 必要时调用 `labelhub-roadmap-auditor-agent` 做只读审计

---

## Recommended execution order

建议严格按以下顺序用 `/goal` 执行：

1. `P1 / Task 1` Reviewer 工作台收口
2. `P1 / Task 2` 模板 schema / 规则收口
3. `P1 / Task 3` 后端测试与口径文档收口
4. `P2 / Task 4` 导出异步化最小闭环
5. `P2 / Task 5` JSONL / Excel + `review_passed` 闭环
6. `P2 / Task 6` 下载 / 历史 / 快照 / 清理策略
7. `P3 / Task 7` 前端视觉与分辨率适配
8. `P3 / Task 8` 答辩与说明材料
9. `P4 / Task 9` 统一回归与文档回写

---

## `/goal` 使用方式

你可以直接在 Claude Code 里这样调用：

### 方式 1：按单个任务执行（推荐）
```text
/goal 按 docs/superpowers/plans/2026-06-03-stage3-stage4-joint-implementation-plan.md 执行 P2 / Task 4：完成导出异步化最小闭环；要求只做这个任务，先读相关文件，最小改动实现，改完后跑后端导出测试、前端导出页测试和必要 build，再汇报结果。
```

### 方式 2：按一个阶段段落执行
```text
/goal 按 docs/superpowers/plans/2026-06-03-stage3-stage4-joint-implementation-plan.md 执行 P1：完成阶段三口径收口。请按 Task 1 → Task 2 → Task 3 顺序推进，每完成一项就验证并汇报，若中途失败先停下来说明原因。
```

### 方式 3：只做计划中的一个最小切片
```text
/goal 基于 docs/superpowers/plans/2026-06-03-stage3-stage4-joint-implementation-plan.md，只执行 P1 / Task 1 中的“补齐 Reviewer 批量打回与时间线测试”，不要顺手改别的模块。完成后运行相关 pytest / 前端测试并汇报。
```

## `/goal` 使用建议
- **一次只给一个明确任务**，不要把 P1~P4 一次性全丢进去。
- 提示词里最好带上：
  - 计划文件路径
  - 要执行的阶段 / Task 编号
  - “只做这一项”
  - “先读文件、最小改动、改后验证”
- 如果你希望我来执行，下一条直接把你要跑的 `/goal` 指令发给我即可。
