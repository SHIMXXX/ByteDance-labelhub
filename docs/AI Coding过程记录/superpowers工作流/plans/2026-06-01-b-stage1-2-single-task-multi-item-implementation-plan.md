# B 侧单 task 多题模型扶正与 reviewer/export 基础收口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把后端真实模型、seed 与接口口径扶正为单 task 多题形态，并为 reviewer/export 的 item 级聚合打下稳定基础。

**Architecture:** 保持 `task -> assignment -> submission(dataset_item)` 作为稳定主模型，修正 `submissions` 唯一约束，使一个 assignment 可以稳定承载多条 item 级 submission。基于这套模型重写 demo seed，并把 `tasks/plaza`、`workbench`、`reviews`、`exports` 的聚合逻辑统一到 task 下的 item 级 submission 集合上。

**Tech Stack:** FastAPI, SQLAlchemy ORM, MySQL/SQLite, pytest, React/Vite（仅做最小字段对齐）

---

## File Map

- Modify: `backend/app/models.py` — `Submission` / `AIAuditJob` / `AIAuditResult` 关系与唯一约束的最终语义基线
- Modify: `backend/app/api/routes/tasks.py` — plaza 返回当前用户领取态与 assignmentId
- Modify: `backend/app/api/routes/workbench.py` — workbench item 聚合与 AI reject 理由回传
- Modify: `backend/app/api/routes/submissions.py` — item 级 draft / submit 的最终行为与状态映射
- Modify: `backend/app/api/routes/reviews.py` — reviewer pending/detail 对 item 级 submission 的稳定聚合
- Modify: `backend/app/api/routes/exports.py` — export 按 task 聚合 item 级 submission
- Modify: `backend/scripts/seed_demo_data.py` — 生成单 task 多题真实演示数据
- Modify: `backend/tests/test_tasks_api.py` — plaza 领取态回归
- Modify: `backend/tests/test_workbench_api.py` — workbench reject reason 与 item 聚合回归
- Modify: `backend/tests/test_submissions_api.py` — item 级 draft/submit 行为回归
- Modify: `backend/tests/test_reviews_api.py` — reviewer pending/detail item 聚合回归
- Modify: `backend/tests/test_export_contract.py` / `backend/tests/test_exports_api.py` — export 聚合回归
- Modify: `frontend/src/pages/labeler/plaza/LabelerPlazaPage.tsx` — 使用 `claimedByCurrentUser + assignmentId`
- Modify: `frontend/src/pages/labeler/plaza/LabelerPlazaPage.test.tsx` — 广场回显回归
- Modify: `frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.tsx` — 保持 item 级 submission 与待修改文案一致
- Modify: `.claude/context/progress-A.md` / `PLANROAD-A.md` / `PLANROAD-B.md` / `docs/demo-script.md` — 实现完成后同步口径

---

### Task 1: 扶正 submissions 唯一约束与 item 级模型基线

**Files:**
- Modify: `backend/app/models.py:130-160`
- Test: `backend/tests/test_submissions_api.py`

- [ ] **Step 1: Write the failing test**

```python
def test_same_assignment_can_hold_multiple_submissions_for_different_items(client, db_session, seed_users):
    owner = seed_users['owner']
    labeler = seed_users['labeler']

    dataset = Dataset(name='Multi Item Dataset', description='', source_type='json', item_count=2, created_by=owner.id)
    db_session.add(dataset)
    db_session.commit()
    db_session.refresh(dataset)

    item1 = DatasetItem(dataset_id=dataset.id, item_index=1, source_json={'text': 'q1'}, search_text='q1')
    item2 = DatasetItem(dataset_id=dataset.id, item_index=2, source_json={'text': 'q2'}, search_text='q2')
    db_session.add_all([item1, item2])
    db_session.commit()
    db_session.refresh(item1)
    db_session.refresh(item2)

    template = Template(task_id=None, name='multi-item-template', description='', created_by=owner.id)
    db_session.add(template)
    db_session.commit()
    db_session.refresh(template)

    version = TemplateVersion(
        template_id=template.id,
        version=1,
        schema_json={'version': 1, 'components': [{'type': 'text_input', 'field': 'summary', 'label': '摘要', 'required': True}]},
    )
    db_session.add(version)
    db_session.commit()
    db_session.refresh(version)

    task = Task(
        title='Multi Item Task',
        description='demo',
        status='published',
        quota=1,
        owner_id=owner.id,
        dataset_id=dataset.id,
        active_template_id=template.id,
        active_template_version_id=version.id,
    )
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)

    assignment = Assignment(task_id=task.id, user_id=labeler.id, status='claimed', progress_total=2)
    db_session.add(assignment)
    db_session.commit()
    db_session.refresh(assignment)

    first = client.post(
        '/api/v1/submissions/draft',
        json={'assignmentId': assignment.id, 'itemId': item1.id, 'templateVersionId': version.id, 'answers': {'summary': 'a1'}},
        headers={'X-Demo-User': 'labeler_demo'},
    )
    second = client.post(
        '/api/v1/submissions/draft',
        json={'assignmentId': assignment.id, 'itemId': item2.id, 'templateVersionId': version.id, 'answers': {'summary': 'a2'}},
        headers={'X-Demo-User': 'labeler_demo'},
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()['data']['submissionId'] != second.json()['data']['submissionId']
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
PYTHONPATH=backend pytest backend/tests/test_submissions_api.py::test_same_assignment_can_hold_multiple_submissions_for_different_items -q
```
Expected: FAIL if old assignment-level uniqueness or fallback logic still prevents multiple item submissions.

