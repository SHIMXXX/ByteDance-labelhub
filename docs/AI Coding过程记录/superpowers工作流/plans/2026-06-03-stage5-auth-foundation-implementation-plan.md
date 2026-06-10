# Stage 5 Auth Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把当前 demo token 登录升级为真实用户名密码 + JWT 认证，同时保留三角色演示账号快捷填充，形成阶段五的认证基础层。

**Architecture:** 后端在现有 `User` 模型上补 `password_hash`，通过最小 JWT 签发与解析替换 `DEMO_TOKENS` / `get_demo_user` 语义；前端把角色卡片直登升级为标准账号密码表单，并保留演示账号快捷填充，`RoleGuard` 改为依赖 token + 登录返回 role 的最小真实语义。当前只做认证基础层，不进入资源归属约束和部署编排。

**Tech Stack:** FastAPI, SQLAlchemy ORM, PyJWT/标准 JWT 库（按项目现有 Python 依赖补齐）, pytest, React 18, TypeScript, Vite, Vitest, Testing Library, Chrome DevTools MCP

---

## File Map

### 后端认证与模型
- Modify: `backend/app/models.py` — 给 `User` 增加 `password_hash`
- Modify: `backend/app/core/database.py` — 为 `users.password_hash` 增加 schema patch
- Modify: `backend/app/core/config.py` — 增加 JWT secret / expire minutes 等最小配置
- Create: `backend/app/services/auth_security.py` — 密码哈希、密码校验、JWT 签发、JWT 解析
- Modify: `backend/app/api/deps.py` — 替换 `get_demo_user` / `token_for_user` 逻辑为 JWT 当前用户依赖，保留 `require_role`
- Modify: `backend/app/api/routes/auth.py` — `/auth/login`、`/auth/me` 切到用户名密码 + JWT
- Modify: `backend/scripts/seed_demo_data.py`（如需要） — 为 demo 用户补默认密码
- Modify: `backend/app/main.py` / 启动初始化路径（如需要） — 确保 demo 用户 hash 可落地

### 后端测试
- Modify: `backend/tests/test_auth_api.py`
- Modify: `backend/tests/test_database_schema.py`
- Modify: `backend/tests/conftest.py`（如需要共享 demo 密码）
- Modify: `backend/tests/test_tasks_api.py` / `backend/tests/test_reviews_api.py` / `backend/tests/test_submissions_api.py`（如需要适配 JWT 认证测试入口）

### 前端登录与守卫
- Modify: `frontend/src/pages/auth/LoginPage.tsx`
- Modify: `frontend/src/pages/auth/LoginPage.test.tsx`
- Modify: `frontend/src/router/guards.tsx`
- Modify: `frontend/src/services/api/client.ts`
- Modify: `frontend/src/types/domain.ts`（如需补登录返回用户结构）
- Modify: `frontend/src/App.tsx`（如需要测试路由入口配合）

### 文档与阶段回写
- Modify: `docs/api-contracts/labelhub-v1.md`
- Modify: `README.md`
- Modify: `PLANROAD-B.md`
- Modify: `.claude/context/progress-A.md`
- Modify: `.claude/context/decisions-A.md`
- Modify: `.claude/context/architecture-A.md`

---

### Task 1: 搭好后端认证基础设施（password_hash + JWT service）

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/app/core/database.py`
- Modify: `backend/app/core/config.py`
- Create: `backend/app/services/auth_security.py`
- Test: `backend/tests/test_database_schema.py`

- [ ] **Step 1: Write the failing schema/config test**

`backend/tests/test_database_schema.py`
```python
from sqlalchemy import inspect
from app.core.config import settings


def test_patch_schema_adds_user_password_hash_column():
    inspector = inspect(engine)
    user_columns = {column['name'] for column in inspector.get_columns('users')}
    assert 'password_hash' in user_columns


def test_auth_settings_exist():
    assert settings.jwt_secret_key
    assert settings.jwt_expire_minutes > 0
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_database_schema.py -q
```
Expected: FAIL because `password_hash` field and/or auth settings do not exist yet.

- [ ] **Step 3: Write the minimal model/config/security code**

`backend/app/models.py`
```python
class User(Base):
    __tablename__ = 'users'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(128), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
```

`backend/app/core/config.py`
```python
jwt_secret_key: str = 'labelhub-dev-secret'
jwt_expire_minutes: int = 120
```

`backend/app/core/database.py`
```python
if 'users' in table_names:
    user_columns = {column['name'] for column in inspector.get_columns('users')}
    if 'password_hash' not in user_columns:
        statements.append('ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL')
```

`backend/app/services/auth_security.py`
```python
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import jwt

from app.core.config import settings


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode('utf-8')).hexdigest()


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        return False
    return hmac.compare_digest(hash_password(password), password_hash)


