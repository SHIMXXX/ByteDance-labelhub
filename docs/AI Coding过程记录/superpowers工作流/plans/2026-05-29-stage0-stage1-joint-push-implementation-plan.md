# Stage0 Stage1 Joint Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the remaining stage 0 stabilization items that still affect demos, and push stage 1 forward into a first real frontend/backend/testable closure.

**Architecture:** Keep the current SM-branch architecture and extend it in place instead of doing a broad refactor. Split work by delivery lane: frontend designer/renderer stabilization, frontend business-flow enhancement, backend AI stabilization plus dataset bootstrap, then verify independently and only sync docs after evidence exists.

**Tech Stack:** React + TypeScript + Vite + Vitest + React Testing Library, FastAPI + SQLAlchemy + Pydantic + pytest, Chrome DevTools MCP for browser verification.

---

## File Map

### Frontend files likely to modify
- `frontend/src/pages/owner/templates/OwnerTemplatesPage.tsx` — owner template builder page; stage 1 designer layout, drag/sort entry, validation hooks.
- `frontend/src/pages/owner/templates/OwnerTemplatesPage.test.tsx` — page-level tests for designer layout and interactions.
- `frontend/src/pages/owner/tasks/OwnerTasksPage.tsx` — owner task page; demo data entry hints and state text cleanup if needed.
- `frontend/src/pages/owner/tasks/OwnerTasksPage.test.tsx` — tests for stage 0 state text and task-page updates.
- `frontend/src/pages/owner/exports/OwnerExportsPage.tsx` — export capability wording consistency and stage 0 empty/loading/error states.
- `frontend/src/pages/owner/exports/OwnerExportsPage.test.tsx` — tests for export page messaging and state rendering.
- `frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.tsx` — reviewer wording or fallback rendering if stage 0 review-state polish is needed.
- `frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.test.tsx` — reviewer page regression coverage.
- `frontend/src/services/api/client.ts` — API methods for any new dataset, re-submit, or template-related calls.
- `frontend/src/App.tsx` or `frontend/src/router/*` / `frontend/src/layouts/*` — only if route-linked stage 1 pages need menu wiring.
- `frontend/src/pages/auth/LoginPage.tsx` / `LoginPage.test.tsx` — only if demo-data entry instructions surface at login.

### Backend files likely to modify
- `backend/app/api/routes/reviews.py` — readable AI fallback / review payload extensions if more stage 0 polish is required.
- `backend/app/api/routes/templates.py` — template-side schema validation or dataset binding hooks if needed.
- `backend/app/api/routes/reviews.py` — review route side effects and fallback semantics.
- `backend/app/api/routes/*` — new dataset import/list/detail APIs and submission re-submit flow endpoints.
- `backend/app/services/ai_executor.py` — stage 0 readable AI error logging, fallback-to-human-review behavior, provider/model/timing metadata.
- `backend/app/core/config.py` — AI logging / seed-demo config toggles if needed.
- `backend/tests/test_ai_executor.py` — executor behavior tests.
- `backend/tests/test_reviews_api.py` — review fallback tests.
- `backend/tests/test_workbench_api.py` — resubmit / item-state / dataset-linked workbench tests.
- `backend/tests/conftest.py` — seed/demo helpers or dataset fixtures.
- Additional backend model/schema/router files under `backend/app/models/*`, `backend/app/schemas/*`, `backend/app/api/routes/*` — dataset and dataset_item bootstrap if not already present.

### Docs files likely to modify after code passes
- `PLANROAD-A.md`
- `PLANROAD-B.md`
- `.claude/context/progress-A.md`
- `.claude/context/decisions-A.md`
- `README.md`
- `docs/api-contracts/labelhub-v1.md`

---

## Round 1 — Stage 0 closure + Stage 1 skeleton

### Task 1: Inventory exact stage 0 and stage 1 touch points before edits

