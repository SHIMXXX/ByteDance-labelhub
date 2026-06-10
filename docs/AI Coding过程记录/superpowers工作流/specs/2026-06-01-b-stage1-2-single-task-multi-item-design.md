# B 侧单 task 多题模型扶正与 reviewer/export 基础收口设计稿

## 背景
当前阶段 1/2 已经具备多题 workbench、dataset 导入、item 级 submission 的部分代码基础，但真实本地演示口径仍依赖兼容式 seed：每个 dataset item 生成一条独立 task / assignment / submission。这样虽然能让前端继续开发，但会带来三个持续问题：

1. 演示形态与题目要求不一致，无法真实体现“一个任务包含多条数据项”的平台模型。
2. Reviewer / Export 的后续增强仍建立在兼容口径之上，后面继续补功能时容易重复返工。
3. A 侧阶段 2 虽已完成最小真实链路收口，但底层数据模型与演示数据仍然别扭，影响后续阶段继续推进。

用户已明确本轮优先满足 `datasets/` 目录中的现有数据样本，不需要为旧线上数据或复杂历史兼容做额外设计。

## 目标
把 B 侧数据模型、seed 与接口语义扶正为“单 task 多题”的真实形态，并同时为 Reviewer / Export 的 item 级聚合打好稳定基础。

## 本轮范围
### 要做
- 修正 `submissions` 当前不利于多题任务的唯一约束口径。
- 以 `datasets/` 中现有样本恢复真实单 task 多题 seed。
- 保持 `task -> assignment -> submission(item)` 作为稳定主模型。
- 让 workbench、reviewer、export 都基于 item 级 submission 聚合。
- 保持 A 侧现有多题 workbench 尽量少改，优先复用已有页面能力。

### 不做
- 不做 Reviewer 批量审核 UI。
- 不做多级审核工作流。
- 不扩 JSONL / Excel 导出能力范围。
- 不为旧历史数据增加复杂兼容层。

## 架构边界
### 核心实体关系
- `Task`：任务容器，对应一个数据集和一个模板版本。
- `Assignment`：用户领取任务后的实例，表示“某个 labeler 正在处理该 task”。
- `Submission`：assignment 下按 `dataset_item_id` 拆分的 item 级提交记录，是 reviewer 和 export 的最小数据载体。

### 稳定关系
- 一个 `task` 绑定一个 `dataset`。
- 一个 `assignment` 对应一个用户领取某个 `task`。
- 一个 `assignment` 下会有多条 `submission`，每条对应一个 `dataset_item`。
- reviewer/export 后续都按 task 聚合 submission 列表，而不是再引入新的中间层模型。

## 迁移策略
### 1. submissions 唯一约束扶正
当前目标口径应稳定为：
- `assignment_id + dataset_item_id` 唯一

不再保留“一个 assignment 只能有一条 submission”的旧约束语义。因为这会直接阻断“一个任务多条数据项”的真实模型。

### 2. 不做复杂历史兼容
由于用户已确认“没有旧数据”，本轮不设计复杂兼容逻辑，只处理当前本地开发库与演示数据：
- 开发库可直接迁到新约束。
- seed 直接按新模型重建。
- 不引入多套双写、灰度或回滚层。

### 3. seed 恢复真实单 task 多题
seed 应改成：
- 一个 dataset 生成一个 task。
- labeler 领取该 task 后生成一个 assignment。
- assignment 下按 dataset items 生成多条 item 级 submission。
- 可按需要生成不同题目的 draft / submitted / needs_revision / review_passed 示例状态。

这样 A 侧 workbench、Reviewer 和 Export 都能吃到一致的数据基础。

## 接口影响面
### tasks/plaza
保持 task 仍是任务卡片单位，但返回口径继续面向真实 assignment：
- `claimedByCurrentUser`
- `assignmentId`
- `claimedCount`

这样 A 侧广场页仍能稳定显示“已领取 / 继续作答”，同时 task 本身已是单 task 多题真实形态。

### workbench/items
继续返回一个 assignment 下的多题列表，每题附带：
- `draftSubmission.submissionId`
- `draftSubmission.status`
- `draftSubmission.answers`
- `draftSubmission.latestRejectReason`

当没有人工 `ReviewRecord.reason` 时，如果该 submission 是 AI reject 导致的 `needs_revision`，则回退使用 `AIAuditResult.summary` 作为待修改理由。

### submissions/draft 与 submissions/{id}/submit
继续围绕 item 级 submission 运作：
- 每题一条 submission
- 重提复用同一条 submission 记录
- 不在本轮引入新的版本表或中间表

### reviews/pending 与 reviews/{id}
本轮先保证 reviewer 后端数据基础可复用：
- 能稳定按 task 下的 item submission 查询待审项
- detail 仍按 submission 读取
- 不直接扩批量审核 UI，但数据语义必须已经站在 item 级 submission 上

### exports
继续按 task 发起导出，但导出内容聚合 task 下全部 item submission：
- 每条 item 以 submission 为中心展开
- 为后续 JSON / CSV / JSONL / Excel 统一结构做准备

## 对前端的预期影响
本轮应尽量保持 A 侧最小改动：
- Labeler 广场继续按 task 卡片展示
- workbench 继续按 assignment 加载多题
- 领取状态回显依赖 `claimedByCurrentUser + assignmentId`
- 若 reviewer/export 字段语义变得更稳定，前端只做最小字段对齐

## 风险与约束
### 风险 1：旧本地数据库残留约束
如果本地 MySQL 仍残留旧唯一约束，迁移后需要确认 schema 真正生效，否则 seed 和浏览器验证仍会继续跑在旧语义上。

### 风险 2：seed 与真实接口口径重新错位
如果 seed 改成单 task 多题，但 reviewer/export 仍按旧兼容逻辑聚合，就会再次出现“能看不能用”的假闭环。

### 风险 3：A 侧被动依赖字段变化
虽然目标是少改前端，但如果 reviewer/export 或 workbench 返回结构发生关键变化，必须同步做最小 A 侧字段校准。

## 验收标准
本轮设计对应的实现完成后，应至少满足：

1. `datasets/` 里的现有样本可通过真实单 task 多题 seed 落入数据库。
2. Labeler 广场对单 task 多题任务显示正常，领取后拿到一个 assignmentId。
3. workbench 在同一 assignment 下返回多条 dataset item submission。
4. AI reject 后可回到待修改状态，并显示待修改理由。
5. reviewer/export 后端都能按 task 聚合 item 级 submission，不再依赖“一 item 一 task”的兼容演示模型。
6. A/B 文档口径与真实模型一致，不再把兼容式 seed 当作当前推荐主路径。

## 本轮推荐实施顺序
1. 先修数据库约束与模型语义。
2. 再改 seed，让 `datasets/` 样本回到单 task 多题真实演示。
3. 然后修 `tasks/plaza`、`workbench`、`reviews`、`exports` 的聚合口径。
4. 最后做 A 侧最小字段同步与浏览器回归。
5. 完成后回写 `PLANROAD-A/B`、`progress-A`、演示文档。