- [ ] **Step 3: Write minimal implementation**

```python
class Submission(Base):
    __tablename__ = 'submissions'
    __table_args__ = (UniqueConstraint('assignment_id', 'dataset_item_id', name='uq_submission_assignment_item'),)
```

```python
if payload.item_id is not None:
    submission = (
        db.query(Submission)
        .filter(Submission.assignment_id == assignment.id, Submission.dataset_item_id == payload.item_id)
        .first()
    )
```

Ensure there is no remaining code path that reuses one submission across different dataset items inside the same assignment.

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
PYTHONPATH=backend pytest backend/tests/test_submissions_api.py::test_same_assignment_can_hold_multiple_submissions_for_different_items -q
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/models.py backend/app/api/routes/submissions.py backend/tests/test_submissions_api.py
git commit -m "fix: allow item-level submissions per assignment"
```

---

### Task 2: 重写 seed 为单 task 多题真实演示数据

**Files:**
- Modify: `backend/scripts/seed_demo_data.py`
- Test: `backend/tests/test_tasks_api.py`

- [ ] **Step 1: Write the failing test**

```python
def test_seed_style_task_can_own_multiple_dataset_items(client, db_session, seed_users):
    owner = seed_users['owner']
    dataset = Dataset(name='Seed Dataset', description='', source_type='json', item_count=3, created_by=owner.id)
    db_session.add(dataset)
    db_session.commit()
    db_session.refresh(dataset)

    for index in range(3):
        db_session.add(DatasetItem(dataset_id=dataset.id, item_index=index + 1, source_json={'text': f'q{index+1}'}, search_text=f'q{index+1}'))
    db_session.commit()

    task = Task(
        title='Seed Task',
        description='demo',
        status='published',
        quota=1,
        owner_id=owner.id,
        dataset_id=dataset.id,
    )
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)

    list_response = client.get('/api/v1/tasks/plaza', headers={'Authorization': 'Bearer labeler-demo-token'})
    item = next(task_item for task_item in list_response.json()['data']['items'] if task_item['id'] == task.id)
    assert item['itemCount'] == 3
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
PYTHONPATH=backend pytest backend/tests/test_tasks_api.py::test_seed_style_task_can_own_multiple_dataset_items -q
```
Expected: FAIL if seed assumptions or task/dataset linkage still rely on one item one task semantics.

- [ ] **Step 3: Write minimal implementation**

```python
def ensure_task_graph(db):
    dataset = ensure_dataset(db, owner.id, 'qa_quality_demo')
    template_version = ensure_template(db, owner.id)

    task = db.query(Task).filter(Task.title == 'Demo Multi Item Task').first()
    if not task:
        task = Task(
            title='Demo Multi Item Task',
            description='demo',
            status='published',
            quota=1,
            owner_id=owner.id,
            dataset_id=dataset.id,
            active_template_id=template_version.template_id,
            active_template_version_id=template_version.id,
        )
        db.add(task)
        db.commit()
        db.refresh(task)
```

Create one assignment for the labeler and one submission per dataset item under that assignment.

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
PYTHONPATH=backend pytest backend/tests/test_tasks_api.py::test_seed_style_task_can_own_multiple_dataset_items -q
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/seed_demo_data.py backend/tests/test_tasks_api.py
git commit -m "feat: seed single-task multi-item demo data"
```

---

### Task 3: 回传当前用户领取态与真实 assignmentId

**Files:**
- Modify: `backend/app/api/routes/tasks.py`
- Modify: `backend/tests/test_tasks_api.py`
- Modify: `frontend/src/pages/labeler/plaza/LabelerPlazaPage.tsx`
- Modify: `frontend/src/pages/labeler/plaza/LabelerPlazaPage.test.tsx`

- [ ] **Step 1: Write the failing tests**

