# LabelHub

LabelHub 是一个面向多角色协作的数据标注与审核平台，覆盖数据集导入、模板设计、任务发布、标注执行、人工审核、AI 预审、质量统计和结果导出等完整流程。

当前仓库是从原型项目中抽取出的 monorepo，按运行职责拆成前端、后端、异步任务和文档四个部分：

- `frontend/`：Vite + React + TypeScript 前端应用。
- `backend/`：FastAPI + SQLAlchemy 后端 API 服务。
- `aiagent/`：Celery Worker 侧的 AI 审核与导出任务执行逻辑。
- `docs/`：API 文档、AI Coding 过程记录、演示截图和补充说明。

## 项目架构

### 总体结构

```text
Browser
  -> Frontend (Vite / React / TypeScript)
      -> /api/v1/*
          -> Backend (FastAPI / SQLAlchemy)
              -> MySQL
              -> Redis
                  -> Celery Worker (aiagent)
                      -> AI Provider (Qwen / DeepSeek)
```

### 运行关系

1. 前端通过 `/api/v1` 调用后端接口，开发环境由 Vite proxy 转发到 `http://127.0.0.1:8765`。
2. 后端负责登录鉴权、资源权限、数据集导入、任务编排、模板管理、标注提交、审核流转、AI 审核触发和导出任务创建。
3. MySQL 保存业务主数据，包括用户、数据集、任务、模板、提交版本、审核记录、AI 审核结果、导出任务和审计日志。
4. Redis 作为 Celery broker 和 result backend，用于异步 AI 审核、异步导出等队列任务。
5. `aiagent/` 中的 Worker 消费后端创建的异步任务；本地联调时也可以通过配置切到 inline / eager 模式，减少额外进程。

### 主要业务流

- Owner 创建数据集、设计模板、发布任务，并配置 AI 审核参数。
- Labeler 领取任务，根据模板完成标注并提交结果。
- Reviewer 对提交结果进行人工审核，支持通过、拒绝、返修、多轮复审和定稿。
- AI 审核任务异步执行，产出结构化评分、问题说明、结论和原始响应留痕。
- Owner 查看任务进度、审核质量、标注员画像，并导出最终结果。

## 模块划分

### 前端模块

前端按角色拆分页面和工作台，核心目录如下：

- `frontend/src/pages/auth/`：登录页，包含演示账号快捷入口。
- `frontend/src/pages/owner/`：Owner 工作台。
- `frontend/src/pages/owner/dashboard/`：Owner 首页概览。
- `frontend/src/pages/owner/datasets/`：数据集列表、导入和详情。
- `frontend/src/pages/owner/tasks/`：任务列表、详情、分析、截止时间和 AI 配置。
- `frontend/src/pages/owner/templates/`：模板列表与模板设计器。
- `frontend/src/pages/owner/reviews/`：Owner 视角审核管理。
- `frontend/src/pages/owner/exports/`：导出任务管理。
- `frontend/src/pages/labeler/`：Labeler 工作台。
- `frontend/src/pages/labeler/dashboard/`：标注员概览。
- `frontend/src/pages/labeler/plaza/`：任务广场。
- `frontend/src/pages/labeler/workbench/`：标注工作台。
- `frontend/src/pages/labeler/LabelerMyTasksPage.tsx`：我的任务。
- `frontend/src/pages/labeler/MyContributionPage.tsx`：个人贡献。
- `frontend/src/pages/reviewer/`：Reviewer 工作台。
- `frontend/src/pages/reviewer/dashboard/`：审核员概览。
- `frontend/src/pages/reviewer/reviews/`：审核工作台。
- `frontend/src/pages/reviewer/ReviewerQualityStatsPage.tsx`：审核质量统计。
- `frontend/src/features/renderer/`：模板渲染器、富文本和媒体渲染能力。
- `frontend/src/layouts/`：统一应用框架与角色布局。
- `frontend/src/router/`：角色菜单、首页映射和路由守卫。
- `frontend/src/services/api/`：API 请求封装、token 存储、401 失效处理。
- `frontend/src/types/`：前端领域类型。
- `frontend/src/utils/`：时间、模板 schema、标注员能力等工具函数。

前端当前是单应用模式，没有拆成多个独立站点。角色隔离主要由路由分区、菜单配置和 `RoleGuard` 完成。

### 后端模块

后端采用 API、schema、service、model、core 的分层结构：

