# LabelHub Stage0+Stage1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补全 A/B 两侧阶段 0 剩余工作，完成阶段 1 全部工作，并在本地跑通“数据集导入 → 建任务 → 多题作答 → 审核 → 导出”的真实链路。

**Architecture:** 在现有 MVP 基线上做最小侵入升级：后端新增数据集与多题任务模型，前端将 Designer 升级为三栏布局并抽出共用 Renderer，同时把 Labeler 工作台升级为多题视角。保持既有 AI 决策映射、JSON/CSV 优先和简单状态机，不提前引入阶段 2 之后的异步队列、多级审核或复杂联动能力。

**Tech Stack:** React、TypeScript、Vite、Vitest、FastAPI、SQLAlchemy、Pydantic、MySQL、pytest、dnd-kit

---

## 0. 范围与执行约束

### 0.1 本计划覆盖范围
- A 阶段 0 剩余：演示数据初始化入口说明 / 联动
- B 阶段 0 剩余：AI 调用日志、seed demo 脚本
- A 阶段 1：Designer 三栏、拖拽、新组件、Renderer 共用、多题 Workbench、页面测试与 UX 收口
- B 阶段 1：datasets / dataset_items、多题模型、JSON / JSONL / Excel 导入、预览/分页/搜索、聚合状态、兼容/迁移与测试

### 0.2 执行约束
- 主进程只编排，不直接改业务代码
- 仅 `labelhub-dev-agent` 允许改业务代码
- 本轮按当前主提示词约束执行：所有开发修改都直接落在**主工作区**，不再创建新的隔离 worktree
- 若后续用户再次明确允许隔离 worktree，开发 Agent 也只能产出候选改动，必须先回收到主工作区，测试、文档、本地运行验证才能继续
- 测试、文档、本地运行验证只能在主工作区执行
- 每一轮必须先测试再进入下一轮
- 连续 2 轮任务 FAIL / BLOCKED，停止自动执行并汇报
- 若计划路径与真实仓库结构不一致，以真实仓库结构为准，先更新任务描述，再实现，不得为迎合计划路径做结构性重构

---

## 1. 文件结构规划

### 1.1 后端
**Create:**
- `backend/app/models/dataset.py` — 数据集与数据项模型
- `backend/app/schemas/dataset.py` — 数据集导入、预览、列表、任务绑定 schema
- `backend/app/services/dataset_import_service.py` — JSON / JSONL / Excel 导入解析与错误报告
- `backend/app/services/dataset_service.py` — 数据集查询、分页、搜索、预览
- `backend/app/api/routes/datasets.py` — 数据集接口
- `backend/tests/test_datasets_api.py` — 数据集导入与查询测试
- `backend/tests/test_dataset_import_service.py` — 导入解析单测
- `backend/scripts/seed_demo_data.py` — 演示数据 seed 脚本

**Modify:**
- `backend/app/models/task.py` — 增加任务绑定数据集字段
- `backend/app/models/submission.py` — 升级为 item 级提交与状态
- `backend/app/models/assignment.py` — 适配多题任务聚合
- `backend/app/api/routes/tasks.py` — 任务创建/详情支持数据集绑定与聚合进度
- `backend/app/api/routes/workbench.py` — 返回 item 列表、分页、状态与聚合信息
- `backend/app/api/routes/submissions.py` — item 级草稿/提交接口
- `backend/app/api/routes/reviews.py` — 审核详情适配 item 级数据
- `backend/app/api/routes/exports.py` — 导出聚合 item 级结果
- `backend/app/services/ai_executor.py` — 写入 AI 调用日志
- `backend/app/models/audit.py` 或现有日志模型文件 — 增加 AI 调用日志字段或独立表
- `backend/app/main.py` — 注册 datasets 路由
- `backend/tests/test_tasks_api.py`
- `backend/tests/test_workbench_api.py`
- `backend/tests/test_submissions_api.py`
- `backend/tests/test_reviews_api.py`
- `backend/tests/test_export_contract.py`

### 1.2 前端
**Create:**
- `frontend/src/features/designer/DesignerShell.tsx` — 三栏布局壳层
- `frontend/src/features/designer/MaterialPalette.tsx` — 左侧物料区
- `frontend/src/features/designer/CanvasList.tsx` — 中间画布区
- `frontend/src/features/designer/PropertyPanel.tsx` — 右侧属性面板
- `frontend/src/features/designer/dnd.ts` — 拖拽排序辅助逻辑
- `frontend/src/features/renderer/Renderer.tsx` — 预览/作答共用 Renderer
- `frontend/src/features/renderer/renderers/RichTextBlock.tsx`
- `frontend/src/features/renderer/renderers/JsonEditorField.tsx`
- `frontend/src/features/renderer/renderers/FileUploadField.tsx`
- `frontend/src/features/renderer/renderers/LlmInteractionField.tsx`
- `frontend/src/pages/labeler/MyContributionPage.tsx`
- `frontend/src/services/api/datasets.ts` — 数据集接口封装
- `frontend/src/types/dataset.ts` — 数据集与多题工作台类型
- `frontend/src/test/designer/DesignerShell.test.tsx`
- `frontend/src/test/renderer/Renderer.test.tsx`
- `frontend/src/test/workbench/MultiItemWorkbench.test.tsx`

