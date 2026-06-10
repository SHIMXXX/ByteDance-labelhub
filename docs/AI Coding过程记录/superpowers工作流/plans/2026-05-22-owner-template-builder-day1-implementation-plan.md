# Owner 模板搭建器 Day 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 在现有模板搭建页中完成组件添加、字段配置、排序、删除与预览的前端最小闭环。

**Architecture:** 保持单页实现，不新增路由、不接后端、不引入复杂状态管理。模板组件类型与白名单放在共享 domain/mock 层，页面使用本地 state 管理 schema、选中项和字段配置，组件测试覆盖核心交互。

**Tech Stack:** React 18、TypeScript、Vite 5、Vitest、Testing Library

---

## File Structure

### Existing files to modify
- `frontend/src/types/domain.ts` — 增加模板组件类型与组件类型联合类型。
- `frontend/src/mocks/tasks.ts` — 不修改；模板搭建器不复用任务 mock。
- `frontend/src/pages/owner/templates/OwnerTemplatesPage.tsx` — 实现模板搭建器单页交互。
- `frontend/src/styles.css` — 增加模板搭建器布局、列表、预览、标签等最小样式。

### New files to create
- `frontend/src/pages/owner/templates/OwnerTemplatesPage.test.tsx` — 覆盖模板搭建器添加、配置、排序、删除与预览行为。

---

### Task 1: 写模板搭建器失败测试

**Files:**
- Create: `frontend/src/pages/owner/templates/OwnerTemplatesPage.test.tsx`

- [x] **Step 1: 新建 `frontend/src/pages/owner/templates/OwnerTemplatesPage.test.tsx`**

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { OwnerTemplatesPage } from './OwnerTemplatesPage'

function renderOwnerTemplatesPage() {
  render(<OwnerTemplatesPage />)
}

