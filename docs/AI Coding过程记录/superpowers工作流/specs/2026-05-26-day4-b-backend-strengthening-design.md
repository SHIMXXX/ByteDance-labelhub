# Day 4 B 侧强化设计

## 背景
当前 SM 分支已经跑通 Owner / Labeler / Reviewer / 导出最小真实链路，A 侧演示主链路基本可用；但 B 侧仍停留在“真实接口够前端联调”的阶段，距离路线图中要求的后端稳定性、AI 预审闭环与可回归验证还有明显差距。

Day 4 以 B 侧为中心，目标不是再加一批孤立接口，而是把后端从“能跑”推进到“可验证、可解释、可继续扩展”的状态。

## 目标
在不引入大规模重构和真实豆包接入的前提下，完成以下 4 类能力：

1. 补后端自动化测试基础，沉淀现有真实链路验证资产。
2. 建立 AI 预审最小闭环，包括 job / result 数据结构、提交后触发、最小执行器、结构化结果回写。
3. 让 Reviewer 从消费占位 AI 结果升级为消费真实持久化 AI 结果。
4. 收口导出与关键状态语义，并预留最小审计日志骨架。

## 范围
### 本次纳入
- 后端测试基础与关键接口测试。
- submissions 状态约束与 AI 预审触发。
- AI 预审最小模型与执行逻辑。
- reviews 查询 AI 结果并基于固定映射工作。
- exports 状态语义收口与最小一致性验证。
- 最小 audit log 骨架或清晰预留点。

### 本次不纳入
- 真实豆包 API 接入。
- Celery / Redis / 真异步任务系统。
- 字段级审计日志。
- 大规模状态机重构。
- 为未来抽过多抽象层。

## 设计原则
1. **先稳后扩**：先补测试与状态语义，再补 AI 最小功能闭环。
2. **最小闭环优先**：AI 先用 mock / rule-based executor 跑通，不等待真实模型。
3. **保持现有模式**：沿用当前 FastAPI + SQLAlchemy + 简单 route 组织，不做大拆分。
4. **协议先固定**：AI 输出固定为 `scores` / `decision` / `summary`，避免 Reviewer 与前端后续反复改字段。
5. **只做当前需要的持久化**：新增表服务于今天的闭环，不为未来多租户、批处理、复杂调度做预埋。

## 方案对比
### 方案 A：只补测试和状态约束
优点：最稳，风险最低。
缺点：B 侧路线图里最缺的 AI 预审仍然没有实质推进。

### 方案 B：直接做 AI 预审功能优先
优点：功能推进快，路线图视觉进展明显。
缺点：没有测试底座时容易把后端变得更脆，后续回归成本高。

### 方案 C：测试底座 + AI 最小闭环 + Reviewer/Export 收口（推荐）
优点：兼顾工程稳定性与功能推进，能明显提升 Day 4 产出质量。
缺点：工作量更大，需要严格控制不扩到真实模型接入与异步系统。

推荐采用 **方案 C**。

## 架构设计
### 1. 测试层
为后端补最小测试依赖与基础夹具，优先覆盖现有已联通真实接口：
- auth
- workbench / claim
- draft / submit
- reviews
- exports

测试重点放在：
- 主成功路径
- 当前已知边界条件
- Day 4 新增状态语义

不追求一口气补齐全部后端测试，只要求把最重要的业务链路变成可重复验证。

### 2. AI 预审最小闭环
新增两类持久化对象：
- `ai_audit_jobs`：记录某个 submission 的一次 AI 审核任务
- `ai_audit_results`：记录结构化审核结果

闭环流程：
1. Labeler 提交 submission。
2. 后端创建一条 `queued` 的 AI job。
3. 同步调用最小 executor。
4. executor 返回固定结构：
   - `scores`
   - `decision`
   - `summary`
5. 写入 `ai_audit_results`。
6. 更新 job 状态与 submission 状态。

Day 4 中 executor 使用本地规则或 mock 逻辑，例如：
- 有答案且非空：`pass`
- 结构可疑或答案为空：`human_review`
- 明显不满足要求：`reject`

这里不强调“AI 是否聪明”，只强调“链路是否稳定”。

### 3. Submission / Reviewer 状态流
沿用现有简化状态，但把 AI 结果真正纳入流转：
- `draft`
- `submitted`
- `ai_passed`
- `needs_revision`
- `review_passed`