```python
def test_list_plaza_tasks_marks_current_users_claim_and_assignment(client, seed_users):
    ...
    assert mine['claimedByCurrentUser'] is True
    assert mine['assignmentId'] == my_assignment_id
    assert others['claimedByCurrentUser'] is False
    assert others['assignmentId'] is None
```

```tsx
it('restores claimed state from plaza response after reload', async () => {
  vi.spyOn(apiClient, 'apiGet').mockResolvedValue({
    items: [{
      id: 36,
      title: 'Demo Multi Item Task #2',
      description: 'demo',
      status: 'published',
      quota: 1,
      claimedCount: 1,
      claimedByCurrentUser: true,
      assignmentId: 41,
      deadline: null,
    }],
    total: 1,
  })

  renderLabelerPlazaPage()
  await screen.findByText('Demo Multi Item Task #2')
  expect(screen.getByText('状态：已领取')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '继续作答' })).toHaveAttribute('href', '/labeler/workbench?assignmentId=41')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
PYTHONPATH=backend pytest backend/tests/test_tasks_api.py::test_list_plaza_tasks_marks_current_users_claim_and_assignment -q
npm --prefix frontend test -- --run src/pages/labeler/plaza/LabelerPlazaPage.test.tsx
```
Expected: FAIL before backend fields and frontend mapping are aligned.

- [ ] **Step 3: Write minimal implementation**

```python
current_assignment = (
    db.query(Assignment)
    .filter(Assignment.task_id == task.id, Assignment.user_id == user.id)
    .first()
)
```

```python
'claimedByCurrentUser': current_assignment is not None,
'assignmentId': current_assignment.id if current_assignment else None,
```

```tsx
claimed: task.claimedByCurrentUser ?? false,
assignmentId: task.assignmentId ?? undefined,
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
PYTHONPATH=backend pytest backend/tests/test_tasks_api.py::test_list_plaza_tasks_marks_current_users_claim_and_assignment -q
npm --prefix frontend test -- --run src/pages/labeler/plaza/LabelerPlazaPage.test.tsx
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/tasks.py backend/tests/test_tasks_api.py frontend/src/pages/labeler/plaza/LabelerPlazaPage.tsx frontend/src/pages/labeler/plaza/LabelerPlazaPage.test.tsx
git commit -m "fix: restore claimed assignments in plaza"
```

---

### Task 4: workbench 回传 AI reject 待修改理由

**Files:**
- Modify: `backend/app/api/routes/workbench.py`
- Modify: `backend/tests/test_workbench_api.py`
- Modify: `frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.tsx`
- Modify: `frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.test.tsx`

- [ ] **Step 1: Write the failing tests**

```python
def test_workbench_exposes_ai_reject_reason_for_needs_revision_submission(client, db_session, seed_users):
    ...
    assert payload['items'][0]['draftSubmission']['status'] == 'needs_revision'
    assert payload['items'][0]['draftSubmission']['latestRejectReason'] == '答案过短，未达到最小质量要求。'
```

```tsx
it('shows reject reason and uses resubmit wording for needs_revision submissions', async () => {
  ...
  expect(await screen.findByText('最近一次打回理由：答案过短，未达到最小质量要求。')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '重新提交' })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
PYTHONPATH=backend pytest backend/tests/test_workbench_api.py::test_workbench_exposes_ai_reject_reason_for_needs_revision_submission -q
npm --prefix frontend test -- --run src/pages/labeler/workbench/LabelerWorkbenchPage.test.tsx
```
Expected: FAIL before AI summary is surfaced into `latestRejectReason`.

- [ ] **Step 3: Write minimal implementation**

```python
def get_latest_reject_reason(submission: Submission) -> str | None:
    review_reason = latest_reject_reason_by_submission_id.get(submission.id)
    if review_reason:
        return review_reason
    ai_result = submission.ai_audit_result
    if submission.status == 'needs_revision' and ai_result and ai_result.decision == 'reject':
        return ai_result.summary
    return None
```

