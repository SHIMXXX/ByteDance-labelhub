# 当前进度状态

## 重要说明（2026-05-25）
- `LWH` 已转为参考 / 归档分支，后续开发统一由成员 A 在 `SM` 分支推进。
- 本文件继续保留成员 B 的历史进度记录，并在后续以同步状态为主，不删除既有内容。
- B 侧已有价值的后端能力已并入或正在并入 `SM`，后续以统一分支上的持续推进为准。

## 最后更新：2026-05-26

### 最近状态
- `LWH` 当前主要承担参考与归档作用，后续不再作为主要开发落点。
- B 侧沉淀的 FastAPI 骨架、数据库接入准备、路由 stub 与接口契约等内容，已作为 `SM` 分支后续开发的重要参考。
- 后续此处以同步记录为主，用于保留 B 侧历史上下文并辅助 A 侧统一推进。
- 模板真实链路、任务绑定模板、带 schema 的 Labeler 完整主链路现已在 `SM` 分支联调通过，B 侧记录同步反映该状态。
- 当前已补启动期 schema patch，旧库缺少 `tasks.active_template_version_id` 时会自动补齐；claim / workbench / draft / submit 已在真实数据库脚本中完成一轮状态验证。
- 已完成浏览器级真实联调，确认 claim / workbench / draft / submit 在 UI 层与脚本验证一致；重复提交当前仍被幂等接受并继续返回成功提示。
- Day 4 已完成后端测试底座补齐：新增 `backend/tests` 下 auth / submissions / reviews / exports 关键接口测试，当前 10 个后端用例可在 TestClient + SQLite 内存库中稳定通过，不再依赖本地 MySQL 启动。
- Day 4 已把最小 AI 预审闭环推进到持久化层：新增 `AIAuditJob` / `AIAuditResult` 模型与 `Submission` 关联，submit 后会落库保存 AI decision / scores / summary，Reviewer 详情读取真实持久化结果。
- Day 4 已补最小审计骨架：新增 `AuditLog` 模型和 `write_audit_log` helper，submit 链路会记录 `submission_submitted` 与 `ai_audit_finished` 关键事件。
- Day 5 已把最小 AI 预审升级为可替换边界：新增 `ai_executor` service，默认仍使用本地规则执行器，但 submit 路径已不再直接内嵌决策逻辑。
- Day 5 已补 review / export 审计闭环：approve / reject / export create / export finish 均会写入 `AuditLog`。
- Day 5 已补最小证明性测试，确保 executor 与新增 audit log 事件可回归验证；当前 submissions / reviews / exports 共 15 个后端用例全绿。
- Day 6 已把导出状态机从“GET 驱动完成”改为“显式 complete 路径驱动完成”，`export_finished` 现在只在完成路径写入。
- Day 6 已接入 DeepSeek executor 边界，本地通过 `backend/.env` / 环境变量读取 `DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL`、`DEEPSEEK_BASE_URL`；同时保留 `AI_PROVIDER` 选择，避免测试依赖真实模型输出。
- Day 6 已补强 submissions / reviews / exports 的状态机测试与审计断言。
- 2026-05-27 已在 A 阶段把导出能力从“状态流转 + 占位下载地址”推进到“真实生成内容”的最小闭环：`ExportJob` 现可持久化 JSON/CSV 导出结果，`complete` 会按 task 聚合 submission / ai result / review record 生成真实内容；同时补了一条 AI 边界测试，明确当前只有 attempt/max_attempts 计数与失败转人工，不包含自动 retry。当前 `pytest backend/tests -v` 共 30 个后端用例全绿。
- 2026-05-28 已从统一 `SM` 分支视角完成第二周收尾核查：`AIExecutor` / `DeepSeekAIExecutor` 最小调用边界、请求级 timeout、attempt/max_attempts、失败转人工、提交链路单 submission 复用单 AI job、导出任务创建/状态查询/真实 JSON/CSV 内容生成均已具备当前代码、后端测试或契约依据；第二周范围内仅将 JSONL / Excel 继续保留为后续扩展项。当前结论仅覆盖第二周最小闭环，不等同于第三周“稳定可演示”目标已全部验证。