def create_access_token(subject: str, role: str) -> str:
    expire_at = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    return jwt.encode({'sub': subject, 'role': role, 'exp': expire_at}, settings.jwt_secret_key, algorithm='HS256')


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret_key, algorithms=['HS256'])
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_database_schema.py -q
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/models.py backend/app/core/database.py backend/app/core/config.py backend/app/services/auth_security.py backend/tests/test_database_schema.py
git commit -m "feat: add auth foundation model and jwt service"
```

---

### Task 2: 把 `/auth/login` 与 `/auth/me` 切到用户名密码 + JWT

**Files:**
- Modify: `backend/app/api/deps.py`
- Modify: `backend/app/api/routes/auth.py`
- Test: `backend/tests/test_auth_api.py`

- [ ] **Step 1: Write the failing auth tests**

`backend/tests/test_auth_api.py`
```python
def test_login_returns_jwt_for_valid_username_and_password(client, db_session, seed_users):
    response = client.post('/api/v1/auth/login', json={'username': 'owner_demo', 'password': 'demo-owner-123'})
    assert response.status_code == 200
    assert response.json()['data']['token']
    assert response.json()['data']['user']['role'] == 'owner'


def test_login_rejects_invalid_password(client, db_session, seed_users):
    response = client.post('/api/v1/auth/login', json={'username': 'owner_demo', 'password': 'wrong'})
    assert response.status_code == 401


def test_auth_me_reads_user_from_bearer_token(client, db_session, seed_users):
    login = client.post('/api/v1/auth/login', json={'username': 'owner_demo', 'password': 'demo-owner-123'})
    token = login.json()['data']['token']
    me = client.get('/api/v1/auth/me', headers={'Authorization': f'Bearer {token}'})
    assert me.status_code == 200
    assert me.json()['data']['username'] == 'owner_demo'
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_auth_api.py -q
```
Expected: FAIL because current login still accepts role/demo token semantics.

- [ ] **Step 3: Write the minimal auth route/dependency changes**

`backend/app/api/deps.py`
```python
from app.services.auth_security import create_access_token, decode_access_token


def token_for_user(user: User) -> str:
    return create_access_token(user.username, user.role)


def get_current_user_from_token(
    db: Session,
    authorization: Annotated[str | None, Header()] = None,
) -> User:
    if not authorization or not authorization.lower().startswith('bearer '):
        raise HTTPException(status_code=401, detail='missing bearer token')

    token = authorization.split(' ', 1)[1]
    try:
        payload = decode_access_token(token)
    except Exception as exc:
        raise HTTPException(status_code=401, detail='invalid access token') from exc

    username = payload.get('sub')
    if not username:
        raise HTTPException(status_code=401, detail='invalid access token')

    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail='user not found')
    return user
```

`backend/app/api/routes/auth.py`
```python
from app.services.auth_security import verify_password


@router.post('/login')
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> dict:
    if not payload.username or not payload.password:
        raise HTTPException(status_code=400, detail='username and password are required')

    user = db.query(User).filter(User.username == payload.username).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail='invalid username or password')

    return success({'token': token_for_user(user), 'user': user_to_dict(user)})


@router.get('/me')
def get_current_user(
    db: Session = Depends(get_db),
    authorization: Annotated[str | None, Header()] = None,
) -> dict:
    user = get_current_user_from_token(db, authorization)
    return success(user_to_dict(user))
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_auth_api.py -q
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/deps.py backend/app/api/routes/auth.py backend/tests/test_auth_api.py
git commit -m "feat: switch auth routes to username password jwt"
```

---

### Task 3: 让 demo 用户自动具备默认密码哈希

**Files:**
- Modify: `backend/tests/conftest.py`
- Modify: `backend/scripts/seed_demo_data.py`
- Modify: 启动初始化路径（按实际项目结构）
- Test: `backend/tests/test_auth_api.py`

- [ ] **Step 1: Write the failing demo-user compatibility test**

`backend/tests/test_auth_api.py`
```python
def test_demo_accounts_can_login_with_default_password(client, db_session, seed_users):
    for username, password in [
        ('owner_demo', 'demo-owner-123'),
        ('labeler_demo', 'demo-labeler-123'),
        ('reviewer_demo', 'demo-reviewer-123'),
    ]:
        response = client.post('/api/v1/auth/login', json={'username': username, 'password': password})
        assert response.status_code == 200
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_auth_api.py::test_demo_accounts_can_login_with_default_password -q
```
Expected: FAIL if demo users do not have password hashes yet.

- [ ] **Step 3: Write the minimal compatibility path**

`backend/tests/conftest.py`
```python
from app.services.auth_security import hash_password