describe('OwnerTemplatesPage', () => {
  it('renders the component whitelist', () => {
    renderOwnerTemplatesPage()

    expect(screen.getByRole('heading', { name: '模板搭建' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '添加 单行文本' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '添加 多行文本' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '添加 单选' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '添加 多选' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '添加 标签选择' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '添加 图片上传' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '添加 展示项' })).toBeInTheDocument()
  })

  it('adds a text input component and updates its config and preview', async () => {
    const user = userEvent.setup()
    renderOwnerTemplatesPage()

    await user.click(screen.getByRole('button', { name: '添加 单行文本' }))

    expect(screen.getByRole('button', { name: /单行文本/ })).toBeInTheDocument()
    expect(screen.getByLabelText('标题')).toHaveValue('单行文本')
    expect(screen.getByLabelText('字段名')).toHaveValue('text_input_1')

    await user.clear(screen.getByLabelText('标题'))
    await user.type(screen.getByLabelText('标题'), '用户名')
    await user.clear(screen.getByLabelText('字段名'))
    await user.type(screen.getByLabelText('字段名'), 'username')
    await user.click(screen.getByLabelText('必填'))

    const preview = screen.getByLabelText('模板预览')
    expect(within(preview).getByText('用户名 *')).toBeInTheDocument()
    expect(within(preview).getByRole('textbox', { name: '用户名' })).toBeInTheDocument()
  })

  it('edits select options and renders them in preview', async () => {
    const user = userEvent.setup()
    renderOwnerTemplatesPage()

    await user.click(screen.getByRole('button', { name: '添加 单选' }))
    await user.clear(screen.getByLabelText('标题'))
    await user.type(screen.getByLabelText('标题'), '情感倾向')
    await user.clear(screen.getByLabelText('选项'))
    await user.type(screen.getByLabelText('选项'), '正向,中性,负向')

    const preview = screen.getByLabelText('模板预览')
    expect(within(preview).getByText('情感倾向')).toBeInTheDocument()
    expect(within(preview).getByLabelText('正向')).toBeInTheDocument()
    expect(within(preview).getByLabelText('中性')).toBeInTheDocument()
    expect(within(preview).getByLabelText('负向')).toBeInTheDocument()
  })

  it('moves components up and down', async () => {
    const user = userEvent.setup()
    renderOwnerTemplatesPage()

    await user.click(screen.getByRole('button', { name: '添加 单行文本' }))
    await user.click(screen.getByRole('button', { name: '添加 单选' }))

    let componentItems = screen.getAllByTestId('template-component-item')
    expect(within(componentItems[0]).getByText('单行文本')).toBeInTheDocument()
    expect(within(componentItems[1]).getByText('单选')).toBeInTheDocument()

    await user.click(within(componentItems[1]).getByRole('button', { name: '上移' }))

    componentItems = screen.getAllByTestId('template-component-item')
    expect(within(componentItems[0]).getByText('单选')).toBeInTheDocument()
    expect(within(componentItems[1]).getByText('单行文本')).toBeInTheDocument()

    await user.click(within(componentItems[0]).getByRole('button', { name: '下移' }))

    componentItems = screen.getAllByTestId('template-component-item')
    expect(within(componentItems[0]).getByText('单行文本')).toBeInTheDocument()
    expect(within(componentItems[1]).getByText('单选')).toBeInTheDocument()
  })

  it('deletes a component', async () => {
    const user = userEvent.setup()
    renderOwnerTemplatesPage()

    await user.click(screen.getByRole('button', { name: '添加 多行文本' }))
    expect(screen.getByTestId('template-component-item')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '删除' }))

    expect(screen.queryByTestId('template-component-item')).not.toBeInTheDocument()
    expect(screen.getByText('还没有添加组件')).toBeInTheDocument()
  })

  it('configures show item content and renders it in preview', async () => {
    const user = userEvent.setup()
    renderOwnerTemplatesPage()

    await user.click(screen.getByRole('button', { name: '添加 展示项' }))
    expect(screen.queryByLabelText('字段名')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('必填')).not.toBeInTheDocument()

    await user.clear(screen.getByLabelText('标题'))
    await user.type(screen.getByLabelText('标题'), '标注说明')
    await user.clear(screen.getByLabelText('展示内容'))
    await user.type(screen.getByLabelText('展示内容'), '请阅读文本后选择最合适的标签')

    const preview = screen.getByLabelText('模板预览')
    expect(within(preview).getByText('标注说明')).toBeInTheDocument()
    expect(within(preview).getByText('请阅读文本后选择最合适的标签')).toBeInTheDocument()
  })
})
```

- [x] **Step 2: 运行测试确认失败**

Run: `npm --prefix frontend run test -- src/pages/owner/templates/OwnerTemplatesPage.test.tsx`
Expected: FAIL，原因包含找不到“添加 单行文本”等新交互元素。

---

### Task 2: 增加模板组件类型

**Files:**
- Modify: `frontend/src/types/domain.ts`
- Test: `frontend/src/pages/owner/templates/OwnerTemplatesPage.test.tsx`

- [x] **Step 1: 在 `frontend/src/types/domain.ts` 末尾追加模板类型**

```ts
export type TemplateComponentType =
  | 'text_input'
  | 'textarea'
  | 'single_select'
  | 'multi_select'
  | 'tag_select'
  | 'image_upload'
  | 'show_item'

export type TemplateComponent = {
  id: number
  type: TemplateComponentType
  label: string
  field: string
  required: boolean
  options?: string[]
  maxCount?: number
  content?: string
}
```

- [x] **Step 2: 运行模板测试，确认仍失败但无类型定义缺失**

Run: `npm --prefix frontend run test -- src/pages/owner/templates/OwnerTemplatesPage.test.tsx`
Expected: FAIL，失败点集中在页面交互未实现。

---

### Task 3: 实现模板搭建器单页逻辑

**Files:**
- Modify: `frontend/src/pages/owner/templates/OwnerTemplatesPage.tsx`
- Test: `frontend/src/pages/owner/templates/OwnerTemplatesPage.test.tsx`

- [x] **Step 1: 用下面完整内容替换 `frontend/src/pages/owner/templates/OwnerTemplatesPage.tsx`**

```tsx
import { useState } from 'react'
import type { TemplateComponent, TemplateComponentType } from '../../../types/domain'

const componentOptions: Array<{ type: TemplateComponentType; name: string }> = [
  { type: 'text_input', name: '单行文本' },
  { type: 'textarea', name: '多行文本' },
  { type: 'single_select', name: '单选' },
  { type: 'multi_select', name: '多选' },
  { type: 'tag_select', name: '标签选择' },
  { type: 'image_upload', name: '图片上传' },
  { type: 'show_item', name: '展示项' },
]