**Modify:**
- `frontend/src/pages/owner/templates/*` — 替换为三栏 Designer，接入新组件
- `frontend/src/pages/labeler/workbench/*` — 升级为多题工作台
- `frontend/src/pages/labeler/plaza/*` — 展示多题任务聚合状态
- `frontend/src/pages/reviewer/*` — 适配 item 级审核视角与更清晰 AI / 打回展示
- `frontend/src/pages/owner/tasks/*` — 创建任务支持绑定数据集
- `frontend/src/pages/owner/exports/*` — 展示 item 聚合导出结果
- `frontend/src/App.tsx` 或现有路由入口 — 接入 `MyContributionPage` 与角色信息架构沉淀
- `frontend/src/layouts/*` 或角色 layout 配置文件 — 收敛到 `AppFrame + role layout + role menu config`
- `frontend/src/services/api/tasks.ts`
- `frontend/src/services/api/submissions.ts`
- `frontend/src/services/api/reviews.ts`
- `frontend/src/types/template.ts`
- `frontend/src/types/submission.ts`

### 1.3 文档
**Modify:**
- `PLANROAD-A.md`
- `PLANROAD-B.md`
- `.claude/context/progress-A.md`
- `.claude/context/decisions-A.md`
- `.claude/context/architecture-A.md`
- `docs/api-contracts/labelhub-v1.md`
- `README.md`
- `docs/demo-script.md`

---

## 2. 任务拆分

### Task 1: 为后端补齐数据集模型与导入测试底座（按真实仓库结构落地）

**Files:**
- Modify: `backend/app/models.py`
- Create: `backend/app/schemas/dataset.py`
- Create: `backend/app/services/dataset_import.py`
- Create: `backend/tests/test_dataset_import_service.py`
- Modify: `backend/app/core/database.py`（仅当模型注册确实需要时）

- [ ] **Step 1: 写导入服务失败测试，固定三种输入格式的最小目标**

```python
from backend.app.services.dataset_import_service import parse_dataset_payload


def test_parse_json_dataset_payload_returns_items():
    payload = {
        "name": "qa_quality",
        "items": [
            {"external_id": "q1", "source": {"title": "A"}},
            {"external_id": "q2", "source": {"title": "B"}},
        ],
    }

    result = parse_dataset_payload("json", payload)

    assert result.dataset_name == "qa_quality"
    assert len(result.items) == 2
    assert result.items[0].external_id == "q1"


def test_parse_jsonl_dataset_payload_returns_items():
    payload = '{"external_id":"q1","source":{"title":"A"}}\n{"external_id":"q2","source":{"title":"B"}}'

    result = parse_dataset_payload("jsonl", payload)

    assert result.dataset_name == "imported-jsonl-dataset"
    assert len(result.items) == 2


def test_parse_unsupported_dataset_payload_raises_error():
    try:
        parse_dataset_payload("csv", "bad")
        assert False, "expected ValueError"
    except ValueError as exc:
        assert "Unsupported dataset format" in str(exc)
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pytest backend/tests/test_dataset_import_service.py -v`
Expected: FAIL，提示 `dataset_import_service` 或 `parse_dataset_payload` 不存在

- [ ] **Step 3: 新建最小数据集模型与 schema**

```python
from sqlalchemy import JSON, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Dataset(Base):
    __tablename__ = "datasets"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_format: Mapped[str] = mapped_column(String(20), nullable=False)

    items: Mapped[list["DatasetItem"]] = relationship(
        back_populates="dataset",
        cascade="all, delete-orphan",
    )


class DatasetItem(Base):
    __tablename__ = "dataset_items"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    dataset_id: Mapped[int] = mapped_column(ForeignKey("datasets.id"), nullable=False)
    external_id: Mapped[str] = mapped_column(String(120), nullable=False)
    source: Mapped[dict] = mapped_column(JSON, nullable=False)
    answer_hint: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    dataset: Mapped[Dataset] = relationship(back_populates="items")
```

```python
from pydantic import BaseModel


class ImportedDatasetItem(BaseModel):
    external_id: str
    source: dict
    answer_hint: dict | None = None
    sort_order: int


class ParsedDatasetPayload(BaseModel):
    dataset_name: str
    source_format: str
    items: list[ImportedDatasetItem]
```

- [ ] **Step 4: 写最小导入解析实现**

