# CLAUDE.md

## 项目背景

正在参加字节跳动 AI 全栈挑战工程训练营，选题为 **LabelHub 数据标注平台**（课题十二）。
开发周期 3 周，目标完赛。

详细需求见 [docs/选题/题目.md](选题/题目.md)。

## 每次会话开始时

我统一负责原前端 A 与后端 B 的工作，后续默认在 `SM` 分支推进；`LWH` 仅保留为参考/归档分支，环境是windows系统。

请按以下顺序读取上下文：
1. docs/PLAN/PLANROAD-FINAL.md — 历史最终路线与完成基线（仅在需要历史背景时查看）
2. .claude/context/progress-A.md — 当前进度、阻塞点与下一步
3. .claude/context/decisions-A.md — 已做的重要决策
4. .claude/context/architecture-A.md — 架构决策记录
5. docs/PLAN/PLANROAD-A.md — 历史前端路线与完成基线（仅在需要历史背景时查看）
6. docs/PLAN/PLANROAD-B.md — 历史后端路线与完成基线（仅在需要历史背景时查看）
7. .claude/context/progress-B.md — 历史 B 侧进度参考（仅在需要旧上下文时查看）

读取后简要总结当前状态，并询问本次会话目标。
执行较大决策或代码变更后，更新进度、决策与架构记录，避免夸大描述。

## 分支约定

- 主开发分支：`SM`
- 参考/归档分支：`LWH`
- 稳定分支：`main`

## 常用操作（自然语言触发）

### 进度汇报
当用户说”查看进度””状态””进展”时：
- 汇总对应 context 三件套 + `git log --oneline -10`
- 输出：进行中 / 阻塞点 / 下一步 / 最近决策 / 最近提交
- “更新进度”时：主进程可直接更新 `.claude/context/progress-A.md`；如涉及 `PLANROAD-FINAL.md` 的路线调整或与历史 PLANROAD-A/B、README、API 文档的一致性判断，可调用 `labelhub-roadmap-auditor-agent` 提供只读审计建议

### 架构决策
当用户说"记一个决策"、"arch"、"架构决定"时：
- 引导：背景 → 方案 → 原因 → 影响范围
- 追加到 `decisions-A.md`，同步更新 `architecture-A.md`

### 代码审查
当用户说"review"、"审查"、"检查代码"时：
- 对未提交变更审查：类型安全、安全漏洞、边界、一致性、冗余
- 只输出问题清单和建议，不直接改代码

### PR 准备
当用户说”提PR”、”准备提交”、”pr”时：
- `git diff main...HEAD --stat`
- 检查 TODO / console.log / 硬编码密钥
- 生成 PR 标题和描述草稿，用户确认后再提交

## 自动检查规则

每次较大代码变更或阶段完成后，主动提醒用户是否需要质量审查：
- 涉及主流程、状态机、接口、AI、导出、跨角色链路 → 建议调用 `labelhub-quality-review-agent` 做多链路全流程检查
- 准备进入下一阶段或准备提交前 → 建议调用 `labelhub-quality-review-agent` 做全局代码审查
- 用户说"免审"则跳过

## 设计文档位置

- 设计稿：`docs/superpowers/specs/YYYY-MM-DD-<主题>-design.md`
- 实施计划：`docs/superpowers/plans/YYYY-MM-DD-<主题>-implementation-plan.md`
- 接口契约：`docs/api-contracts/labelhub-v1.md`

## 多 Agent 辅助流程

完整编排规则以 `labelhub-main-prompt.md` 为准；

子 Agent 定义见 `.claude/agents/`：
- `labelhub-quality-review-agent` — 质量审查、接口一致性检查与功能回归建议
- `labelhub-roadmap-auditor-agent` — 路线、进度、计划和文档一致性审计

关键原则：

真实代码修改、测试执行、文档回写和最终验收由主进程当前会话串行完成
子 Agent 只作为只读顾问使用，不参与真实开发闭环
删除开发 Agent，不再委托子 Agent 写业务代码

## 行为准则

以下准则偏向稳健优先于速度，简单任务可自行判断。

### 1. 先想再写
不要假设，不要隐藏疑惑，主动暴露权衡。

实现之前：
- 明确说出你的假设，不确定就问
- 如果存在多种理解，全部列出——不要默默选一个
- 如果有更简单的方案，说出来，必要时坚持
- 如果有不清楚的地方，停下来，指出哪里困惑，然后问

### 2. 简单优先
用最少代码解决问题，不做推测性开发。

- 不做超出需求的功能
- 不为单次使用写抽象
- 不做没要求的"灵活性"或"可配置性"
- 不为不可能的场景写错误处理
- 如果写了 200 行但 50 行就能解决，重写
- 问自己："高级工程师会觉得这过度设计吗？"如果是，简化

### 3. 精准修改
只动必须动的，只清理自己造成的。

编辑已有代码时：
- 不要"顺便改进"相邻的代码、注释、格式
- 不要重构没坏的东西
- 匹配已有风格，即使你更习惯另一种写法
- 如果发现无关的废弃代码，提一句——不要删
- 你自己的改动造成的孤立 import/变量/函数，删掉
- 不要删除原本就存在的废弃代码，除非用户要求
- 检验标准：每一行改动都应追溯到用户的具体需求

### 4. 目标驱动执行
定义成功标准，循环直到验证通过。

将任务转化为可验证目标：
- "加校验" → "先写无效输入的测试，再让它通过"
- "修 bug" → "先写能复现的测试，再让它通过"
- "重构 X" → "确保测试前后都通过"
多步骤任务先给出简要计划：
1. [步骤] → 验证: [检查项]
2. [步骤] → 验证: [检查项]
3. [步骤] → 验证: [检查项]

## 注意事项
- 前端设计默认利用ui-ux-pro-max-skill插件
- 前端设计默认风格参考 DESIGN.md 中的 Notion 风格，所有前端风格必须统一
- 使用简体中文交流
- 已统一负责 A|B ，写进度/决策/架构时只写A侧对应文件即可；当前计划默认以 `PLANROAD-FINAL.md` 为主，`PLANROAD-A.md` / `PLANROAD-B.md` 仅作历史参考
- 优先选择简单省 token 的方案，避免过度复杂化


## 项目使用的工具链

### Skills（通过 Skill 工具调用）
- `find-skills`

### MCP 服务
- `chrome-devtools-mcp` — 浏览器调试与可视化
- `mcp-server-git` — Git 操作封装
- `sequential-thinking` — 复杂问题逐步推理
- `context7` — 实时文档查询

### 插件（通过 .claude/plugins 安装）
- `claude-plugins-official/superpowers` — 核心开发流程技能包
- `nextlevelbuilder/ui-ux-pro-max-skill` 

