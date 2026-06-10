# ByteDance LabelHub

LabelHub 是一个面向多角色协作的数据标注与审核平台，覆盖任务发布、数据集导入、模板设计、标注执行、人工复审、AI 审核与结果导出等完整流程。

这个公开仓库是从原项目仓库整理出来的 `source-only monorepo` 版本，重点保留核心源码，适合做代码阅读、架构展示和项目说明。

## 仓库内容

当前公开仓库保留：

- `frontend/src/`：基于 React + TypeScript 的前端核心页面、角色工作台、模板渲染器与 API 调用逻辑
- `backend/app/`：基于 FastAPI + SQLAlchemy 的 API 服务、模型、路由、认证、审核与导出逻辑
- `aiagent/`：AI 审核与导出任务的异步执行模块

当前公开仓库不包含：

- `docs/`、设计文档、计划文档、接口契约
- `deploy/`、部署脚本、基础设施配置
- `.env`、运行时配置文件、依赖清单
- `datasets/` 示例数据
- `tests/`、`*.test.*`、mock 数据、缓存和生成文件

也就是说，测试文件没有传到这个公开仓库。

## 项目架构

总体结构如下：

```text
Browser
  -> Frontend (React)
      -> /api/v1/*
          -> Backend (FastAPI)
              -> MySQL
              -> Redis
                  -> Celery Worker (aiagent)
                      -> AI Provider (Qwen / DeepSeek)
```

运行关系：

1. 前端通过 `/api/v1` 调用后端接口。
2. 后端负责认证、任务编排、数据落库、审核流转与导出任务创建。
3. MySQL 保存用户、任务、模板、提交、审核、AI 审核和导出等业务数据。
4. Redis 作为异步任务队列和结果后端。
5. `aiagent/` 负责异步执行 AI 审核和导出任务。

## 主要业务流

- Owner 创建数据集、模板和任务，并配置 AI 审核参数。
- Labeler 领取任务并按模板完成标注提交。
- Reviewer 对提交进行人工审核，推动返修、复审和定稿。
- AI 审核链路异步执行，产出结构化评分、结论和审计信息。
- Owner 根据任务状态导出最终结果。

## 模块划分

### 前端

前端按角色拆分页面与工作台：

- `frontend/src/pages/owner/`：Owner 工作台，覆盖任务、模板、数据集、审核管理、导出
- `frontend/src/pages/labeler/`：Labeler 工作台，覆盖任务广场、我的任务、工作台、个人贡献
- `frontend/src/pages/reviewer/`：Reviewer 工作台，覆盖审核页和质量统计
- `frontend/src/pages/auth/`：登录页
- `frontend/src/features/renderer/`：模板渲染器、富文本和媒体渲染能力
- `frontend/src/router/`：角色菜单与访问守卫
- `frontend/src/services/api/`：API 请求封装和认证状态管理

### 后端

后端按典型分层组织：

- `backend/app/main.py`：FastAPI 入口
- `backend/app/api/routes/`：认证、数据集、任务、模板、提交、审核、导出、用户、工作台接口
- `backend/app/models.py`：核心业务模型
- `backend/app/services/`：认证、导入、审核、导出、AI 调用等领域服务
- `backend/app/core/`：配置、数据库、Celery 集成

### AI Worker

`aiagent/` 承载异步任务执行逻辑：

- `aiagent/services/ai_job_runner.py`：AI 审核任务执行
- `aiagent/services/export_job_runner.py`：导出任务执行
- `aiagent/services/ai_executor.py`：模型调用执行器
- `aiagent/services/ai_audit.py` / `ai_defaults.py`：AI 审核结构化处理与默认配置

## 核心数据模型

系统围绕以下实体组织：

- `User`：用户与角色
- `Dataset` / `DatasetItem`：数据集与样本
- `Task`：任务主实体
- `Template` / `TemplateVersion`：标注模板与版本
- `Assignment`：任务领取关系
- `Submission` / `SubmissionVersion`：提交结果与历史版本
- `ReviewRecord`：人工审核轨迹
- `AIAuditConfig` / `AIAuditJob` / `AIAuditResult`：AI 审核配置、任务与结果
- `ExportJob`：导出任务
- `AuditLog`：审计日志

这套模型的重点是：

- 模板和提交都保留版本化信息，支持多轮返修和复核
- AI 审核被建模为独立任务链路，便于重试、排队和审计追踪

## 关键设计取舍

### 角色分区优先

Owner、Labeler、Reviewer 分别拥有独立工作台，而不是堆在一个混合页面里。这样更利于权限边界和流程理解，但也会带来部分通用逻辑的抽象成本。

### AI 审核链路异步化

AI 审核没有直接塞进同步请求，而是拆成独立异步任务。这让系统更适合处理耗时模型调用，也便于后续扩展和任务追踪。

### 模板与提交版本化

模板设计器和标注提交都保留版本轨迹，这对返修、复审、抽检和审计非常关键，但会增加数据模型和查询逻辑复杂度。

## 公开版说明

这个仓库不是原始开发仓库的完整镜像，而是一个公开可分享的源码整理版，因此做了以下处理：

- 移除了文档、部署、数据样例、测试和运行配置
- 替换了默认数据库连接、Redis 地址、JWT secret 和演示密码
- 保留核心代码结构，便于阅读系统实现方式

如果后续要把它扩展成可直接运行的开源仓库，可以再补回：

- 依赖清单
- 环境变量模板
- 本地启动脚本
- 数据样例
- 自动化测试