const optionTypes: TemplateComponentType[] = ['single_select', 'multi_select', 'tag_select']

function getComponentName(type: TemplateComponentType) {
  return componentOptions.find((component) => component.type === type)?.name ?? type
}

function createComponent(type: TemplateComponentType, id: number): TemplateComponent {
  const name = getComponentName(type)
  const base: TemplateComponent = {
    id,
    type,
    label: name,
    field: `${type}_${id}`,
    required: false,
  }

  if (optionTypes.includes(type)) {
    return {
      ...base,
      options: ['选项一', '选项二'],
    }
  }

  if (type === 'image_upload') {
    return {
      ...base,
      maxCount: 1,
    }
  }

  if (type === 'show_item') {
    return {
      ...base,
      field: '',
      content: '这里展示给标注员的说明内容',
    }
  }

  return base
}

export function OwnerTemplatesPage() {
  const [components, setComponents] = useState<TemplateComponent[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const selectedComponent = components.find((component) => component.id === selectedId) ?? null

  function handleAddComponent(type: TemplateComponentType) {
    const nextId = Date.now()
    const nextComponent = createComponent(type, nextId)
    setComponents((current) => [...current, nextComponent])
    setSelectedId(nextId)
  }

  function updateSelectedComponent(patch: Partial<TemplateComponent>) {
    if (selectedId === null) {
      return
    }

    setComponents((current) =>
      current.map((component) => (component.id === selectedId ? { ...component, ...patch } : component)),
    )
  }

  function handleOptionsChange(value: string) {
    updateSelectedComponent({
      options: value
        .split(',')
        .map((option) => option.trim())
        .filter(Boolean),
    })
  }

  function handleMaxCountChange(value: string) {
    const nextValue = Number(value)
    updateSelectedComponent({
      maxCount: Number.isNaN(nextValue) || nextValue <= 0 ? 1 : Math.floor(nextValue),
    })
  }

  function handleMove(componentId: number, direction: 'up' | 'down') {
    setComponents((current) => {
      const index = current.findIndex((component) => component.id === componentId)
      const targetIndex = direction === 'up' ? index - 1 : index + 1
      if (index < 0 || targetIndex < 0 || targetIndex >= current.length) {
        return current
      }

      const nextComponents = [...current]
      const currentItem = nextComponents[index]
      nextComponents[index] = nextComponents[targetIndex]
      nextComponents[targetIndex] = currentItem
      return nextComponents
    })
  }

  function handleDelete(componentId: number) {
    setComponents((current) => {
      const index = current.findIndex((component) => component.id === componentId)
      const nextComponents = current.filter((component) => component.id !== componentId)

      if (selectedId === componentId) {
        const nextSelected = nextComponents[index] ?? nextComponents[index - 1] ?? null
        setSelectedId(nextSelected?.id ?? null)
      }

      return nextComponents
    })
  }

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>模板搭建</h2>
          <p>第一版先固定组件白名单与字段白名单。</p>
        </div>
      </header>

      <div className="template-builder-grid">
        <article className="card template-panel">
          <h3>组件白名单</h3>
          <div className="component-button-list">
            {componentOptions.map((component) => (
              <button key={component.type} type="button" onClick={() => handleAddComponent(component.type)}>
                添加 {component.name}
              </button>
            ))}
          </div>
        </article>

        <article className="card template-panel">
          <h3>Schema 组件</h3>
          {components.length === 0 ? (
            <p>还没有添加组件</p>
          ) : (
            <div className="template-component-list">
              {components.map((component, index) => (
                <button
                  className={component.id === selectedId ? 'template-component-item is-selected' : 'template-component-item'}
                  data-testid="template-component-item"
                  key={component.id}
                  type="button"
                  onClick={() => setSelectedId(component.id)}
                >
                  <span>
                    <strong>{getComponentName(component.type)}</strong>
                    <small>{component.type === 'show_item' ? component.content : component.field}</small>
                  </span>
                  <span className="template-component-actions">
                    <button type="button" disabled={index === 0} onClick={() => handleMove(component.id, 'up')}>
                      上移
                    </button>
                    <button
                      type="button"
                      disabled={index === components.length - 1}
                      onClick={() => handleMove(component.id, 'down')}
                    >
                      下移
                    </button>
                    <button type="button" onClick={() => handleDelete(component.id)}>
                      删除
                    </button>
                  </span>
                </button>
              ))}
            </div>
          )}
        </article>

        <article className="card template-panel">
          <h3>字段配置</h3>
          {selectedComponent ? (
            <div className="form-grid">
              <label className="form-field">
                <span>标题</span>
                <input
                  value={selectedComponent.label}
                  onChange={(event) => updateSelectedComponent({ label: event.target.value })}
                />
              </label>

              {selectedComponent.type !== 'show_item' ? (
                <>
                  <label className="form-field">
                    <span>字段名</span>
                    <input
                      value={selectedComponent.field}
                      onChange={(event) => updateSelectedComponent({ field: event.target.value })}
                    />
                  </label>
                  <label className="checkbox-field">
                    <input
                      checked={selectedComponent.required}
                      type="checkbox"
                      onChange={(event) => updateSelectedComponent({ required: event.target.checked })}
                    />
                    <span>必填</span>
                  </label>
                </>
              ) : null}

              {optionTypes.includes(selectedComponent.type) ? (
                <label className="form-field">
                  <span>选项</span>
                  <input
                    value={selectedComponent.options?.join(',') ?? ''}
                    onChange={(event) => handleOptionsChange(event.target.value)}
                  />
                </label>
              ) : null}

              {selectedComponent.type === 'image_upload' ? (
                <label className="form-field">
                  <span>最大数量</span>
                  <input
                    min="1"
                    type="number"
                    value={selectedComponent.maxCount ?? 1}
                    onChange={(event) => handleMaxCountChange(event.target.value)}
                  />
                </label>
              ) : null}

              {selectedComponent.type === 'show_item' ? (
                <label className="form-field">
                  <span>展示内容</span>
                  <textarea
                    value={selectedComponent.content ?? ''}
                    onChange={(event) => updateSelectedComponent({ content: event.target.value })}
                  />
                </label>
              ) : null}
            </div>
          ) : (
            <p>请选择一个组件进行配置。</p>
          )}
        </article>

        <article aria-label="模板预览" className="card template-panel template-preview">
          <h3>预览</h3>
          {components.length === 0 ? (
            <p>添加组件后在这里预览。</p>
          ) : (
            components.map((component) => <TemplatePreviewItem component={component} key={component.id} />)
          )}
        </article>
      </div>
    </section>
  )
}