**Files:**
- Modify: `docs/superpowers/plans/2026-05-29-stage0-stage1-joint-push-implementation-plan.md`
- Check: `PLANROAD-A.md`
- Check: `PLANROAD-B.md`
- Check: `frontend/src/pages/owner/templates/OwnerTemplatesPage.tsx`
- Check: `frontend/src/pages/owner/tasks/OwnerTasksPage.tsx`
- Check: `frontend/src/pages/owner/exports/OwnerExportsPage.tsx`
- Check: `frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.tsx`
- Check: `backend/app/services/ai_executor.py`
- Check: `backend/app/api/routes/reviews.py`

- [ ] **Step 1: Read the current files and mark concrete gaps**

```text
Read the listed frontend/backend files and map each remaining stage 0 item and stage 1 target to exact files.
Record three buckets in your working notes:
1. must change now
2. likely change now
3. defer unless blocked
```

- [ ] **Step 2: Verify no broad refactor is required before starting**

Run: `git diff --stat -- frontend/src/pages/owner/templates/OwnerTemplatesPage.tsx frontend/src/pages/owner/tasks/OwnerTasksPage.tsx frontend/src/pages/owner/exports/OwnerExportsPage.tsx frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.tsx backend/app/services/ai_executor.py backend/app/api/routes/reviews.py`
Expected: A small enough surface to continue in-place rather than rewriting architecture.

- [ ] **Step 3: Commit no code yet**

```text
Do not commit after this task. This task exists to lock scope and prevent agents from colliding.
```

### Task 2: Add failing frontend tests for stage 0 state polish and designer skeleton

**Files:**
- Modify: `frontend/src/pages/owner/templates/OwnerTemplatesPage.test.tsx`
- Modify: `frontend/src/pages/owner/exports/OwnerExportsPage.test.tsx`
- Modify: `frontend/src/pages/owner/tasks/OwnerTasksPage.test.tsx`
- Modify: `frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.test.tsx`
- Test: `frontend/src/pages/owner/templates/OwnerTemplatesPage.test.tsx`
- Test: `frontend/src/pages/owner/exports/OwnerExportsPage.test.tsx`

- [ ] **Step 1: Write failing tests for the owner template three-panel skeleton**

```tsx
it('renders the designer with material, canvas and config panels', async () => {
  renderWithRouter(<OwnerTemplatesPage />)

  expect(await screen.findByText(/组件物料|物料区/i)).toBeInTheDocument()
  expect(screen.getByText(/画布|预览/i)).toBeInTheDocument()
  expect(screen.getByText(/属性面板|字段配置/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Write failing tests for export/task/reviewer state wording**

```tsx
it('shows explicit capability hint for export formats', async () => {
  renderWithRouter(<OwnerExportsPage />)
  expect(await screen.findByText(/当前仅支持\s*JSON\s*\/\s*CSV/i)).toBeInTheDocument()
})

it('shows empty or loading copy instead of blank content', async () => {
  renderWithRouter(<ReviewerReviewsPage />)
  expect(await screen.findByText(/加载中|暂无|空状态/i)).toBeInTheDocument()
})
```

- [ ] **Step 3: Run tests to verify failure**

Run: `npm --prefix frontend test -- OwnerTemplatesPage.test.tsx OwnerExportsPage.test.tsx OwnerTasksPage.test.tsx ReviewerReviewsPage.test.tsx --runInBand`
Expected: FAIL because the exact three-panel labels or state copy do not fully match yet.

- [ ] **Step 4: Commit the failing tests**

```bash
git add frontend/src/pages/owner/templates/OwnerTemplatesPage.test.tsx frontend/src/pages/owner/exports/OwnerExportsPage.test.tsx frontend/src/pages/owner/tasks/OwnerTasksPage.test.tsx frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.test.tsx
git commit -m "test: define stage0 polish and designer skeleton expectations"
```

### Task 3: Make stage 0 frontend state polish and designer skeleton tests pass

**Files:**
- Modify: `frontend/src/pages/owner/templates/OwnerTemplatesPage.tsx`
- Modify: `frontend/src/pages/owner/exports/OwnerExportsPage.tsx`
- Modify: `frontend/src/pages/owner/tasks/OwnerTasksPage.tsx`
- Modify: `frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.tsx`
- Test: `frontend/src/pages/owner/templates/OwnerTemplatesPage.test.tsx`
- Test: `frontend/src/pages/owner/exports/OwnerExportsPage.test.tsx`
- Test: `frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.test.tsx`

- [ ] **Step 1: Add minimal three-panel layout markers to the template page**

```tsx
<section aria-label="组件物料区">
  <h2>组件物料</h2>