Wire `latestRejectReason` to `get_latest_reject_reason(submission)`.

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
PYTHONPATH=backend pytest backend/tests/test_workbench_api.py::test_workbench_exposes_ai_reject_reason_for_needs_revision_submission -q
npm --prefix frontend test -- --run src/pages/labeler/workbench/LabelerWorkbenchPage.test.tsx
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/workbench.py backend/tests/test_workbench_api.py frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.test.tsx
git commit -m "fix: expose ai reject reason in workbench"
```

---

### Task 5: reviewer pending/detail 按 item submission 稳定聚合

**Files:**
- Modify: `backend/app/api/routes/reviews.py`
- Modify: `backend/tests/test_reviews_api.py`

- [ ] **Step 1: Write the failing test**

```python
def test_pending_reviews_lists_item_level_submissions_for_single_task(client, db_session, seed_users):
    ...
    pending = client.get('/api/v1/reviews/pending', headers={'X-Demo-User': 'reviewer_demo'})
    assert pending.status_code == 200
    items = pending.json()['data']['items']
    assert len(items) == 2
    assert {item['submissionId'] for item in items} == {submission1.id, submission2.id}
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
PYTHONPATH=backend pytest backend/tests/test_reviews_api.py::test_pending_reviews_lists_item_level_submissions_for_single_task -q
```
Expected: FAIL if pending list still assumes compatibility semantics or task-level collapse.

- [ ] **Step 3: Write minimal implementation**

```python
submissions = (
    db.query(Submission)
    .filter(Submission.status.in_(['submitted', 'ai_passed']))
    .order_by(Submission.updated_at.desc())
    .all()
)
```

Keep reviewer pending/detail centered on submission rows, not on compatibility task copies.

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
PYTHONPATH=backend pytest backend/tests/test_reviews_api.py::test_pending_reviews_lists_item_level_submissions_for_single_task -q
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/reviews.py backend/tests/test_reviews_api.py
git commit -m "fix: stabilize reviewer item-level pending aggregation"
```

---

### Task 6: export 按 task 聚合 item 级 submission

**Files:**
- Modify: `backend/app/api/routes/exports.py`
- Modify: `backend/tests/test_export_contract.py`
- Modify: `backend/tests/test_exports_api.py`

- [ ] **Step 1: Write the failing test**

```python
def test_export_aggregates_multiple_item_submissions_under_one_task(client, db_session, seed_users):
    ...
    complete = client.post(f'/api/v1/exports/{job_id}/complete', headers={'X-Demo-User': 'owner_demo'})
    assert complete.status_code == 200
    payload = complete.json()['data']
    assert 'datasetItemId' in payload['content'][0]
    assert len(payload['content']) == 2
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
PYTHONPATH=backend pytest backend/tests/test_export_contract.py::test_export_aggregates_multiple_item_submissions_under_one_task -q
```
Expected: FAIL if export still depends on compatibility one-item task assumptions.

- [ ] **Step 3: Write minimal implementation**

```python
submissions = db.query(Submission).filter(Submission.task_id == task.id).all()
for submission in submissions:
    items.append({
        'submissionId': submission.id,
        'datasetItemId': submission.dataset_item_id,
        'answers': submission.answers_json,
        ...
    })
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
PYTHONPATH=backend pytest backend/tests/test_export_contract.py::test_export_aggregates_multiple_item_submissions_under_one_task -q
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/exports.py backend/tests/test_export_contract.py backend/tests/test_exports_api.py
git commit -m "fix: aggregate exports by item submissions"
```

---

### Task 7: 恢复浏览器真链路并同步文档口径

**Files:**
- Modify: `docs/demo-script.md`
- Modify: `.claude/context/progress-A.md`
- Modify: `PLANROAD-A.md`
- Modify: `PLANROAD-B.md`

- [ ] **Step 1: Write the failing verification checklist**

```markdown
- Labeler 广场刷新后仍显示“已领取 / 继续作答”
- workbench 在 AI reject 后显示待修改理由与“重新提交”
- 重提交内容落库
- 文档中不再要求 `PYTHONPATH=backend`
- 文档中不再保留 8000 旧代理口径
```

- [ ] **Step 2: Run runtime verification to confirm current gaps**

Run in browser:
```bash
python backend/scripts/seed_demo_data.py
python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8765
npm --prefix frontend run dev -- --host 127.0.0.1 --port 5176
```
Expected: observe old or missing behaviors before final sync if preceding tasks were not completed.

- [ ] **Step 3: Write minimal documentation updates**

```markdown
### 演示数据初始化
```bash
python backend/scripts/seed_demo_data.py
```
```

Update progress and PLANROAD to state that phase 2 minimum real chain is basically closed, while keeping the single-task multi-item seed migration and higher-level reviewer/export enhancements honest.

- [ ] **Step 4: Re-run runtime verification after docs sync**

Expected observations:
- plaza refresh shows claimed state
- workbench shows AI reject reason
- resubmit updates submission answers
- docs match actual commands and port behavior

- [ ] **Step 5: Commit**

```bash
git add docs/demo-script.md .claude/context/progress-A.md PLANROAD-A.md PLANROAD-B.md
git commit -m "docs: sync phase 2 runtime and roadmap status"
```

---

## Self-Review

- Spec coverage: includes unique constraint, single-task seed, plaza assignment recovery, AI reject reason surfacing, reviewer/export aggregation, and doc sync.
- Placeholder scan: no TBD/TODO placeholders remain; every task has a concrete test, command, and file path.
- Type consistency: uses `claimedByCurrentUser`, `assignmentId`, `latestRejectReason`, `submissionId`, and `dataset_item_id` consistently across backend and frontend tasks.
