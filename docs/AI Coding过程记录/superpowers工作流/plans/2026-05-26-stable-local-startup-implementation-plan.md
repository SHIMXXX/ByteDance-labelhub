# Stable Local Startup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a stable one-command local startup workflow for Windows that launches the current verified LabelHub frontend and backend with fixed ports and aligned documentation.

**Architecture:** Keep the current verified backend port `8765` and frontend port `5176`, and add a single Windows-friendly startup script at repo root to launch both processes. Update Vite proxy and docs so the runtime behavior, demo script, and startup instructions all use the same source of truth.

**Tech Stack:** Windows shell/batch, Vite, FastAPI/Uvicorn, Markdown docs

---

## File Structure

- Modify: `frontend/vite.config.ts`
  - Keep the dev server pinned to the verified frontend port and backend proxy target used by the startup workflow.
- Create: `start-dev.bat`
  - One-command Windows startup entrypoint that launches backend and frontend in separate shells.
- Modify: `README.md`
  - Add stable local startup instructions and the verified port pairing.
- Modify: `docs/demo-script.md`
  - Align demo steps with the new one-command startup flow.
- Modify: `.claude/context/progress-A.md`
  - Record the stable startup workflow and any remaining limitations.
- Modify: `PLANROAD-A.md`
  - Update Day 3 completion state only if runtime evidence supports it after verification.

---

### Task 1: Lock startup configuration to one stable workflow

**Files:**
- Modify: `frontend/vite.config.ts`
- Create: `start-dev.bat`

- [ ] **Step 1: Write the failing verification expectation**

Expectation to verify after implementation:
- Running `start-dev.bat` should open two shells: backend on `127.0.0.1:8765`, frontend on `127.0.0.1:5176`.
- Frontend requests to `/api/*` should proxy to `127.0.0.1:8765`.

- [ ] **Step 2: Verify current startup is fragmented**

Run:
```bash
python - <<'PY'
from pathlib import Path
print(Path('frontend/vite.config.ts').read_text(encoding='utf-8'))
print(Path('start-dev.bat').exists())
PY
```
Expected:
- `vite.config.ts` still needs to be checked against the final chosen ports
- `start-dev.bat` does not exist yet

- [ ] **Step 3: Write minimal stable Vite config**

Target code in `frontend/vite.config.ts`:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5176,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8765',
      },
    },
  },
})
```

- [ ] **Step 4: Add one-command Windows startup script**

Create `start-dev.bat` with this exact content:
```bat
@echo off
setlocal

set BACKEND_PORT=8765
set FRONTEND_PORT=5176

start "LabelHub Backend" cmd /k "python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port %BACKEND_PORT%"
start "LabelHub Frontend" cmd /k "npm --prefix frontend run dev -- --host 127.0.0.1 --port %FRONTEND_PORT%"

echo LabelHub dev services are starting...
exit /b 0
```

- [ ] **Step 5: Verify the file contents are correct**

Run:
```bash
python - <<'PY'
from pathlib import Path
print(Path('start-dev.bat').read_text(encoding='utf-8'))
print(Path('frontend/vite.config.ts').read_text(encoding='utf-8'))
PY
```
Expected:
- `start-dev.bat` exists
- backend port is `8765`
- frontend port is `5176`
- Vite proxy target is `http://127.0.0.1:8765`

---

### Task 2: Align documentation with the stable startup workflow

**Files:**
- Modify: `README.md`
- Modify: `docs/demo-script.md`

- [ ] **Step 1: Write the failing documentation expectation**

Expectation to verify after implementation:
- README shows one-command startup via `start-dev.bat`
- Demo script startup section uses the same ports and mentions the script first

- [ ] **Step 2: Inspect current docs for mismatch**

Run:
```bash
python - <<'PY'
from pathlib import Path
print('README has start-dev.bat:', 'start-dev.bat' in Path('README.md').read_text(encoding='utf-8'))
print('demo-script has start-dev.bat:', 'start-dev.bat' in Path('docs/demo-script.md').read_text(encoding='utf-8'))
PY
```
Expected:
- At least one file does not yet mention `start-dev.bat`

- [ ] **Step 3: Update README with stable startup instructions**

Add a concise section to `README.md` containing:
```md
## 本地启动（稳定方案）

Windows 环境下，优先使用根目录脚本一键启动：

```bash
start-dev.bat
```

默认端口：
- 前端：`http://127.0.0.1:5176`
- 后端：`http://127.0.0.1:8765`
```
```

- [ ] **Step 4: Update demo script to prefer one-command startup**