</section>
<section aria-label="模板画布区">
  <h2>画布预览</h2>
</section>
<aside aria-label="属性面板">
  <h2>属性面板</h2>
</aside>
```

- [ ] **Step 2: Add explicit empty/loading/error copy where stage 0 requires it**

```tsx
if (isLoading) {
  return <div>加载中，请稍候…</div>
}

if (!items.length) {
  return <div>暂无数据，请先创建或初始化演示数据。</div>
}
```

- [ ] **Step 3: Keep existing logic and wire copy into the real page state branches**

```tsx
<p className="text-sm text-slate-500">当前仅支持 JSON / CSV 导出，JSONL / Excel 将在后续阶段补齐。</p>
```

- [ ] **Step 4: Run the targeted tests again**

Run: `npm --prefix frontend test -- OwnerTemplatesPage.test.tsx OwnerExportsPage.test.tsx OwnerTasksPage.test.tsx ReviewerReviewsPage.test.tsx --runInBand`
Expected: PASS

- [ ] **Step 5: Commit the stage 0 frontend closure**

```bash
git add frontend/src/pages/owner/templates/OwnerTemplatesPage.tsx frontend/src/pages/owner/exports/OwnerExportsPage.tsx frontend/src/pages/owner/tasks/OwnerTasksPage.tsx frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.tsx
git commit -m "feat: polish frontend state handling for stage0"
```

### Task 4: Add failing frontend tests for stage 1 labeler resubmit and plaza filtering

**Files:**
- Modify: `frontend/src/App.test.tsx`
- Modify: `frontend/src/pages/owner/tasks/OwnerTasksPage.test.tsx`
- Modify: `frontend/src/pages/owner/templates/OwnerTemplatesPage.test.tsx`
- Test: `frontend/src/App.test.tsx`

- [ ] **Step 1: Write a failing test for labeler re-submit entry**

```tsx
it('lets the labeler reopen a needs-revision submission', async () => {
  renderWithRouter(<App />, { initialEntries: ['/labeler/tasks/task-1/workbench'] })
  expect(await screen.findByRole('button', { name: /修改后重新提交|继续修改/i })).toBeInTheDocument()
})
```

- [ ] **Step 2: Write a failing test for plaza filtering/search tags**

```tsx
it('filters plaza tasks by search text and status tag', async () => {
  renderWithRouter(<App />, { initialEntries: ['/labeler/tasks'] })

  const search = await screen.findByPlaceholderText(/搜索任务/i)
  await userEvent.type(search, 'demo')
  await userEvent.click(screen.getByRole('button', { name: /待我处理/i }))

  expect(screen.getByText(/demo/i)).toBeInTheDocument()
})
```

- [ ] **Step 3: Run the tests to verify failure**

Run: `npm --prefix frontend test -- App.test.tsx OwnerTasksPage.test.tsx OwnerTemplatesPage.test.tsx --runInBand`
Expected: FAIL because the re-submit CTA and plaza filter UI are not fully present yet.

- [ ] **Step 4: Commit the failing tests**

```bash
git add frontend/src/App.test.tsx frontend/src/pages/owner/tasks/OwnerTasksPage.test.tsx frontend/src/pages/owner/templates/OwnerTemplatesPage.test.tsx
git commit -m "test: define stage1 labeler and plaza interactions"
```

### Task 5: Implement minimal frontend stage 1 business-flow upgrades

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/services/api/client.ts`
- Modify: `frontend/src/pages/owner/tasks/OwnerTasksPage.tsx`
- Modify: `frontend/src/pages/owner/templates/OwnerTemplatesPage.tsx`
- Modify: any labeler task/plaza page under `frontend/src/pages/**`
- Test: `frontend/src/App.test.tsx`

- [ ] **Step 1: Add minimal re-submit CTA for needs-revision flows**

```tsx
{submission.status === 'needs_revision' ? (
  <button type="button" onClick={handleResumeRevision}>
    修改后重新提交
  </button>
) : null}
```