- 2026-05-29 已完成后续阶段 0 的后端稳定收口第一轮：`DeepSeekAIExecutor` 新增 `scores` normalize、`decision` 最小 schema 校验与 `summary` fallback；`reviews` 详情接口在 AI 结果缺失时会返回 `scores=[]`、`decision=human_review` 与可读 fallback summary，避免前端 Reviewer 页面因异常 AI 数据崩溃。新增 `backend/tests/test_ai_executor.py`，并完成 `test_reviews_api.py` / `test_workbench_api.py` 回归；当前阶段 0 相关后端测试 11 个用例通过。对外口径仍应限定为“后端稳定收口第一轮已完成”，不等同于 AI 异常自动转人工复核与调用日志体系已全部完成。
- 2026-05-30 已在真实主仓库完成阶段 0 / 阶段 1 的最后一轮收口：补齐模板字段唯一性校验、任务广场搜索/筛选/状态标签、打回后查看理由并基于原答案重新提交、Labeler 端 `human_review` 提示、`ExportFormat` 收窄为 `json | csv`。同时新增 `backend/tests/test_export_contract.py`、`test_tasks_api.py`、`test_templates_api.py`，并回归通过后端关键测试 15 个、前端关键测试 19 个与前端构建。
- 2026-05-30 已新增两套真实导入样本：`datasets/datasets/qa_quality` 与 `datasets/datasets/preference_compare`，均包含 `annotation_guide.md` 以及 JSON / JSONL / Excel 三种格式，可作为阶段 1 数据集导入与多题任务模型的第一批验证输入。

### 已完成
- 成员 B 路线图已拆分并写入 PLANROAD-B.md。
- FastAPI 项目结构、基础配置（core/config.py）、数据库连接代码（core/database.py）已就位。
- 5 组核心路由已升级为真实链路并可联调：health、auth、tasks、templates、submissions、workbench。
- 后端 `.venv` 已创建并安装依赖，应用可正常导入。
- 已完成本地 MySQL 启动与真实数据库读写验证。
- 已建立核心数据模型与核心表：`users`、`tasks`、`templates`、`template_versions`、`assignments`、`submissions`。
- 统一接口契约文档已存在，并已覆盖登录、任务、模板、领取、workbench、草稿保存、提交等第 1 周核心链路。
- 已补启动期最小 schema patch：旧库若缺少 `tasks.active_template_id` / `tasks.active_template_version_id` 会在初始化时自动补齐，避免模型升级后因历史库结构落后阻断主链路。
- 已用真实数据库脚本完成一轮 Labeler 主链路状态验证：claim、workbench、draft、submit 可正常读写；重复提交当前表现为幂等接受并保持 `submitted`。

### 进行中
- 统一在 `SM` 分支继续做后端稳定化，下一步从已验证的 Labeler 前半链路转向异常场景语义收口与后半链路对接。

### 阻塞点
- 当前环境下 FastAPI startup 仍使用 `on_event`，测试虽已通过环境变量绕开初始化，但后续可考虑迁移到 lifespan 以消除 deprecation warning。

### 已知设计债
- `DeepSeekAIExecutor` 当前已补 requests 异常包装，但仍只覆盖同步请求级 fallback；还缺少更细的分类策略，例如区分超时、鉴权失败、响应结构错误后的不同告警/审计语义，也没有后台任务级超时治理。
- `config.py` 中 `deepseek_model` 默认值是写死的 ，与用户实际 `.env` 中的 `deepseek-v4-flash` 不一致时容易混淆；后续可考虑把模型名完全交给环境变量决定、不做代码层默认值。
- `ExportJob` 当前已能持久化真实 JSON / CSV 导出内容，但仍未进入真实文件落盘 / 下载产物管理阶段；JSONL / Excel 也仍未进入真实文件导出阶段。

### 下一步
- 若继续按原计划推进，优先补真实导出能力的下一步：在已有 JSON/CSV 内容生成基础上，再决定是否进入文件落盘与下载产物管理，然后继续 JSONL / Excel 扩展。
- 继续补 AI 预审真实在线验证与更细的失败分类测试；若要宣称“重试机制已完成”，需先实现真正自动 retry，而不只是计数落库。
- 如进入下一轮大规模升级，再评估把 AI / export job 执行从同步请求链路迁到后台任务系统。
