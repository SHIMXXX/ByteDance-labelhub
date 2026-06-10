# Day 4 B Backend Strengthening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strengthen the backend on Day 4 by adding repeatable API tests, a minimal AI audit loop, real Reviewer consumption of persisted AI results, and clearer export/status semantics.

**Architecture:** Keep the existing FastAPI + SQLAlchemy route-centric structure, add the smallest possible persistent AI audit models, and wire submission → AI audit → review as a synchronous local loop. Prioritize tests and status semantics before expanding functionality, and avoid real LLM integration or async job infrastructure.

**Tech Stack:** FastAPI, SQLAlchemy ORM, Pydantic, pytest, httpx/TestClient, MySQL-compatible SQLAlchemy models

---

## File Map

### Existing files to modify
- `backend/app/models.py` — add AI audit models and optional audit log skeleton.
- `backend/app/core/database.py` — ensure startup schema patch can create missing AI tables if needed.
- `backend/app/api/routes/submissions.py` — create AI jobs/results on submit and update submission state.
- `backend/app/api/routes/reviews.py` — read persisted AI results instead of inline placeholder logic.
- `backend/app/api/routes/exports.py` — normalize export status flow and response semantics.
- `backend/app/api/router.py` — include any new route modules only if needed.

### New backend files to create
- `backend/app/services/ai_audit.py` — local synchronous AI audit executor and persistence helpers.
- `backend/app/services/audit_log.py` — minimal audit log helper or no-op-compatible writer.

### Tests to create or modify
- `backend/tests/conftest.py` — shared app/database fixtures.
- `backend/tests/test_submissions_api.py` — submit/draft/AI audit loop tests.
- `backend/tests/test_reviews_api.py` — pending/detail/approve/reject tests with real AI result reads.
- `backend/tests/test_exports_api.py` — create/list/detail/status semantics tests.
- `backend/tests/test_auth_api.py` — minimal login smoke test if not already present.

---

### Task 1: Establish backend test foundation

**Files:**
- Modify: `backend/requirements.txt`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_auth_api.py`

- [ ] **Step 1: Add the failing test dependencies declaration**

Update `backend/requirements.txt` to include the missing test dependencies:

```txt
fastapi==0.115.0
uvicorn==0.30.6
sqlalchemy==2.0.36
pymysql==1.1.1
python-dotenv==1.0.1
pydantic==2.9.2
pydantic-settings==2.5.2
pytest==8.3.3
httpx==0.27.2
```

- [ ] **Step 2: Create shared test fixtures**

Create `backend/tests/conftest.py` with a temporary SQLite-backed app fixture that overrides `get_db`:

```python
from collections.abc import Generator
from pathlib import Path
import sys

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.api.router import api_router
from app.core.database import Base, get_db
from app.main import app
from app.models import User