- [ ] **Step 2: Add minimal search/filter UI for the plaza page**

```tsx
<input
  placeholder="搜索任务"
  value={keyword}
  onChange={(event) => setKeyword(event.target.value)}
/>
<button type="button" onClick={() => setStatusFilter('pending')}>待我处理</button>
<button type="button" onClick={() => setStatusFilter('all')}>全部</button>
```

- [ ] **Step 3: Filter the in-memory task list before rendering**

```tsx
const filteredTasks = tasks.filter((task) => {
  const matchesKeyword = !keyword || task.title.toLowerCase().includes(keyword.toLowerCase())
  const matchesStatus = statusFilter === 'all' || task.status === statusFilter
  return matchesKeyword && matchesStatus
})
```

- [ ] **Step 4: Run the targeted tests**

Run: `npm --prefix frontend test -- App.test.tsx OwnerTasksPage.test.tsx OwnerTemplatesPage.test.tsx --runInBand`
Expected: PASS

- [ ] **Step 5: Run the frontend build**

Run: `npm --prefix frontend run build`
Expected: PASS with a production build output.

- [ ] **Step 6: Commit the frontend stage 1 business-flow increment**

```bash
git add frontend/src/App.tsx frontend/src/services/api/client.ts frontend/src/pages
git commit -m "feat: add first stage1 labeler and plaza upgrades"
```

### Task 6: Add failing backend tests for AI readable failure fallback and dataset bootstrap

**Files:**
- Modify: `backend/tests/test_ai_executor.py`
- Modify: `backend/tests/test_reviews_api.py`
- Modify: `backend/tests/test_workbench_api.py`
- Modify: `backend/tests/conftest.py`
- Test: `backend/tests/test_ai_executor.py`
- Test: `backend/tests/test_workbench_api.py`

- [ ] **Step 1: Add a failing AI executor test for readable fallback output**

```python
def test_executor_returns_readable_failure_summary_on_provider_error():
    executor = DeepSeekAIExecutor(api_key="demo", model="demo-model", timeout=1)

    result = executor._normalize_result({
        "decision": "broken",
        "summary": "",
        "scores": None,
        "error": "401 unauthorized",
    })

    assert result["decision"] == "human_review"
    assert result["scores"] == []
    assert "401" in result["summary"]
```

- [ ] **Step 2: Add failing tests for first dataset bootstrap boundaries**

```python
def test_workbench_returns_item_scoped_payload_when_dataset_items_exist(client, seeded_dataset_task):
    response = client.get(f"/api/workbench/tasks/{seeded_dataset_task['task_id']}")
    assert response.status_code == 200
    payload = response.json()
    assert "items" in payload
    assert payload["items"]
```

- [ ] **Step 3: Run the tests to verify failure**

Run: `pytest backend/tests/test_ai_executor.py backend/tests/test_workbench_api.py -v`
Expected: FAIL because readable fallback and item-scoped payload support are incomplete.

- [ ] **Step 4: Commit the failing backend tests**

```bash
git add backend/tests/test_ai_executor.py backend/tests/test_reviews_api.py backend/tests/test_workbench_api.py backend/tests/conftest.py
git commit -m "test: define stage0 ai fallback and dataset bootstrap behavior"
```

### Task 7: Implement backend stage 0 AI fallback and stage 1 dataset bootstrap

**Files:**
- Modify: `backend/app/services/ai_executor.py`
- Modify: `backend/app/core/config.py`
- Modify: `backend/app/api/routes/reviews.py`
- Modify/Create: backend dataset-related model/router/schema files under `backend/app/**`
- Modify: `backend/tests/conftest.py`
- Test: `backend/tests/test_ai_executor.py`
- Test: `backend/tests/test_workbench_api.py`

- [ ] **Step 1: Normalize unreadable AI output into human-review fallback with readable summary**

```python
if decision not in {"pass", "reject", "human_review"}:
    error_text = (payload.get("error") or payload.get("summary") or "AI 返回异常，已转人工复核").strip()
    return {
        "decision": "human_review",
        "scores": [],
        "summary": error_text,
    }
```