- `backend/app/main.py`：FastAPI 应用入口，启动时初始化数据库并注入演示账号。
- `backend/app/api/router.py`：统一挂载 API 路由。
- `backend/app/api/deps.py`：依赖注入、鉴权和演示用户解析。
- `backend/app/api/routes/auth.py`：登录与当前用户。
- `backend/app/api/routes/datasets.py`：数据集管理、导入和样本查询。
- `backend/app/api/routes/tasks.py`：任务创建、发布、领取、统计和配置。
- `backend/app/api/routes/templates.py`：模板与模板版本管理。
- `backend/app/api/routes/submissions.py`：标注提交、草稿、版本和 AI 审核触发。
- `backend/app/api/routes/reviews.py`：Reviewer 侧审核流。
- `backend/app/api/routes/owner_reviews.py`：Owner 侧审核管理。
- `backend/app/api/routes/exports.py`：导出任务创建、状态查询和下载。
- `backend/app/api/routes/users.py`：用户与审核员查询。
- `backend/app/api/routes/workbench.py`：标注工作台数据读取与保存。
- `backend/app/api/routes/health.py`：健康检查。
- `backend/app/models.py`：SQLAlchemy 业务模型。
- `backend/app/schemas/`：接口输入输出结构。
- `backend/app/services/`：认证、访问控制、数据集导入、AI 审核、导出、审计日志等领域服务。
- `backend/app/core/config.py`：环境变量配置。
- `backend/app/core/database.py`：数据库连接、建表、轻量 schema patch 和演示账号注入。
- `backend/app/core/celery_app.py`：后端侧 Celery 集成。

### AI Worker 模块

`aiagent/` 承载异步任务执行逻辑，和后端共享配置，但从 Web API 进程中拆出，便于独立部署和横向扩容。

- `aiagent/core/celery_app.py`：Celery 实例定义，注册 AI 审核与导出任务。
- `aiagent/services/ai_job_runner.py`：AI 审核任务执行入口。
- `aiagent/services/export_job_runner.py`：导出任务执行入口。
- `aiagent/services/ai_executor.py`：模型调用执行器。
- `aiagent/services/ai_audit.py`：AI 审核结果结构化处理。
- `aiagent/services/ai_defaults.py`：AI 审核默认提示词、维度和配置。
- `aiagent/services/llm_assist.py`：LLM 辅助能力封装。

### 文档模块

- `docs/api文档/labelhub-api.md`：接口契约文档。
- `docs/demo截图/`：首页、模板搭建台、标注工作台、审核工作台、AI 预审流水等演示截图。
- `docs/AI Coding过程记录/`：计划、设计、实现过程和阶段记录。
- `docs/技术文档.txt`：技术文档入口说明。
- `docs/演示环境说明.txt`：演示环境入口说明。

## 项目目录说明

```text
ByteDance-labelhub/
├─ aiagent/                  # Celery Worker 和异步任务执行逻辑
│  ├─ core/                  # Worker 配置入口
│  └─ services/              # AI 审核、导出、LLM 辅助等任务实现
├─ backend/                  # FastAPI 后端
│  └─ app/
│     ├─ api/                # API 路由与依赖
│     ├─ core/               # 配置、数据库、Celery
│     ├─ jobs/               # 后端任务相关代码
│     ├─ models/             # 模型拆分目录
│     ├─ schemas/            # API schema
│     ├─ services/           # 领域服务
│     ├─ main.py             # FastAPI 入口
│     └─ models.py           # 当前主业务模型集合
├─ docs/                     # API 文档、截图、过程记录
│     ├─ AI coing过程记录/    # AIcoidng过程记录
│     ├─ api文档/            # 配置、数据库、Celery
│     ├─ demo截图            # demo截图
│     ├─ 技术文档、演示环境说明   # 飞书链接
├─ frontend/                 # React 前端
│  └─ src/
│     ├─ components/         # 通用组件
│     ├─ features/           # 业务能力组件，如模板渲染器
│     ├─ layouts/            # 页面框架和角色布局
│     ├─ pages/              # 按角色拆分的页面
│     ├─ router/             # 路由菜单和守卫
│     ├─ services/           # API client
│     ├─ types/              # 类型定义
│     └─ utils/              # 工具函数
└─ README.md                 # 项目说明
```

当前抽取版本不应提交本地运行产物，例如 `.venv/`、`frontend/node_modules/`、`backend/.env`、数据库 volume、构建产物和日志文件。它们只在本地创建。

## 核心数据模型

系统围绕以下实体组织：