SQLALCHEMY_DATABASE_URL = 'sqlite:///./test_day4.db'
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={'check_same_thread': False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client(db_session: Session) -> Generator[TestClient, None, None]:
    def override_get_db() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def seed_users(db_session: Session) -> dict[str, User]:
    owner = User(username='owner_demo', display_name='Owner Demo', role='owner')
    labeler = User(username='labeler_demo', display_name='Labeler Demo', role='labeler')
    reviewer = User(username='reviewer_demo', display_name='Reviewer Demo', role='reviewer')
    db_session.add_all([owner, labeler, reviewer])
    db_session.commit()
    db_session.refresh(owner)
    db_session.refresh(labeler)
    db_session.refresh(reviewer)
    return {'owner': owner, 'labeler': labeler, 'reviewer': reviewer}
```

- [ ] **Step 3: Write the first failing auth smoke test**

Create `backend/tests/test_auth_api.py`:

```python
def test_login_returns_demo_user(client, seed_users):
    response = client.post('/api/auth/login', json={'username': 'owner_demo'})

    assert response.status_code == 200
    data = response.json()['data']
    assert data['user']['username'] == 'owner_demo'
    assert data['user']['role'] == 'owner'
    assert data['token'].startswith('demo-token-')
```

- [ ] **Step 4: Run the auth test**

Run: `python -m pytest backend/tests/test_auth_api.py -v`
Expected: PASS

- [ ] **Step 5: Commit the test foundation**

```bash
git add backend/requirements.txt backend/tests/conftest.py backend/tests/test_auth_api.py
git commit -m "test: add backend API test foundation"
```

### Task 2: Add AI audit persistence models

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/app/core/database.py`
- Test: `backend/tests/conftest.py`

- [ ] **Step 1: Write the failing model expectations into the test fixture flow**

Extend `backend/tests/conftest.py` to assert tables can be created with the new models by keeping `Base.metadata.create_all(bind=engine)` as the source of truth. No new test file is needed for this step because later API tests will fail if the schema is incomplete.

- [ ] **Step 2: Add minimal AI audit and audit log models**

Append to `backend/app/models.py`:

```python
class AIAuditJob(Base):
    __tablename__ = 'ai_audit_jobs'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey('submissions.id'), unique=True, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default='queued', nullable=False)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    submission: Mapped[Submission] = relationship('Submission')


class AIAuditResult(Base):
    __tablename__ = 'ai_audit_results'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    job_id: Mapped[int] = mapped_column(ForeignKey('ai_audit_jobs.id'), unique=True, nullable=False)
    submission_id: Mapped[int] = mapped_column(ForeignKey('submissions.id'), nullable=False)
    scores_json: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    decision: Mapped[str] = mapped_column(String(32), nullable=False)
    summary: Mapped[str] = mapped_column(Text, default='', nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    job: Mapped[AIAuditJob] = relationship('AIAuditJob')
    submission: Mapped[Submission] = relationship('Submission')


class AuditLog(Base):
    __tablename__ = 'audit_logs'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False)
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey('users.id'), nullable=True)
    payload_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    actor: Mapped[User | None] = relationship('User')
```

- [ ] **Step 3: Patch startup schema creation for existing local databases**

Update `backend/app/core/database.py` so any startup patch that currently adds missing task columns also creates the new AI and audit tables through `Base.metadata.create_all(bind=engine)` after patch logic.

```python
Base.metadata.create_all(bind=engine)
```

- [ ] **Step 4: Run the auth test again to verify schema compatibility**

Run: `python -m pytest backend/tests/test_auth_api.py -v`
Expected: PASS

- [ ] **Step 5: Commit the new models**

```bash
git add backend/app/models.py backend/app/core/database.py
git commit -m "feat: add ai audit persistence models"
```

### Task 3: Implement the synchronous AI audit service

**Files:**
- Create: `backend/app/services/ai_audit.py`
- Create: `backend/app/services/audit_log.py`
- Modify: `backend/app/models.py`
- Test: `backend/tests/test_submissions_api.py`

- [ ] **Step 1: Write the failing submission flow test**

Create `backend/tests/test_submissions_api.py`:

```python
from app.models import Assignment, Submission, Task, Template, TemplateVersion


def seed_submission_graph(db_session, seed_users):
    owner = seed_users['owner']
    labeler = seed_users['labeler']
    task = Task(title='Task A', description='Source text', status='published', quota=1, owner_id=owner.id)
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)

    template = Template(task_id=task.id, name='Template A', description='', created_by=owner.id)
    db_session.add(template)
    db_session.commit()
    db_session.refresh(template)

    version = TemplateVersion(
        template_id=template.id,
        version=1,
        schema_json={'components': [{'type': 'input', 'field': 'answer', 'label': 'Answer', 'required': True}]},
    )
    db_session.add(version)
    db_session.commit()
    db_session.refresh(version)

    assignment = Assignment(task_id=task.id, user_id=labeler.id, status='claimed')
    db_session.add(assignment)
    db_session.commit()
    db_session.refresh(assignment)

    submission = Submission(
        task_id=task.id,
        assignment_id=assignment.id,
        user_id=labeler.id,
        template_version_id=version.id,
        status='draft',
        answers_json={'answer': 'filled'},
    )
    db_session.add(submission)
    db_session.commit()
    db_session.refresh(submission)
    return submission


def test_submit_creates_ai_job_and_result(client, db_session, seed_users):
    submission = seed_submission_graph(db_session, seed_users)

    response = client.post(
        f'/api/submissions/{submission.id}/submit',
        headers={'X-Demo-User': 'labeler_demo'},
        json={},
    )

    assert response.status_code == 200
    body = response.json()['data']
    assert body['status'] == 'ai_passed'
```

- [ ] **Step 2: Run the submissions test to verify it fails**

Run: `python -m pytest backend/tests/test_submissions_api.py::test_submit_creates_ai_job_and_result -v`
Expected: FAIL because submit currently returns `submitted` and does not persist AI job/result.

- [ ] **Step 3: Implement the AI audit service**

Create `backend/app/services/ai_audit.py`:

```python
from sqlalchemy.orm import Session

from app.models import AIAuditJob, AIAuditResult, Submission


def run_local_ai_audit(submission: Submission) -> tuple[list[dict], str, str]:
    answers = submission.answers_json or {}
    answer_values = [value for value in answers.values() if value not in (None, '', [])]
    if not answer_values:
        return (
            [{'dimension': 'completeness', 'score': 1, 'reason': '答案为空，需要人工复核。'}],
            'human_review',
            '当前提交没有有效答案，建议人工复核。',
        )
    if all(isinstance(value, str) and len(value.strip()) < 2 for value in answer_values):
        return (
            [{'dimension': 'quality', 'score': 1, 'reason': '答案过短，需修改后重提。'}],
            'reject',
            '答案过短，未达到最小质量要求。',
        )
    return (
        [{'dimension': 'completeness', 'score': 4, 'reason': '答案已填写完整，可进入人工审核。'}],
        'pass',
        '已生成最小 AI 预审结果，等待 Reviewer 最终裁决。',
    )


def run_ai_audit_for_submission(db: Session, submission: Submission) -> tuple[AIAuditJob, AIAuditResult]:
    job = db.query(AIAuditJob).filter(AIAuditJob.submission_id == submission.id).first()
    if not job:
        job = AIAuditJob(submission_id=submission.id, status='queued', attempt_count=0)
        db.add(job)
        db.flush()

    job.status = 'processing'
    job.attempt_count += 1
    db.flush()

    try:
        scores, decision, summary = run_local_ai_audit(submission)
        result = db.query(AIAuditResult).filter(AIAuditResult.job_id == job.id).first()
        if not result:
            result = AIAuditResult(job_id=job.id, submission_id=submission.id, scores_json=scores, decision=decision, summary=summary)
            db.add(result)
        else:
            result.scores_json = scores
            result.decision = decision
            result.summary = summary

        submission.status = 'needs_revision' if decision == 'reject' else 'ai_passed'
        job.status = 'done'
        job.error_message = None
        db.flush()
        return job, result
    except Exception as exc:
        job.status = 'failed'
        job.error_message = str(exc)
        db.flush()
        raise
```

- [ ] **Step 4: Implement the minimal audit log helper**

Create `backend/app/services/audit_log.py`:

```python
from sqlalchemy.orm import Session

from app.models import AuditLog


def write_audit_log(
    db: Session,
    *,
    event_type: str,
    entity_type: str,
    entity_id: int,
    actor_user_id: int | None,
    payload: dict,
) -> AuditLog:
    log = AuditLog(
        event_type=event_type,
        entity_type=entity_type,
        entity_id=entity_id,
        actor_user_id=actor_user_id,
        payload_json=payload,
    )
    db.add(log)
    db.flush()
    return log
```

- [ ] **Step 5: Run the submissions test again**

Run: `python -m pytest backend/tests/test_submissions_api.py::test_submit_creates_ai_job_and_result -v`
Expected: still FAIL until the route is wired.

### Task 4: Wire submission submit flow into AI audit and audit logs

**Files:**
- Modify: `backend/app/api/routes/submissions.py`
- Modify: `backend/app/services/ai_audit.py`
- Modify: `backend/app/services/audit_log.py`
- Test: `backend/tests/test_submissions_api.py`

- [ ] **Step 1: Add a second failing boundary test for repeat submission**

Append to `backend/tests/test_submissions_api.py`:

```python
def test_submit_rejects_already_submitted_submission(client, db_session, seed_users):
    submission = seed_submission_graph(db_session, seed_users)

    first = client.post(
        f'/api/submissions/{submission.id}/submit',
        headers={'X-Demo-User': 'labeler_demo'},
        json={},
    )
    assert first.status_code == 200

    second = client.post(
        f'/api/submissions/{submission.id}/submit',
        headers={'X-Demo-User': 'labeler_demo'},
        json={},
    )
    assert second.status_code == 409
```

- [ ] **Step 2: Update the submit route to run AI audit synchronously**

Modify `backend/app/api/routes/submissions.py` imports and submit body:

```python
from app.models import Assignment, Submission, TemplateVersion
from app.services.ai_audit import run_ai_audit_for_submission
from app.services.audit_log import write_audit_log
```

Replace the tail of `submit_answers` with:

```python
    submission.status = 'submitted'
    db.flush()
    write_audit_log(
        db,
        event_type='submission_submitted',
        entity_type='submission',
        entity_id=submission.id,
        actor_user_id=user.id,
        payload={'assignmentId': submission.assignment_id},
    )

    job, result = run_ai_audit_for_submission(db, submission)
    write_audit_log(
        db,
        event_type='ai_audit_finished',
        entity_type='submission',
        entity_id=submission.id,
        actor_user_id=None,
        payload={'jobId': job.id, 'decision': result.decision},
    )
    db.commit()
    db.refresh(submission)

    return success(
        {
            'submissionId': submission.id,
            'status': submission.status,
            'submittedAt': submission.updated_at,
            'aiDecision': result.decision,
        }
    )
```

- [ ] **Step 3: Run the submissions tests**

Run: `python -m pytest backend/tests/test_submissions_api.py -v`
Expected: PASS

- [ ] **Step 4: Commit the submit flow integration**

```bash
git add backend/app/api/routes/submissions.py backend/app/services/ai_audit.py backend/app/services/audit_log.py backend/tests/test_submissions_api.py
git commit -m "feat: run ai audit on submission submit"
```

### Task 5: Make reviews consume persisted AI results

**Files:**
- Modify: `backend/app/api/routes/reviews.py`
- Test: `backend/tests/test_reviews_api.py`

- [ ] **Step 1: Write the failing review detail test**

Create `backend/tests/test_reviews_api.py`:

```python
from app.models import AIAuditJob, AIAuditResult, Assignment, Submission, Task, Template, TemplateVersion


def seed_reviewable_submission(db_session, seed_users):
    owner = seed_users['owner']
    labeler = seed_users['labeler']
    task = Task(title='Review Task', description='Source text', status='published', quota=1, owner_id=owner.id)
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)

    template = Template(task_id=task.id, name='Review Template', description='', created_by=owner.id)
    db_session.add(template)
    db_session.commit()
    db_session.refresh(template)

    version = TemplateVersion(template_id=template.id, version=1, schema_json={'components': []})
    db_session.add(version)
    db_session.commit()
    db_session.refresh(version)

    assignment = Assignment(task_id=task.id, user_id=labeler.id, status='claimed')
    db_session.add(assignment)
    db_session.commit()
    db_session.refresh(assignment)

    submission = Submission(
        task_id=task.id,
        assignment_id=assignment.id,
        user_id=labeler.id,
        template_version_id=version.id,
        status='ai_passed',
        answers_json={'answer': 'valid answer'},
    )
    db_session.add(submission)
    db_session.commit()
    db_session.refresh(submission)

    job = AIAuditJob(submission_id=submission.id, status='done', attempt_count=1)
    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)

    result = AIAuditResult(
        job_id=job.id,
        submission_id=submission.id,
        scores_json=[{'dimension': 'completeness', 'score': 4, 'reason': 'ok'}],
        decision='pass',
        summary='summary text',
    )
    db_session.add(result)
    db_session.commit()
    db_session.refresh(result)
    return submission


def test_review_detail_reads_persisted_ai_result(client, db_session, seed_users):
    submission = seed_reviewable_submission(db_session, seed_users)

    response = client.get(f'/api/reviews/{submission.id}', headers={'X-Demo-User': 'reviewer_demo'})

    assert response.status_code == 200
    data = response.json()['data']
    assert data['aiResult']['decision'] == 'pass'
    assert data['aiResult']['summary'] == 'summary text'
```

- [ ] **Step 2: Run the review detail test to verify it fails**

Run: `python -m pytest backend/tests/test_reviews_api.py::test_review_detail_reads_persisted_ai_result -v`
Expected: FAIL because reviews currently build inline placeholder AI data.

- [ ] **Step 3: Replace inline placeholder AI result reads**

Update `backend/app/api/routes/reviews.py` to import and query `AIAuditResult`:

```python
from app.models import AIAuditResult, Submission
```

Replace `to_ai_result()` with:

```python
def get_ai_result(submission_id: int, db: Session) -> dict:
    result = (
        db.query(AIAuditResult)
        .filter(AIAuditResult.submission_id == submission_id)
        .order_by(AIAuditResult.id.desc())
        .first()
    )
    if not result:
        raise HTTPException(status_code=409, detail='submission has no ai result yet')
    return {
        'scores': result.scores_json,
        'decision': result.decision,
        'summary': result.summary,
    }
```

Update pending/detail response construction to call `get_ai_result(submission.id, db)` once per submission.

- [ ] **Step 4: Add failing reject boundary test and then satisfy it**

Append to `backend/tests/test_reviews_api.py`:

```python
def test_reject_requires_reason(client, db_session, seed_users):
    submission = seed_reviewable_submission(db_session, seed_users)

    response = client.post(
        f'/api/reviews/{submission.id}/reject',
        headers={'X-Demo-User': 'reviewer_demo'},
        json={'reason': '   '},
    )

    assert response.status_code == 400
```

This should already pass after route changes; keep it as a guard.

- [ ] **Step 5: Run the reviews tests**

Run: `python -m pytest backend/tests/test_reviews_api.py -v`
Expected: PASS

- [ ] **Step 6: Commit the reviews integration**

```bash
git add backend/app/api/routes/reviews.py backend/tests/test_reviews_api.py
git commit -m "feat: load persisted ai results in reviews"
```

### Task 6: Normalize export semantics and protect current behavior

**Files:**
- Modify: `backend/app/api/routes/exports.py`
- Test: `backend/tests/test_exports_api.py`

- [ ] **Step 1: Write the failing export lifecycle test**

Create `backend/tests/test_exports_api.py`:

```python
from app.models import Task


def seed_export_task(db_session, seed_users):
    owner = seed_users['owner']
    task = Task(title='Export Task', description='For export', status='published', quota=1, owner_id=owner.id)
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)
    return task


def test_export_detail_moves_from_queued_to_done(client, db_session, seed_users):
    task = seed_export_task(db_session, seed_users)

    created = client.post('/api/exports', headers={'X-Demo-User': 'owner_demo'}, json={'taskId': task.id, 'format': 'json'})
    assert created.status_code == 200
    job_id = created.json()['data']['jobId']
    assert created.json()['data']['status'] == 'queued'

    detail = client.get(f'/api/exports/{job_id}', headers={'X-Demo-User': 'owner_demo'})
    assert detail.status_code == 200
    data = detail.json()['data']
    assert data['status'] == 'done'
    assert data['downloadUrl'].endswith(f'export-{job_id}.json')
```

- [ ] **Step 2: Run the export lifecycle test**

Run: `python -m pytest backend/tests/test_exports_api.py::test_export_detail_moves_from_queued_to_done -v`
Expected: PASS or near-pass depending on current behavior; keep it as a regression lock.

- [ ] **Step 3: Add boundary tests for missing jobs and filtered lists**

Append to `backend/tests/test_exports_api.py`:

```python
def test_export_detail_returns_404_for_missing_job(client, seed_users):
    response = client.get('/api/exports/99999', headers={'X-Demo-User': 'owner_demo'})
    assert response.status_code == 404


def test_export_list_filters_by_task_id(client, db_session, seed_users):
    first = seed_export_task(db_session, seed_users)
    second = seed_export_task(db_session, seed_users)

    client.post('/api/exports', headers={'X-Demo-User': 'owner_demo'}, json={'taskId': first.id, 'format': 'json'})
    client.post('/api/exports', headers={'X-Demo-User': 'owner_demo'}, json={'taskId': second.id, 'format': 'csv'})

    response = client.get(f'/api/exports?taskId={first.id}', headers={'X-Demo-User': 'owner_demo'})
    assert response.status_code == 200
    items = response.json()['data']['items']
    assert len(items) == 1
    assert items[0]['taskId'] == first.id
```

- [ ] **Step 4: Normalize in-memory export statuses without changing storage strategy**

Update `backend/app/api/routes/exports.py` so the transition becomes explicit:

```python
    if job['status'] == 'queued':
        processing_job = {**job, 'status': 'processing'}
        for index, item in enumerate(_EXPORT_JOBS):
            if item['jobId'] == job_id:
                _EXPORT_JOBS[index] = processing_job
                job = processing_job
                break

    if job['status'] == 'processing':
        job = {
            **job,
            'status': 'done',
            'downloadUrl': build_download_url(job_id, job['format']),
            'finishedAt': utc_now_iso(),
        }
        for index, item in enumerate(_EXPORT_JOBS):
            if item['jobId'] == job_id:
                _EXPORT_JOBS[index] = job
                break
```

- [ ] **Step 5: Run the exports tests**

Run: `python -m pytest backend/tests/test_exports_api.py -v`
Expected: PASS

- [ ] **Step 6: Commit the export regression coverage**

```bash
git add backend/app/api/routes/exports.py backend/tests/test_exports_api.py
git commit -m "test: cover export lifecycle semantics"
```

### Task 7: Run the focused backend regression pack

**Files:**
- Test: `backend/tests/test_auth_api.py`
- Test: `backend/tests/test_submissions_api.py`
- Test: `backend/tests/test_reviews_api.py`
- Test: `backend/tests/test_exports_api.py`

- [ ] **Step 1: Run the focused suite**

Run: `python -m pytest backend/tests/test_auth_api.py backend/tests/test_submissions_api.py backend/tests/test_reviews_api.py backend/tests/test_exports_api.py -v`
Expected: all selected tests PASS

- [ ] **Step 2: Run the frontend regression tests most affected by backend status semantics**

Run: `npm test -- --runInBand frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.test.tsx frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.test.tsx frontend/src/pages/owner/exports/OwnerExportsPage.test.tsx`
Expected: PASS

- [ ] **Step 3: Do a final local smoke path if servers are available**

Run the local app and manually check:
- labeler submit returns AI-driven status
- reviewer detail shows persisted AI result
- owner export still creates and resolves job detail

Expected: golden path still works without relying on placeholder AI responses.

- [ ] **Step 4: Commit any final verification-only adjustments**

```bash
git add backend/tests backend/app frontend/src/pages
git commit -m "chore: verify backend day4 strengthening flow"
```

---

## Self-Review Notes
- Spec coverage: tests, AI audit models/service, review consumption, export semantics, and audit log skeleton are all covered.
- No placeholders remain for the intended Day 4 path; any optional work is explicitly labeled optional and not required for the core loop.
- Type consistency: `AIAuditJob`, `AIAuditResult`, `AuditLog`, `run_ai_audit_for_submission`, and `get_ai_result` are used consistently across tasks.

---

Plan complete and saved to `docs/superpowers/plans/2026-05-26-day4-b-backend-strengthening-implementation-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

User preference in this session indicates automatic continuation after writing the documents, so the next step should use **superpowers:subagent-driven-development** unless the user overrides it.