- [ ] **Step 2: Record minimal AI call metadata for later audit or inspection**

```python
return {
    "decision": normalized_decision,
    "scores": normalized_scores,
    "summary": normalized_summary,
    "provider": self.provider_name,
    "model": self.model,
    "duration_ms": duration_ms,
}
```

- [ ] **Step 3: Add the smallest dataset bootstrap that keeps current MVP compatible**

```python
class Dataset(Base):
    __tablename__ = "datasets"
    id = mapped_column(String(36), primary_key=True)
    name = mapped_column(String(255), nullable=False)

class DatasetItem(Base):
    __tablename__ = "dataset_items"
    id = mapped_column(String(36), primary_key=True)
    dataset_id = mapped_column(ForeignKey("datasets.id"), nullable=False)
    source = mapped_column(JSON, nullable=False)
```

- [ ] **Step 4: Return item-scoped workbench data when dataset items are bound**

```python
if task.dataset_id:
    return {
        "task": task_payload,
        "items": [serialize_dataset_item(item) for item in dataset_items],
        "submission": submission_payload,
    }
```

- [ ] **Step 5: Run the targeted backend tests**

Run: `pytest backend/tests/test_ai_executor.py backend/tests/test_workbench_api.py backend/tests/test_reviews_api.py -v`
Expected: PASS

- [ ] **Step 6: Commit the backend increment**

```bash
git add backend/app backend/tests
git commit -m "feat: add ai fallback clarity and dataset bootstrap"
```

## Round 2 — Connect first real closure

### Task 8: Add failing tests for shared renderer and field uniqueness validation

**Files:**
- Modify: `frontend/src/pages/owner/templates/OwnerTemplatesPage.test.tsx`
- Modify: `frontend/src/App.test.tsx`
- Test: `frontend/src/pages/owner/templates/OwnerTemplatesPage.test.tsx`

- [ ] **Step 1: Write a failing test for duplicate field rejection**