function TemplatePreviewItem({ component }: { component: TemplateComponent }) {
  const label = component.required ? `${component.label} *` : component.label

  if (component.type === 'textarea') {
    return (
      <label className="form-field template-preview-item">
        <span>{label}</span>
        <textarea aria-label={component.label} readOnly />
      </label>
    )
  }

  if (component.type === 'single_select') {
    return (
      <fieldset className="template-preview-item">
        <legend>{label}</legend>
        {component.options?.map((option) => (
          <label className="checkbox-field" key={option}>
            <input name={`preview-${component.id}`} type="radio" />
            <span>{option}</span>
          </label>
        ))}
      </fieldset>
    )
  }

  if (component.type === 'multi_select') {
    return (
      <fieldset className="template-preview-item">
        <legend>{label}</legend>
        {component.options?.map((option) => (
          <label className="checkbox-field" key={option}>
            <input type="checkbox" />
            <span>{option}</span>
          </label>
        ))}
      </fieldset>
    )
  }

  if (component.type === 'tag_select') {
    return (
      <div className="template-preview-item">
        <p>{label}</p>
        <div className="tag-row">
          {component.options?.map((option) => (
            <span className="tag-pill" key={option}>
              {option}
            </span>
          ))}
        </div>
      </div>
    )
  }

  if (component.type === 'image_upload') {
    return (
      <div className="template-preview-item">
        <p>{label}</p>
        <div className="upload-placeholder">最多上传 {component.maxCount ?? 1} 张图片</div>
      </div>
    )
  }

  if (component.type === 'show_item') {
    return (
      <div className="template-preview-item">
        <h4>{component.label}</h4>
        <p>{component.content}</p>
      </div>
    )
  }

  return (
    <label className="form-field template-preview-item">
      <span>{label}</span>
      <input aria-label={component.label} readOnly />
    </label>
  )
}
```

- [x] **Step 2: 运行模板测试**

Run: `npm --prefix frontend run test -- src/pages/owner/templates/OwnerTemplatesPage.test.tsx`
Expected: PASS，6 个测试通过。

---

### Task 4: 补模板搭建器样式

**Files:**
- Modify: `frontend/src/styles.css`
- Test: `frontend/src/pages/owner/templates/OwnerTemplatesPage.test.tsx`

- [x] **Step 1: 在 `frontend/src/styles.css` 末尾追加样式**

```css
.template-builder-grid {
  display: grid;
  grid-template-columns: 220px minmax(260px, 1fr) minmax(280px, 1fr);
  gap: 16px;
  align-items: start;
}