- `User`：用户与角色。
- `Dataset` / `DatasetItem`：数据集与样本。
- `Task`：任务主实体，关联数据集、模板、截止时间、奖励规则和 AI 审核配置。
- `Template` / `TemplateVersion`：标注模板及版本。
- `Assignment`：任务领取关系。
- `Submission` / `SubmissionVersion`：提交结果与历史版本。
- `ReviewRecord`：人工审核轨迹。
- `TaskReviewerAssignment`：任务与审核员的分配关系。
- `AIAuditConfig` / `AIAuditJob` / `AIAuditResult`：AI 审核配置、任务和结果。
- `ExportJob`：导出任务。
- `AuditLog`：审计日志。

这套模型有两个明显特点：

- 模板和提交都保留版本信息，方便返修、复审、抽检、导出和审计回溯。
- AI 审核被建模成独立任务链路，而不是直接写进提交表，便于排队、重试、状态追踪和原始响应留痕。

## 本地启动指引

### 环境要求

- Python 3.11 或以上。
- Node.js 18 或以上。
- Docker Desktop，或可用的 Docker / Docker Compose。
- Windows 推荐使用 PowerShell；macOS / Linux 可按手动启动命令执行。

### 首次启动前需要补齐的本地文件

当前仓库只提交核心源码和文档，不提交本地环境文件。首次启动前，需要在仓库根目录补齐这些文件：

- `backend/requirements.txt`：Python 依赖清单。
- `frontend/package.json`：前端依赖和脚本。
- `frontend/vite.config.ts`：Vite dev server 与 `/api` 代理。
- `docker-compose.yml`：本地 MySQL / Redis。
- `backend/.env.example`：后端环境变量模板。
- `start-dev.bat`：Windows 一键启动脚本，可选。

如果这些文件已经从原项目同步到仓库，可以直接进入下一步；如果没有，先把它们补齐再启动。


### 创建依赖环境

在仓库根目录执行：

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
npm install --prefix frontend
```

macOS / Linux：

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
npm install --prefix frontend
```

### 配置后端 `.env`

从模板创建本地配置：

```powershell
Copy-Item backend\.env.example backend\.env
```

如果没有 `.env.example`，可以手动创建 `backend/.env`，最少填下面这些字段就能启动：

```env
APP_NAME=LabelHub API
APP_ENV=development
API_PREFIX=/api/v1

MYSQL_HOST=127.0.0.1
MYSQL_PORT=13306
MYSQL_USER=root
MYSQL_PASSWORD=root
MYSQL_DATABASE=labelhub

REDIS_URL=redis://127.0.0.1:6379/0

JWT_SECRET_KEY=labelhub-local-dev-secret
JWT_EXPIRE_MINUTES=120

AI_PROVIDER=qwen
AI_TIMEOUT_SECONDS=90
AI_MAX_ATTEMPTS=2
AI_RUN_JOBS_INLINE=false
CELERY_TASK_ALWAYS_EAGER=false

DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com

QWEN_API_KEY=
QWEN_MODEL=qwen3.6-flash
QWEN_BASE_URL=https://dashscope.aliyuncs.com
```

最关键的是这几个字段：

- `MYSQL_HOST=127.0.0.1`：本地 Docker MySQL 地址。
- `MYSQL_PORT=13306`：`docker-compose.yml` 通常把容器内 `3306` 映射到本机 `13306`，不要误填成 `3306`。
- `MYSQL_USER=root`：本地默认用户。
- `MYSQL_PASSWORD=root`：本地默认密码。
- `MYSQL_DATABASE=labelhub`：本地默认数据库。
- `REDIS_URL=redis://127.0.0.1:6379/0`：Celery 队列地址。
- `JWT_SECRET_KEY=labelhub-local-dev-secret`：必须显式填一个非默认值，否则后端会拒绝在 development 环境启动。

AI 相关字段可以先留空：

- 只想把系统跑起来：`DEEPSEEK_API_KEY=` 和 `QWEN_API_KEY=` 可以为空。
- 需要联调 AI 审核：根据 `AI_PROVIDER` 填对应 key。
- 用 Qwen：填写 `AI_PROVIDER=qwen`、`QWEN_API_KEY=你的 Key`、`QWEN_BASE_URL=https://dashscope.aliyuncs.com`。
- 用 DeepSeek：填写 `AI_PROVIDER=deepseek`、`DEEPSEEK_API_KEY=你的 Key`、`DEEPSEEK_BASE_URL=https://api.deepseek.com`。

### 启动 MySQL 和 Redis

在仓库根目录执行：

```bash
docker compose up -d mysql redis
```

默认端口：

- MySQL：`127.0.0.1:13306`
- Redis：`127.0.0.1:6379`

### 启动后端 API

