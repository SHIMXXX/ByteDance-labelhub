# LabelHub 剩余功能缺口一次性收口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不扩大到部署、强安全升级或无关重构的前提下，一次性补齐 Designer 最小可视化编辑、Labeler 真实自动保存、认证体验第二轮、Reviewer 分配局部错误以及 `tab_container` 最小 Tab 切换交互。

**Architecture:** 保持现有页面与组件边界不变，在 `OwnerTemplatesPage`、`Renderer`、`LabelerWorkbenchPage`、`AppFrame`、`LoginPage`、`api client`、`OwnerTasksPage` 内做最小增量修改。测试继续以现有 Vitest + Testing Library 页面测试为主，按“先补失败测试，再补最小实现，再跑定向回归”的方式闭环。

**Tech Stack:** React 19、TypeScript、React Router、Vitest、Testing Library、现有 `apiGet/apiPost/apiPatch` API client

---

## 文件结构与职责映射

### 主要修改文件
- `frontend/src/pages/owner/templates/OwnerTemplatesPage.tsx`
  - 现有模板 Designer 页面；补 schema v2 规则编辑、group/tab children 最小管理、嵌套组件选择与写回逻辑。
- `frontend/src/pages/owner/templates/OwnerTemplatesPage.test.tsx`
  - 模板 Designer 页面测试；补规则编辑、group/tab children 编辑回归。
- `frontend/src/features/renderer/Renderer.tsx`
  - 现有运行态 Renderer；把 `tab_container` 从全部展开改成最小 Tab 切换。
- `frontend/src/features/renderer/Renderer.test.tsx`
  - Renderer 测试；补默认首 tab 渲染和点击切换验证。
- `frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.tsx`
  - Labeler 多题 workbench；抽统一保存函数，补 debounce 自动保存、切题前保存、失败反馈。
- `frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.test.tsx`
  - Workbench 页面测试；补自动保存、切题前保存成功 / 失败场景。
- `frontend/src/layouts/AppFrame.tsx`
  - 三角色统一壳层；补退出登录入口。
- `frontend/src/pages/auth/LoginPage.tsx`
  - 登录页；补一次性会话失效提示消费。
- `frontend/src/pages/auth/LoginPage.test.tsx`
  - 登录页测试；补失效提示一次性展示验证。
- `frontend/src/services/api/client.ts`
  - 401 会话失效处理；补一次性失效提示标记工具，主动退出时支持清理。
- `frontend/src/App.test.tsx`
  - 路由 / 失效回登录相关测试；视实现调整或补充。
- `frontend/src/pages/owner/tasks/OwnerTasksPage.tsx`
  - Owner 任务页；将 reviewer 分配错误从页面级下沉为卡片局部状态。
- `frontend/src/pages/owner/tasks/OwnerTasksPage.test.tsx`
  - Owner 任务页测试；补 reviewer 列表加载失败和保存失败的局部反馈验证。

### 不新增文件的原则
- 这轮不创建新的通用 hooks / 组件文件。
- 如确实需要少量工具函数，优先写在现有文件内，避免无关抽象。

---

### Task 1: 为 Renderer 补最小 Tab 切换交互

**Files:**
- Modify: `frontend/src/features/renderer/Renderer.tsx`
- Test: `frontend/src/features/renderer/Renderer.test.tsx`

- [ ] **Step 1: 写 `tab_container` 默认只渲染首个 tab 的失败测试**

```tsx
it('默认只渲染首个 tab 的字段，并可切换到其他 tab', () => {
  render(
    <Renderer
      mode="answer"
      schema={[
        {
          id: 1,
          type: 'tab_container',
          label: '信息分栏',
          field: '',
          required: false,
          tabs: [
            {
              key: 'basic',
              label: '基础信息',
              children: [
                { id: 11, type: 'text_input', label: '标题', field: 'title', required: false },
              ],
            },
            {
              key: 'extra',
              label: '补充信息',
              children: [
                { id: 12, type: 'textarea', label: '备注', field: 'remark', required: false },
              ],
            },
          ],
        },
      ]}
      values={{}}
      onUpdateAnswer={vi.fn()}
    />,
  )

  expect(screen.getByRole('button', { name: '基础信息' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '补充信息' })).toBeInTheDocument()
  expect(screen.getByLabelText('标题')).toBeInTheDocument()
  expect(screen.queryByLabelText('备注')).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '补充信息' }))

  expect(screen.getByLabelText('备注')).toBeInTheDocument()
  expect(screen.queryByLabelText('标题')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: 运行单测，确认当前失败**

Run: `npm --prefix frontend run test -- Renderer.test.tsx`
Expected: FAIL，原因是当前实现会同时渲染所有 tab children，`queryByLabelText('备注')` 不为 `null`。

- [ ] **Step 3: 在 `Renderer.tsx` 中为 `tab_container` 增加最小切换状态**

```tsx
import { useState } from 'react'

