# LabelHub MVP 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 3 周内完成 LabelHub 的稳完赛版 MVP，跑通 Owner / Labeler / Reviewer 的黄金路径，并预留少量时间做可控升级。

**Architecture:** 采用 A 初版单体方案：React + TypeScript 前端、FastAPI 后端、MySQL 主库、豆包 AI 预审。本计划优先保证可演示闭环，同时通过任务表、幂等、接口契约冻结等设计，为后续升级到更强异步架构保留空间。

**Tech Stack:** React、TypeScript、FastAPI、Python、MySQL、豆包 LLM、对象存储（本地/MinIO）

---

## 0. 黄金路径与协作约束

### 黄金路径
Owner 建任务/搭模板/发布 → Labeler 领取任务并作答提交 → AI 预审 → Reviewer 通过或打回 → Owner 导出。

### 协作规则
- 不强制每天开发和每天对齐。
- 默认每 2~3 天进行一次 15~20 分钟短对齐；若接口或状态机发生变化，立即补一次对齐。
- 所有接口字段先冻结契约，再分别开发。
- 前端允许先用 mock，后端并行实现真实接口。
- 联调顺序固定：登录 → 任务管理 → 任务领取 → 模板渲染 → 作答提交 → AI 预审 → 人工复审 → 导出。

### 角色分工
- 成员 A：前台主链路 Owner
- 成员 B：后台稳定器 Owner
- 不追求均分，追求关键路径最稳。

## 1. 文件结构规划

**前端建议创建/维护：**
- `frontend/src/pages/owner/tasks/*`：任务管理页面
- `frontend/src/pages/owner/templates/*`：低配模板搭建器
- `frontend/src/pages/labeler/plaza/*`：任务广场
- `frontend/src/pages/labeler/workbench/*`：作答页
- `frontend/src/pages/reviewer/reviews/*`：审核页面
- `frontend/src/services/api/*`：接口调用封装
- `frontend/src/mocks/*`：mock 数据
- `frontend/src/types/*`：前后端共享协议副本

**后端建议创建/维护：**
- `backend/app/main.py`：FastAPI 入口
- `backend/app/api/*`：路由层
- `backend/app/models/*`：数据库模型
- `backend/app/schemas/*`：Pydantic 模型
- `backend/app/services/task_service.py`
- `backend/app/services/template_service.py`
- `backend/app/services/submission_service.py`
- `backend/app/services/audit_service.py`
- `backend/app/services/review_service.py`
- `backend/app/services/export_service.py`
- `backend/app/services/llm_client.py`
- `backend/app/jobs/*`：轻量任务执行器
- `backend/tests/*`：后端测试

**文档与联调：**
- `docs/api-contracts/*.md`：接口契约
- `docs/demo-script.md`：演示脚本
- `docs/upgrade-notes.md`：升级预留项

---

## 2. 三周总计划（中文执行版）

## 第 1 周目标：跑通“提交前”主链路

### 成员 A（前台主链路）
- [ ] 画出最小页面清单：登录入口、任务列表、新建任务、模板搭建、任务广场、作答页。
- [ ] 先定义页面需要的接口字段，写成接口契约初稿。
- [ ] 使用 mock 数据完成任务列表页。
- [ ] 使用 mock 数据完成新建任务页。
- [ ] 完成低配模板搭建器：组件列表、字段配置、预览渲染。
- [ ] 将模板配置字段白名单固定为：通用 `label`、`field`、`required`；单选/多选/标签选择加 `options`；图片上传加 `maxCount`；展示项加 `content`。
- [ ] 完成任务广场页与领取按钮。
- [ ] 完成作答页与草稿保存交互。
- [ ] 完成提交校验与提交按钮。

### 成员 B（后台稳定器）
- [ ] 初始化 FastAPI 项目结构。
- [ ] 接入 MySQL 与基础配置。
- [ ] 建立核心表：users、tasks、templates、template_versions、assignments、submissions。
- [ ] 完成演示账号登录接口。
- [ ] 提供登录页/角色入口页所需的最小接口与页面壳子支持。
- [ ] 完成任务 CRUD 接口。
- [ ] 完成先到先得领取接口。
- [ ] 完成模板保存与版本读取接口。
- [ ] 完成草稿保存与提交接口。

### 第 1 周里程碑
- [ ] 能登录不同演示账号。
- [ ] Owner 能建任务并保存模板。
- [ ] Labeler 能领取任务、填写、保存草稿、提交。

---

## 第 2 周目标：补齐 AI、审核、导出闭环

### 成员 A（前台主链路）
- [ ] 把任务管理、模板、作答页从 mock 切到真实接口。
- [ ] 完成 Reviewer 待审核列表页。
- [ ] 完成审核详情页。
- [ ] 展示 AI 评分结果与结论。
- [ ] 展示打回原因与修改提示。
- [ ] 完成 Owner 导出入口。