```python
import json
from types import SimpleNamespace

from app.schemas.dataset import ImportedDatasetItem, ParsedDatasetPayload


def parse_dataset_payload(source_format: str, payload):
    if source_format == "json":
        items = [
            ImportedDatasetItem(
                external_id=item["external_id"],
                source=item["source"],
                answer_hint=item.get("answer_hint"),
                sort_order=index,
            )
            for index, item in enumerate(payload["items"])
        ]
        return ParsedDatasetPayload(
            dataset_name=payload["name"],
            source_format="json",
            items=items,
        )

    if source_format == "jsonl":
        lines = [line for line in payload.splitlines() if line.strip()]
        items = []
        for index, line in enumerate(lines):
            data = json.loads(line)
            items.append(
                ImportedDatasetItem(
                    external_id=data["external_id"],
                    source=data["source"],
                    answer_hint=data.get("answer_hint"),
                    sort_order=index,
                )
            )
        return ParsedDatasetPayload(
            dataset_name="imported-jsonl-dataset",
            source_format="jsonl",
            items=items,
        )

    raise ValueError(f"Unsupported dataset format: {source_format}")
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pytest backend/tests/test_dataset_import_service.py -v`
Expected: PASS，3 passed

- [ ] **Step 6: 提交**

```bash
git add backend/app/models/dataset.py backend/app/schemas/dataset.py backend/app/services/dataset_import_service.py backend/tests/test_dataset_import_service.py backend/app/models/__init__.py
git commit -m "feat: add dataset import model baseline"
```

### Task 2: 为后端补齐 datasets API、预览、分页、搜索与 Excel 导入路径

**Files:**
- Create: `backend/app/services/dataset_service.py`
- Create: `backend/app/api/routes/datasets.py`
- Create: `backend/tests/test_datasets_api.py`
- Modify: `backend/app/main.py`
- Modify: `backend/app/services/dataset_import_service.py`

- [ ] **Step 1: 写 datasets API 失败测试**

```python
def test_create_dataset_from_json(client):
    response = client.post(
        "/datasets/import",
        json={
            "name": "qa_quality",
            "sourceFormat": "json",
            "payload": {
                "name": "qa_quality",
                "items": [{"external_id": "q1", "source": {"title": "A"}}],
            },
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["dataset"]["name"] == "qa_quality"
    assert body["summary"]["itemCount"] == 1


def test_list_datasets_with_search(client):
    response = client.get("/datasets", params={"q": "qa", "page": 1, "pageSize": 10})
    assert response.status_code == 200
    assert "items" in response.json()


def test_preview_dataset_items(client):
    response = client.get("/datasets/1/items", params={"page": 1, "pageSize": 20})
    assert response.status_code == 200
    assert "items" in response.json()
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pytest backend/tests/test_datasets_api.py -v`
Expected: FAIL，提示 `/datasets` 路由不存在

- [ ] **Step 3: 扩展导入服务支持 Excel 最小路径**

```python
from io import BytesIO

import openpyxl


def parse_excel_dataset_payload(file_bytes: bytes, dataset_name: str):
    workbook = openpyxl.load_workbook(BytesIO(file_bytes))
    sheet = workbook.active
    items = []

    for index, row in enumerate(sheet.iter_rows(min_row=2, values_only=True)):
        external_id, title, content = row[:3]
        items.append(
            ImportedDatasetItem(
                external_id=str(external_id),
                source={"title": title, "content": content},
                answer_hint=None,
                sort_order=index,
            )
        )

    return ParsedDatasetPayload(
        dataset_name=dataset_name,
        source_format="excel",
        items=items,
    )
```

- [ ] **Step 4: 实现 datasets service 与路由**

```python
@router.post("/datasets/import", status_code=201)
def import_dataset(payload: DatasetImportRequest, db: Session = Depends(get_db)):
    parsed = import_dataset_payload(payload)
    dataset = create_dataset_with_items(db, parsed)
    return {
        "dataset": {"id": dataset.id, "name": dataset.name, "sourceFormat": dataset.source_format},
        "summary": {"itemCount": len(dataset.items)},
    }


@router.get("/datasets")
def list_datasets(q: str | None = None, page: int = 1, pageSize: int = 10, db: Session = Depends(get_db)):
    items, total = query_datasets(db, q=q, page=page, page_size=pageSize)
    return {
        "items": [serialize_dataset_summary(item) for item in items],
        "pagination": {"page": page, "pageSize": pageSize, "total": total},
    }


@router.get("/datasets/{dataset_id}/items")
def list_dataset_items(dataset_id: int, page: int = 1, pageSize: int = 20, db: Session = Depends(get_db)):
    items, total = query_dataset_items(db, dataset_id=dataset_id, page=page, page_size=pageSize)
    return {
        "items": [serialize_dataset_item(item) for item in items],
        "pagination": {"page": page, "pageSize": pageSize, "total": total},
    }
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pytest backend/tests/test_datasets_api.py -v`
Expected: PASS，3 passed

- [ ] **Step 6: 提交**