.template-panel {
  display: grid;
  gap: 14px;
}

.component-button-list,
.template-component-list {
  display: grid;
  gap: 10px;
}

.template-component-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
}

.template-component-item small {
  display: block;
  color: #787671;
  margin-top: 4px;
}

.template-component-item.is-selected {
  border-color: #5645d4;
  box-shadow: 0 0 0 2px rgba(86, 69, 212, 0.12);
}

.template-component-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.checkbox-field {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #37352f;
  font-size: 14px;
}

.template-preview {
  grid-column: span 3;
}

.template-preview-item {
  border-top: 1px solid #e5e7eb;
  padding-top: 14px;
}

.template-preview-item:first-of-type {
  border-top: 0;
  padding-top: 0;
}

.tag-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.tag-pill {
  border: 1px solid #e5e7eb;
  border-radius: 9999px;
  padding: 4px 10px;
  background: #f6f5f4;
  color: #37352f;
  font-size: 13px;
}

.upload-placeholder {
  border: 1px dashed #a4a097;
  border-radius: 12px;
  padding: 16px;
  color: #787671;
  background: #fafaf9;
}
```

- [x] **Step 2: 跑模板测试确认样式改动无行为回归**

Run: `npm --prefix frontend run test -- src/pages/owner/templates/OwnerTemplatesPage.test.tsx`
Expected: PASS。

---

### Task 5: 全量验证与浏览器手工验收

**Files:**
- Verify: `frontend/src/pages/owner/templates/OwnerTemplatesPage.tsx`
- Verify: `frontend/src/pages/owner/templates/OwnerTemplatesPage.test.tsx`

- [x] **Step 1: 跑全量前端测试**

Run: `npm --prefix frontend run test`
Expected: PASS，OwnerTasksPage 与 OwnerTemplatesPage 测试均通过。

- [x] **Step 2: 跑前端构建**

Run: `npm --prefix frontend run build`
Expected: PASS，TypeScript 与 Vite 构建成功。

- [x] **Step 3: 浏览器手工验证模板搭建器**

Run: `npm --prefix frontend run dev -- --host 127.0.0.1 --port 4173`
Expected: Vite dev server 可访问。

打开：`http://127.0.0.1:4173/owner/templates`

手工检查：
- 能看到 7 个“添加 xxx”按钮。
- 点击“添加 单行文本”后，Schema 列表出现单行文本并自动选中。
- 修改标题、字段名、必填后，预览同步更新。
- 点击“添加 单选”后，能编辑选项并在预览看到选项。
- 两个组件可以上移 / 下移。
- 组件可以删除。
- 添加“展示项”后，只展示标题和展示内容配置，不展示字段名与必填。

---

## Self-Review Notes

### Spec coverage
- 7 个组件白名单：Task 1、Task 3
- 添加 / 选中：Task 1、Task 3
- 配置字段：Task 1、Task 3
- options / maxCount / content：Task 1、Task 3
- 上移 / 下移 / 删除：Task 1、Task 3
- 预览渲染：Task 1、Task 3
- 样式与浏览器验证：Task 4、Task 5

### Placeholder scan
- 未使用 TBD / TODO / “自行实现”。
- 每个代码步骤均提供完整代码或明确命令。

### Type consistency
- 组件类型统一使用 `TemplateComponentType`。
- Schema 项统一使用 `TemplateComponent`。
- 字段名统一为 `label`、`field`、`required`、`options`、`maxCount`、`content`。
