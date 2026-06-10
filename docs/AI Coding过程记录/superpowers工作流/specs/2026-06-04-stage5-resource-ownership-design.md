# LabelHub 阶段五子项目二：权限与资源归属设计稿

> 日期：2026-06-04
> 范围：阶段五第二子项目第一轮，只做三角色资源归属与最小 reviewer 任务级分配闭环，不把完整 RBAC 平台、部署与细粒度调度整包并行推进。

## 1. 背景

阶段五子项目一已经完成了认证基础层：

- 后端 `/auth/login` 已切到用户名 / 密码 + JWT
- `/auth/me` 已基于 Bearer token 返回当前用户
- 前端登录页已升级为账号密码表单 + 演示账号快捷填充
- `RoleGuard` 已切到 `token + labelhub_role`

这解决了“谁在访问系统”的问题，但还没有解决“这个用户能访问哪一份数据”的问题。

当前代码里虽然已经存在不少资源归属字段，例如：

- `Task.owner_id`
- `Dataset.created_by`
- `Template.created_by`
- `ExportJob.created_by`
- `Assignment.user_id`
- `Submission.user_id`

但业务路由还没有系统性地把这些字段落实为权限边界。结果是：

- Owner 仍可能看到或操作不属于自己的任务、模板、数据集、导出任务
- Labeler 如果只靠 `submissionId` / `assignmentId` 访问接口，仍存在越权风险
- Reviewer 当前还没有真正的“只看自己被分配任务”的严格约束

因此，阶段五子项目二的第一轮目标不是构建完整权限中心，而是基于现有模型和已完成的 JWT 认证，补齐 **三角色资源归属的最小真实闭环**。

---

## 2. 目标

本轮完成后，系统应满足以下目标：

1. **Owner 只能看到和管理自己的资源**
   - task
   - template
   - dataset
   - export job

2. **Labeler 只能访问自己的工作资源**
   - 只能 claim 当前可领取任务
   - 只能打开自己的 assignment
   - 只能保存 / 提交自己的 submission

3. **Reviewer 采用严格分配制**
   - 只有被分配到某个 task 的 reviewer，才能看到该 task 下的待审 submission
   - 也只有该 reviewer 才能进入 review detail、approve、reject

4. **Owner 拥有最小 reviewer 分配入口**
   - 在现有 Owner 任务页上完成 reviewer 任务级分配
   - 不引入独立权限后台

5. **后续阶段可继续扩展**
   - 后续如果要增加 submission 级 reviewer 分配、更多角色规则或部署环境权限治理，可以在本轮边界之上继续演进

---

## 3. 范围边界

### 纳入范围
- Owner 资源归属校验：tasks / templates / datasets / exports
- Labeler 资源归属校验：claim / workbench / draft / submit
- Reviewer 严格分配制：pending / detail / approve / reject
- reviewer 任务级分配模型与后端接口
- Owner 任务页最小 reviewer 分配入口
- 三角色权限自动化测试
- 最小浏览器权限验收
- README / API 契约 / progress 同步到不误导的程度

### 明确不做
- 不做完整通用 RBAC/ACL 系统
- 不做字段级权限
- 不做 submission 级 reviewer 分配
- 不做多 reviewer 并行抢单 / 转派 / 轮转
- 不做多人并行 labeler 标注模型重构
- 不做部署（Docker Compose / Nginx / 云环境）
- 不做与当前权限闭环无关的大规模重构

---

## 4. 方案选择

本轮考虑过三种方案：

### 方案 A：一次性全量 RBAC 收口
- 三角色所有相关路由立即切到严格资源校验
- 同时补 reviewer 分配模型、前端入口、所有列表过滤、所有详情页拒绝访问逻辑

**优点**
- 语义最完整

**缺点**
- 改动面最大，最容易让阶段五子项目二演变成权限大重构
- 任一链路漏改都会提高回归成本

### 方案 B：三角色主链路最小闭环收口（本轮采用）
- 三角色同时推进，但只覆盖当前真实主链路必经资源
- reviewer 采用严格分配制
- Owner 有最小前端分配入口
- 分配粒度只做到任务级

**优点**
- 能形成可验收闭环
- 范围完整但仍可控
- 与当前项目“稳步推进、小步验收”的节奏一致

**缺点**
- 不是最终完整权限体系，后续若要更细粒度分配，还需继续扩展

### 方案 C：权限框架优先
- 先抽通用 policy helper、assignment 模型和接口骨架
- 主链路适配先做一半