```tsx
it('rejects duplicate field keys in the template builder', async () => {
  renderWithRouter(<OwnerTemplatesPage />)
  await userEvent.click(await screen.findByRole('button', { name: /添加文本输入/i }))
  await userEvent.click(screen.getByRole('button', { name: /添加文本输入/i }))
  expect(await screen.findByText(/field 需唯一|字段标识不能重复/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Write a failing test for renderer reuse semantics**

```tsx
it('shows the same configured field label in preview and workbench flows', async () => {
  renderWithRouter(<App />)
  expect(await screen.findAllByText(/摘要|Summary/i)).not.toHaveLength(0)
})
```

- [ ] **Step 3: Run the tests to verify failure**

Run: `npm --prefix frontend test -- OwnerTemplatesPage.test.tsx App.test.tsx --runInBand`
Expected: FAIL because duplicate-field validation and shared renderer semantics are incomplete.

- [ ] **Step 4: Commit the failing tests**

```bash
git add frontend/src/pages/owner/templates/OwnerTemplatesPage.test.tsx frontend/src/App.test.tsx
git commit -m "test: define shared renderer and field uniqueness rules"
```

### Task 9: Implement shared renderer entry and duplicate field validation

**Files:**
- Modify: `frontend/src/pages/owner/templates/OwnerTemplatesPage.tsx`
- Modify/Create: renderer-related files under `frontend/src/**`
- Modify: any labeler workbench page under `frontend/src/pages/**`
- Test: `frontend/src/pages/owner/templates/OwnerTemplatesPage.test.tsx`
- Test: `frontend/src/App.test.tsx`

- [ ] **Step 1: Extract or reuse one renderer entry point for preview and workbench**

```tsx
export function TemplateRenderer({ schema, value, onChange }: TemplateRendererProps) {
  return schema.components.map((component) => renderComponent(component, value, onChange))
}
```

- [ ] **Step 2: Use the renderer in the owner preview and labeler workbench paths**

```tsx
<TemplateRenderer schema={templateSchema} value={draftAnswers} onChange={handleAnswerChange} />
```

- [ ] **Step 3: Add duplicate-field validation before save or publish**

```tsx
const fieldKeys = components.map((component) => component.field).filter(Boolean)
const hasDuplicateField = new Set(fieldKeys).size !== fieldKeys.length
if (hasDuplicateField) {
  setError('字段标识不能重复')
  return
}
```

- [ ] **Step 4: Run the targeted tests again**

Run: `npm --prefix frontend test -- OwnerTemplatesPage.test.tsx App.test.tsx --runInBand`
Expected: PASS

- [ ] **Step 5: Commit the shared renderer increment**

```bash
git add frontend/src
git commit -m "feat: share renderer entry and enforce unique field keys"
```

### Task 10: Add failing tests for dataset import API and seed demo entry

**Files:**
- Modify: `backend/tests/test_workbench_api.py`
- Modify: `backend/tests/conftest.py`
- Test: `backend/tests/test_workbench_api.py`

- [ ] **Step 1: Write a failing test for minimal dataset import**

```python
def test_dataset_import_creates_dataset_and_items(client):
    response = client.post("/api/datasets/import", json={
        "name": "demo dataset",
        "items": [{"source": {"text": "one"}}, {"source": {"text": "two"}}],
    })
    assert response.status_code == 201
    payload = response.json()
    assert payload["dataset"]["name"] == "demo dataset"
    assert len(payload["items"]) == 2
```
```

- [ ] **Step 2: Write a failing test for seed demo discoverability or script output**

```python
def test_seed_demo_helper_returns_created_entities(seed_demo_data):
    assert seed_demo_data["task_id"]
    assert seed_demo_data["dataset_id"]
    assert seed_demo_data["submission_id"]
```
```

- [ ] **Step 3: Run the tests to verify failure**

Run: `pytest backend/tests/test_workbench_api.py -v`
Expected: FAIL because dataset import and seed-demo bootstrap are not complete yet.

- [ ] **Step 4: Commit the failing tests**

```bash
git add backend/tests/test_workbench_api.py backend/tests/conftest.py
git commit -m "test: define dataset import and seed demo bootstrap"
```

### Task 11: Implement dataset import route and seed demo bootstrap

**Files:**
- Modify/Create: dataset-related route/schema/service files under `backend/app/**`
- Modify: `backend/tests/conftest.py`
- Modify: `README.md`
- Modify: `docs/api-contracts/labelhub-v1.md`
- Test: `backend/tests/test_workbench_api.py`

- [ ] **Step 1: Add the smallest dataset import route**

```python
@router.post('/datasets/import', status_code=201)
def import_dataset(payload: DatasetImportRequest, db: Session = Depends(get_db)):
    dataset = create_dataset(db, payload.name)
    items = [create_dataset_item(db, dataset.id, item.source) for item in payload.items]
    return {
        'dataset': serialize_dataset(dataset),
        'items': [serialize_dataset_item(item) for item in items],
    }
```

- [ ] **Step 2: Add a reusable seed-demo helper for tests and local setup**

```python
def seed_demo_data(db: Session) -> dict[str, str]:
    dataset = create_dataset(db, 'demo dataset')
    item = create_dataset_item(db, dataset.id, {'text': 'demo source'})
    task = create_task(db, title='Demo task', dataset_id=dataset.id)
    submission = create_submission(db, task_id=task.id, item_id=item.id)
    return {
        'dataset_id': dataset.id,
        'task_id': task.id,
        'submission_id': submission.id,
    }
```

- [ ] **Step 3: Document the new boundary in the contract doc and README**

```md
- 当前阶段新增最小 `/api/datasets/import` 入口，用于导入演示数据集。
- 当前阶段的数据集能力仅覆盖 JSON 请求导入与 item 列表返回，不等同于完整 JSONL / Excel 导入终态。
```

- [ ] **Step 4: Run the targeted tests**

Run: `pytest backend/tests/test_workbench_api.py -v`
Expected: PASS

- [ ] **Step 5: Commit the dataset import increment**

```bash
git add backend/app backend/tests README.md docs/api-contracts/labelhub-v1.md
git commit -m "feat: add minimal dataset import and demo seed bootstrap"
```

### Task 12: Run lane-level verification and browser validation

**Files:**
- Test: `frontend/src/App.test.tsx`
- Test: `frontend/src/pages/owner/templates/OwnerTemplatesPage.test.tsx`
- Test: `frontend/src/pages/owner/exports/OwnerExportsPage.test.tsx`
- Test: `backend/tests/test_ai_executor.py`
- Test: `backend/tests/test_reviews_api.py`
- Test: `backend/tests/test_workbench_api.py`

- [ ] **Step 1: Run focused frontend tests**

Run: `npm --prefix frontend test -- App.test.tsx OwnerTemplatesPage.test.tsx OwnerExportsPage.test.tsx OwnerTasksPage.test.tsx ReviewerReviewsPage.test.tsx --runInBand`
Expected: PASS

- [ ] **Step 2: Run frontend production build**

Run: `npm --prefix frontend run build`
Expected: PASS

- [ ] **Step 3: Run focused backend tests**

Run: `pytest backend/tests/test_ai_executor.py backend/tests/test_reviews_api.py backend/tests/test_workbench_api.py -v`
Expected: PASS

- [ ] **Step 4: Start the app and verify golden paths in the browser**

Run: `start-dev.bat`
Expected: backend on `http://127.0.0.1:8765`, frontend on `http://127.0.0.1:5176`.

- [ ] **Step 5: In the browser verify these flows**

```text
1. Owner template page shows the three-panel structure and can surface duplicate-field validation.
2. Labeler plaza shows search/filter controls.
3. A needs-revision task exposes a re-submit entry.
4. Export page still shows JSON/CSV-only wording and does not regress.
```

- [ ] **Step 6: Commit only if verification is green and user requested commits**

```text
If the user did not explicitly request commits, skip committing here.
If they did, create one verification or integration commit only after all checks pass.
```

### Task 13: Sync plans and progress docs after evidence exists

**Files:**
- Modify: `PLANROAD-A.md`
- Modify: `PLANROAD-B.md`
- Modify: `.claude/context/progress-A.md`
- Modify: `.claude/context/decisions-A.md`
- Modify: `README.md`
- Modify: `docs/api-contracts/labelhub-v1.md`

- [ ] **Step 1: Update A-side route map and stage checkboxes only for proven items**

```md
- [x] 优化错误提示、空状态、loading 状态与状态文案
- [x] 增加一键初始化演示数据入口在前端的使用说明 / 操作入口联动
- [-] 将模板搭建器升级为左侧物料区 / 中间画布 / 右侧属性面板
```

- [ ] **Step 2: Update B-side stage 0 and stage 1 wording with first-closure language**

```md
- [x] AI 返回异常时写入可读错误信息，并自动转人工复核
- [-] 新增 datasets 表
- [-] 新增 dataset_items 表
- [-] 支持 JSON 导入数据集
```

- [ ] **Step 3: Update progress and decisions with evidence-based wording**

```md
- 2026-05-29 已完成阶段 0 剩余稳定项第二轮收口，并将阶段 1 推进到 Designer 三栏骨架、Labeler 重提入口、数据集最小导入边界。
- 决策：阶段 1 今日以“第一轮真实闭环骨架”作为完成口径，不把 JSONL / Excel、多轮审核、完整异步 AI 系统误记为已完成。
```

- [ ] **Step 4: Manually inspect the docs for contradiction**

Run: `git diff -- PLANROAD-A.md PLANROAD-B.md .claude/context/progress-A.md .claude/context/decisions-A.md README.md docs/api-contracts/labelhub-v1.md`
Expected: Terminology and completion states are consistent with tested code.

- [ ] **Step 5: Commit doc sync only if the user requested commits**

```text
If commits are requested, create one doc-sync commit after verifying code and docs agree.
Otherwise leave the changes uncommitted.
```

---

## Self-review checklist

- Spec coverage: This plan covers stage 0 frontend polish, stage 0 backend AI fallback, stage 1 designer/renderer skeleton, labeler resubmit/plaza filters, dataset bootstrap/import, verification, and doc sync.
- Placeholder scan: No TODO/TBD placeholders remain; every code step includes concrete snippets or commands.
- Type consistency: The plan consistently uses `human_review`, `dataset_id`, `items`, `submission`, and duplicate `field` validation terminology across tasks.