```bash
git add backend/app/api/routes/datasets.py backend/app/services/dataset_service.py backend/app/services/dataset_import_service.py backend/tests/test_datasets_api.py backend/app/main.py
git commit -m "feat: add dataset import and browse api"
```

### Task 3: 让任务、工作台、提交模型支持多题任务

**Files:**
- Modify: `backend/app/models/task.py`
- Modify: `backend/app/models/assignment.py`
- Modify: `backend/app/models/submission.py`
- Modify: `backend/app/api/routes/tasks.py`
- Modify: `backend/app/api/routes/workbench.py`
- Modify: `backend/app/api/routes/submissions.py`
- Test: `backend/tests/test_tasks_api.py`
- Test: `backend/tests/test_workbench_api.py`
- Test: `backend/tests/test_submissions_api.py`

- [ ] **Step 1: 写多题任务失败测试**

```python
def test_create_task_with_dataset_binding(client, owner_token, dataset_id):
    response = client.post(
        "/tasks",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "title": "QA Task",
            "description": "demo",
            "datasetId": dataset_id,
            "templateId": 1,
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["datasetId"] == dataset_id
    assert body["itemCount"] == 3


def test_workbench_returns_item_list(client, labeler_token, published_task_id):
    response = client.get(
        f"/workbench/tasks/{published_task_id}",
        headers={"Authorization": f"Bearer {labeler_token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body["items"]) == 3
    assert body["progress"]["total"] == 3


def test_save_draft_for_specific_item(client, labeler_token, submission_id):
    response = client.post(
        "/submissions/draft",
        headers={"Authorization": f"Bearer {labeler_token}"},
        json={"submissionId": submission_id, "answers": {"summary": "draft"}},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "draft"
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pytest backend/tests/test_tasks_api.py backend/tests/test_workbench_api.py backend/tests/test_submissions_api.py -v`
Expected: FAIL，缺少 `datasetId` / `itemCount` / `items` / item 级 submission 能力

- [ ] **Step 3: 调整模型最小字段**

```python
class Task(Base):
    dataset_id: Mapped[int | None] = mapped_column(ForeignKey("datasets.id"), nullable=True)


class Assignment(Base):
    progress_total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    progress_completed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class Submission(Base):
    dataset_item_id: Mapped[int] = mapped_column(ForeignKey("dataset_items.id"), nullable=False)
    answers: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
```

- [ ] **Step 4: 最小实现任务绑定、工作台聚合与 item 级草稿接口**

```python
# tasks route
return {
    "id": task.id,
    "title": task.title,
    "datasetId": task.dataset_id,
    "itemCount": len(task.dataset.items) if task.dataset else 0,
}

# workbench route
return {
    "taskId": task.id,
    "items": [
        {
            "submissionId": submission.id,
            "datasetItemId": submission.dataset_item_id,
            "status": submission.status,
            "source": submission.dataset_item.source,
            "answers": submission.answers,
        }
        for submission in submissions
    ],
    "progress": {
        "total": len(submissions),
        "completed": len([s for s in submissions if s.status == "review_passed"]),
    },
}

# submissions draft route
submission.answers = payload.answers
submission.status = "draft"
db.commit()
return {"id": submission.id, "status": submission.status, "answers": submission.answers}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pytest backend/tests/test_tasks_api.py backend/tests/test_workbench_api.py backend/tests/test_submissions_api.py -v`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add backend/app/models/task.py backend/app/models/assignment.py backend/app/models/submission.py backend/app/api/routes/tasks.py backend/app/api/routes/workbench.py backend/app/api/routes/submissions.py backend/tests/test_tasks_api.py backend/tests/test_workbench_api.py backend/tests/test_submissions_api.py
git commit -m "feat: support dataset-backed multi-item workbench"
```

### Task 4: 补齐 AI 调用日志、seed demo 脚本与多题导出/审核回归

**Files:**
- Create: `backend/scripts/seed_demo_data.py`
- Modify: `backend/app/services/ai_executor.py`
- Modify: `backend/app/api/routes/reviews.py`
- Modify: `backend/app/api/routes/exports.py`
- Test: `backend/tests/test_reviews_api.py`
- Test: `backend/tests/test_export_contract.py`

- [ ] **Step 1: 写 AI 调用日志与导出聚合失败测试**

```python
def test_ai_executor_logs_provider_and_decision(db_session):
    result = run_ai_executor_for_test(db_session, answers={"summary": "ok"})
    assert result.decision in {"pass", "reject", "human_review"}

    log = db_session.query(AuditLog).filter(AuditLog.event_type == "ai_call_logged").one()
    assert log.payload["provider"]
    assert log.payload["model"]
    assert "durationMs" in log.payload
    assert log.payload["decision"] == result.decision