**优点**
- 对后续扩展友好

**缺点**
- 容易出现“框架有了，但当前黄金链路没真正收口”的假完成

### 本轮最终采用
**方案 B：三角色主链路最小闭环收口。**

原因：它既覆盖了用户明确要求的三角色同时推进，又能把范围锁在当前黄金链路上，避免权限层一轮内膨胀成完整平台工程。

---

## 5. 范围与目标细化

### 5.1 本轮功能目标

1. **Owner 只能看到和管理自己创建的资源**
   - task
   - template
   - dataset
   - export job

2. **Labeler 只能访问自己的工作资源**
   - 只能 claim 自己当前可领取的任务
   - 只能查看自己的 assignment
   - 只能保存 / 提交自己的 submission
   - `workbench` 只能打开自己的 assignment 视角

3. **Reviewer 采用严格分配制**
   - 只有被显式分配到某个 task 的 reviewer，才能看到该 task 下的待审 submission
   - 也只有该 reviewer 才能进入 review detail / approve / reject

4. **Owner 提供最小 reviewer 分配入口**
   - 在现有 Owner 页面补一个最小入口
   - 只支持“把 reviewer 分配到 task”
   - 不做复杂权限后台，不做拖拽调度，不做批量智能分配

### 5.2 本轮设计约束
- 三角色同时做，但只覆盖当前真实主链路
- reviewer 分配采用**任务级分配**
- Owner 分配入口采用最小前端入口，而不是新建独立权限中心页面
- reviewer 分配接口采用**覆盖式保存**，不做增量 add/remove 双接口

---

## 6. 数据模型设计

### 6.1 复用现有资源归属字段

本轮尽量复用已有字段，不对核心模型做无关重写：

- `Task.owner_id`：Owner 资源归属锚点
- `Dataset.created_by`
- `Template.created_by`
- `ExportJob.created_by`
- `Assignment.user_id`
- `Submission.user_id`
- `Submission.assignment_id`

这些字段已经足够支撑 Owner / Labeler 的资源校验。

### 6.2 新增 reviewer 任务级分配表

本轮唯一建议新增的模型是一张 reviewer 任务分配表，例如：

- `task_reviewer_assignments`
  - `id`
  - `task_id`
  - `reviewer_id`
  - `assigned_by`
  - `created_at`

约束与索引：
- 唯一约束：`(task_id, reviewer_id)`
- `task_id` 与 `reviewer_id` 应建立索引或至少具备高频查询友好性

### 6.3 为什么不直接复用 `Submission.assigned_reviewer_id`

当前已经明确本轮做的是 **任务级分配**，不是 submission 级分配。若直接把 reviewer 分配关系压到 `Submission.assigned_reviewer_id`：

- 会把任务级关系错误地下沉到每条 submission
- 需要额外考虑补写、同步、重提轮次与历史兼容
- 会让分配语义与后续演进变复杂

因此本轮约定：
- **权限判断主依据**：`task_reviewer_assignments`
- `Submission.assigned_reviewer_id` 若继续保留，只能视为历史兼容字段或未来扩展预留字段，不作为本轮权限主依据

---

## 7. 权限规则设计

## 7.1 Owner 资源归属规则

Owner 登录后，所有 Owner 侧接口都要额外满足“资源属于当前 owner”。

### 规则
- `Task`：`task.owner_id == current_user.id`
- `Template`：`template.created_by == current_user.id`
- `Dataset`：`dataset.created_by == current_user.id`
- `ExportJob`：`export_job.created_by == current_user.id`

若某资源之间存在关联，还需保证关联目标也属于当前 owner，例如：
- 创建 template 时若绑定 `taskId`，该 task 必须属于当前 owner
- 创建 export job 时，目标 task 必须属于当前 owner

### 效果
- Owner 看不到别人的任务、模板、数据集、导出历史
- Owner 不能把别人的 dataset/template 绑到自己的 task 上
- 导出接口不能通过猜 `jobId` 越权下载别人导出结果

## 7.2 Labeler 资源归属规则

本轮继续沿用当前最小业务前提：**一个 task 当前只允许一个 assignment 主持链路**，不顺手扩成多人协作标注模型。

### 规则
- `claim task`
  - 当前用户必须是 `labeler`
  - task 必须为可领取状态
  - 若 assignment 已存在且不属于当前用户，则拒绝
- `workbench`
  - `assignment.user_id == current_user.id`
