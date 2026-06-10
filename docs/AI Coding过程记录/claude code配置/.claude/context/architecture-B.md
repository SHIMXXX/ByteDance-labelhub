# 架构决策记录

## 2026/05/21 - LabelHub MVP 后端与支撑模块边界
- 背景：成员 B 负责系统底层能力与高风险模块，需要在不拖慢主链路的前提下，完成后端、AI、审核、导出和审计支撑。
- 决策：
  - 后端采用 FastAPI + MySQL 单体方案，先保证本地可跑通。
  - AI 预审采用豆包真实接口，输出结构固定为 `scores`、`decision`、`summary`。
  - AI 任务与导出任务都采用任务表驱动，为后续升级到更稳定的队列方案预留空间。
  - 审计日志只覆盖关键事件，不做字段级审计。
  - 第一版鉴权固定为 Bearer token，前端只调提交接口，不直接触发 AI 审核接口。
- 影响文件：
  - docs/superpowers/specs/2026-05-21-labelhub-mvp-design.md
  - docs/superpowers/plans/2026-05-21-labelhub-mvp-implementation-plan.md
  - docs/api-contracts/labelhub-v1.md
  - PLANROAD-B.md