建议语义：
- 用户点击提交后先进入 `submitted`
- AI job 执行完成后：
  - `pass` / `human_review` → `ai_passed`
  - `reject` → `needs_revision`
- Reviewer 只处理需要人工审的数据，即已具备 AI 结果且可复核的数据
- Reviewer approve → `review_passed`
- Reviewer reject → `needs_revision`

这样可以保留当前简化状态模型，同时让 AI 预审结果与 Reviewer 页面真正一致。

### 4. Reviewer 接口改造
当前 reviews 路由中的 `to_ai_result()` 是临时占位逻辑。Day 4 需要改为：
- 优先读取 submission 最近一次 AI result
- pending 列表根据真实状态筛选
- detail 页返回真实 `aiResult`

若 submission 尚无 AI result，不应再伪造一份虚拟结果，而应显式按状态拒绝或视为未进入待审。

### 5. Export 语义收口
当前 exports 仍使用内存 `_EXPORT_JOBS`，但 Day 4 不强制改成数据库表。为了控制工作量，建议只收口状态语义与测试：
- `queued`
- `processing`
- `done`
- `failed`（可以先预留但不强制走到）

最小实现可保持“首次详情查询推进为 done”的模式，但测试与返回字段要统一，避免前端和答辩讲解时出现歧义。

### 6. Audit Log 预留
今天不做完整审计系统，但建议至少提供统一写入入口或最小模型骨架，便于记录关键事件：
- submission submitted
- ai audit finished
- review approved / rejected
- export created / finished

如果时间不足，可以先写最小 helper 和模型，不强制每个路由全部接完。

## 数据设计
### `ai_audit_jobs`
建议字段：
- `id`
- `submission_id`
- `status`：`queued` / `processing` / `done` / `failed`
- `attempt_count`
- `error_message`
- `created_at`
- `updated_at`

约束：
- 一个 submission 在 Day 4 版本只保留一个活跃 job
- 重复提交不允许，因此不会为同一 submission 反复创建新 job

### `ai_audit_results`
建议字段：
- `id`
- `job_id`
- `submission_id`
- `scores_json`
- `decision`
- `summary`
- `created_at`

约束：
- 一条 job 对应一条 result
- `decision` 固定只允许：`pass` / `human_review` / `reject`

### `audit_logs`（可选骨架）
建议字段：
- `id`
- `event_type`
- `entity_type`
- `entity_id`
- `actor_user_id`
- `payload_json`
- `created_at`

## 错误处理与边界
Day 4 重点收口以下边界：
- submission 已提交后再次提交：409
- Reviewer 审核非待审 submission：409
- reject reason 为空：400
- export job 不存在：404
- AI job 执行失败：记录失败状态，不伪造成功结果
- submission 没有 AI result 时 Reviewer 不应展示虚构结果

## 测试策略
优先补三类测试：
1. **现有真实链路回归测试**：确保 Day 3 已打通能力不被 Day 4 改坏。
2. **AI 闭环测试**：提交后创建 job、生成 result、更新 submission 状态。
3. **边界测试**：重复提交、非法审核、空理由打回、导出不存在。

不追求覆盖率数字，追求“答辩前能快速证明关键链路没坏”。

## 成功标准
Day 4 结束时满足以下条件即可判定成功：
1. 后端关键接口已有一批可稳定执行的自动化测试。
2. submission 提交后能触发 AI 预审最小闭环。
3. Reviewer 能消费真实持久化的 AI 结果，而不是临时占位数据。
4. exports 状态与返回语义更清晰一致。
5. 至少有最小 audit log 骨架或明确预留点。

## 风险与控制
### 风险 1：AI 功能膨胀
如果开始追求“更像真实 AI”，会迅速超出 Day 4 容量。
**控制**：只做固定协议 + 最小规则执行器。

### 风险 2：测试补太广
如果试图一次补齐所有接口测试，容易拖慢主任务。
**控制**：只覆盖关键业务链路与新增逻辑。

### 风险 3：过早抽象
如果为未来异步执行、重试、分布式任务提前抽很多层，会增加复杂度。
**控制**：Day 4 保持同步执行器与简单模型，后续再演进。

## 结论
Day 4 的正确方向不是“单点猛冲某个功能”，而是把 B 侧后端补成一个更完整的最小系统：
- 有测试
- 有状态语义
- 有 AI 最小闭环
- 有 Reviewer 真消费
- 有导出一致性
- 有审计骨架预留

这能最大化当天工作量的产出比，也最有利于后续自动执行和连续推进。