- `save draft / submit submission`
  - `submission.assignment.user_id == current_user.id`
  - `submission.user_id == current_user.id`
  - assignment / submission / task 关系必须一致

### 效果
Labeler 只能进入自己的工作台，只能保存/提交自己的答案，不能通过 assignmentId / submissionId 串改别人的工作数据。

## 7.3 Reviewer 严格分配规则

本轮规则已经固定为：
- 严格分配制
- Owner 提供最小前端分配入口
- 分配粒度为任务级

### 可见性规则
当且仅当存在：
- `task_reviewer_assignments.task_id == submission.task_id`
- 且 `task_reviewer_assignments.reviewer_id == current_user.id`

当前 reviewer 才能：
- 在 pending list 中看见该 submission
- 进入 review detail
- 执行 approve
- 执行 reject

### 明确不提供的语义
- 不存在“所有 reviewer 都能看到待审池”
- 不存在“未分配 reviewer 可先看后审”
- 不存在 submission 级单独换 reviewer 的复杂逻辑

---

## 8. 错误语义

本轮保持简单、可测试、可调试的错误语义：

- **资源不存在** → `404`
- **角色不匹配 / 资源不属于当前用户 / reviewer 未被分配** → `403`

这意味着：
- “没有这个资源”和“你不能碰这个资源”明确区分
- 本轮不引入“伪装成 404 隐藏资源存在性”的更复杂安全策略

原因：当前是课程项目与主链路收口阶段，更需要一致、直观、好验证的权限语义，而不是企业级安全隐藏策略。

---

## 9. 接口设计

## 9.1 Owner 资源归属校验接口

### `tasks.py`
- `GET /tasks`
  - 只返回 `owner_id == current_user.id` 的任务
- `GET /tasks/{task_id}`
  - 非本人任务返回 `403`
- `POST /tasks`
  - 保持 `owner_id = current_user.id`
- `PATCH /tasks/{task_id}/status`
- `PATCH /tasks/{task_id}/ai-config`
  - 都必须校验 task 属于当前 owner

### `templates.py`
- `GET /templates`
  - 只返回 `created_by == current_user.id` 的 template
- `POST /templates`
  - `created_by = current_user.id`
  - 若传入 `taskId`，该 task 必须属于当前 owner
- `POST /templates/{template_id}/versions`
- `GET /templates/{template_id}/active-version`
  - 都要校验 template 属于当前 owner

### `datasets.py`
- `POST /datasets/import`
  - `created_by = current_user.id`
- `GET /datasets`
  - 只返回自己的 dataset
- `GET /datasets/{dataset_id}/items`
  - 只能查看自己的 dataset items

### `exports.py`
- `GET /exports`
  - 只返回 `created_by == current_user.id` 的导出任务
- `POST /exports`
  - 目标 task 必须属于当前 owner
- `GET /exports/{job_id}`
- `GET /exports/{job_id}/download`
  - 必须校验 export job 属于当前 owner

## 9.2 Labeler 资源归属接口

### `tasks.py`
- `GET /tasks/plaza`
  - 保持 labeler 视角，只展示可领取任务
- `POST /tasks/{task_id}/claim`
  - 保留现有 assignment 唯一链路
  - 若 assignment 已存在且不是当前用户，继续拒绝

### `workbench.py`
- `GET /workbench/items?assignmentId=...`
  - 保留并正式确认 `assignment.user_id == current_user.id` 校验

### `submissions.py`
- `POST /submissions/draft`
- `POST /submissions/{submission_id}/submit`
  - 补强校验：
    - submission 属于当前用户
    - submission.assignment 属于当前用户
    - assignment / submission / task 关系一致

## 9.3 Reviewer 分配与审核接口

### reviewer 分配接口（建议放在 `tasks.py`）
因为本轮是**任务级分配**，所以分配接口围绕 task 组织最自然。

- `GET /tasks/{task_id}/reviewers`
  - Owner 查看当前 task 的 reviewer 分配结果
- `POST /tasks/{task_id}/reviewers`
  - Owner 为任务分配 reviewer
  - 请求体最小可采用：

```json
{
  "reviewerIds": [3, 5]
}
```

#### 保存语义
采用**覆盖式写入**：
- 本次传入的 reviewer 列表，就是该 task 最新分配结果
- 旧分配中不在列表里的 reviewer 会被移除

这样前端实现最简单，后端也不需要再额外维护增量 add/remove 两套接口。

### reviewer 列表辅助接口
为了前端选择 reviewer，建议新增：