def test_export_contains_multi_item_answers(client, owner_token, review_passed_task_id):
    response = client.post(
        f"/exports/tasks/{review_passed_task_id}/complete",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"format": "json"},
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body["content"]["items"]) >= 2
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pytest backend/tests/test_reviews_api.py backend/tests/test_export_contract.py -v`
Expected: FAIL，缺少 `ai_call_logged` 或多题导出聚合

- [ ] **Step 3: 在 AI executor 写最小调用日志**

```python
started_at = time.perf_counter()
result = executor.run(payload)
duration_ms = int((time.perf_counter() - started_at) * 1000)
write_audit_log(
    db,
    event_type="ai_call_logged",
    actor_id=submission.user_id,
    entity_type="submission",
    entity_id=submission.id,
    payload={
        "provider": settings.ai_provider,
        "model": settings.deepseek_model,
        "durationMs": duration_ms,
        "decision": result.decision,
    },
)
```

- [ ] **Step 4: 增加 seed demo 脚本与多题导出聚合**

```python
# seed_demo_data.py
if __name__ == "__main__":
    create_demo_users()
    dataset = create_demo_dataset("qa_quality")
    template = create_demo_template()
    task = create_demo_task(dataset_id=dataset.id, template_id=template.id)
    create_demo_submissions(task_id=task.id, dataset=dataset)
    create_demo_reviews(task_id=task.id)
    print({"taskId": task.id, "datasetId": dataset.id, "seeded": True})