owner = User(username='owner_demo', display_name='Owner Demo', role='owner', password_hash=hash_password('demo-owner-123'))
labeler = User(username='labeler_demo', display_name='Labeler Demo', role='labeler', password_hash=hash_password('demo-labeler-123'))
reviewer = User(username='reviewer_demo', display_name='Reviewer Demo', role='reviewer', password_hash=hash_password('demo-reviewer-123'))
```

`backend/scripts/seed_demo_data.py`
```python
# 确保 demo 用户存在且补齐默认 password_hash
```

若当前启动初始化路径会自动创建 demo 用户，也同步补上哈希。

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_auth_api.py::test_demo_accounts_can_login_with_default_password -q
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/tests/conftest.py backend/scripts/seed_demo_data.py backend/tests/test_auth_api.py
git commit -m "feat: add default passwords for demo accounts"
```

---

### Task 4: 替换后端业务路由里的当前用户入口并保住角色门

**Files:**
- Modify: `backend/app/api/routes/tasks.py`
- Modify: `backend/app/api/routes/datasets.py`
- Modify: `backend/app/api/routes/templates.py`
- Modify: `backend/app/api/routes/submissions.py`
- Modify: `backend/app/api/routes/workbench.py`
- Modify: `backend/app/api/routes/reviews.py`
- Modify: `backend/app/api/routes/exports.py`
- Test: `backend/tests/test_tasks_api.py`
- Test: `backend/tests/test_reviews_api.py`
- Test: `backend/tests/test_submissions_api.py`

- [ ] **Step 1: Write/adjust one failing authorization test**

`backend/tests/test_tasks_api.py`
```python
def test_owner_route_rejects_reviewer_token(client, db_session, seed_users):
    login = client.post('/api/v1/auth/login', json={'username': 'reviewer_demo', 'password': 'demo-reviewer-123'})
    token = login.json()['data']['token']
    response = client.get('/api/v1/tasks', headers={'Authorization': f'Bearer {token}'})
    assert response.status_code == 403
```

- [ ] **Step 2: Run the test to verify failure or current mismatch**

Run:
```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_tasks_api.py::test_owner_route_rejects_reviewer_token -q
```
Expected: FAIL or require route dependency updates.

- [ ] **Step 3: Replace `get_demo_user(...)` call sites with JWT current user dependency**

Representative change pattern in route files:
```python
user = get_current_user_from_token(db, authorization)
require_role(user, {'owner'})
```

Apply the same pattern consistently across owner / labeler / reviewer route groups while preserving `require_role()` behavior.

- [ ] **Step 4: Run focused route tests**

Run:
```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_tasks_api.py backend/tests/test_reviews_api.py backend/tests/test_submissions_api.py -q
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/tasks.py backend/app/api/routes/datasets.py backend/app/api/routes/templates.py backend/app/api/routes/submissions.py backend/app/api/routes/workbench.py backend/app/api/routes/reviews.py backend/app/api/routes/exports.py backend/tests/test_tasks_api.py backend/tests/test_reviews_api.py backend/tests/test_submissions_api.py
git commit -m "refactor: switch protected routes to jwt current user"
```

---

### Task 5: 把前端登录页改成账号密码表单 + 演示账号快捷填充

**Files:**
- Modify: `frontend/src/pages/auth/LoginPage.tsx`
- Modify: `frontend/src/pages/auth/LoginPage.test.tsx`
- Modify: `frontend/src/types/domain.ts`（如需）

- [ ] **Step 1: Write the failing login page tests**

`frontend/src/pages/auth/LoginPage.test.tsx`
```tsx
it('renders username password form and fills demo account shortcuts', async () => {
  render(<LoginPage />)
  expect(screen.getByLabelText('用户名')).toBeInTheDocument()
  expect(screen.getByLabelText('密码')).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: '填充 Owner 演示账号' }))
  expect(screen.getByLabelText('用户名')).toHaveValue('owner_demo')
  expect(screen.getByLabelText('密码')).toHaveValue('demo-owner-123')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npm --prefix frontend run test -- src/pages/auth/LoginPage.test.tsx
```
Expected: FAIL because current page only has role cards.

- [ ] **Step 3: Write the minimal login page implementation**

`frontend/src/pages/auth/LoginPage.tsx`
```tsx
const demoAccounts = {
  owner: { username: 'owner_demo', password: 'demo-owner-123', path: '/owner' },
  labeler: { username: 'labeler_demo', password: 'demo-labeler-123', path: '/labeler' },
  reviewer: { username: 'reviewer_demo', password: 'demo-reviewer-123', path: '/reviewer' },
}
```

```tsx
const [username, setUsername] = useState('')
const [password, setPassword] = useState('')
```

```tsx
await apiPost<LoginResponse, { username: string; password: string }>('/auth/login', { username, password })
```