- `GET /users/reviewers`
  - 返回所有 `role=reviewer` 的用户最小字段：
    - `id`
    - `username`
    - `displayName`

这比把 reviewer 数据耦合进 task 主接口更干净，也更容易复用。

### `reviews.py`
- `GET /reviews/pending`
  - 只返回当前 reviewer 被分配 task 下的待审 submission
- `GET /reviews/{submission_id}`
  - 若 submission 所属 task 未分配给当前 reviewer，返回 `403`
- `POST /reviews/{submission_id}/approve`
- `POST /reviews/{submission_id}/reject`
  - 均需校验当前 reviewer 对该 submission 所属 task 拥有分配权限
- 如果当前批量接口仍在使用，也要同步限制为只能处理自己被分配 task 下的 submission

---

## 10. 前端交互设计

## 10.1 Owner reviewer 分配入口位置

本轮不新开“权限中心”页面，分配入口直接放在 **Owner 任务管理页 / 任务详情上下文** 中。

### 推荐落点
在现有 Owner Tasks 页面中，为每个任务卡片或详情区增加一个最小功能块：
- 标题：`Reviewer 分配`
- 展示当前已分配 reviewer
- 一个“编辑分配”按钮
- 点击后出现最小多选面板或 checkbox 列表
- 保存时调用 `POST /tasks/{task_id}/reviewers`

### 原因
- reviewer 分配本质上是 task 配置的一部分
- Owner 心智最顺：建任务 / 配 AI / 分 reviewer 都围绕 task 进行
- 不额外引入新页面，最符合本轮范围控制要求

## 10.2 最小交互形态

这轮不做复杂弹窗系统和权限配置中心，只做最小可用交互：

- Owner 进入任务管理页
- 在任务卡片上看到当前已分配 reviewer 数量或名称摘要
- 点击“分配 Reviewer”
- 拉取 reviewer 列表与当前分配结果
- 多选 reviewer 后保存
- 保存成功后刷新当前任务数据

### 文案建议
- 空状态：`当前未分配 Reviewer`
- 保存成功：`Reviewer 分配已更新`
- 保存失败：`分配失败，请稍后重试`

## 10.3 其他角色前端改动范围

本轮不为 Labeler / Reviewer 增加复杂新页面，只让现有页面自然体现权限结果：

- **Owner**
  - 资源列表自然只展示自己的数据
- **Labeler**
  - 继续只能进入自己的 assignment / workbench
- **Reviewer**
  - pending 列表只显示被分配 task 下的数据
  - 未分配 reviewer 若硬进 detail，会看到后端 `403` 对应的失败态或被拦回列表

本轮前端重点不是新建大量页面，而是在现有页面上让资源过滤和 reviewer 分配真正落地。

---

## 11. 实现边界

### 11.1 权限 helper 策略

本轮不引入通用 policy engine 或 ACL DSL，而是采用 **“显式 helper + 业务路由调用”** 的方式。

建议新增一组很薄的 ownership / assignment / reviewer-assignment helper，例如：

- `require_owner_task(db, task_id, current_user)`
- `require_owner_template(db, template_id, current_user)`
- `require_owner_dataset(db, dataset_id, current_user)`
- `require_owner_export_job(db, job_id, current_user)`
- `require_labeler_assignment(db, assignment_id, current_user)`
- `require_labeler_submission(db, submission_id, current_user)`
- `require_reviewer_task_assignment(db, task_id, current_user)`
- `require_reviewer_submission_access(db, submission_id, current_user)`

这些 helper 只做三件事：
1. 查资源
2. 不存在返回 `404`
3. 存在但不属于当前用户 / 未分配则返回 `403`

### 11.2 为什么不做通用权限框架

本轮规则虽然覆盖三角色，但本质上仍很直：
- Owner 看 `owner_id / created_by`
- Labeler 看 `assignment.user_id / submission.user_id`
- Reviewer 看 task 级分配表

如果现在就抽象成完整 policy / ACL / permission matrix，会明显超出当前项目需要，且容易把任务从“闭环收口”带偏到“框架搭建”。

### 11.3 数据库变更边界

本轮建议新增：
- reviewer 任务分配表（例如 `task_reviewer_assignments`）

本轮不建议：
- 重写 `Submission.assigned_reviewer_id`
- 重写现有 `Assignment` / `Submission` 主结构
- 引入多 reviewer 并发状态
- 接入复杂 migration 工具链

### 11.4 schema patch 策略