```

```python
# exports route/service
content = {
    "taskId": task.id,
    "items": [
        {
            "datasetItemId": submission.dataset_item_id,
            "source": submission.dataset_item.source,
            "answers": submission.answers,
            "aiDecision": submission.ai_result.decision if submission.ai_result else None,
            "reviewDecision": submission.latest_review.decision if submission.latest_review else None,
            "submissionStatus": submission.status,
        }
        for submission in submissions
    ],
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pytest backend/tests/test_reviews_api.py backend/tests/test_export_contract.py -v`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add backend/app/services/ai_executor.py backend/app/api/routes/reviews.py backend/app/api/routes/exports.py backend/tests/test_reviews_api.py backend/tests/test_export_contract.py backend/scripts/seed_demo_data.py
git commit -m "feat: add ai call logs and multi-item export seed flow"
```

### Task 5: 为前端增加数据集类型、接口与任务创建绑定能力

**Files:**
- Create: `frontend/src/services/api/datasets.ts`
- Create: `frontend/src/types/dataset.ts`
- Modify: `frontend/src/services/api/tasks.ts`
- Modify: `frontend/src/pages/owner/tasks/*`
- Test: `frontend/src/test/owner/TaskCreatePage.test.tsx`

- [ ] **Step 1: 写任务创建绑定数据集失败测试**

```tsx
it('submits selected dataset id when creating a task', async () => {
  render(<TaskCreatePage />)

  await user.type(screen.getByLabelText('任务标题'), 'QA Task')
  await user.selectOptions(screen.getByLabelText('数据集'), '3')
  await user.click(screen.getByRole('button', { name: '创建任务' }))

  expect(createTaskMock).toHaveBeenCalledWith(
    expect.objectContaining({ datasetId: 3 })
  )
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test --prefix frontend -- TaskCreatePage.test.tsx`
Expected: FAIL，页面无数据集选择或 API 未提交 `datasetId`

- [ ] **Step 3: 增加数据集类型与接口封装**

```ts
export interface DatasetSummary {
  id: number
  name: string
  sourceFormat: 'json' | 'jsonl' | 'excel'
  itemCount: number
}

export async function listDatasets(params?: { q?: string }) {
  const response = await apiClient.get('/datasets', { params })
  return response.data
}
```

- [ ] **Step 4: 在任务创建页接入数据集下拉并提交 `datasetId`**

```tsx
<Select
  label="数据集"
  value={form.datasetId ?? ''}
  onChange={(event) => setForm((prev) => ({ ...prev, datasetId: Number(event.target.value) }))}
>
  <option value="">请选择数据集</option>
  {datasets.map((dataset) => (
    <option key={dataset.id} value={dataset.id}>
      {dataset.name}（{dataset.itemCount} 题）
    </option>
  ))}
</Select>
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm run test --prefix frontend -- TaskCreatePage.test.tsx`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add frontend/src/services/api/datasets.ts frontend/src/types/dataset.ts frontend/src/services/api/tasks.ts frontend/src/pages/owner/tasks frontend/src/test/owner/TaskCreatePage.test.tsx
git commit -m "feat: bind dataset in owner task creation"
```

### Task 6: 将模板设计器升级为三栏布局并接入拖拽排序

**Files:**
- Create: `frontend/src/features/designer/DesignerShell.tsx`
- Create: `frontend/src/features/designer/MaterialPalette.tsx`
- Create: `frontend/src/features/designer/CanvasList.tsx`
- Create: `frontend/src/features/designer/PropertyPanel.tsx`
- Create: `frontend/src/features/designer/dnd.ts`
- Test: `frontend/src/test/designer/DesignerShell.test.tsx`
- Modify: `frontend/src/pages/owner/templates/*`

- [ ] **Step 1: 写三栏布局与排序失败测试**

```tsx
it('renders three-column designer and reorders blocks', async () => {
  render(<TemplateDesignerPage />)

  expect(screen.getByText('组件物料')).toBeInTheDocument()
  expect(screen.getByText('模板画布')).toBeInTheDocument()
  expect(screen.getByText('属性设置')).toBeInTheDocument()

  const orders = screen.getAllByTestId('canvas-item-order')
  expect(orders[0]).toHaveTextContent('1')
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test --prefix frontend -- DesignerShell.test.tsx`
Expected: FAIL，页面仍是旧布局

- [ ] **Step 3: 创建最小三栏壳层与拖拽辅助函数**

```tsx
export function DesignerShell({ palette, canvas, panel }: DesignerShellProps) {
  return (
    <div className="grid grid-cols-[280px_minmax(0,1fr)_320px] gap-4">
      <aside>{palette}</aside>
      <main>{canvas}</main>
      <aside>{panel}</aside>
    </div>
  )
}
```

```ts
export function reorderFields<T>(items: T[], activeIndex: number, overIndex: number) {
  const next = [...items]
  const [moved] = next.splice(activeIndex, 1)
  next.splice(overIndex, 0, moved)
  return next
}
```

- [ ] **Step 4: 将模板页接到新壳层并最小接入 dnd-kit**

```tsx
<DndContext onDragEnd={handleDragEnd}>
  <DesignerShell
    palette={<MaterialPalette components={componentOptions} onAdd={handleAddField} />}
    canvas={<CanvasList fields={fields} selectedFieldId={selectedFieldId} onSelect={setSelectedFieldId} />}
    panel={<PropertyPanel field={selectedField} onChange={handleFieldChange} />}
  />
</DndContext>
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm run test --prefix frontend -- DesignerShell.test.tsx`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add frontend/src/features/designer frontend/src/pages/owner/templates frontend/src/test/designer/DesignerShell.test.tsx
git commit -m "feat: upgrade template designer to three-column layout"
```

### Task 7: 为 Renderer 增加富文本、JSON、上传、LLM 组件并复用到预览与作答

**Files:**
- Create: `frontend/src/features/renderer/Renderer.tsx`
- Create: `frontend/src/features/renderer/renderers/RichTextBlock.tsx`
- Create: `frontend/src/features/renderer/renderers/JsonEditorField.tsx`
- Create: `frontend/src/features/renderer/renderers/FileUploadField.tsx`
- Create: `frontend/src/features/renderer/renderers/LlmInteractionField.tsx`
- Test: `frontend/src/test/renderer/Renderer.test.tsx`
- Modify: `frontend/src/pages/owner/templates/*`
- Modify: `frontend/src/pages/labeler/workbench/*`
- Modify: `frontend/src/types/template.ts`

- [ ] **Step 1: 写 Renderer 复用失败测试**

```tsx
it('renders rich text, json, upload and llm blocks in shared renderer', () => {
  render(
    <Renderer
      schema={[
        { type: 'rich_text', label: '说明', field: 'intro', content: '<b>Hello</b>' },
        { type: 'json_editor', label: 'JSON', field: 'payload' },
        { type: 'file_upload', label: '附件', field: 'attachments', maxCount: 2 },
        { type: 'llm_interaction', label: 'AI 参考', field: 'aiDraft' },
      ]}
      mode="preview"
      values={{}}
    />
  )

  expect(screen.getByText('说明')).toBeInTheDocument()
  expect(screen.getByLabelText('JSON')).toBeInTheDocument()
  expect(screen.getByText('上传附件')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '生成 AI 建议' })).toBeInTheDocument()
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test --prefix frontend -- Renderer.test.tsx`
Expected: FAIL，缺少新组件类型与共用 Renderer

- [ ] **Step 3: 定义新 schema 类型**

```ts
export type TemplateFieldType =
  | 'text'
  | 'textarea'
  | 'single_select'
  | 'multi_select'
  | 'tag_select'
  | 'image_upload'
  | 'show_item'
  | 'rich_text'
  | 'json_editor'
  | 'file_upload'
  | 'llm_interaction'
```

- [ ] **Step 4: 实现最小共用 Renderer**

```tsx
export function Renderer({ schema, mode, values, onChange }: RendererProps) {
  return (
    <div className="space-y-4">
      {schema.map((field) => {
        switch (field.type) {
          case 'rich_text':
            return <RichTextBlock key={field.field} field={field} />
          case 'json_editor':
            return <JsonEditorField key={field.field} field={field} value={values[field.field]} onChange={onChange} />
          case 'file_upload':
            return <FileUploadField key={field.field} field={field} value={values[field.field]} onChange={onChange} />
          case 'llm_interaction':
            return <LlmInteractionField key={field.field} field={field} value={values[field.field]} onChange={onChange} />
          default:
            return renderLegacyField(field, mode, values, onChange)
        }
      })}
    </div>
  )
}
```

- [ ] **Step 5: 让模板预览与 Labeler 作答都改用 `Renderer`**

Run code sketch:

```tsx
<Renderer schema={templateSchema} mode="preview" values={previewValues} />
<Renderer schema={templateSchema} mode="answer" values={answers} onChange={handleAnswerChange} />
```

- [ ] **Step 6: 运行测试确认通过**

Run: `npm run test --prefix frontend -- Renderer.test.tsx`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add frontend/src/features/renderer frontend/src/pages/owner/templates frontend/src/pages/labeler/workbench frontend/src/types/template.ts frontend/src/test/renderer/Renderer.test.tsx
git commit -m "feat: share renderer across preview and workbench"
```

### Task 8: 将 Labeler Workbench 升级为多题工作台并补交互反馈

**Files:**
- Modify: `frontend/src/pages/labeler/workbench/*`
- Modify: `frontend/src/services/api/submissions.ts`
- Modify: `frontend/src/types/submission.ts`
- Test: `frontend/src/test/workbench/MultiItemWorkbench.test.tsx`

- [ ] **Step 1: 写多题工作台失败测试**

```tsx
it('switches between items and shows progress summary', async () => {
  render(<LabelerWorkbenchPage />)

  expect(await screen.findByText('第 1 / 3 题')).toBeInTheDocument()
  expect(screen.getByText('已完成 1 / 3')).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: '下一题' }))
  expect(screen.getByText('第 2 / 3 题')).toBeInTheDocument()
})

it('shows reject reason and resubmit guidance', async () => {
  render(<LabelerWorkbenchPage />)
  expect(await screen.findByText('打回原因')).toBeInTheDocument()
  expect(screen.getByText('请基于原答案修改后重新提交')).toBeInTheDocument()
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test --prefix frontend -- MultiItemWorkbench.test.tsx`
Expected: FAIL，页面仍是单题或缺少聚合进度

- [ ] **Step 3: 扩展 workbench 类型与 API**

```ts
export interface WorkbenchItem {
  submissionId: number
  datasetItemId: number
  status: 'draft' | 'submitted' | 'needs_revision' | 'review_passed'
  source: Record<string, unknown>
  answers: Record<string, unknown>
  rejectReason?: string
}

export interface WorkbenchPayload {
  taskId: number
  items: WorkbenchItem[]
  progress: { total: number; completed: number }
}
```

- [ ] **Step 4: 在页面中实现题号导航、状态、切题与提交前汇总**

```tsx
<p>{`第 ${activeIndex + 1} / ${items.length} 题`}</p>
<p>{`已完成 ${progress.completed} / ${progress.total}`}</p>
<button onClick={() => setActiveIndex((prev) => Math.max(prev - 1, 0))}>上一题</button>
<button onClick={() => setActiveIndex((prev) => Math.min(prev + 1, items.length - 1))}>下一题</button>
```

- [ ] **Step 5: 补空态、失败提示与打回提示**

```tsx
{activeItem.rejectReason ? (
  <Alert tone="warning" title="打回原因">
    <p>{activeItem.rejectReason}</p>
    <p>请基于原答案修改后重新提交</p>
  </Alert>
) : null}
```

- [ ] **Step 6: 运行测试确认通过**

Run: `npm run test --prefix frontend -- MultiItemWorkbench.test.tsx`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add frontend/src/pages/labeler/workbench frontend/src/services/api/submissions.ts frontend/src/types/submission.ts frontend/src/test/workbench/MultiItemWorkbench.test.tsx
git commit -m "feat: add multi-item labeler workbench"
```

### Task 9: 收口角色信息架构、我的贡献页、Reviewer 展示与演示入口联动

**Files:**
- Create: `frontend/src/pages/labeler/MyContributionPage.tsx`
- Modify: `frontend/src/App.tsx` 或路由入口
- Modify: `frontend/src/layouts/*`
- Modify: `frontend/src/pages/reviewer/*`
- Modify: `frontend/src/pages/owner/*`（演示数据入口说明/联动）
- Test: `frontend/src/test/reviewer/ReviewerDetailPage.test.tsx`

- [ ] **Step 1: 写 Reviewer 展示与我的贡献页失败测试**

```tsx
it('shows ai summary cards and reject reason clearly', async () => {
  render(<ReviewerDetailPage />)
  expect(await screen.findByText('AI 审核结论')).toBeInTheDocument()
  expect(screen.getByText('打回理由')).toBeInTheDocument()
})

it('renders my contribution page in labeler menu', async () => {
  render(<App />)
  expect(screen.getByRole('link', { name: '我的贡献' })).toBeInTheDocument()
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test --prefix frontend -- ReviewerDetailPage.test.tsx`
Expected: FAIL，页面结构或菜单缺少目标能力

- [ ] **Step 3: 增加我的贡献页与角色菜单项**

```tsx
export default function MyContributionPage() {
  return (
    <section>
      <h1>我的贡献</h1>
      <p>查看我参与的任务数量、已提交题数和审核通过数。</p>
    </section>
  )
}
```

- [ ] **Step 4: 优化 Reviewer AI 结果与打回原因展示，并补演示数据入口说明**

```tsx
<Card title="AI 审核结论">
  <p>{review.aiResult.decision}</p>
  <p>{review.aiResult.summary}</p>
</Card>
<Card title="打回理由">
  <p>{review.rejectReason ?? '暂无打回'}</p>
</Card>
<Callout>
  <p>可先执行演示数据初始化脚本，再在当前页绑定数据集开始演示。</p>
</Callout>
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm run test --prefix frontend -- ReviewerDetailPage.test.tsx`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add frontend/src/pages/labeler/MyContributionPage.tsx frontend/src/App.tsx frontend/src/layouts frontend/src/pages/reviewer frontend/src/pages/owner frontend/src/test/reviewer/ReviewerDetailPage.test.tsx
git commit -m "feat: refine reviewer view and labeler contribution page"
```

### Task 10: 主工作区联调、文档回写与本地运行验证

**Files:**
- Modify: `docs/api-contracts/labelhub-v1.md`
- Modify: `README.md`
- Modify: `docs/demo-script.md`
- Modify: `PLANROAD-A.md`
- Modify: `PLANROAD-B.md`
- Modify: `.claude/context/progress-A.md`
- Modify: `.claude/context/decisions-A.md`
- Modify: `.claude/context/architecture-A.md`

- [ ] **Step 1: 先运行后端关键测试**

Run: `pytest backend/tests/test_dataset_import_service.py backend/tests/test_datasets_api.py backend/tests/test_tasks_api.py backend/tests/test_workbench_api.py backend/tests/test_submissions_api.py backend/tests/test_reviews_api.py backend/tests/test_export_contract.py -v`
Expected: PASS

- [ ] **Step 2: 再运行前端关键测试**

Run: `npm run test --prefix frontend -- DesignerShell.test.tsx Renderer.test.tsx MultiItemWorkbench.test.tsx ReviewerDetailPage.test.tsx TaskCreatePage.test.tsx`
Expected: PASS

- [ ] **Step 3: 运行前端构建**

Run: `npm run build --prefix frontend`
Expected: PASS，输出 `built in ...`

- [ ] **Step 4: 在主工作区启动本地环境并验证真实链路**

Run:

```bash
python backend/scripts/seed_demo_data.py
./start-dev.bat
```

Expected:
- 数据集可见
- Owner 可绑定数据集建任务
- Labeler 可多题作答并重提
- Reviewer 可看到 AI 结果与打回理由
- Owner 可导出 item 聚合结果

- [ ] **Step 5: 更新文档与路线图**

需要写明：
- 阶段 0 / 1 已完成哪些真实能力
- 仍未进入阶段 2+ 的边界
- 本地启动与演示数据初始化方式
- 新增数据集导入与多题任务链路的契约与已知限制

- [ ] **Step 6: 提交**

```bash
git add docs/api-contracts/labelhub-v1.md README.md docs/demo-script.md PLANROAD-A.md PLANROAD-B.md .claude/context/progress-A.md .claude/context/decisions-A.md .claude/context/architecture-A.md
git commit -m "docs: sync stage0 and stage1 completion status"
```

---

## 3. 计划自检

### 3.1 Spec coverage
- 数据集导入、分页、搜索、预览：Task 1-2
- 任务绑定数据集、多题模型、item 级状态：Task 3
- AI 调用日志与 seed demo：Task 4
- 前端数据集绑定：Task 5
- Designer 三栏与拖拽：Task 6
- 新组件与共用 Renderer：Task 7
- 多题 Workbench、空态、打回提示：Task 8
- 角色信息架构、我的贡献页、Reviewer 体验、演示数据入口说明：Task 9
- 联调、本地运行、文档回写：Task 10

### 3.2 Placeholder scan
- 无 `TBD` / `TODO` / “后续再定” 占位词
- 每个代码步骤都给出明确文件与最小代码草图
- 每个任务都包含测试命令与提交命令

### 3.3 Type consistency
- 数据集格式统一使用 `json | jsonl | excel`
- Renderer 新组件类型统一使用 `rich_text | json_editor | file_upload | llm_interaction`
- Workbench item 状态统一使用 `draft | submitted | needs_revision | review_passed`

---

Plan complete and saved to `docs/superpowers/plans/2026-05-31-labelhub-stage0-stage1-implementation-plan.md`.

Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

User has already authorized automatic execution. Proceed with Subagent-Driven execution by default.