function RendererField({ component, mode, source, values, value, onUpdateAnswer, onToggleArrayAnswer, onGenerateLLMAnswer }: RendererFieldProps) {
  const label = component.required ? `${component.label} *` : component.label
  const [activeTabKey, setActiveTabKey] = useState<string | null>(component.type === 'tab_container' ? component.tabs?.[0]?.key ?? null : null)

  if (component.type === 'tab_container') {
    const tabs = component.tabs ?? []
    const currentTab = tabs.find((tab) => tab.key === activeTabKey) ?? tabs[0]

    return (
      <div className="template-preview-item">
        <h4>{component.label}</h4>
        <div className="button-row" role="tablist" aria-label={component.label}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={currentTab?.key === tab.key}
              className={currentTab?.key === tab.key ? 'is-active' : ''}
              onClick={() => setActiveTabKey(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {currentTab ? (
          <Renderer
            schema={currentTab.children ?? []}
            mode={mode}
            values={values}
            source={source}
            onUpdateAnswer={onUpdateAnswer}
            onToggleArrayAnswer={onToggleArrayAnswer}
            onGenerateLLMAnswer={onGenerateLLMAnswer}
          />
        ) : <p>当前没有可展示的 Tab。</p>}
      </div>
    )
  }
```

- [ ] **Step 4: 再跑 Renderer 单测，确认通过**

Run: `npm --prefix frontend run test -- Renderer.test.tsx`
Expected: PASS，新增 tab 切换测试通过，原有 renderer 相关测试不回归失败。

- [ ] **Step 5: 提交本任务改动**

```bash
git add frontend/src/features/renderer/Renderer.tsx frontend/src/features/renderer/Renderer.test.tsx
git commit -m "feat: add minimal tab switch renderer"
```

---

### Task 2: 为 Designer 补 `visibleWhen` 与 `validationRules` 结构化编辑

**Files:**
- Modify: `frontend/src/pages/owner/templates/OwnerTemplatesPage.tsx`
- Test: `frontend/src/pages/owner/templates/OwnerTemplatesPage.test.tsx`

- [ ] **Step 1: 写规则编辑 UI 的失败测试**

```tsx
it('允许为选中组件新增 visibleWhen 与 validationRules 并在保存时带入 schema', async () => {
  const user = userEvent.setup()
  const apiGetMock = vi.mocked(apiGet)
  const apiPatchMock = vi.mocked(apiPatch)
  const apiPostMock = vi.mocked(apiPost)

  apiGetMock
    .mockResolvedValueOnce({ items: [{ id: 1, name: '默认模板', description: '' }] })
    .mockResolvedValueOnce({
      templateId: 1,
      templateVersionId: 2,
      schema: {
        version: 2,
        components: [
          { id: 1, type: 'text_input', label: '标题', field: 'title', required: false },
        ],
      },
    })

  apiPatchMock.mockResolvedValue({ id: 1, name: '默认模板', description: '' })
  apiPostMock.mockResolvedValue({ templateVersionId: 3, templateId: 1, version: 3 })

  render(<OwnerTemplatesPage />)

  await user.click(await screen.findByRole('button', { name: /选择组件 1/i }))
  await user.click(screen.getByRole('button', { name: '新增显示条件' }))
  await user.type(screen.getByLabelText('显示条件字段-1'), 'status')
  await user.selectOptions(screen.getByLabelText('显示条件操作符-1'), 'eq')
  await user.type(screen.getByLabelText('显示条件值-1'), 'ready')

  await user.click(screen.getByRole('button', { name: '新增校验规则' }))
  await user.selectOptions(screen.getByLabelText('校验规则类型-1'), 'required_if')
  await user.type(screen.getByLabelText('校验字段-1'), 'status')
  await user.selectOptions(screen.getByLabelText('校验操作符-1'), 'eq')
  await user.type(screen.getByLabelText('校验值-1'), 'ready')

  await user.click(screen.getByRole('button', { name: '保存模板' }))

  expect(apiPostMock).toHaveBeenLastCalledWith('/templates/1/versions', {
    schema: {
      version: 2,
      components: [
        expect.objectContaining({
          visibleWhen: [{ field: 'status', operator: 'eq', value: 'ready' }],
          validationRules: [{ type: 'required_if', field: 'status', operator: 'eq', value: 'ready' }],
        }),
      ],
    },
  })
})
```

- [ ] **Step 2: 运行模板页测试，确认失败**

Run: `npm --prefix frontend run test -- OwnerTemplatesPage.test.tsx`
Expected: FAIL，原因是页面中不存在“新增显示条件 / 新增校验规则”等控件。

- [ ] **Step 3: 在 `OwnerTemplatesPage.tsx` 中增加规则编辑数据更新逻辑**

```tsx
type SelectedComponentPath =
  | { type: 'root'; componentId: number }
  | { type: 'group-child'; parentId: number; componentId: number }
  | { type: 'tab-child'; parentId: number; tabKey: string; componentId: number }

function addVisibleWhenRule(component: TemplateComponent): TemplateComponent {
  return {
    ...component,
    visibleWhen: [...(component.visibleWhen ?? []), { field: '', operator: 'eq', value: '' }],
  }
}

function addValidationRule(component: TemplateComponent): TemplateComponent {
  return {
    ...component,
    validationRules: [...(component.validationRules ?? []), { type: 'required_if', field: '', operator: 'eq', value: '' }],
  }
}
```

```tsx
function renderRuleEditor(selectedComponent: TemplateComponent) {
  return (
    <>
      <div>
        <div className="button-row">
          <span>显示条件</span>
          <button type="button" onClick={() => updateSelectedComponent(addVisibleWhenRule(selectedComponent))}>
            新增显示条件
          </button>
        </div>
        {(selectedComponent.visibleWhen ?? []).map((rule, index) => (
          <div key={`visible-${index}`} className="form-grid">
            <label className="form-field">
              <span>显示条件字段-{index + 1}</span>
              <input
                aria-label={`显示条件字段-${index + 1}`}
                value={rule.field}
                onChange={(event) => updateVisibleWhenRule(index, { field: event.target.value })}
              />
            </label>
            <label className="form-field">
              <span>显示条件操作符-{index + 1}</span>
              <select
                aria-label={`显示条件操作符-${index + 1}`}
                value={rule.operator}
                onChange={(event) => updateVisibleWhenRule(index, { operator: event.target.value as TemplateVisibilityRule['operator'] })}
              >
                <option value="eq">等于</option>
                <option value="neq">不等于</option>
                <option value="not_empty">非空</option>
                <option value="includes">包含</option>
              </select>
            </label>
            {rule.operator !== 'not_empty' ? (
              <label className="form-field">
                <span>显示条件值-{index + 1}</span>
                <input
                  aria-label={`显示条件值-${index + 1}`}
                  value={rule.value ?? ''}
                  onChange={(event) => updateVisibleWhenRule(index, { value: event.target.value })}
                />
              </label>
            ) : null}
            <button type="button" onClick={() => removeVisibleWhenRule(index)}>删除显示条件</button>
          </div>
        ))}
      </div>

      <div>
        <div className="button-row">
          <span>联动校验</span>
          <button type="button" onClick={() => updateSelectedComponent(addValidationRule(selectedComponent))}>
            新增校验规则
          </button>
        </div>
        {(selectedComponent.validationRules ?? []).map((rule, index) => (
          <div key={`validation-${index}`} className="form-grid">
            <label className="form-field">
              <span>校验规则类型-{index + 1}</span>
              <select
                aria-label={`校验规则类型-${index + 1}`}
                value={rule.type}
                onChange={(event) => updateValidationRuleType(index, event.target.value as TemplateValidationRule['type'])}
              >
                <option value="required_if">条件必填</option>
                <option value="min_selected">最少选择数</option>
                <option value="json_valid">JSON 有效</option>
              </select>
            </label>
          </div>
        ))}
      </div>
    </>
  )
}
```

- [ ] **Step 4: 跑模板页测试，确认规则编辑通过**

Run: `npm --prefix frontend run test -- OwnerTemplatesPage.test.tsx`
Expected: PASS，新增规则编辑测试通过，保存时 schema 正确包含结构化规则。

- [ ] **Step 5: 提交本任务改动**

```bash
git add frontend/src/pages/owner/templates/OwnerTemplatesPage.tsx frontend/src/pages/owner/templates/OwnerTemplatesPage.test.tsx
git commit -m "feat: add structured schema rule editing"
```

---

### Task 3: 为 Designer 补 `group.children` 与 `tab.children` 最小可视化编辑

**Files:**
- Modify: `frontend/src/pages/owner/templates/OwnerTemplatesPage.tsx`
- Test: `frontend/src/pages/owner/templates/OwnerTemplatesPage.test.tsx`

- [ ] **Step 1: 写 children 编辑的失败测试**

```tsx
it('允许为 group 与 tab_container 添加子组件并保存到 schema', async () => {
  const user = userEvent.setup()
  const apiGetMock = vi.mocked(apiGet)
  const apiPatchMock = vi.mocked(apiPatch)
  const apiPostMock = vi.mocked(apiPost)

  apiGetMock
    .mockResolvedValueOnce({ items: [{ id: 1, name: '默认模板', description: '' }] })
    .mockResolvedValueOnce({
      templateId: 1,
      templateVersionId: 2,
      schema: {
        version: 2,
        components: [
          { id: 1, type: 'group', label: '信息组', field: '', required: false, children: [] },
          {
            id: 2,
            type: 'tab_container',
            label: '分栏',
            field: '',
            required: false,
            tabs: [{ key: 'main', label: '主信息', children: [] }],
          },
        ],
      },
    })

  apiPatchMock.mockResolvedValue({ id: 1, name: '默认模板', description: '' })
  apiPostMock.mockResolvedValue({ templateVersionId: 3, templateId: 1, version: 3 })

  render(<OwnerTemplatesPage />)

  await user.click(await screen.findByRole('button', { name: /选择组件 1/i }))
  await user.click(screen.getByRole('button', { name: '添加分组子组件' }))
  await user.click(screen.getByRole('button', { name: '添加 单行文本 到分组' }))

  await user.click(screen.getByRole('button', { name: /选择组件 2/i }))
  await user.click(screen.getByRole('button', { name: '添加 Tab' }))
  await user.click(screen.getByRole('button', { name: '添加 单行文本 到 Tab 主信息' }))

  await user.click(screen.getByRole('button', { name: '保存模板' }))

  expect(apiPostMock).toHaveBeenLastCalledWith('/templates/1/versions', {
    schema: {
      version: 2,
      components: [
        expect.objectContaining({ children: [expect.objectContaining({ type: 'text_input' })] }),
        expect.objectContaining({
          tabs: expect.arrayContaining([
            expect.objectContaining({ children: [expect.objectContaining({ type: 'text_input' })] }),
          ]),
        }),
      ],
    },
  })
})
```

- [ ] **Step 2: 运行模板页测试，确认失败**

Run: `npm --prefix frontend run test -- OwnerTemplatesPage.test.tsx`
Expected: FAIL，原因是页面中不存在 group/tab children 编辑入口。

- [ ] **Step 3: 在 `OwnerTemplatesPage.tsx` 中扩展组件选择与嵌套写回逻辑**

```tsx
function createNestedComponent(type: TemplateComponentType, id: number): TemplateComponent {
  const component = createComponent(type, id)
  return component.type === 'group' || component.type === 'tab_container'
    ? { ...component, label: `${component.label}（子组件）` }
    : component
}

function updateComponentByPath(current: TemplateComponent[], path: SelectedComponentPath, updater: (component: TemplateComponent) => TemplateComponent) {
  return current.map((component) => {
    if (path.type === 'root' && component.id === path.componentId) {
      return updater(component)
    }

    if (path.type === 'group-child' && component.id === path.parentId) {
      return {
        ...component,
        children: (component.children ?? []).map((child) =>
          child.id === path.componentId ? updater(child) : child,
        ),
      }
    }

    if (path.type === 'tab-child' && component.id === path.parentId) {
      return {
        ...component,
        tabs: (component.tabs ?? []).map((tab) =>
          tab.key !== path.tabKey
            ? tab
            : {
                ...tab,
                children: tab.children.map((child) => (child.id === path.componentId ? updater(child) : child)),
              },
        ),
      }
    }

    return component
  })
}
```

```tsx
function addGroupChild(parentId: number, type: TemplateComponentType) {
  const nextId = idRef.current + 1
  idRef.current = nextId
  setComponents((current) =>
    current.map((component) =>
      component.id !== parentId
        ? component
        : {
            ...component,
            children: [...(component.children ?? []), createNestedComponent(type, nextId)],
          },
    ),
  )
}

function addTabChild(parentId: number, tabKey: string, type: TemplateComponentType) {
  const nextId = idRef.current + 1
  idRef.current = nextId
  setComponents((current) =>
    current.map((component) =>
      component.id !== parentId
        ? component
        : {
            ...component,
            tabs: (component.tabs ?? []).map((tab) =>
              tab.key !== tabKey
                ? tab
                : { ...tab, children: [...tab.children, createNestedComponent(type, nextId)] },
            ),
          },
    ),
  )
}
```

- [ ] **Step 4: 跑模板页测试，确认 children 编辑通过**

Run: `npm --prefix frontend run test -- OwnerTemplatesPage.test.tsx`
Expected: PASS，新增 group/tab children 测试通过，原有模板页测试不回归失败。

- [ ] **Step 5: 提交本任务改动**

```bash
git add frontend/src/pages/owner/templates/OwnerTemplatesPage.tsx frontend/src/pages/owner/templates/OwnerTemplatesPage.test.tsx
git commit -m "feat: add minimal nested template editing"
```

---

### Task 4: 为 Workbench 补统一保存函数与 debounce 自动保存

**Files:**
- Modify: `frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.tsx`
- Test: `frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.test.tsx`

- [ ] **Step 1: 写 debounce 自动保存的失败测试**

```tsx
it('答案变更后会 debounce 自动保存草稿', async () => {
  vi.useFakeTimers()
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  vi.mocked(apiGet).mockResolvedValue({
    assignmentId: 8,
    task: { id: 1, title: '多题任务' },
    template: {
      templateId: 1,
      templateVersionId: 2,
      schema: { version: 1, components: [{ id: 1, type: 'text_input', label: '标题', field: 'title', required: false }] },
    },
    progress: { total: 1, completed: 0 },
    items: [{ itemId: 11, index: 1, source: { text: 'hello' }, draftSubmission: null }],
  })
  vi.mocked(apiPost).mockResolvedValue({ submissionId: 100, status: 'draft', savedAt: '2026-06-04T12:00:00+08:00' })

  render(
    <MemoryRouter initialEntries={['/labeler/workbench?assignmentId=8']}>
      <LabelerWorkbenchPage />
    </MemoryRouter>,
  )

  await user.type(await screen.findByLabelText('标题'), 'abc')
  vi.advanceTimersByTime(1200)

  await waitFor(() => {
    expect(apiPost).toHaveBeenCalledWith('/submissions/draft', expect.objectContaining({ answers: { title: 'abc' } }))
  })

  expect(screen.getByText(/已自动保存于/)).toBeInTheDocument()
  vi.useRealTimers()
})
```

- [ ] **Step 2: 运行 workbench 测试，确认失败**

Run: `npm --prefix frontend run test -- LabelerWorkbenchPage.test.tsx`
Expected: FAIL，原因是当前没有 debounce 自动保存触发逻辑。

- [ ] **Step 3: 在 `LabelerWorkbenchPage.tsx` 中抽统一保存函数并接入 debounce**

```tsx
const AUTO_SAVE_DELAY = 1200
const [autosaving, setAutosaving] = useState(false)
const [autosaveError, setAutosaveError] = useState('')
const [dirtyItemIds, setDirtyItemIds] = useState<Record<number, boolean>>({})

async function saveDraftForItem(item: LabelerWorkItem, nextAnswers: AnswerState, source: 'manual' | 'auto' | 'navigation') {
  const result = await apiPost<DraftResponse, {
    assignmentId: number
    itemId: number
    templateVersionId: number | null
    answers: AnswerState
  }>('/submissions/draft', {
    assignmentId: Number(assignmentId),
    itemId: item.id,
    templateVersionId,
    answers: nextAnswers,
  })

  setItemSubmissionIds((current) => ({ ...current, [item.id]: result.submissionId }))
  setItems((current) => current.map((entry) => entry.id !== item.id ? entry : {
    ...entry,
    draftAnswers: nextAnswers,
    draftSubmissionId: result.submissionId,
    draftStatus: 'draft',
    draftSavedAt: result.savedAt,
  }))
  setDirtyItemIds((current) => ({ ...current, [item.id]: false }))

  if (source === 'manual') {
    setFeedback('草稿已保存')
  } else {
    setAutosaveFeedback(`已自动保存于 ${new Date(result.savedAt).toLocaleTimeString('zh-CN', { hour12: false })}`)
  }

  return result
}
```

```tsx
useEffect(() => {
  if (!currentItem || !dirtyItemIds[currentItem.id]) {
    return
  }

  const timer = window.setTimeout(() => {
    setAutosaving(true)
    setAutosaveError('')
    void saveDraftForItem(currentItem, itemAnswers[currentItem.id] ?? {}, 'auto')
      .catch(() => {
        setAutosaveError('自动保存失败，请稍后重试。')
      })
      .finally(() => {
        setAutosaving(false)
      })
  }, AUTO_SAVE_DELAY)

  return () => window.clearTimeout(timer)
}, [currentItem, dirtyItemIds, itemAnswers])
```

- [ ] **Step 4: 跑 workbench 单测，确认自动保存通过**

Run: `npm --prefix frontend run test -- LabelerWorkbenchPage.test.tsx`
Expected: PASS，新增 debounce 自动保存测试通过。

- [ ] **Step 5: 提交本任务改动**

```bash
git add frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.tsx frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.test.tsx
git commit -m "feat: add debounced draft autosave"
```

---

### Task 5: 为 Workbench 补切题前保存与失败留在当前题

**Files:**
- Modify: `frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.tsx`
- Test: `frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.test.tsx`

- [ ] **Step 1: 写切题前保存成功与失败的测试**

```tsx
it('切到下一题前会先保存当前题，成功后再切换', async () => {
  const user = userEvent.setup()
  vi.mocked(apiGet).mockResolvedValue({
    assignmentId: 8,
    task: { id: 1, title: '多题任务' },
    template: {
      templateId: 1,
      templateVersionId: 2,
      schema: { version: 1, components: [{ id: 1, type: 'text_input', label: '标题', field: 'title', required: false }] },
    },
    progress: { total: 2, completed: 0 },
    items: [
      { itemId: 11, index: 1, source: { text: 'a' }, draftSubmission: null },
      { itemId: 12, index: 2, source: { text: 'b' }, draftSubmission: null },
    ],
  })
  vi.mocked(apiPost).mockResolvedValue({ submissionId: 100, status: 'draft', savedAt: '2026-06-04T12:00:00+08:00' })

  render(
    <MemoryRouter initialEntries={['/labeler/workbench?assignmentId=8']}>
      <LabelerWorkbenchPage />
    </MemoryRouter>,
  )

  await user.type(await screen.findByLabelText('标题'), 'hello')
  await user.click(screen.getByRole('button', { name: '下一题' }))

  await waitFor(() => expect(apiPost).toHaveBeenCalled())
  expect(screen.getByText('第 2 / 2 题')).toBeInTheDocument()
})

it('切题前自动保存失败时会停留在当前题', async () => {
  const user = userEvent.setup()
  vi.mocked(apiGet).mockResolvedValue(/* 同上 */)
  vi.mocked(apiPost).mockRejectedValueOnce(new Error('save failed'))

  render(
    <MemoryRouter initialEntries={['/labeler/workbench?assignmentId=8']}>
      <LabelerWorkbenchPage />
    </MemoryRouter>,
  )

  await user.type(await screen.findByLabelText('标题'), 'hello')
  await user.click(screen.getByRole('button', { name: '下一题' }))

  await waitFor(() => {
    expect(screen.getByText('第 1 / 2 题')).toBeInTheDocument()
  })
  expect(screen.getByText('自动保存失败，请先重试。')).toBeInTheDocument()
})
```

- [ ] **Step 2: 运行 workbench 测试，确认失败**

Run: `npm --prefix frontend run test -- LabelerWorkbenchPage.test.tsx`
Expected: FAIL，原因是当前上一题 / 下一题不会先执行保存再切换。

- [ ] **Step 3: 在 `LabelerWorkbenchPage.tsx` 中把导航切换改为“先保存后切换”**

```tsx
async function flushCurrentDraftBeforeNavigate(targetIndex: number) {
  if (!currentItem || !dirtyItemIds[currentItem.id]) {
    setCurrentIndex(targetIndex)
    setErrors([])
    setFeedback('')
    return
  }

  try {
    setAutosaving(true)
    setAutosaveError('')
    await saveDraftForItem(currentItem, itemAnswers[currentItem.id] ?? {}, 'navigation')
    setCurrentIndex(targetIndex)
    setErrors([])
    setFeedback('')
  } catch {
    setAutosaveError('自动保存失败，请先重试。')
  } finally {
    setAutosaving(false)
  }
}

function goToPrevious() {
  if (currentIndex > 0) {
    void flushCurrentDraftBeforeNavigate(currentIndex - 1)
  }
}

function goToNext() {
  if (currentIndex < items.length - 1) {
    void flushCurrentDraftBeforeNavigate(currentIndex + 1)
  }
}
```

- [ ] **Step 4: 跑 workbench 单测，确认切题语义通过**

Run: `npm --prefix frontend run test -- LabelerWorkbenchPage.test.tsx`
Expected: PASS，新增切题前保存成功 / 失败测试通过。

- [ ] **Step 5: 提交本任务改动**

```bash
git add frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.tsx frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.test.tsx
git commit -m "feat: save draft before workbench navigation"
```

---

### Task 6: 补统一退出登录入口与登录页一次性失效提示

**Files:**
- Modify: `frontend/src/layouts/AppFrame.tsx`
- Modify: `frontend/src/pages/auth/LoginPage.tsx`
- Modify: `frontend/src/services/api/client.ts`
- Test: `frontend/src/pages/auth/LoginPage.test.tsx`
- Test: `frontend/src/App.test.tsx`

- [ ] **Step 1: 写退出登录与失效提示的失败测试**

```tsx
it('401 会话失效后登录页显示一次性提示', async () => {
  window.localStorage.setItem('labelhub_auth_expired_reason', '1')

  render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  )

  expect(screen.getByText('登录已失效，请重新登录。')).toBeInTheDocument()
  expect(window.localStorage.getItem('labelhub_auth_expired_reason')).toBeNull()
})

it('退出登录会清空登录态并回到登录页', async () => {
  const user = userEvent.setup()
  window.localStorage.setItem('labelhub_role', 'owner')
  window.localStorage.setItem('labelhub_token', 'jwt-token')

  render(
    <MemoryRouter initialEntries={['/owner']}>
      <AppFrame title="Owner 工作台" description="desc" menuItems={[]}>
        <div>content</div>
      </AppFrame>
    </MemoryRouter>,
  )

  await user.click(screen.getByRole('button', { name: '退出登录' }))

  expect(window.localStorage.getItem('labelhub_role')).toBeNull()
  expect(window.localStorage.getItem('labelhub_token')).toBeNull()
})
```

- [ ] **Step 2: 运行登录 / App 测试，确认失败**

Run: `npm --prefix frontend run test -- LoginPage.test.tsx App.test.tsx`
Expected: FAIL，原因是当前没有失效提示存储键与退出按钮。

- [ ] **Step 3: 在 `api client`、`LoginPage`、`AppFrame` 中补最小实现**

```ts
const AUTH_EXPIRED_NOTICE_STORAGE_KEY = 'labelhub_auth_expired_notice'

export function markAuthExpiredNotice() {
  window.localStorage.setItem(AUTH_EXPIRED_NOTICE_STORAGE_KEY, '1')
}

export function consumeAuthExpiredNotice() {
  const value = window.localStorage.getItem(AUTH_EXPIRED_NOTICE_STORAGE_KEY)
  window.localStorage.removeItem(AUTH_EXPIRED_NOTICE_STORAGE_KEY)
  return value === '1'
}

export function clearAuthSession(options?: { clearExpiredNotice?: boolean }) {
  authToken = ''
  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
  window.localStorage.removeItem(AUTH_ROLE_STORAGE_KEY)
  if (options?.clearExpiredNotice) {
    window.localStorage.removeItem(AUTH_EXPIRED_NOTICE_STORAGE_KEY)
  }
}
```

```ts
if (response.status === 401) {
  clearAuthSession()
  markAuthExpiredNotice()
  notifyAuthExpired()
}
```

```tsx
const navigate = useNavigate()

function handleLogout() {
  clearAuthSession({ clearExpiredNotice: true })
  navigate('/')
}

<button type="button" onClick={handleLogout}>退出登录</button>
```

```tsx
const [notice, setNotice] = useState('')

useEffect(() => {
  clearAuthSession()
  if (consumeAuthExpiredNotice()) {
    setNotice('登录已失效，请重新登录。')
  }
}, [])
```

- [ ] **Step 4: 再跑登录 / App 测试，确认通过**

Run: `npm --prefix frontend run test -- LoginPage.test.tsx App.test.tsx`
Expected: PASS，退出登录与一次性失效提示测试通过。

- [ ] **Step 5: 提交本任务改动**

```bash
git add frontend/src/layouts/AppFrame.tsx frontend/src/pages/auth/LoginPage.tsx frontend/src/pages/auth/LoginPage.test.tsx frontend/src/services/api/client.ts frontend/src/App.test.tsx
git commit -m "feat: improve auth session experience"
```

---

### Task 7: 将 Reviewer 分配错误下沉为卡片局部错误

**Files:**
- Modify: `frontend/src/pages/owner/tasks/OwnerTasksPage.tsx`
- Test: `frontend/src/pages/owner/tasks/OwnerTasksPage.test.tsx`

- [ ] **Step 1: 写 reviewer 局部错误的失败测试**

```tsx
it('reviewer 列表加载失败时只在当前卡片分配区块显示错误', async () => {
  const user = userEvent.setup()
  vi.mocked(apiGet)
    .mockResolvedValueOnce({ items: [{ id: 1, title: '任务 A', description: '', status: 'draft', quota: 1, deadline: '2026-06-04' }] })
    .mockResolvedValueOnce({ items: [] })
    .mockResolvedValueOnce({ items: [] })
    .mockRejectedValueOnce(new Error('reviewers failed'))

  render(<OwnerTasksPage />)

  await user.click(await screen.findByRole('button', { name: '分配 Reviewer' }))

  expect(screen.getByText('Reviewer 列表加载失败，请稍后重试。')).toBeInTheDocument()
  expect(screen.queryByText('任务列表加载失败，请确认后端服务已启动。')).not.toBeInTheDocument()
  expect(screen.getByText('任务 A')).toBeInTheDocument()
})

it('reviewer 保存失败时只在当前卡片显示错误', async () => {
  const user = userEvent.setup()
  vi.mocked(apiGet)
    .mockResolvedValueOnce({ items: [{ id: 1, title: '任务 A', description: '', status: 'draft', quota: 1, deadline: '2026-06-04' }] })
    .mockResolvedValueOnce({ items: [] })
    .mockResolvedValueOnce({ items: [] })
    .mockResolvedValueOnce({ items: [{ id: 3, username: 'reviewer_demo', displayName: 'Reviewer Demo', role: 'reviewer' }] })
  vi.mocked(apiPost).mockRejectedValueOnce(new Error('save failed'))

  render(<OwnerTasksPage />)

  await user.click(await screen.findByRole('button', { name: '分配 Reviewer' }))
  await user.click(await screen.findByLabelText('Reviewer Demo'))
  await user.click(screen.getByRole('button', { name: '保存 Reviewer 分配' }))

  expect(await screen.findByText('Reviewer 分配保存失败，请稍后重试。')).toBeInTheDocument()
})
```

- [ ] **Step 2: 运行任务页测试，确认失败**

Run: `npm --prefix frontend run test -- OwnerTasksPage.test.tsx`
Expected: FAIL，原因是当前错误仍然走 `pageError`。

- [ ] **Step 3: 在 `OwnerTasksPage.tsx` 中拆 reviewer 分配局部状态**

```tsx
const [reviewerPanelError, setReviewerPanelError] = useState('')
const [reviewerPanelLoading, setReviewerPanelLoading] = useState(false)
const [reviewerPanelTaskId, setReviewerPanelTaskId] = useState<number | null>(null)
const [reviewerSaveErrorTaskId, setReviewerSaveErrorTaskId] = useState<number | null>(null)
const [reviewerSaveMessageTaskId, setReviewerSaveMessageTaskId] = useState<number | null>(null)
```

```tsx
async function openReviewerEditor(task: OwnerTask) {
  setEditingReviewerTaskId(task.id)
  setReviewerPanelTaskId(task.id)
  setReviewerPanelError('')
  setReviewerMessage('')

  if (reviewerOptionsLoaded) {
    return
  }

  try {
    setReviewerPanelLoading(true)
    const result = await apiGet<{ items: ReviewerOption[] }>('/users/reviewers')
    setReviewerOptions(result.items)
    setReviewerOptionsLoaded(true)
  } catch {
    setReviewerPanelError('Reviewer 列表加载失败，请稍后重试。')
  } finally {
    setReviewerPanelLoading(false)
  }
}

async function saveTaskReviewers(taskId: number) {
  setSavingReviewerTaskId(taskId)
  setReviewerPanelError('')
  setReviewerSaveErrorTaskId(null)

  try {
    await apiPost(`/tasks/${taskId}/reviewers`, { reviewerIds: selectedReviewerIds })
    setReviewerSaveMessageTaskId(taskId)
    setEditingReviewerTaskId(null)
    await loadTasks()
  } catch {
    setReviewerSaveErrorTaskId(taskId)
    setReviewerPanelError('Reviewer 分配保存失败，请稍后重试。')
  } finally {
    setSavingReviewerTaskId(null)
  }
}
```

- [ ] **Step 4: 跑任务页测试，确认 reviewer 错误局部化通过**

Run: `npm --prefix frontend run test -- OwnerTasksPage.test.tsx`
Expected: PASS，新增局部错误测试通过，任务列表主体仍可渲染。

- [ ] **Step 5: 提交本任务改动**

```bash
git add frontend/src/pages/owner/tasks/OwnerTasksPage.tsx frontend/src/pages/owner/tasks/OwnerTasksPage.test.tsx
git commit -m "feat: localize reviewer assignment errors"
```

---

### Task 8: 运行本轮前端定向回归与构建

**Files:**
- Test: `frontend/src/features/renderer/Renderer.test.tsx`
- Test: `frontend/src/pages/owner/templates/OwnerTemplatesPage.test.tsx`
- Test: `frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.test.tsx`
- Test: `frontend/src/pages/auth/LoginPage.test.tsx`
- Test: `frontend/src/App.test.tsx`
- Test: `frontend/src/pages/owner/tasks/OwnerTasksPage.test.tsx`

- [ ] **Step 1: 跑 Renderer 与 Designer 定向测试**

Run: `npm --prefix frontend run test -- Renderer.test.tsx OwnerTemplatesPage.test.tsx`
Expected: PASS，Tab 切换、规则编辑、children 编辑相关测试通过。

- [ ] **Step 2: 跑 Workbench 定向测试**

Run: `npm --prefix frontend run test -- LabelerWorkbenchPage.test.tsx`
Expected: PASS，自动保存、切题前保存与失败提示测试通过。

- [ ] **Step 3: 跑认证体验与 Reviewer 局部错误测试**

Run: `npm --prefix frontend run test -- LoginPage.test.tsx App.test.tsx OwnerTasksPage.test.tsx`
Expected: PASS，退出登录、失效提示、reviewer 局部错误测试通过。

- [ ] **Step 4: 跑前端构建**

Run: `npm --prefix frontend run build`
Expected: PASS，Vite build 成功，无 TypeScript 构建错误。

- [ ] **Step 5: 提交回归通过后的总收口提交**

```bash
git add frontend/src/features/renderer/Renderer.tsx frontend/src/features/renderer/Renderer.test.tsx frontend/src/pages/owner/templates/OwnerTemplatesPage.tsx frontend/src/pages/owner/templates/OwnerTemplatesPage.test.tsx frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.tsx frontend/src/pages/labeler/workbench/LabelerWorkbenchPage.test.tsx frontend/src/layouts/AppFrame.tsx frontend/src/pages/auth/LoginPage.tsx frontend/src/pages/auth/LoginPage.test.tsx frontend/src/services/api/client.ts frontend/src/App.test.tsx frontend/src/pages/owner/tasks/OwnerTasksPage.tsx frontend/src/pages/owner/tasks/OwnerTasksPage.test.tsx
git commit -m "feat: close remaining frontend workflow gaps"
```

---

## Spec 覆盖自检

- Designer 最小可视化编辑（`visibleWhen` / `validationRules` / `group children` / `tab children`）
  - Task 2、Task 3 覆盖
- Labeler 真实自动保存（debounce、切题前保存、失败反馈、手动保存保留）
  - Task 4、Task 5 覆盖
- 认证体验第二轮（退出登录、登录失效提示、会话清理体验）
  - Task 6 覆盖
- Reviewer 分配错误从页面级下沉到局部错误
  - Task 7 覆盖
- `tab_container` 最小 Tab 切换交互
  - Task 1 覆盖
- 定向测试与构建验证
  - Task 8 覆盖

## 占位符自检

- 未使用 `TODO` / `TBD` / “后续再补” 之类占位语。
- 每个任务都给出了精确文件、示例测试代码、运行命令与预期。

## 类型一致性自检

- `visibleWhen` 与 `validationRules` 名称与 `frontend/src/types/domain.ts` 一致。
- 自动保存仍复用现有 `DraftResponse` 与 `AnswerState`。
- 认证提示的新增存储键与 `clearAuthSession` / `consumeAuthExpiredNotice` 命名保持一致。

---

Plan complete and saved to `docs/superpowers/plans/2026-06-04-remaining-gap-closure.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