继续沿用当前项目已有的 `patch_schema()` 风格：
- 启动时检查 reviewer 分配表是否存在
- 不存在则创建
- 同时补唯一约束与必要索引

这样与当前项目风格最一致，实施成本也最低。

---

## 12. 测试策略

这轮权限必须被当成主功能验证，而不是靠人工感觉判断。

## 12.1 后端测试矩阵

### Owner
验证“只能看/改自己的资源”：
- owner A 创建 task / template / dataset / export
- owner B 带自己的 JWT 尝试访问
- 预期：
  - 列表看不到 A 的资源
  - 详情 / 更新 / 导出下载返回 `403`

### Labeler
验证“只能操作自己的 assignment / submission”：
- labeler A claim 后生成 assignment / submission
- labeler B 尝试访问：
  - `/workbench/items?assignmentId=...`
  - `/submissions/draft`
  - `/submissions/{id}/submit`
- 预期：均返回 `403`

### Reviewer
验证“严格分配制”：
- reviewer A 被分配到 task
- reviewer B 未被分配
- 待审 submission 属于该 task
- 预期：
  - reviewer A 能看到 pending、detail、approve/reject
  - reviewer B 的 pending 列表看不到该 submission
  - reviewer B 直接访问 detail / approve / reject 返回 `403`

### 分配接口
- 只有 owner 且 task 属于自己时，才能更新 reviewer 分配
- 非 owner 或非 task owner 返回 `403`
- 覆盖式保存后，再次读取分配结果必须与提交内容一致

## 12.2 前端测试矩阵

本轮前端测试聚焦新增 reviewer 分配 UI，而不是扩写海量页面测试：

- Owner 任务页 / reviewer 分配区域：
  - 能显示当前分配状态
  - 能拉 reviewer 列表
  - 能提交新的 `reviewerIds`
  - 保存成功后回显更新结果
  - 保存失败时有错误提示

同时补最小权限感知测试：
- Reviewer 页面在无数据时不会崩
- 未授权访问 detail 时能稳定展示失败态或跳回列表

---

## 13. 浏览器验收标准

本轮浏览器只验证黄金权限闭环，不扩展到所有边角场景。

### 场景 1：Owner 资源隔离
- `owner_demo` 登录
- 只能看到自己的 task / template / dataset / export
- 在任务页能打开 reviewer 分配入口并保存

### 场景 2：Labeler 资源隔离
- `labeler_demo` 登录
- 只能进入自己的 assignment
- 若手改 URL 或请求别人的 assignment，前端能稳定处理后端拒绝

### 场景 3：Reviewer 严格分配制
- 先由 owner 给某个 task 分配 `reviewer_demo`
- `reviewer_demo` 登录
- 只能在待审列表看到被分配 task 下的数据
- 能进入 detail 并 approve/reject
- 未被分配的 reviewer 登录后，看不到这批待审数据

---

## 14. 完成判定标准

只有同时满足下面几条，本轮才能被称为“阶段五子项目二第一轮完成”：

1. reviewer 任务级分配表与最小接口已落地
2. Owner / Labeler / Reviewer 三角色关键路由已加资源归属校验
3. Owner 页面已具备最小 reviewer 分配入口
4. 后端权限测试矩阵通过
5. 前端新增交互测试通过
6. 至少完成一轮浏览器真实权限验收
7. README / API 契约 / progress 已同步到不误导的程度

---

## 15. 本轮明确暂不处理的风险

- 不解决“一个 task 多个 labeler 并行标注”的权限模型
- 不解决 submission 级 reviewer 精细分配
- 不解决 reviewer 轮转 / 抢单 / 转派
- 不解决隐藏资源存在性的 `404/403` 安全策略争议
- 不解决部署层面的反向代理、跨域、生产鉴权存储增强
- 不做完整权限中心、组织/团队模型

---

## 16. 与当前工程的衔接说明

本设计严格建立在当前代码能力之上：

- JWT 认证基础层已完成，是本轮所有资源归属校验的前提
- 现有模型已具备大部分 Owner / Labeler 归属字段，因此本轮主要是把已有字段真正落实到路由权限
- Reviewer 当前缺的不是审核能力本身，而是“谁可以看 / 审”的任务级分配约束，因此本轮只新增一张任务级 reviewer 分配表即可形成闭环

本轮目标不是把系统升级为通用权限平台，而是让当前 LabelHub 主链路第一次真正具备“谁能看哪份数据、谁能操作哪份数据”的明确边界。