Change `docs/demo-script.md` startup section to:
```md
## 1. 启动方式

优先使用一键启动脚本：

```bash
start-dev.bat
```

默认端口：
- 前端：`http://127.0.0.1:5176/`
- 后端：`http://127.0.0.1:8765`
```

Retain the explicit backend/frontend commands below as fallback instructions only if needed.

- [ ] **Step 5: Verify docs are aligned**

Run:
```bash
python - <<'PY'
from pathlib import Path
readme = Path('README.md').read_text(encoding='utf-8')
demo = Path('docs/demo-script.md').read_text(encoding='utf-8')
print('README start-dev.bat:', 'start-dev.bat' in readme)
print('Demo start-dev.bat:', 'start-dev.bat' in demo)
print('README 5176:', '5176' in readme)
print('README 8765:', '8765' in readme)
print('Demo 5176:', '5176' in demo)
print('Demo 8765:', '8765' in demo)
PY
```
Expected:
- all checks print `True`

---

### Task 3: Runtime verification of the stable startup path

**Files:**
- Modify: `.claude/context/progress-A.md`
- Modify: `PLANROAD-A.md`

- [ ] **Step 1: Run the startup script**

Run:
```bash
cmd //c start-dev.bat
```
Expected:
- command exits successfully
- separate backend and frontend shells open

- [ ] **Step 2: Verify backend is reachable**

Run:
```bash
python - <<'PY'
import urllib.request
print(urllib.request.urlopen('http://127.0.0.1:8765/api/v1/health').read().decode())
PY
```
Expected:
- health response returns successfully

- [ ] **Step 3: Verify frontend is reachable**

Run:
```bash
python - <<'PY'
import urllib.request
html = urllib.request.urlopen('http://127.0.0.1:5176/').read().decode('utf-8')
print('LabelHub' in html)
PY
```
Expected:
- prints `True`

- [ ] **Step 4: Verify browser golden path still loads under stable startup**

Use browser verification on:
- `/labeler/workbench?assignmentId=5`
- `/reviewer/reviews`
- `/owner/exports`

Expected:
- all three pages load using the stable startup pair `8765 + 5176`

- [ ] **Step 5: Update progress record with verified startup workflow**

Append factual status to `.claude/context/progress-A.md` describing:
- stable startup script exists
- verified ports
- any remaining limitation (for example, if port 8000/8001 remain unusable)

- [ ] **Step 6: Update PLANROAD-A only if evidence supports it**

If runtime verification passes, update only the items now proven by evidence:
- Day 3 script/documentation items
- any startup-stability-related completion notes

---

### Task 4: Final day-wide review and automatic fix pass

**Files:**
- Review all touched files from today

- [ ] **Step 1: Run targeted checks for today’s changed areas**

Run:
```bash
npm --prefix frontend test -- --run src/pages/labeler/workbench/LabelerWorkbenchPage.test.tsx src/pages/reviewer/reviews/ReviewerReviewsPage.test.tsx src/pages/owner/exports/OwnerExportsPage.test.tsx
```
Expected:
- all targeted frontend tests pass

- [ ] **Step 2: Review current working diff**

Run:
```bash
git diff -- backend/app/api/router.py backend/app/api/routes/reviews.py backend/app/api/routes/exports.py backend/app/api/routes/submissions.py frontend/src/pages/reviewer/reviews/ReviewerReviewsPage.tsx frontend/src/pages/owner/exports/OwnerExportsPage.tsx frontend/src/pages/owner/exports/OwnerExportsPage.test.tsx frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.tsx frontend/vite.config.ts README.md docs/demo-script.md .claude/context/progress-A.md PLANROAD-A.md
```
Expected:
- inspect only the files changed for today’s scope

- [ ] **Step 3: Request code review**

Dispatch code review on today’s changes, focusing on:
- incorrect route registration
- mock/real interface mismatches
- brittle startup assumptions
- misleading progress claims

- [ ] **Step 4: If review finds issues, apply minimal fixes and re-run relevant verification**

For every issue found:
- fix only that issue
- re-run the smallest relevant verification command
- do not batch unrelated refactors

- [ ] **Step 5: Update final progress record**

Record the final verified state of today’s work in `.claude/context/progress-A.md`.

---

## Self-Review

- Spec coverage: covers one-command startup, stable ports, doc sync, runtime verification, and end-of-day review.
- Placeholder scan: no TBD/TODO placeholders remain.
- Type consistency: ports are consistently `8765` backend and `5176` frontend; startup script name is consistently `start-dev.bat`.