```tsx
<button type="button" onClick={() => fillDemo('owner')}>填充 Owner 演示账号</button>
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npm --prefix frontend run test -- src/pages/auth/LoginPage.test.tsx
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/auth/LoginPage.tsx frontend/src/pages/auth/LoginPage.test.tsx frontend/src/types/domain.ts
git commit -m "feat: add username password login page with demo fill"
```

---

### Task 6: 调整 RoleGuard 到真实登录语义

**Files:**
- Modify: `frontend/src/router/guards.tsx`
- Modify: `frontend/src/services/api/client.ts`
- Modify: `frontend/src/App.test.tsx`（如有守卫测试）
- Create/Modify: 守卫相关测试文件（按项目现状）

- [ ] **Step 1: Write the failing guard tests**

```tsx
it('redirects to login when token is missing', () => {})
it('redirects to saved user role home when role mismatches', () => {})
it('allows route when token and saved role match', () => {})
```

- [ ] **Step 2: Run tests to verify failure**

Run:
```bash
npm --prefix frontend run test -- src/App.test.tsx
```
Expected: FAIL or expose current dependency on `labelhub_demo_role` semantics.

- [ ] **Step 3: Write minimal guard changes**

`frontend/src/router/guards.tsx`
```tsx
const token = getAuthToken()
if (!token) return <Navigate to="/" replace />

const savedRole = window.localStorage.getItem('labelhub_role') as UserRole | null
if (savedRole && savedRole !== role) {
  return <Navigate to={roleHomePath[savedRole]} replace />
}
```

登录成功后改为写入：
```tsx
window.localStorage.setItem('labelhub_role', result.user.role)
```

- [ ] **Step 4: Run tests to verify pass**

Run:
```bash
npm --prefix frontend run test -- src/App.test.tsx src/pages/auth/LoginPage.test.tsx
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/router/guards.tsx frontend/src/services/api/client.ts frontend/src/App.test.tsx frontend/src/pages/auth/LoginPage.tsx frontend/src/pages/auth/LoginPage.test.tsx
git commit -m "refactor: align route guard with jwt login state"
```

---

### Task 7: 更新文档并做统一验收

**Files:**
- Modify: `docs/api-contracts/labelhub-v1.md`
- Modify: `README.md`
- Modify: `PLANROAD-B.md`
- Modify: `.claude/context/progress-A.md`
- Modify: `.claude/context/decisions-A.md`
- Modify: `.claude/context/architecture-A.md`

- [ ] **Step 1: Update auth contract docs**

补充：
- `/auth/login` 请求从 `role` 转为 `username + password`
- `/auth/me` 基于 Bearer JWT
- demo 账号快捷填充是前端能力，不是后端特殊登录模式

- [ ] **Step 2: Run final backend verification**

Run:
```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_auth_api.py backend/tests/test_tasks_api.py backend/tests/test_reviews_api.py backend/tests/test_submissions_api.py -q
```
Expected: PASS.

- [ ] **Step 3: Run final frontend verification**

Run:
```bash
npm --prefix frontend run test -- src/pages/auth/LoginPage.test.tsx src/App.test.tsx
npm --prefix frontend run build
```
Expected: PASS.

- [ ] **Step 4: Run browser verification**

Manual checklist:
- Owner 使用表单/演示填充登录成功进入 `/owner`
- Labeler 登录成功进入 `/labeler`
- Reviewer 登录成功进入 `/reviewer`
- 无 token 访问受保护路由会回登录页

- [ ] **Step 5: Commit**

```bash
git add docs/api-contracts/labelhub-v1.md README.md PLANROAD-B.md .claude/context/progress-A.md .claude/context/decisions-A.md .claude/context/architecture-A.md
git commit -m "docs: sync auth foundation docs and progress"
```

---

## Spec Coverage Check

Spec requirements covered:
- `User.password_hash` → Task 1
- JWT 签发与解析 → Task 1 / Task 2
- `/auth/login`、`/auth/me` → Task 2
- demo 用户默认密码兼容 → Task 3
- 业务路由替换认证入口 → Task 4
- 登录页账号密码表单 + 演示账号填充 → Task 5
- `RoleGuard` 适配 → Task 6
- 测试、浏览器验收、文档回写 → Task 7

无遗漏项。

## Placeholder Scan
- 无 TBD / TODO / “后续自行实现” 占位
- 每个任务都给出了明确文件、命令、验证目标

## Type Consistency Check
- 后端统一使用 `password_hash`、`jwt_secret_key`、`jwt_expire_minutes`
- 前端统一使用 `labelhub_role` 作为角色本地恢复字段
- `/auth/login` 请求统一为 `username + password`

Plan complete and saved to `docs/superpowers/plans/2026-06-03-stage5-auth-foundation-implementation-plan.md`. Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration

2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?