Windows PowerShell：

```powershell
.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8765
```

macOS / Linux：

```bash
source .venv/bin/activate
python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8765
```

后端首次启动会自动：

- 创建缺失表。
- 对已有表执行轻量 schema patch。
- 注入演示账号。

健康检查：

```bash
curl http://127.0.0.1:8765/api/v1/health
```

### 启动前端

```bash
npm run dev --prefix frontend
```

默认访问地址：

- 前端：`http://127.0.0.1:5173`
- 后端：`http://127.0.0.1:8765`

前端 API client 固定请求 `/api/v1`，需要确保 `frontend/vite.config.ts` 将 `/api` 代理到 `http://127.0.0.1:8765`。

### 启动 Celery Worker

如果需要异步 AI 审核或异步导出，再开一个终端执行：

Windows PowerShell：

```powershell
.venv\Scripts\Activate.ps1
python -m celery -A aiagent.core.celery_app.celery_app worker --loglevel=INFO --pool=solo
```

macOS / Linux：

```bash
source .venv/bin/activate
python -m celery -A aiagent.core.celery_app.celery_app worker --loglevel=INFO --pool=solo
```

如果只做本地页面和 API 联调，不想额外启动 Worker，可以在 `backend/.env` 中改成同步降级模式：

```env
AI_RUN_JOBS_INLINE=true
```

或：

```env
CELERY_TASK_ALWAYS_EAGER=true
```

### 演示账号

后端启动后会自动注入以下本地演示账号：

- Owner：`owner_demo / owner-demo-password`
- Labeler：`labeler_demo / labeler-demo-password`
- Labeler：`labeler_demo2 / labeler-demo2-password`
- Reviewer：`reviewer_demo / reviewer-demo-password`
- Reviewer：`reviewer_demo2 / reviewer-demo2-password`

## 关键设计取舍

### 1. 角色分区优先，而不是单页混合工作台

项目把 Owner、Labeler、Reviewer 拆成三套页面和路由。这样角色职责清晰，页面复杂度更容易控制，权限边界也能自然落在路由守卫和菜单层。

代价是部分通用能力需要抽象复用，跨角色流程联调时也要理解更多上下文。

### 2. 应用内轻量 schema patch，而不是先引入 Alembic

`backend/app/core/database.py` 在启动时会自动建表、补字段和补索引。这让开发阶段改表更快，新同学拉代码后更容易直接跑起来。

代价是数据库演进历史不可追踪，复杂变更不如标准迁移脚本可靠。如果后续进入多人长期协作或生产环境演进，建议补上 Alembic。

### 3. AI 审核链路独立成异步任务

AI 审核没有直接放在接口请求里同步执行，而是拆成 `AIAuditConfig -> AIAuditJob -> AIAuditResult` 的独立链路，并由 Celery Worker 消费。

这样做可以支持排队、重试、状态追踪、原始响应留痕和模型提供商替换。代价是本地启动链路更长，需要 Redis 和 Worker 配合，所以代码里保留了 inline / eager 降级模式。

### 4. 模板和提交都保留版本

模板设计器和标注提交都不是覆盖式更新，而是保留版本轨迹。标注业务里的返修、复审、抽检、导出和审计都依赖“当时提交的内容”，所以版本化是必要复杂度。

代价是数据模型、查询和导出逻辑更复杂，需要区分当前版本、最终版本和历史版本。

### 5. 前后端单仓协作

当前仓库把前端、后端、Worker 和文档放在一个 monorepo 中，便于一次提交覆盖端到端改动，也能降低接口、页面和文档错位的概率。

代价是仓库边界更宽，后续 CI/CD、权限控制、发布节奏需要团队约定得更清楚。

### 6. 演示友好优先，但保留生产演进空间

项目启动时自动注入演示账号，前端登录页也提供演示账号快捷入口，降低本地演示和评审成本。

代价是生产部署前必须收紧默认配置，包括关闭演示账号注入、替换 JWT secret、配置真实数据库、补齐迁移机制，并将 AI key 交给密钥管理系统托管。

## 常用检查命令

查看后端健康状态：

```bash
curl http://127.0.0.1:8765/api/v1/health
```

查看 Docker 依赖状态：

```bash
docker compose ps
```

查看 MySQL / Redis 日志：

```bash
docker compose logs mysql --tail=100
docker compose logs redis --tail=100
```

查看本地端口占用：

```powershell
netstat -ano | findstr ":8765"
netstat -ano | findstr ":5173"
netstat -ano | findstr ":6379"
netstat -ano | findstr ":13306"
```