### 成员 B（后台稳定器）
- [ ] 建立 ai_audit_jobs、ai_audit_results、review_records、export_jobs、audit_logs 表。
- [ ] 接入豆包模型并封装 `LLMClient`。
- [ ] 定义 AI 结构化输出协议：scores、decision、summary。
- [ ] 固定 AI 结论映射：`pass` 进入 Reviewer 待审，`reject` 进入待修改，`human_review` 进入 Reviewer 待审，Reviewer 拥有最终裁决权。
- [ ] 完成 AI 任务创建、执行、结果回写。
- [ ] 完成超时、重试、失败转人工复核逻辑。
- [ ] 完成人工复审接口：通过/打回。
- [ ] 按顺序完成导出：先 JSON，再 CSV，再 JSONL，最后 Excel；若时间不足优先保证前两种。
- [ ] 完成导出任务创建、状态查询、文件生成。
- [ ] 第一版 audit_logs 只记录：任务创建、任务发布/暂停/结束、任务领取、提交答案、AI 预审完成、Reviewer 通过/打回、导出创建/完成。
- [ ] 提供导出历史页所需的最小接口与页面壳子支持。

### 第 2 周里程碑
- [ ] Labeler 提交后可触发 AI 预审。
- [ ] Reviewer 可查看 AI 结论并通过/打回。
- [ ] Owner 可发起并下载导出结果。
- [ ] 黄金路径首次完整打通。

---

## 第 3 周目标：稳定、答辩、预留升级

### 成员 A（前台主链路）
- [ ] 修复核心页面问题与明显体验缺陷。
- [ ] 优化关键路径文案与错误提示。
- [ ] 准备演示账号、任务、示例数据。
- [ ] 编写演示脚本并配合录屏。

### 成员 B（后台稳定器）
- [ ] 修复 AI、审核、导出过程中的高频异常。
- [ ] 补关键接口测试与状态机测试。
- [ ] 检查幂等、重试、任务状态一致性。
- [ ] 准备最小云演示环境（如时间允许）。
- [ ] 预留少量时间做 A 初版后的升级试点。

### 第 3 周升级预留（只在黄金路径稳定后执行）
- [ ] 把轻量任务执行器整理出明确接口，降低未来迁移到 Celery/Redis 的成本。
- [ ] 增补 1~2 个简单模板组件，前提是不破坏现有 schema。
- [ ] 优化审核体验，例如更清晰的 AI 结果展示或打回说明。

### 第 3 周里程碑
- [ ] 黄金路径稳定可重复演示。
- [ ] README、API 文档、演示脚本齐备。
- [ ] 至少明确一项“下一版升级入口”已被预留。

---

## 3. 关键防阻塞机制

### 3.1 接口契约冻结
- [ ] 在开发前写出登录、任务、模板、提交、AI 结果、审核、导出 7 类接口示例。
- [ ] 任一字段变更后，先更新契约文档再改代码。

### 3.2 Mock 并行
- [ ] 成员 A 在真实接口未完成前，先用 mock 数据完成页面结构。
- [ ] 成员 B 完成接口后，A 再逐步替换。

### 3.3 灵活对齐
- [ ] 默认每 2~3 天一次短对齐。
- [ ] 若出现接口字段变更、状态机变化、联调阻塞，立即补一次对齐。

### 3.4 固定联调顺序
- [ ] 登录
- [ ] 任务管理
- [ ] 模板渲染
- [ ] 任务领取
- [ ] 作答与提交
- [ ] AI 预审
- [ ] 人工复审
- [ ] 导出

---

## 4. 验收标准

### 第 1 阶段验收
- [ ] 登录成功
- [ ] 任务可创建
- [ ] 模板可保存
- [ ] 任务可领取
- [ ] 作答可保存草稿并提交

### 第 2 阶段验收
- [ ] AI 预审结果可见
- [ ] 人工复审可通过/打回
- [ ] 导出文件可下载
- [ ] 审计日志可追溯关键动作

### 最终验收
- [ ] Owner 完成：建任务 → 搭模板 → 发布 → 看结果 → 导出
- [ ] Labeler 完成：领任务 → 作答 → 提交 → 看打回 → 修改
- [ ] Reviewer 完成：查看 AI 结论 → 通过/打回
- [ ] 全链路可录屏展示

---

## 5. 风险与应对

### 风险 1：模板搭建器做复杂
- 处理：只做低配，不做复杂拖拽与高级联动，并固定第一版字段白名单。

### 风险 2：AI 接口不稳定
- 处理：超时、重试、失败转人工复核，并提前固定 AI 结论到业务状态的映射。

### 风险 3：两人开发节奏不同
- 处理：灵活对齐、接口契约冻结、mock 并行，并将页面壳子类任务适度转移给成员 B 分担。

### 风险 4：最后一周还在补主链路
- 处理：升级内容只能在黄金路径稳定后进入。

### 风险 5：导出与审计边界膨胀
- 处理：导出按 JSON → CSV → JSONL → Excel 顺序推进；审计日志只覆盖第一版关键事件。

---

## 6. 推荐执行顺序

1. 先写接口契约文档。
2. A 用 mock 做页面，B 建后端基础能力。
3. 第 1 周末打通“提交前”。
4. 第 2 周补齐 AI / 审核 / 导出。
5. 第 3 周先稳，再做少量升级预留。
