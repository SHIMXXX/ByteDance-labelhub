import { useEffect, useRef, useState, Fragment, type CSSProperties } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DndContext, DragOverlay, PointerSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragOverEvent, type DragStartEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { apiGet, apiPatch, apiPost, ApiError } from '../../../services/api/client'
import { Renderer } from '../../../features/renderer/Renderer'
import type {
  JsonRecord,
  ReviewAnswerValue,
  TemplateComponent,
  TemplateComponentType,
  TemplateValidationRule,
  TemplateVisibilityRule,
} from '../../../types/domain'

type TemplateMeta = {
  id: number
  name: string
  description: string
  datasetId?: number | null
}

type TemplateCreateResponse = {
  id: number
  name: string
  description: string
}

type TemplateVersionResponse = {
  templateVersionId: number
  templateId: number
  version: number
}

type ActiveTemplateResponse = {
  templateId: number
  templateVersionId: number | null
  datasetBinding?: {
    datasetId: number | null
    sampleItemId?: number | null
    sampleStrategy?: 'first_item'
  }
  schema: {
    version?: number
    components?: TemplateComponent[]
    sourceView?: { components?: TemplateComponent[] }
    answerView?: { components?: TemplateComponent[] }
  }
}

type TemplateListResponse = {
  items: Array<{
    id: number
    name: string
    description?: string
  }>
}

type SelectedComponentPath =
  | { type: 'root'; componentId: number }
  | { type: 'group-child'; parentId: number; componentId: number }
  | { type: 'tab-child'; parentId: number; tabKey: string; componentId: number }
  | { type: 'compare-child-left'; parentId: number; componentId: number }
  | { type: 'compare-child-right'; parentId: number; componentId: number }

type NormalizedTemplateComponent = {
  type: TemplateComponentType
  label: string
  field?: string
  required?: boolean
  pane?: 'source' | 'answer'
  options?: string[]
  maxCount?: number
  content?: string
  promptField?: string
  leftField?: string
  rightField?: string
  leftLabel?: string
  rightLabel?: string
  metadataFields?: string[]
  visibleWhen?: TemplateVisibilityRule[]
  validationRules?: TemplateValidationRule[]
  sourceField?: string
  children?: NormalizedTemplateComponent[]
  tabs?: Array<{ key: string; label: string; children: NormalizedTemplateComponent[] }>
  description?: string
  children_left?: NormalizedTemplateComponent[]
  children_right?: NormalizedTemplateComponent[]
  llmInstruction?: string
}

const sourceComponentOptions: Array<{ type: TemplateComponentType; name: string }> = [
  { type: 'show_item', name: '展示项' },
  { type: 'compare_panel', name: '对比面板' },
  { type: 'rich_text', name: '富文本' },
  { type: 'field_display', name: '单行文本展示' },
  { type: 'field_textarea', name: '多行文本展示' },
  { type: 'field_tags', name: '标签展示' },
  { type: 'field_hyperlink', name: '超链接展示' },
  { type: 'field_image', name: '图像展示' },
  { type: 'field_video', name: '视频展示' },
  { type: 'field_markdown', name: 'Markdown 图文' },
  { type: 'group', name: '分组容器' },
  { type: 'tab_container', name: '分页容器' },
]

const answerComponentOptions: Array<{ type: TemplateComponentType; name: string }> = [
  { type: 'text_input', name: '单行文本' },
  { type: 'textarea', name: '多行文本' },
  { type: 'rich_text', name: '富文本' },
  { type: 'single_select', name: '单选' },
  { type: 'multi_select', name: '多选' },
  { type: 'tag_select', name: '标签选择' },
  { type: 'json_editor', name: 'JSON 编辑器' },
  { type: 'llm_assist', name: 'LLM 辅助' },
  { type: 'image_upload', name: '图片上传' },
  { type: 'show_item', name: '展示项' },
  { type: 'compare_panel', name: '对比面板' },
  { type: 'group', name: '分组容器' },
  { type: 'tab_container', name: '分页容器' },
]

const componentOptions: Array<{ type: TemplateComponentType; name: string }> = [
  ...sourceComponentOptions,
  ...answerComponentOptions.filter((c) => !sourceComponentOptions.some((s) => s.type === c.type)),
  { type: 'text_input', name: '单行文本' },
  { type: 'textarea', name: '多行文本' },
  { type: 'single_select', name: '单选' },
  { type: 'multi_select', name: '多选' },
  { type: 'tag_select', name: '标签选择' },
  { type: 'json_editor', name: 'JSON 编辑器' },
  { type: 'llm_assist', name: 'LLM 辅助' },
  { type: 'image_upload', name: '图片上传' },
]

const optionTypes: TemplateComponentType[] = ['single_select', 'multi_select', 'tag_select']

function getDefaultPaneForType(type: TemplateComponentType): 'source' | 'answer' {
  if (type === 'show_item' || type === 'compare_panel' || type === 'rich_text' || type.startsWith('field_')) {
    return 'source'
  }
  return 'answer'
}

const sourceAllowedComponentTypes: TemplateComponentType[] = [
  'show_item',
  'compare_panel',
  'rich_text',
  'field_display',
  'field_textarea',
  'field_tags',
  'field_hyperlink',
  'field_image',
  'field_video',
  'field_markdown',
  'group',
  'tab_container',
]

const answerAllowedComponentTypes: TemplateComponentType[] = [
  'text_input',
  'textarea',
  'rich_text',
  'single_select',
  'multi_select',
  'tag_select',
  'json_editor',
  'llm_assist',
  'image_upload',
  'show_item',
  'compare_panel',
  'group',
  'tab_container',
]

const nestedSourceComponentTypes = sourceAllowedComponentTypes.filter((type) => type !== 'group' && type !== 'tab_container')
const nestedAnswerComponentTypes = answerAllowedComponentTypes.filter((type) => type !== 'group' && type !== 'tab_container')

function isSourceFieldComponentType(type: TemplateComponentType) {
  return (
    type === 'field_display'
    || type === 'field_textarea'
    || type === 'field_tags'
    || type === 'field_hyperlink'
    || type === 'field_image'
    || type === 'field_video'
    || type === 'field_markdown'
  )
}

type TemplateBasicInfoPayload = {
  name: string
  description: string
  datasetId: number | null
}

function isSourceFieldComponent(component: Pick<TemplateComponent, 'type'>) {
  return isSourceFieldComponentType(component.type)
}

function getAllowedComponentTypesForPane(pane: 'source' | 'answer') {
  return pane === 'source' ? sourceAllowedComponentTypes : answerAllowedComponentTypes
}

function isComponentTypeAllowedInPane(type: TemplateComponentType, pane: 'source' | 'answer') {
  return getAllowedComponentTypesForPane(pane).includes(type)
}

function getNestedAllowedComponentTypesForPane(pane: 'source' | 'answer') {
  return pane === 'source' ? nestedSourceComponentTypes : nestedAnswerComponentTypes
}

function getPreferredPaneForMaterial(type: TemplateComponentType, fallbackPane: 'source' | 'answer') {
  const sourceAllowed = isComponentTypeAllowedInPane(type, 'source')
  const answerAllowed = isComponentTypeAllowedInPane(type, 'answer')

  if (sourceAllowed && !answerAllowed) {
    return 'source'
  }

  if (answerAllowed && !sourceAllowed) {
    return 'answer'
  }

  return fallbackPane
}

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
    pane: getDefaultPaneForType(type),
  }

  if (optionTypes.includes(type)) {
    return {
      ...base,
      options: ['选项一', '选项二'],
      optionsText: '选项一,选项二',
    }
  }

  if (type === 'image_upload') {
    return {
      ...base,
      maxCount: 1,
    }
  }

  if (type === 'group') {
    return {
      ...base,
      field: '',
      description: '用于分组展示',
      children: [],
    }
  }

  if (type === 'tab_container') {
    return {
      ...base,
      field: '',
      tabs: [{ key: `tab_${id}_main`, label: '第 1 页', children: [] }],
    }
  }

  if (type === 'show_item') {
    return {
      ...base,
      field: '',
      content: '这里展示给标注员的说明内容',
    }
  }

  if (type === 'compare_panel') {
    return {
      ...base,
      field: '',
      promptField: 'prompt',
      leftField: 'response_a',
      rightField: 'response_b',
      leftLabel: '回答 A',
      rightLabel: '回答 B',
      metadataFields: ['model_a', 'model_b'],
      content: '用于展示偏好对比题面',
    }
  }

  if (type === 'llm_assist') {
    return {
      ...base,
      llmInstruction: '你是一个专业的标注助手。请依据题面、素材和上下文独立判断，再给出标注员应如何填写或修改的建议。当前已填写内容只能视为待核对草稿，可能有误；如果发现问题，请直接指出需要修改的字段、原因和建议写法。输出简洁中文建议，不要使用 Markdown。',
      content: '点击获取 AI 标注建议',
    }
  }

  if (type === 'json_editor') {
    return {
      ...base,
      content: '{\n  "key": "value"\n}',
    }
  }

  if (type === 'rich_text') {
    return {
      ...base,
      content: '请输入富文本内容',
    }
  }

  if (type === 'field_display') {
    return {
      ...base,
      field: '',
      sourceField: '',
      label: '单行文本展示',
    }
  }

  if (type === 'field_textarea') {
    return {
      ...base,
      field: '',
      sourceField: '',
      label: '多行文本展示',
    }
  }

  if (type === 'field_tags') {
    return {
      ...base,
      field: '',
      sourceField: '',
      label: '标签展示',
    }
  }

  if (type === 'field_hyperlink') {
    return {
      ...base,
      field: '',
      sourceField: '',
      label: '超链接展示',
    }
  }

  if (type === 'field_image') {
    return {
      ...base,
      field: '',
      sourceField: '',
      label: '图像展示',
    }
  }

  if (type === 'field_video') {
    return {
      ...base,
      field: '',
      sourceField: '',
      label: '视频展示',
    }
  }

  if (type === 'field_markdown') {
    return {
      ...base,
      field: '',
      sourceField: '',
      label: 'Markdown 图文',
    }
  }

  return base
}

function createNestedComponent(type: TemplateComponentType, id: number, pane: 'source' | 'answer'): TemplateComponent {
  return {
    ...createComponent(type, id),
    pane,
  }
}

function addVisibleWhenRule(component: TemplateComponent): TemplateComponent {
  return {
    ...component,
    visibleWhen: [...(component.visibleWhen ?? []), { field: '', operator: 'eq', value: '' }],
  }
}

function createRequiredIfRule(): Extract<TemplateValidationRule, { type: 'required_if' }> {
  return {
    type: 'required_if',
    field: '',
    operator: 'eq',
    value: '',
  }
}

function createEqualsIfRule(): Extract<TemplateValidationRule, { type: 'equals_if' }> {
  return {
    type: 'equals_if',
    field: '',
    operator: 'eq',
    value: '',
    expectedValue: '',
  }
}

function createNotEqualsIfRule(): Extract<TemplateValidationRule, { type: 'not_equals_if' }> {
  return {
    type: 'not_equals_if',
    field: '',
    operator: 'eq',
    value: '',
    expectedValue: '',
  }
}

function addValidationRule(component: TemplateComponent): TemplateComponent {
  return {
    ...component,
    validationRules: [...(component.validationRules ?? []), createRequiredIfRule()],
  }
}

function hydrateComponent(component: TemplateComponent, nextIdRef: { current: number }): TemplateComponent {
  nextIdRef.current += 1
  const nextId = nextIdRef.current
  const nextComponent: TemplateComponent = {
    id: component.id ?? nextId,
    type: component.type,
    label: component.label,
    field: component.field,
    required: component.required ?? false,
    pane: component.pane ?? getDefaultPaneForType(component.type),
    visibleWhen: component.visibleWhen ?? [],
    validationRules: component.validationRules ?? [],
  }

  if (optionTypes.includes(component.type)) {
    return {
      ...nextComponent,
      options: component.options ?? [],
      optionsText: component.options?.join(',') ?? '',
    }
  }

  if (component.type === 'image_upload') {
    return {
      ...nextComponent,
      maxCount: component.maxCount ?? 1,
    }
  }

  if (component.type === 'group') {
    return {
      ...nextComponent,
      field: '',
      description: component.description ?? '',
      children: (component.children ?? []).map((child) => hydrateComponent(child, nextIdRef)),
    }
  }

  if (component.type === 'tab_container') {
    return {
      ...nextComponent,
      field: '',
      tabs: (component.tabs ?? []).map((tab, index) => ({
        key: tab.key || `tab_${nextId}_${index + 1}`,
        label: tab.label,
        children: (tab.children ?? []).map((child) => hydrateComponent(child, nextIdRef)),
      })),
    }
  }

  if (component.type === 'show_item') {
    return {
      ...nextComponent,
      field: '',
      content: component.content ?? '',
      sourceField: component.sourceField,
    }
  }

  if (component.type === 'compare_panel') {
    return {
      ...nextComponent,
      field: '',
      content: component.content ?? '',
      promptField: component.promptField ?? 'prompt',
      leftField: component.leftField ?? 'response_a',
      rightField: component.rightField ?? 'response_b',
      leftLabel: component.leftLabel ?? '回答 A',
      rightLabel: component.rightLabel ?? '回答 B',
      metadataFields: component.metadataFields ?? ['model_a', 'model_b'],
      children_left: (component.children_left ?? []).map((child) => hydrateComponent(child, nextIdRef)),
      children_right: (component.children_right ?? []).map((child) => hydrateComponent(child, nextIdRef)),
    }
  }

  if (component.type === 'llm_assist' || component.type === 'json_editor' || component.type === 'rich_text') {
    return {
      ...nextComponent,
      content: component.content ?? '',
      llmInstruction: component.llmInstruction,
    }
  }

  if (isSourceFieldComponent(component)) {
    return {
      ...nextComponent,
      field: '',
      sourceField: component.sourceField ?? '',
      content: component.content ?? '',
    }
  }

  return nextComponent
}

function hydrateComponents(components: ActiveTemplateResponse['schema']['components'] = []) {
  const nextIdRef = { current: 0 }
  return components.map((component) => hydrateComponent(component, nextIdRef))
}

function normalizeDatasetItems(items: Array<Record<string, unknown>>) {
  return items.map((item) => ({
    id: Number(item.id ?? 0),
    sequence: Number(item.sequence ?? item.itemIndex ?? item.item_index ?? 0),
    source: ((item.source ?? item.source_json) as JsonRecord | undefined) ?? {},
  }))
}

async function fetchDatasetSampleItems(datasetId: number) {
  const firstPage = await apiGet<{ items: Array<Record<string, unknown>>; total?: number; page?: number; pageSize?: number }>(
    `/datasets/${datasetId}/items?page=1&pageSize=100`,
  )
  const normalizedItems = normalizeDatasetItems(firstPage.items)
  const total = Number(firstPage.total ?? normalizedItems.length)
  const pageSize = Number(firstPage.pageSize ?? 100)

  if (total <= normalizedItems.length || pageSize <= 0) {
    return normalizedItems
  }

  const totalPages = Math.ceil(total / pageSize)
  const pages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      apiGet<{ items: Array<Record<string, unknown>> }>(`/datasets/${datasetId}/items?page=${index + 2}&pageSize=${pageSize}`),
    ),
  )

  return [...normalizedItems, ...pages.flatMap((page) => normalizeDatasetItems(page.items))]
}

function formatSampleSource(source: JsonRecord) {
  return JSON.stringify(source, null, 2)
}

function formatSampleSourceValue(value: unknown) {
  if (value === null) {
    return 'null'
  }
  if (value === undefined) {
    return 'undefined'
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return JSON.stringify(value, null, 2)
}

function parseDatasetSelectValue(value: string) {
  if (!value) {
    return null
  }

  const nextValue = Number(value)
  return Number.isFinite(nextValue) && nextValue > 0 ? nextValue : null
}

function normalizeComponent(component: TemplateComponent): NormalizedTemplateComponent {
  if (component.type === 'group') {
    return {
      type: component.type,
      label: component.label,
      description: component.description ?? '',
      children: (component.children ?? []).map((child) => normalizeComponent(child)),
    }
  }

  if (component.type === 'tab_container') {
    return {
      type: component.type,
      label: component.label,
      tabs: (component.tabs ?? []).map((tab) => ({
        key: tab.key,
        label: tab.label,
        children: tab.children.map((child) => normalizeComponent(child)),
      })),
    }
  }

  if (component.type === 'show_item') {
    return {
      type: component.type,
      label: component.label,
      field: component.field,
      content: component.content ?? '',
      sourceField: component.sourceField,
    }
  }

  if (component.type === 'compare_panel') {
    return {
      type: component.type,
      label: component.label,
      field: component.field,
      content: component.content ?? '',
      promptField: component.promptField ?? 'prompt',
      leftField: component.leftField ?? 'response_a',
      rightField: component.rightField ?? 'response_b',
      leftLabel: component.leftLabel ?? '回答 A',
      rightLabel: component.rightLabel ?? '回答 B',
      metadataFields: component.metadataFields ?? [],
      children_left: (component.children_left ?? []).map((child) => normalizeComponent(child)),
      children_right: (component.children_right ?? []).map((child) => normalizeComponent(child)),
    }
  }

  if (component.type === 'llm_assist' || component.type === 'json_editor' || component.type === 'rich_text') {
    return {
      type: component.type,
      label: component.label,
      field: component.field,
      required: component.required,
      content: component.content ?? '',
      llmInstruction: component.llmInstruction,
      visibleWhen: component.visibleWhen ?? [],
      validationRules: component.validationRules ?? [],
    }
  }

  if (isSourceFieldComponent(component)) {
    return {
      type: component.type,
      label: component.label,
      field: component.field,
      sourceField: component.sourceField ?? '',
      visibleWhen: component.visibleWhen ?? [],
    }
  }

  if (optionTypes.includes(component.type)) {
    return {
      type: component.type,
      label: component.label,
      field: component.field,
      required: component.required,
      options: component.options ?? [],
      visibleWhen: component.visibleWhen ?? [],
      validationRules: component.validationRules ?? [],
    }
  }

  if (component.type === 'image_upload') {
    return {
      type: component.type,
      label: component.label,
      field: component.field,
      required: component.required,
      maxCount: component.maxCount ?? 1,
      visibleWhen: component.visibleWhen ?? [],
      validationRules: component.validationRules ?? [],
    }
  }

  return {
    type: component.type,
    label: component.label,
    field: component.field,
    required: component.required,
    visibleWhen: component.visibleWhen ?? [],
    validationRules: component.validationRules ?? [],
  }
}

function collectComponentFields(component: TemplateComponent, seenFields: Set<string>): string | null {
  if (component.type !== 'show_item' && component.type !== 'compare_panel') {
    const normalizedField = component.field.trim()
    if (normalizedField) {
      if (seenFields.has(normalizedField)) {
        return normalizedField
      }
      seenFields.add(normalizedField)
    }
  }

  for (const child of component.children ?? []) {
    const duplicate = collectComponentFields(child, seenFields)
    if (duplicate) {
      return duplicate
    }
  }

  for (const child of component.children_left ?? []) {
    const duplicate = collectComponentFields(child, seenFields)
    if (duplicate) {
      return duplicate
    }
  }

  for (const child of component.children_right ?? []) {
    const duplicate = collectComponentFields(child, seenFields)
    if (duplicate) {
      return duplicate
    }
  }

  for (const tab of component.tabs ?? []) {
    for (const child of tab.children) {
      const duplicate = collectComponentFields(child, seenFields)
      if (duplicate) {
        return duplicate
      }
    }
  }

  return null
}

function findDuplicateField(components: TemplateComponent[]) {
  const seenFields = new Set<string>()

  for (const component of components) {
    const duplicateField = collectComponentFields(component, seenFields)
    if (duplicateField) {
      return duplicateField
    }
  }

  return null
}

const previewSourceExample: JsonRecord = {
  prompt: '请比较回答 A 与回答 B 的事实准确性，并给出更优选择。',
  response_a: '回答 A：重点强调速度，但遗漏了约束条件。',
  response_b: '回答 B：覆盖约束条件，并解释权衡。',
  category: 'preference_compare',
}

const previewAnswerExample: Record<string, ReviewAnswerValue> = {
  preferred_answer: 'response_b',
  rationale: '示例答案：回答 B 结构更完整，也更符合任务要求。',
}

function getComponentSummary(component: TemplateComponent) {
  if (component.type === 'group') {
    return `${component.children?.length ?? 0} 个子组件`
  }

  if (component.type === 'tab_container') {
    return `${component.tabs?.length ?? 0} 个分页`
  }

  if (component.type === 'show_item') {
    return component.content || '展示原始题面信息'
  }

  if (component.type === 'compare_panel') {
    return `${component.leftField || 'response_a'} vs ${component.rightField || 'response_b'}`
  }

  if (component.type === 'field_display' || component.type === 'field_textarea') {
    return component.sourceField || '未绑定字段'
  }

  if (component.type === 'field_tags') {
    return component.sourceField ? `${component.sourceField} (标签)` : '未绑定字段'
  }

  if (component.type === 'field_hyperlink') {
    return component.sourceField ? `${component.sourceField} (链接)` : '未绑定字段'
  }

  if (component.type === 'field_image') {
    return component.sourceField ? `${component.sourceField} (图像)` : '未绑定字段'
  }

  if (component.type === 'field_video') {
    return component.sourceField ? `${component.sourceField} (视频)` : '未绑定字段'
  }

  if (component.type === 'field_markdown') {
    return component.sourceField ? `${component.sourceField} (Markdown)` : '未绑定字段'
  }

  return component.field || '未配置字段'
}

function getChildComponentLabel(child: TemplateComponent, index: number) {
  return child.label?.trim() ? child.label : `子组件 ${index + 1}`
}

function SortableTemplateComponentItem({
  component,
  index,
  isSelected,
  total,
  onDelete,
  onMove,
  onSelect,
  source,
  values,
}: {
  component: TemplateComponent
  index: number
  isSelected: boolean
  total: number
  onDelete: (componentId: number) => void
  onMove: (componentId: number, direction: 'up' | 'down') => void
  onSelect: (componentId: number) => void
  source: JsonRecord
  values: Record<string, ReviewAnswerValue>
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({
    id: String(component.id),
  })

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transform ? 'transform 200ms ease' : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      className={isSelected ? 'template-component-item is-selected' : 'template-component-item'}
      data-testid="template-component-item"
      style={{ ...style, opacity: isDragging ? 0.6 : 1 }}
    >
      <button type="button" aria-label={`选择组件 ${component.id}`} onClick={() => onSelect(component.id)}>
        <strong>{getComponentName(component.type)}</strong>
        <small>{getComponentSummary(component)}</small>
      </button>
      <div className="template-component-item__preview">
        <Renderer schema={[component]} mode="answer" source={source} values={values} />
      </div>
      <span className="template-component-actions">
        <button type="button" aria-label={`拖拽组件 ${component.id}`} {...attributes} {...listeners}>
          拖拽
        </button>
        <span data-testid="canvas-item-order">{index + 1}</span>
        <button type="button" disabled={index === 0} onClick={() => onMove(component.id, 'up')}>
          上移
        </button>
        <button type="button" disabled={index === total - 1} onClick={() => onMove(component.id, 'down')}>
          下移
        </button>
        <button type="button" onClick={() => onDelete(component.id)}>
          删除
        </button>
      </span>
    </div>
  )
}

const materialCategories: Array<{
  id: 'inputs' | 'display' | 'source' | 'layout' | 'special'
  label: string
  items: Array<{ type: TemplateComponentType; name: string; icon: string }>
}> = [
  {
    id: 'inputs',
    label: '基础录入 (Inputs)',
    items: [
      { type: 'text_input', name: '单行文本', icon: '📝' },
      { type: 'textarea', name: '多行文本', icon: '📄' },
      { type: 'single_select', name: '单项选择', icon: '🔘' },
      { type: 'multi_select', name: '多项选择', icon: '✅' },
      { type: 'tag_select', name: '标签选择', icon: '🏷️' },
    ]
  },
  {
    id: 'display',
    label: '数据展示 (Display)',
    items: [
      { type: 'show_item', name: '通用展示', icon: '👁️' },
      { type: 'compare_panel', name: '对比面板', icon: '⚖️' },
      { type: 'rich_text', name: '富文本', icon: '✨' },
    ]
  },
  {
    id: 'source',
    label: '源字段绑定 (Source)',
    items: [
      { type: 'field_display', name: '文本展示', icon: '🔹' },
      { type: 'field_textarea', name: '段落展示', icon: '🔸' },
      { type: 'field_tags', name: '标签云', icon: '🔖' },
      { type: 'field_hyperlink', name: '外部链接', icon: '🔗' },
      { type: 'field_image', name: '图片显示', icon: '🖼️' },
      { type: 'field_video', name: '视频播放', icon: '▶️' },
      { type: 'field_markdown', name: 'Markdown 图文', icon: '▣' },
    ]
  },
  {
    id: 'layout',
    label: '容器组件 (Layout)',
    items: [
      { type: 'group', name: '分组容器', icon: '📦' },
      { type: 'tab_container', name: '分页容器', icon: '📑' },
    ]
  },
  {
    id: 'special',
    label: '高级/AI (Special)',
    items: [
      { type: 'llm_assist', name: 'AI 辅助', icon: '🤖' },
      { type: 'json_editor', name: 'JSON 编辑', icon: '⚙️' },
      { type: 'image_upload', name: '图片上传', icon: '📤' },
    ]
  }
]

function getVisibleMaterialCategories(zone: 'source' | 'answer') {
  return materialCategories
    .map((category) => ({
      ...category,
      items: category.items.filter((item) => isComponentTypeAllowedInPane(item.type, zone)),
    }))
    .filter((category) => category.items.length > 0)
}

function DraggableMaterialButton({ type, name, icon, onAdd }: { type: TemplateComponentType; name: string; icon: string; onAdd: (type: TemplateComponentType) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `material:${type}`,
  })

  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.6 : 1,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 10px',
    fontSize: '12px',
    textAlign: 'left',
    width: '100%',
    borderRadius: '7px',
    border: '1px solid #e5e3df',
    background: '#fff',
    transition: 'all 0.2s ease',
    cursor: 'grab',
    boxShadow: isDragging ? '0 8px 24px rgba(15, 23, 42, 0.12)' : 'none'
  }

  return (
    <button
      ref={setNodeRef}
      type="button"
      aria-label={`添加 ${name}`}
      style={style}
      onClick={() => onAdd(type)}
      {...attributes}
      {...listeners}
    >
      <span style={{ fontSize: '14px', lineHeight: 1 }}>{icon}</span>
      <span style={{ fontWeight: 500, color: '#37352f' }}>{name}</span>
    </button>
  )
}

function PaneDropZone({
  pane,
  title,
  helper,
  items,
  selectedPath,
  isActive,
  onSelect,
  onDelete,
  onMove,
  onActivate,
  source,
  values,
  showDropPlaceholder,
  dropPlaceholderLabel,
  showTopDropHint,
  dropIndicatorId,
}: {
  pane: 'source' | 'answer'
  title: string
  helper: string
  items: TemplateComponent[]
  selectedPath: SelectedComponentPath | null
  isActive: boolean
  onSelect: (componentId: number) => void
  onDelete: (componentId: number) => void
  onMove: (componentId: number, direction: 'up' | 'down') => void
  onActivate: () => void
  source: JsonRecord
  values: Record<string, ReviewAnswerValue>
  showDropPlaceholder?: boolean
  dropPlaceholderLabel?: string
  showTopDropHint?: boolean
  dropIndicatorId?: string | null
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `pane:${pane}` })

  return (
    <article ref={setNodeRef} className={`designer-pane ${isOver ? 'is-over' : ''} ${isActive ? 'is-active' : ''}`}>
      <div className="designer-preview-header">
        <div>
          <h3>{title}</h3>
          <p className="field-helper-text">{helper}</p>
        </div>
        <button
          type="button"
          className={`button button-sm designer-edit-zone-btn ${isActive ? 'button-primary' : ''}`}
          aria-label={`编辑${title}`}
          onClick={onActivate}
        >
          {isActive ? '编辑中' : '编辑'}
        </button>
      </div>
      <div className="designer-preview-surface">
        {items.length === 0 ? (
          <p>从左侧拖入或点击添加组件到这个分区。</p>
        ) : (
          <SortableContext items={items.map((component) => String(component.id))} strategy={verticalListSortingStrategy}>
            <div className="template-component-list">
              {showDropPlaceholder && showTopDropHint ? (
                <div className="template-component-drop-hint">
                  <strong>{dropPlaceholderLabel ?? '将添加到顶部'}</strong>
                  <small>释放后会插入到当前分区最上方</small>
                </div>
              ) : null}
              {items.map((component, index) => (
                <Fragment key={component.id}>
                  {dropIndicatorId === String(component.id) ? <div className="template-component-insert-line" /> : null}
                  <SortableTemplateComponentItem
                    component={component}
                    index={index}
                    isSelected={selectedPath?.type === 'root' && component.id === selectedPath.componentId}
                    onDelete={onDelete}
                    onMove={onMove}
                    onSelect={onSelect}
                    total={items.length}
                    source={source}
                    values={values}
                  />
                </Fragment>
              ))}
            </div>
          </SortableContext>
        )}
      </div>
    </article>
  )
}

function loadMockSampleItems() {
  return [{ id: 101, sequence: 1, source: previewSourceExample }]
}

export function OwnerTemplateDesignerPage() {
  const { templateId } = useParams<{ templateId: string }>()
  const [components, setComponents] = useState<TemplateComponent[]>([])
  const [selectedPath, setSelectedPath] = useState<SelectedComponentPath | null>(null)
  const [templateName, setTemplateName] = useState('默认模板')
  const [templateDescription, setTemplateDescription] = useState('')
  const [templateMeta, setTemplateMeta] = useState<TemplateMeta | null>(null)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [schemaVersion, setSchemaVersion] = useState<1 | 2 | 3>(3)
  const [designDatasetId, setDesignDatasetId] = useState<number | null>(null)
  const [datasetList, setDatasetList] = useState<Array<{ id: number; name: string }>>([])
  const [sampleItems, setSampleItems] = useState<Array<{ id: number; sequence: number; source: JsonRecord }>>([])
  const [sampleIndex, setSampleIndex] = useState(0)
  const [showSamplePreview, setShowSamplePreview] = useState(false)
  const [samplePreviewMode, setSamplePreviewMode] = useState<'fields' | 'json'>('fields')
  const [samplePreviewNotice, setSamplePreviewNotice] = useState('')
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [activeEditZone, setActiveEditZone] = useState<'source' | 'answer'>('answer')
  const [activeDragMaterial, setActiveDragMaterial] = useState<{ type: TemplateComponentType; name: string; icon: string } | null>(null)
  const [activeDragPane, setActiveDragPane] = useState<'source' | 'answer' | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const idRef = useRef(0)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const selectedComponent = getComponentByPath(components, selectedPath)
  const sourceComponents = components.filter((component) => component.pane === 'source')
  const answerComponents = components.filter((component) => component.pane !== 'source')
  const currentSampleSource = sampleItems[sampleIndex]?.source ?? previewSourceExample
  const hasBoundDatasetSamples = Boolean(designDatasetId) && sampleItems.length > 0
  const currentDatasetName = datasetList.find((dataset) => dataset.id === designDatasetId)?.name ?? null
  const currentSampleFieldEntries = Object.entries(currentSampleSource ?? {})
  const visibleMaterialCategories = getVisibleMaterialCategories(activeEditZone)

  useEffect(() => {
    void loadInitialData()
  }, [])

  useEffect(() => {
    if (!samplePreviewNotice) {
      return
    }

    const timer = window.setTimeout(() => setSamplePreviewNotice(''), 1800)
    return () => window.clearTimeout(timer)
  }, [samplePreviewNotice])

  async function loadInitialData() {
    setLoading(true)
    try {
      const dsRes = await apiGet<{ items: Array<{ id: number; name: string }> }>('/datasets')
      setDatasetList(dsRes.items)
      await loadDefaultTemplate()
    } catch {
      setError('初始化设计器失败')
    } finally {
      setLoading(false)
    }
  }

  async function handleUpdateBasicInfo() {
    if (!templateMeta) return
    setSaving(true)
    setFeedback('')
    setError('')
    try {
      const targetDsId = designDatasetId ?? null

      const res = await apiPatch<TemplateMeta & { datasetId: number | null }, TemplateBasicInfoPayload>(`/templates/${templateMeta.id}`, {
        name: templateName.trim() || '未命名模板',
        description: templateDescription.trim(),
        datasetId: targetDsId,
      })

      setTemplateMeta(res)
      setDesignDatasetId(res.datasetId)
      setTemplateName(res.name)
      setTemplateDescription(res.description)
      setFeedback('模板基础信息已保存；绑定数据集会在点击“保存模板”后写入模板版本。')

      // Reload samples from the newly bound dataset
      if (res.datasetId) {
        const samples = await fetchDatasetSampleItems(res.datasetId)
        if (samples.length > 0) {
          setSampleItems(samples)
          setSampleIndex(0)
        } else {
          setSampleItems(loadMockSampleItems())
          setFeedback('数据集已绑定，但该数据集目前没有样本数据。')
        }
      } else {
        setSampleItems(loadMockSampleItems())
      }
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.detail || err.message : '同步模板信息失败，请重试。')
    } finally {
      setSaving(false)
    }
  }

  async function loadDefaultTemplate() {
    setLoading(true)
    setError('')

    try {
      const nextTemplateName = '默认模板'
      const templateList = await apiGet<TemplateListResponse>('/templates')
      const routeTemplate = templateId ? templateList.items.find((item) => String(item.id) === templateId) : null
      const existingTemplate =
        routeTemplate ??
        templateList.items.find((item) => item.id === templateMeta?.id) ??
        templateList.items.find((item) => item.name === nextTemplateName)
      const createResult = existingTemplate
        ? {
            id: existingTemplate.id,
            name: existingTemplate.name,
            description: existingTemplate.description ?? templateMeta?.description ?? templateDescription,
          }
        : await apiPost<TemplateCreateResponse, { name: string; description: string }>('/templates', {
            name: templateName.trim() || nextTemplateName,
            description: templateDescription.trim(),
          })
      const activeResult = await apiGet<ActiveTemplateResponse>(
        `/templates/${createResult.id}/active-version`,
      )
      const nextComponents = hydrateComponents(
        activeResult.schema.version === 3
          ? [...(activeResult.schema.sourceView?.components ?? []), ...(activeResult.schema.answerView?.components ?? [])]
          : activeResult.schema.components,
      )
      const nextSchemaVersion = activeResult.schema.version === 3 ? 3 : activeResult.schema.version === 2 ? 2 : 1
      const activeDsId = activeResult.datasetBinding?.datasetId ?? null
      setTemplateName(createResult.name)
      setTemplateDescription(createResult.description)
      setTemplateMeta({ id: createResult.id, name: createResult.name, description: createResult.description })
      setSchemaVersion(nextSchemaVersion)
      setDesignDatasetId(activeDsId)
      setSampleIndex(0)

      if (activeDsId) {
        try {
          const samples = await fetchDatasetSampleItems(activeDsId)
          if (samples.length > 0) {
            setSampleItems(samples)
          } else {
            setSampleItems(loadMockSampleItems())
          }
        } catch {
          setSampleItems(loadMockSampleItems())
        }
      } else {
        setSampleItems(loadMockSampleItems())
      }
      setComponents(nextComponents)
      setSelectedPath(nextComponents[0] ? { type: 'root', componentId: nextComponents[0].id } : null)
      idRef.current = nextComponents.reduce((maxId, component) => Math.max(maxId, component.id), 0)
    } catch {
      setError('模板读取失败，请确认后端服务已启动。')
    } finally {
      setLoading(false)
    }
  }

  function getComponentByPath(currentComponents: TemplateComponent[], path: SelectedComponentPath | null) {
    if (!path) {
      return null
    }

    if (path.type === 'root') {
      return currentComponents.find((component) => component.id === path.componentId) ?? null
    }

    const parent = currentComponents.find((component) => component.id === path.parentId)
    if (!parent) {
      return null
    }

    if (path.type === 'group-child') {
      return parent.children?.find((child) => child.id === path.componentId) ?? null
    }

    if (path.type === 'compare-child-left') {
      return parent.children_left?.find((child) => child.id === path.componentId) ?? null
    }

    if (path.type === 'compare-child-right') {
      return parent.children_right?.find((child) => child.id === path.componentId) ?? null
    }

    const tab = parent.tabs?.find((item) => item.key === path.tabKey)
    return tab?.children.find((child) => child.id === path.componentId) ?? null
  }

  function updateComponentByPath(updater: (component: TemplateComponent) => TemplateComponent) {
    if (!selectedPath) {
      return
    }

    setComponents((current) =>
      current.map((component) => {
        if (selectedPath.type === 'root' && component.id === selectedPath.componentId) {
          return updater(component)
        }

        if (selectedPath.type === 'group-child' && component.id === selectedPath.parentId) {
          return {
            ...component,
            children: (component.children ?? []).map((child) =>
              child.id === selectedPath.componentId ? updater(child) : child,
            ),
          }
        }

        if (selectedPath.type === 'compare-child-left' && component.id === selectedPath.parentId) {
          return {
            ...component,
            children_left: (component.children_left ?? []).map((child) =>
              child.id === selectedPath.componentId ? updater(child) : child,
            ),
          }
        }

        if (selectedPath.type === 'compare-child-right' && component.id === selectedPath.parentId) {
          return {
            ...component,
            children_right: (component.children_right ?? []).map((child) =>
              child.id === selectedPath.componentId ? updater(child) : child,
            ),
          }
        }

        if (selectedPath.type === 'tab-child' && component.id === selectedPath.parentId) {
          return {
            ...component,
            tabs: (component.tabs ?? []).map((tab) =>
              tab.key !== selectedPath.tabKey
                ? tab
                : {
                    ...tab,
                    children: tab.children.map((child) =>
                      child.id === selectedPath.componentId ? updater(child) : child,
                    ),
                  },
            ),
          }
        }

        return component
      }),
    )
  }

  async function handleSaveTemplate() {
    if (!templateMeta) {
      setError('模板尚未初始化完成，请稍后重试。')
      return
    }

    const duplicateField = findDuplicateField(components)
    if (duplicateField) {
      setFeedback('')
      setError(`字段名不能重复：${duplicateField}`)
      return
    }

    setSaving(true)
    setFeedback('')
    setError('')

    try {
      const schema = {
        version: 3 as const,
        datasetBinding: {
          datasetId: designDatasetId ?? null,
          sampleItemId: sampleItems[sampleIndex]?.id ?? null,
          sampleStrategy: 'first_item' as const,
        },
        layout: { type: 'stacked-source-answer' as const },
        sourceView: { components: components.filter((component) => component.pane === 'source').map((component) => normalizeComponent(component)) },
        answerView: { components: components.filter((component) => component.pane !== 'source').map((component) => normalizeComponent(component)) },
      }
      setSchemaVersion(schema.version)

      // Update both basic info and version in one sequence or ensure basic info is synced
      const nextTemplate = await apiPatch<TemplateMeta & { datasetId: number | null }, TemplateBasicInfoPayload>(
        `/templates/${templateMeta.id}`,
        {
          name: templateName.trim() || '默认模板',
          description: templateDescription.trim(),
          datasetId: designDatasetId ?? null,
        },
      )

      const result = await apiPost<TemplateVersionResponse, { schema: typeof schema }>(
        `/templates/${templateMeta.id}/versions`,
        { schema },
      )

      setTemplateMeta(nextTemplate)
      setDesignDatasetId(nextTemplate.datasetId)
      setFeedback(`模板已成功发布为第 ${result.version} 版`)
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.detail || err.message : '模板保存或发布失败，请检查配置。')
    } finally {
      setSaving(false)
    }
  }

  function handleAddComponent(type: TemplateComponentType) {
    if (!isComponentTypeAllowedInPane(type, activeEditZone)) {
      return
    }

    const nextId = idRef.current + 1
    idRef.current = nextId
    const nextComponent = { ...createComponent(type, nextId), pane: activeEditZone }
    setComponents((current) => {
      const insertIndex = current.findIndex((component) => component.pane === activeEditZone)
      if (insertIndex < 0) {
        return activeEditZone === 'source' ? [nextComponent, ...current] : [...current, nextComponent]
      }
      return [...current.slice(0, insertIndex), nextComponent, ...current.slice(insertIndex)]
    })
    setSelectedPath({ type: 'root', componentId: nextId })
  }

  function updateSelectedComponent(patch: Partial<TemplateComponent>) {
    if (!selectedPath) {
      return
    }

    updateComponentByPath((component) => ({ ...component, ...patch }))
  }

  function handleOptionsChange(value: string) {
    updateSelectedComponent({
      options: value
        .split(/[,，]/)
        .map((option) => option.trim())
        .filter(Boolean),
      optionsText: value,
    })
  }

  function handleMaxCountChange(value: string) {
    const nextValue = Number(value)
    updateSelectedComponent({
      maxCount: Number.isNaN(nextValue) || nextValue <= 0 ? 1 : Math.floor(nextValue),
    })
  }

  function updateVisibleWhenRule(index: number, patch: Partial<TemplateVisibilityRule>) {
    updateComponentByPath((component) => ({
      ...component,
      visibleWhen: (component.visibleWhen ?? []).map((rule, currentIndex) =>
        currentIndex === index ? { ...rule, ...patch } : rule,
      ),
    }))
  }

  function removeVisibleWhenRule(index: number) {
    updateComponentByPath((component) => ({
      ...component,
      visibleWhen: (component.visibleWhen ?? []).filter((_, currentIndex) => currentIndex !== index),
    }))
  }

  function updateValidationRule(index: number, nextRule: TemplateValidationRule) {
    updateComponentByPath((component) => ({
      ...component,
      validationRules: (component.validationRules ?? []).map((rule, currentIndex) =>
        currentIndex === index ? nextRule : rule,
      ),
    }))
  }

  function updateValidationRuleType(index: number, type: TemplateValidationRule['type']) {
    if (type === 'json_valid') {
      updateValidationRule(index, { type: 'json_valid' })
      return
    }

    if (type === 'min_selected' || type === 'min_length') {
      updateValidationRule(index, { type, value: 1 })
      return
    }

    if (type === 'required_if') {
      updateValidationRule(index, createRequiredIfRule())
      return
    }

    if (type === 'equals_if') {
      updateValidationRule(index, createEqualsIfRule())
      return
    }

    updateValidationRule(index, createNotEqualsIfRule())
  }

  function removeValidationRule(index: number) {
    updateComponentByPath((component) => ({
      ...component,
      validationRules: (component.validationRules ?? []).filter((_, currentIndex) => currentIndex !== index),
    }))
  }

  function addGroupChild(parentId: number, type: TemplateComponentType) {
    const parent = components.find((component) => component.id === parentId)
    const pane = parent?.pane ?? 'answer'
    if (!isComponentTypeAllowedInPane(type, pane) || type === 'group' || type === 'tab_container') {
      return
    }

    const nextId = idRef.current + 1
    idRef.current = nextId
    setComponents((current) =>
      current.map((component) =>
        component.id !== parentId
          ? component
          : {
              ...component,
              children: [...(component.children ?? []), createNestedComponent(type, nextId, pane)],
            },
      ),
    )
    setSelectedPath({ type: 'root', componentId: parentId })
  }

  function removeGroupChild(parentId: number, componentId: number) {
    setComponents((current) =>
      current.map((component) =>
        component.id !== parentId
          ? component
          : {
              ...component,
              children: (component.children ?? []).filter((child) => child.id !== componentId),
            },
      ),
    )

    if (selectedPath?.type === 'group-child' && selectedPath.parentId === parentId && selectedPath.componentId === componentId) {
      setSelectedPath({ type: 'root', componentId: parentId })
    }
  }

  function moveGroupChild(parentId: number, componentId: number, direction: 'up' | 'down') {
    setComponents((current) =>
      current.map((component) => {
        if (component.id !== parentId) {
          return component
        }

        const children = component.children ?? []
        const index = children.findIndex((child) => child.id === componentId)
        const targetIndex = direction === 'up' ? index - 1 : index + 1
        if (index < 0 || targetIndex < 0 || targetIndex >= children.length) {
          return component
        }

        return {
          ...component,
          children: arrayMove(children, index, targetIndex),
        }
      }),
    )
  }

  function addTab(parentId: number) {
    const nextId = idRef.current + 1
    idRef.current = nextId
    const nextTabKey = `tab_${parentId}_${nextId}`
    setComponents((current) =>
      current.map((component) =>
        component.id !== parentId
          ? component
          : {
              ...component,
              tabs: [...(component.tabs ?? []), { key: nextTabKey, label: `第 ${(component.tabs?.length ?? 0) + 1} 页`, children: [] }],
            },
      ),
    )
  }

  function updateTabLabel(parentId: number, tabKey: string, label: string) {
    setComponents((current) =>
      current.map((component) =>
        component.id !== parentId
          ? component
          : {
              ...component,
              tabs: (component.tabs ?? []).map((tab) => (tab.key === tabKey ? { ...tab, label } : tab)),
            },
      ),
    )
  }

  function removeTab(parentId: number, tabKey: string) {
    setComponents((current) =>
      current.map((component) => {
        if (component.id !== parentId) {
          return component
        }

        const nextTabs = (component.tabs ?? []).filter((tab) => tab.key !== tabKey)

        if (selectedPath?.type === 'tab-child' && selectedPath.parentId === parentId && selectedPath.tabKey === tabKey) {
          setSelectedPath({ type: 'root', componentId: parentId })
        }

        return {
          ...component,
          tabs: nextTabs.length > 0 ? nextTabs : component.tabs,
        }
      }),
    )
  }

  function moveTab(parentId: number, tabKey: string, direction: 'left' | 'right') {
    setComponents((current) =>
      current.map((component) => {
        if (component.id !== parentId) {
          return component
        }

        const tabs = component.tabs ?? []
        const index = tabs.findIndex((tab) => tab.key === tabKey)
        const targetIndex = direction === 'left' ? index - 1 : index + 1
        if (index < 0 || targetIndex < 0 || targetIndex >= tabs.length) {
          return component
        }

        return {
          ...component,
          tabs: arrayMove(tabs, index, targetIndex),
        }
      }),
    )
  }

  function addTabChild(parentId: number, tabKey: string, type: TemplateComponentType) {
    const parent = components.find((component) => component.id === parentId)
    const pane = parent?.pane ?? 'answer'
    if (!isComponentTypeAllowedInPane(type, pane) || type === 'group' || type === 'tab_container') {
      return
    }

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
                  : { ...tab, children: [...tab.children, createNestedComponent(type, nextId, pane)] },
              ),
            },
      ),
    )
    setSelectedPath({ type: 'root', componentId: parentId })
  }

  function removeTabChild(parentId: number, tabKey: string, componentId: number) {
    setComponents((current) =>
      current.map((component) =>
        component.id !== parentId
          ? component
          : {
              ...component,
              tabs: (component.tabs ?? []).map((tab) =>
                tab.key !== tabKey
                  ? tab
                  : { ...tab, children: tab.children.filter((child) => child.id !== componentId) },
              ),
            },
      ),
    )

    if (selectedPath?.type === 'tab-child' && selectedPath.parentId === parentId && selectedPath.tabKey === tabKey && selectedPath.componentId === componentId) {
      setSelectedPath({ type: 'root', componentId: parentId })
    }
  }

  function moveTabChild(parentId: number, tabKey: string, componentId: number, direction: 'up' | 'down') {
    setComponents((current) =>
      current.map((component) => {
        if (component.id !== parentId) {
          return component
        }

        return {
          ...component,
          tabs: (component.tabs ?? []).map((tab) => {
            if (tab.key !== tabKey) {
              return tab
            }

            const index = tab.children.findIndex((child) => child.id === componentId)
            const targetIndex = direction === 'up' ? index - 1 : index + 1
            if (index < 0 || targetIndex < 0 || targetIndex >= tab.children.length) {
              return tab
            }

            return {
              ...tab,
              children: arrayMove(tab.children, index, targetIndex),
            }
          }),
        }
      }),
    )
  }

  function addCompareChild(parentId: number, slot: 'left' | 'right', type: TemplateComponentType) {
    const parent = components.find((component) => component.id === parentId)
    const pane = parent?.pane ?? 'answer'
    const nextId = idRef.current + 1
    idRef.current = nextId
    const nextComponent = createNestedComponent(type, nextId, pane)

    setComponents((current) =>
      current.map((component) =>
        component.id !== parentId
          ? component
          : {
              ...component,
              [slot === 'left' ? 'children_left' : 'children_right']: [
                ...(component[slot === 'left' ? 'children_left' : 'children_right'] ?? []),
                nextComponent,
              ],
            },
      ),
    )
    setSelectedPath({ type: 'root', componentId: parentId })
  }

  function removeCompareChild(parentId: number, slot: 'left' | 'right', componentId: number) {
    setComponents((current) =>
      current.map((component) =>
        component.id !== parentId
          ? component
          : {
              ...component,
              [slot === 'left' ? 'children_left' : 'children_right']: (
                component[slot === 'left' ? 'children_left' : 'children_right'] ?? []
              ).filter((child) => child.id !== componentId),
            },
      ),
    )

    const pathType = slot === 'left' ? 'compare-child-left' : 'compare-child-right'
    if (selectedPath?.type === pathType && selectedPath.parentId === parentId && selectedPath.componentId === componentId) {
      setSelectedPath({ type: 'root', componentId: parentId })
    }
  }

  function moveCompareChild(parentId: number, slot: 'left' | 'right', componentId: number, direction: 'up' | 'down') {
    setComponents((current) =>
      current.map((component) => {
        if (component.id !== parentId) {
          return component
        }

        const listKey = slot === 'left' ? 'children_left' : 'children_right'
        const list = component[listKey] ?? []
        const index = list.findIndex((child) => child.id === componentId)
        const targetIndex = direction === 'up' ? index - 1 : index + 1
        if (index < 0 || targetIndex < 0 || targetIndex >= list.length) {
          return component
        }

        return {
          ...component,
          [listKey]: arrayMove(list, index, targetIndex),
        }
      }),
    )
  }

  function renderRuleEditor(component: TemplateComponent) {
    return (
      <>
        <div>
          <div className="button-row">
            <span>显示条件</span>
            <button type="button" onClick={() => updateComponentByPath(() => addVisibleWhenRule(component))}>
              新增显示条件
            </button>
          </div>
          {(component.visibleWhen ?? []).map((rule, index) => (
            <div className="form-grid" key={`visible-${index}`}>
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
              <button type="button" onClick={() => removeVisibleWhenRule(index)}>
                删除显示条件
              </button>
            </div>
          ))}
        </div>

        <div>
          <div className="button-row">
            <span>联动校验</span>
            <button type="button" onClick={() => updateComponentByPath(() => addValidationRule(component))}>
              新增校验规则
            </button>
          </div>
          {(component.validationRules ?? []).map((rule, index) => (
            <div className="form-grid" key={`validation-${index}`}>
              <label className="form-field">
                <span>校验规则类型-{index + 1}</span>
                <select
                  aria-label={`校验规则类型-${index + 1}`}
                  value={rule.type}
                  onChange={(event) => updateValidationRuleType(index, event.target.value as TemplateValidationRule['type'])}
                >
                  <option value="required_if">条件必填</option>
                  <option value="min_selected">最少选择数</option>
                  <option value="min_length">最少字符数</option>
                  <option value="equals_if">条件等于</option>
                  <option value="not_equals_if">条件不等于</option>
                  <option value="json_valid">JSON 有效</option>
                </select>
              </label>

              {(rule.type === 'required_if' || rule.type === 'equals_if' || rule.type === 'not_equals_if') ? (
                <>
                  <label className="form-field">
                    <span>校验字段-{index + 1}</span>
                    <input
                      aria-label={`校验字段-${index + 1}`}
                      value={rule.field}
                      onChange={(event) => updateValidationRule(index, { ...rule, field: event.target.value })}
                    />
                  </label>
                  <label className="form-field">
                    <span>校验操作符-{index + 1}</span>
                    <select
                      aria-label={`校验操作符-${index + 1}`}
                      value={rule.operator}
                      onChange={(event) => updateValidationRule(index, { ...rule, operator: event.target.value as TemplateVisibilityRule['operator'] })}
                    >
                      <option value="eq">等于</option>
                      <option value="neq">不等于</option>
                      <option value="not_empty">非空</option>
                      <option value="includes">包含</option>
                    </select>
                  </label>
                  {rule.operator !== 'not_empty' ? (
                    <label className="form-field">
                      <span>校验值-{index + 1}</span>
                      <input
                        aria-label={`校验值-${index + 1}`}
                        value={rule.value ?? ''}
                        onChange={(event) => updateValidationRule(index, { ...rule, value: event.target.value })}
                      />
                    </label>
                  ) : null}
                  {'expectedValue' in rule ? (
                    <label className="form-field">
                      <span>目标值-{index + 1}</span>
                      <input
                        aria-label={`目标值-${index + 1}`}
                        value={rule.expectedValue}
                        onChange={(event) => updateValidationRule(index, { ...rule, expectedValue: event.target.value })}
                      />
                    </label>
                  ) : null}
                </>
              ) : null}

              {(rule.type === 'min_selected' || rule.type === 'min_length') ? (
                <label className="form-field">
                  <span>{rule.type === 'min_selected' ? `最少选择数-${index + 1}` : `最少字符数-${index + 1}`}</span>
                  <input
                    aria-label={rule.type === 'min_selected' ? `最少选择数-${index + 1}` : `最少字符数-${index + 1}`}
                    min="1"
                    type="number"
                    value={rule.value}
                    onChange={(event) => updateValidationRule(index, { ...rule, value: Number(event.target.value) || 1 })}
                  />
                </label>
              ) : null}

              <button type="button" onClick={() => removeValidationRule(index)}>
                删除校验规则
              </button>
            </div>
          ))}
        </div>
      </>
    )
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

      if (selectedPath?.type === 'root' && selectedPath.componentId === componentId) {
        const nextSelected = nextComponents[index] ?? nextComponents[index - 1] ?? null
        setSelectedPath(nextSelected ? { type: 'root', componentId: nextSelected.id } : null)
      }

      return nextComponents
    })
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event

    if (!over) {
      setActiveDragMaterial(null)
      setActiveDragPane(null)
      setDragOverId(null)
      return
    }

    const activeId = String(active.id)
    const overId = String(over.id)

    if (activeId.startsWith('material:')) {
      const type = activeId.replace('material:', '') as TemplateComponentType
      const targetPane =
        overId.startsWith('pane:')
          ? (overId.replace('pane:', '') as 'source' | 'answer')
          : components.find((component) => String(component.id) === overId)?.pane

      if (!targetPane || !activeDragPane || targetPane !== activeDragPane) {
        setActiveDragMaterial(null)
        setActiveDragPane(null)
        setDragOverId(null)
        return
      }

      const nextId = idRef.current + 1
      idRef.current = nextId
      const nextComponent = { ...createComponent(type, nextId), pane: targetPane }
      setComponents((current) => {
        if (overId.startsWith('pane:')) {
          const insertIndex = current.findIndex((component) => component.pane === targetPane)
          if (insertIndex < 0) {
            return targetPane === 'source' ? [nextComponent, ...current] : [...current, nextComponent]
          }
          return [...current.slice(0, insertIndex), nextComponent, ...current.slice(insertIndex)]
        }

        const insertIndex = current.findIndex((component) => String(component.id) === overId)
        if (insertIndex < 0) {
          return current
        }
        return [...current.slice(0, insertIndex), nextComponent, ...current.slice(insertIndex)]
      })
      setSelectedPath({ type: 'root', componentId: nextId })
      setActiveDragMaterial(null)
      setActiveDragPane(null)
      setDragOverId(null)
      return
    }

    if (activeId === overId) {
      setActiveDragMaterial(null)
      setActiveDragPane(null)
      setDragOverId(null)
      return
    }

    setComponents((current) => {
      const oldIndex = current.findIndex((component) => String(component.id) === activeId)
      if (oldIndex < 0) {
        return current
      }

      const activePane = current[oldIndex]?.pane

      if (overId.startsWith('pane:')) {
        const pane = overId.replace('pane:', '') as 'source' | 'answer'
        if (pane !== activePane) {
          return current
        }
        const firstPaneIndex = current.findIndex((component) => component.pane === pane)
        if (firstPaneIndex < 0 || firstPaneIndex === oldIndex) {
          return current
        }
        return arrayMove(current, oldIndex, firstPaneIndex)
      }

      const newIndex = current.findIndex((component) => String(component.id) === overId)
      if (newIndex < 0) {
        return current
      }

      const overPane = current[newIndex]?.pane
      if (activePane !== overPane) {
        return current
      }

      return arrayMove(current, oldIndex, newIndex)
    })
    setActiveDragMaterial(null)
    setActiveDragPane(null)
    setDragOverId(null)
  }

  function handleDragStart(event: DragStartEvent) {
    const activeId = String(event.active.id)
    setDragOverId(null)

    if (!activeId.startsWith('material:')) {
      setActiveDragMaterial(null)
      const activeComponent = components.find((component) => String(component.id) === activeId) ?? null
      setActiveDragPane(activeComponent?.pane ?? null)
      return
    }

    const materialType = activeId.replace('material:', '') as TemplateComponentType
    const material = materialCategories.flatMap((category) => category.items).find((item) => item.type === materialType) ?? null
    setActiveDragMaterial(material ? { type: material.type, name: material.name, icon: material.icon } : null)
    setActiveDragPane(activeEditZone)
  }

  function handleDragOver(event: DragOverEvent) {
    const overId = event.over ? String(event.over.id) : null
    if (!overId || !activeDragPane) {
      setDragOverId(null)
      return
    }

    if (overId.startsWith('pane:')) {
      const pane = overId.replace('pane:', '') as 'source' | 'answer'
      setDragOverId(pane === activeDragPane ? overId : null)
      return
    }

    const overComponent = components.find((component) => String(component.id) === overId) ?? null
    setDragOverId(overComponent?.pane === activeDragPane ? overId : null)
  }

  async function handleCopyCurrentSampleSource() {
    try {
      await navigator.clipboard.writeText(formatSampleSource(currentSampleSource))
      setSamplePreviewNotice('source JSON 已复制')
    } catch {
      setSamplePreviewNotice('复制失败，请手动选择内容')
    }
  }

  return (
    <section className="template-designer-page designer-shell">
      <header className="designer-shell__topbar" style={{ backgroundColor: '#fff', borderBottom: '1px solid #ede9e4' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Link aria-label="返回模板库" to="/owner/templates" style={{ textDecoration: 'none', color: '#787671', fontSize: '20px', lineHeight: 1 }}>←</Link>
          <div>
            <span style={{ display: 'block', fontSize: '11px', color: '#787671', marginBottom: '2px' }}>模板设计器</span>
            <h2 style={{ fontSize: '15px', fontWeight: 600, margin: 0, color: '#1a1a1a' }}>{templateName || '未命名模板'}</h2>
            <p style={{ fontSize: '11px', color: '#a4a097', margin: 0 }}>schema v{schemaVersion}</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#f6f5f4', borderRadius: '6px', padding: '2px', border: '1px solid #ede9e4' }}>
            <button
              type="button"
              className="button-icon-sm"
              disabled={!hasBoundDatasetSamples || sampleIndex === 0}
              onClick={() => setSampleIndex((current) => Math.max(current - 1, 0))}
              style={{ border: 'none', background: 'none', padding: '4px 10px', cursor: !hasBoundDatasetSamples || sampleIndex === 0 ? 'not-allowed' : 'pointer', fontSize: '11px', opacity: !hasBoundDatasetSamples || sampleIndex === 0 ? 0.4 : 1 }}
            >
              上一个
            </button>
            <button
              type="button"
              className="button-icon-sm"
              disabled={!hasBoundDatasetSamples}
              onClick={() => setShowSamplePreview(true)}
              style={{
                border: 'none',
                background: 'none',
                padding: '0 8px',
                borderLeft: '1px solid #ede9e4',
                borderRight: '1px solid #ede9e4',
                fontSize: '11px',
                fontWeight: 500,
                color: hasBoundDatasetSamples ? '#5645d4' : '#787671',
                cursor: hasBoundDatasetSamples ? 'pointer' : 'not-allowed',
                opacity: hasBoundDatasetSamples ? 1 : 0.55,
              }}
              aria-label="预览样本 source 数据"
              title={hasBoundDatasetSamples ? '查看当前样本的 source 原始数据' : '请先绑定数据集并加载样本'}
            >
              预览样本 {hasBoundDatasetSamples ? `${sampleIndex + 1}/${sampleItems.length}` : '未绑定'}
            </button>
            <button
              type="button"
              className="button-icon-sm"
              disabled={!hasBoundDatasetSamples || sampleItems.length <= 1 || sampleIndex >= sampleItems.length - 1}
              onClick={() => setSampleIndex((current) => Math.min(current + 1, sampleItems.length - 1))}
              style={{ border: 'none', background: 'none', padding: '4px 10px', cursor: !hasBoundDatasetSamples || sampleItems.length <= 1 || sampleIndex >= sampleItems.length - 1 ? 'not-allowed' : 'pointer', fontSize: '11px', opacity: (!hasBoundDatasetSamples || sampleItems.length <= 1 || sampleIndex >= sampleItems.length - 1) ? 0.4 : 1 }}
            >
              下一个
            </button>
          </div>

          <button type="button" className="button-sm" onClick={() => setSelectedPath(null)} style={{ background: 'none', border: '1px solid #ede9e4', borderRadius: '6px', color: '#5645d4', fontWeight: 500 }}>
            ⚙ 全局配置
          </button>

          <div style={{ width: '1px', height: '24px', backgroundColor: '#ede9e4' }}></div>

          <button type="button" className="button-sm" onClick={() => void loadDefaultTemplate()} disabled={loading || saving} style={{ background: 'none', border: '1px solid #ede9e4', borderRadius: '6px' }}>
            重置
          </button>

          <button className="button-sm button-primary" type="button" onClick={() => void handleSaveTemplate()} disabled={loading || saving || !templateMeta} style={{ padding: '6px 20px', borderRadius: '6px', fontWeight: 600 }}>
            {saving ? '保存中...' : '发布版本'}
          </button>
        </div>
      </header>

      <main className="designer-shell__main">
        {feedback && <div className="feedback-message animate-fade-in" style={{ margin: '0' }}>{feedback}</div>}
        {error && <div className="error-text" style={{ margin: '0' }}>{error}</div>}

        {showSamplePreview ? (
          <div className="modal-overlay" onClick={(event) => {
            if (event.target === event.currentTarget) {
              setShowSamplePreview(false)
            }
          }}>
            <div className="modal-card modal-card-wide" style={{ maxWidth: '920px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                <div>
                  <h3>样本 Source 预览</h3>
                  <p className="field-helper-text" style={{ margin: '6px 0 0 0' }}>
                    查看当前绑定数据集的原始 source 数据，并切换不同样本快速核对字段。
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {samplePreviewNotice ? <span className="inline-notice">{samplePreviewNotice}</span> : null}
                  <button className="button" type="button" onClick={() => void handleCopyCurrentSampleSource()}>复制 JSON</button>
                  <button className="button" type="button" onClick={() => setShowSamplePreview(false)}>关闭</button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '12px' }}>
                <div style={{ border: '1px solid #ede9e4', borderRadius: '8px', padding: '10px 12px', backgroundColor: '#fafaf9' }}>
                  <div style={{ fontSize: '11px', color: '#787671', marginBottom: '4px' }}>数据集</div>
                  <strong style={{ fontSize: '13px', color: '#1a1a1a' }}>{currentDatasetName ?? '未命名数据集'}</strong>
                </div>
                <div style={{ border: '1px solid #ede9e4', borderRadius: '8px', padding: '10px 12px', backgroundColor: '#fafaf9' }}>
                  <div style={{ fontSize: '11px', color: '#787671', marginBottom: '4px' }}>样本位置</div>
                  <strong style={{ fontSize: '13px', color: '#1a1a1a' }}>{`${sampleIndex + 1} / ${sampleItems.length}`}</strong>
                </div>
                <div style={{ border: '1px solid #ede9e4', borderRadius: '8px', padding: '10px 12px', backgroundColor: '#fafaf9' }}>
                  <div style={{ fontSize: '11px', color: '#787671', marginBottom: '4px' }}>样本 ID</div>
                  <strong style={{ fontSize: '13px', color: '#1a1a1a' }}>{sampleItems[sampleIndex]?.id ?? '-'}</strong>
                </div>
                <div style={{ border: '1px solid #ede9e4', borderRadius: '8px', padding: '10px 12px', backgroundColor: '#fafaf9' }}>
                  <div style={{ fontSize: '11px', color: '#787671', marginBottom: '4px' }}>字段数</div>
                  <strong style={{ fontSize: '13px', color: '#1a1a1a' }}>{currentSampleFieldEntries.length}</strong>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 220px) 1fr auto auto', gap: '12px', alignItems: 'end' }}>
                <label className="form-field" style={{ margin: 0 }}>
                  <span>当前样本</span>
                  <select value={sampleIndex} onChange={(event) => setSampleIndex(Number(event.target.value))}>
                    {sampleItems.map((item, index) => (
                      <option key={item.id} value={index}>
                        {`第 ${item.sequence || index + 1} 条 (ID: ${item.id})`}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="field-helper-text" style={{ alignSelf: 'center', marginBottom: '6px' }}>
                  共 {sampleItems.length} 条样本，当前显示第 {sampleIndex + 1} 条
                </div>
                <button className="button-sm" type="button" disabled={sampleIndex === 0} onClick={() => setSampleIndex((current) => Math.max(current - 1, 0))}>
                  上一个
                </button>
                <button className="button-sm" type="button" disabled={sampleIndex >= sampleItems.length - 1} onClick={() => setSampleIndex((current) => Math.min(current + 1, sampleItems.length - 1))}>
                  下一个
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {currentSampleFieldEntries.slice(0, 8).map(([key]) => (
                    <span
                      key={key}
                      style={{
                        border: '1px solid #ddd6fe',
                        backgroundColor: '#f5f3ff',
                        color: '#5645d4',
                        borderRadius: '999px',
                        padding: '4px 10px',
                        fontSize: '11px',
                        fontWeight: 600,
                      }}
                    >
                      {key}
                    </span>
                  ))}
                  {currentSampleFieldEntries.length > 8 ? (
                    <span className="field-helper-text">{`还有 ${currentSampleFieldEntries.length - 8} 个字段`}</span>
                  ) : null}
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', backgroundColor: '#f6f5f4', border: '1px solid #ede9e4', borderRadius: '8px', padding: '3px' }}>
                  <button
                    type="button"
                    className="button-sm"
                    onClick={() => setSamplePreviewMode('fields')}
                    style={{
                      border: 'none',
                      background: samplePreviewMode === 'fields' ? '#fff' : 'transparent',
                      boxShadow: samplePreviewMode === 'fields' ? '0 1px 2px rgba(15, 23, 42, 0.08)' : 'none',
                      color: samplePreviewMode === 'fields' ? '#1a1a1a' : '#787671',
                    }}
                  >
                    字段视图
                  </button>
                  <button
                    type="button"
                    className="button-sm"
                    onClick={() => setSamplePreviewMode('json')}
                    style={{
                      border: 'none',
                      background: samplePreviewMode === 'json' ? '#fff' : 'transparent',
                      boxShadow: samplePreviewMode === 'json' ? '0 1px 2px rgba(15, 23, 42, 0.08)' : 'none',
                      color: samplePreviewMode === 'json' ? '#1a1a1a' : '#787671',
                    }}
                  >
                    JSON
                  </button>
                </div>
              </div>

              <div style={{ border: '1px solid #ede9e4', borderRadius: '8px', backgroundColor: '#fafaf9', overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', borderBottom: '1px solid #ede9e4', fontSize: '12px', color: '#787671', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>source</span>
                  <span className="field-helper-text" style={{ margin: 0 }}>
                    {samplePreviewMode === 'fields' ? '按字段浏览当前样本' : '查看原始 JSON'}
                  </span>
                </div>
                {samplePreviewMode === 'fields' ? (
                  <div style={{ maxHeight: '420px', overflowY: 'auto', backgroundColor: '#fff' }}>
                    {currentSampleFieldEntries.length > 0 ? currentSampleFieldEntries.map(([key, value]) => (
                      <div key={key} style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '16px', padding: '14px 16px', borderBottom: '1px solid #f3f4f6', alignItems: 'start' }}>
                        <strong style={{ fontSize: '12px', color: '#111827', wordBreak: 'break-word' }}>{key}</strong>
                        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#4b5563', fontFamily: 'monospace', fontSize: '12px', lineHeight: 1.6 }}>
                          {formatSampleSourceValue(value)}
                        </div>
                      </div>
                    )) : (
                      <div style={{ padding: '20px 16px' }} className="field-helper-text">当前样本没有 source 字段</div>
                    )}
                  </div>
                ) : (
                  <pre
                    style={{
                      margin: 0,
                      padding: '16px',
                      overflowX: 'auto',
                      maxHeight: '420px',
                      fontSize: '12px',
                      lineHeight: 1.6,
                      color: '#1f2937',
                      backgroundColor: '#fff',
                    }}
                  >
                    {formatSampleSource(currentSampleSource)}
                  </pre>
                )}
              </div>
            </div>
          </div>
        ) : null}

        <DndContext
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragCancel={() => {
            setActiveDragMaterial(null)
            setActiveDragPane(null)
            setDragOverId(null)
          }}
          onDragEnd={handleDragEnd}
          sensors={sensors}
        >
          <div className={`designer-three-column ${!rightCollapsed ? 'with-right-panel' : ''}`}>
            <article className="card template-panel designer-sidebar-left">
              <div className="designer-section-header" style={{ marginBottom: '10px' }}>
                <h3>组件物料</h3>
                <p className="field-helper-text">拖拽或点击组件到中间画布</p>
              </div>
              <div style={{ display: 'grid', gap: '18px' }}>
                {visibleMaterialCategories.map((category) => (
                  <div key={category.label}>
                    <h4 style={{
                      fontSize: '11px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: '#a4a097',
                      marginBottom: '8px'
                    }}>
                      {category.label}
                    </h4>
                    <div style={{ display: 'grid', gap: '6px' }}>
                      {category.items.map((item) => (
                          <DraggableMaterialButton
                            key={item.type}
                            icon={item.icon}
                            name={item.name}
                            type={item.type}
                            onAdd={handleAddComponent}
                          />
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="card template-panel designer-canvas-shell" onClick={(e) => {
              if (e.target === e.currentTarget) setSelectedPath(null)
            }} style={{ cursor: 'default' }}>
              <PaneDropZone
                pane="source"
                title="原始数据展示区"
                helper="展示真实样本字段与说明内容。"
                items={sourceComponents}
                selectedPath={selectedPath}
                isActive={activeEditZone === 'source'}
                onSelect={(componentId) => setSelectedPath({ type: 'root', componentId })}
                onDelete={handleDelete}
                onMove={handleMove}
                onActivate={() => setActiveEditZone('source')}
                source={currentSampleSource}
                values={previewAnswerExample}
                showDropPlaceholder={Boolean(activeDragMaterial) && activeDragPane === 'source'}
                showTopDropHint={dragOverId === 'pane:source'}
                dropIndicatorId={dragOverId?.startsWith('pane:') ? null : dragOverId}
                dropPlaceholderLabel={activeDragMaterial ? `将在顶部添加：${activeDragMaterial.name}` : undefined}
              />

              <div style={{ borderTop: '1px solid #ede9e4', margin: '0 24px' }} onClick={(e) => e.stopPropagation()}></div>

              <PaneDropZone
                pane="answer"
                title="作答区"
                helper="搭建标注员填写区域。"
                items={answerComponents}
                selectedPath={selectedPath}
                isActive={activeEditZone === 'answer'}
                onSelect={(componentId) => setSelectedPath({ type: 'root', componentId })}
                onDelete={handleDelete}
                onMove={handleMove}
                onActivate={() => setActiveEditZone('answer')}
                source={currentSampleSource}
                values={previewAnswerExample}
                showDropPlaceholder={Boolean(activeDragMaterial) && activeDragPane === 'answer'}
                showTopDropHint={dragOverId === 'pane:answer'}
                dropIndicatorId={dragOverId?.startsWith('pane:') ? null : dragOverId}
                dropPlaceholderLabel={activeDragMaterial ? `将在顶部添加：${activeDragMaterial.name}` : undefined}
              />
            </article>

            {/* 右侧属性面板 — 可收缩悬浮式 */}
            {rightCollapsed ? (
              <button
                type="button"
                className="designer-floating-toggle"
                aria-label="展开属性设置"
                onClick={() => setRightCollapsed(false)}
              >
                属性 ◀
              </button>
            ) : (
              <article className="card template-panel designer-sidebar-right designer-floating-panel">
                <div className="designer-section-header" style={{ marginBottom: '20px' }}>
                  <div>
                    <h3>{selectedComponent ? '属性设置' : '模板设置'}</h3>
                    <p className="field-helper-text">
                      {selectedComponent ? `${getComponentName(selectedComponent.type)} 属性` : '配置模板基础信息与数据源'}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="designer-collapse-toggle"
                    aria-label="折叠属性设置"
                    onClick={() => setRightCollapsed(true)}
                  >
                    ▶
                  </button>
                </div>

                {selectedComponent ? (
                  <div style={{ display: 'grid', gap: '24px' }}>
                    {/* 基础配置 Section */}
                    <div className="designer-container-section" style={{ backgroundColor: '#fff', padding: '16px' }}>
                      <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px', color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ color: '#5645d4' }}>●</span> 基础配置
                      </h4>
                      <div className="form-grid">
                        <label className="form-field">
                          <span>标题 (Label)</span>
                          <input
                            value={selectedComponent.label}
                            onChange={(event) => updateSelectedComponent({ label: event.target.value })}
                          />
                        </label>

                        {selectedComponent.type !== 'show_item' && selectedComponent.type !== 'group' && selectedComponent.type !== 'tab_container' && !selectedComponent.type.startsWith('field_') ? (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'flex-end' }}>
                            <label className="form-field">
                              <span>字段名 (Field Key)</span>
                              <input
                                value={selectedComponent.field}
                                onChange={(event) => updateSelectedComponent({ field: event.target.value })}
                              />
                            </label>
                            <label className="checkbox-field" style={{ marginBottom: '12px' }}>
                              <input
                                checked={selectedComponent.required}
                                type="checkbox"
                                onChange={(event) => updateSelectedComponent({ required: event.target.checked })}
                              />
                              <span>必填</span>
                            </label>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {/* 组件特性 Section */}
                    <div className="designer-container-section" style={{ backgroundColor: '#fff', padding: '16px' }}>
                      <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px', color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ color: 'var(--color-warning)' }}>●</span> 组件特性
                      </h4>
                      <div className="form-grid">
                        {/* source 区组件：源数据字段绑定 */}
                        {(selectedComponent.pane === 'source' && isSourceFieldComponent(selectedComponent)) ? (
                          <label className="form-field">
                            <span>绑定源字段</span>
                            <select
                              aria-label="绑定源字段"
                              value={selectedComponent.sourceField ?? ''}
                              onChange={(event) => updateSelectedComponent({ sourceField: event.target.value })}
                            >
                              <option value="">请选择字段</option>
                              {currentSampleSource ? Object.keys(currentSampleSource).map((key) => (
                                <option key={key} value={key}>{key}</option>
                              )) : null}
                            </select>
                            <p className="field-helper-text">选择要展示的样本数据字段</p>
                          </label>
                        ) : null}

                        {optionTypes.includes(selectedComponent.type) ? (
                          <label className="form-field">
                            <span>选项配置 (逗号分隔)</span>
                            <textarea
                              style={{ minHeight: '80px' }}
                              value={selectedComponent.optionsText ?? selectedComponent.options?.join(',') ?? ''}
                              onChange={(event) => handleOptionsChange(event.target.value)}
                            />
                          </label>
                        ) : null}

                        {selectedComponent.type === 'compare_panel' ? (
                          <div className="form-grid">
                            <label className="form-field">
                              <span>题面字段 (Prompt)</span>
                              <input value={selectedComponent.promptField ?? ''} onChange={(event) => updateSelectedComponent({ promptField: event.target.value })} />
                            </label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                              <label className="form-field">
                                <span>左侧字段</span>
                                <input value={selectedComponent.leftField ?? ''} onChange={(event) => updateSelectedComponent({ leftField: event.target.value })} />
                              </label>
                              <label className="form-field">
                                <span>右侧字段</span>
                                <input value={selectedComponent.rightField ?? ''} onChange={(event) => updateSelectedComponent({ rightField: event.target.value })} />
                              </label>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                              <label className="form-field">
                                <span>左侧标题</span>
                                <input value={selectedComponent.leftLabel ?? ''} onChange={(event) => updateSelectedComponent({ leftLabel: event.target.value })} />
                              </label>
                              <label className="form-field">
                                <span>右侧标题</span>
                                <input value={selectedComponent.rightLabel ?? ''} onChange={(event) => updateSelectedComponent({ rightLabel: event.target.value })} />
                              </label>
                            </div>
                            <label className="form-field">
                              <span>元信息字段 (Metadata)</span>
                              <input
                                placeholder="model_a, model_b"
                                value={(selectedComponent.metadataFields ?? []).join(',')}
                                onChange={(event) => updateSelectedComponent({ metadataFields: event.target.value.split(/[,，]/).map((item) => item.trim()).filter(Boolean) })}
                              />
                            </label>
                          </div>
                        ) : null}

                        {(selectedComponent.type === 'show_item' || selectedComponent.type === 'rich_text' || selectedComponent.type === 'json_editor' || selectedComponent.type === 'llm_assist' || isSourceFieldComponent(selectedComponent)) ? (
                          <label className="form-field">
                            <span>{selectedComponent.type === 'show_item' ? '展示内容' : selectedComponent.type === 'llm_assist' ? '辅助提示文案' : selectedComponent.type.startsWith('field_') ? '默认/占位内容' : '组件默认内容'}</span>
                            <textarea
                              style={{ minHeight: '100px' }}
                              value={selectedComponent.content ?? ''}
                              onChange={(event) => updateSelectedComponent({ content: event.target.value })}
                            />
                          </label>
                        ) : null}

                        {selectedComponent.type === 'llm_assist' ? (
                          <label className="form-field">
                            <span>大模型系统指令 (System Prompt)</span>
                            <p className="field-helper-text">描述希望 AI 生成内容的逻辑、约束及格式要求。</p>
                            <textarea
                              style={{ minHeight: '120px' }}
                              value={selectedComponent.llmInstruction ?? ''}
                              onChange={(event) => updateSelectedComponent({ llmInstruction: event.target.value })}
                            />
                          </label>
                        ) : null}

                        {selectedComponent.type === 'image_upload' ? (
                          <label className="form-field">
                            <span>最大图片数量</span>
                            <input
                              min="1"
                              type="number"
                              value={selectedComponent.maxCount ?? 1}
                              onChange={(event) => handleMaxCountChange(event.target.value)}
                            />
                          </label>
                        ) : null}
                      </div>
                    </div>

                    {/* 布局容器内容 Section (仅针对 Group/Tab/Compare) */}
                    {(selectedComponent.type === 'group' || selectedComponent.type === 'tab_container' || selectedComponent.type === 'compare_panel') && (
                      <div className="designer-container-section" style={{ backgroundColor: '#fff', padding: '16px' }}>
                        <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px', color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: '#1aae39' }}>●</span> 容器子项管理
                        </h4>

                        {selectedComponent.type === 'group' ? (
                          <div className="form-grid">
                            <div className="designer-section-header">
                              <span className="field-helper-text">分组内包含 {selectedComponent.children?.length ?? 0} 个子组件</span>
                              <div className="button-row" style={{ marginTop: '8px' }}>
                                <button className="button-sm" type="button" onClick={() => addGroupChild(selectedComponent.id, 'text_input')}>+ 文本</button>
                                <button className="button-sm" type="button" onClick={() => addGroupChild(selectedComponent.id, 'single_select')}>+ 单选</button>
                              </div>
                            </div>
                            <div className="designer-nested-list">
                              {(selectedComponent.children ?? []).map((child, index, children) => (
                                <div key={child.id} className="designer-nested-item" style={{ padding: '8px 12px' }}>
                                  <div style={{ flex: 1 }}>
                                    <strong style={{ fontSize: '13px' }}>{getChildComponentLabel(child, index)}</strong>
                                    <p style={{ fontSize: '11px', color: '#a4a097' }}>{getComponentName(child.type)}</p>
                                  </div>
                                  <div className="button-row" style={{ gap: '4px' }}>
                                    <button
                                      type="button"
                                      className="button-sm"
                                      style={{ padding: '2px 6px' }}
                                      onClick={() => setSelectedPath({ type: 'group-child', parentId: selectedComponent.id, componentId: child.id })}
                                    >
                                      📝
                                    </button>
                                    <button type="button" className="button-sm" style={{ padding: '2px 6px' }} disabled={index === 0} onClick={() => moveGroupChild(selectedComponent.id, child.id, 'up')}>↑</button>
                                    <button type="button" className="button-sm" style={{ padding: '2px 6px' }} disabled={index === children.length - 1} onClick={() => moveGroupChild(selectedComponent.id, child.id, 'down')}>↓</button>
                                    <button type="button" className="button-sm" style={{ padding: '2px 6px', color: '#e03131' }} onClick={() => removeGroupChild(selectedComponent.id, child.id)}>×</button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : selectedComponent.type === 'tab_container' ? (
                          <div className="form-grid">
                            <div className="designer-section-header">
                              <span className="field-helper-text">共 {selectedComponent.tabs?.length ?? 0} 个分页</span>
                              <button className="button-sm button-primary" type="button" aria-label="新增分页" onClick={() => addTab(selectedComponent.id)}>+ 新增分页</button>
                            </div>
                            {(selectedComponent.tabs ?? []).map((tab, tabIndex, tabs) => (
                              <div key={tab.key} className="designer-tab-card" style={{ padding: '12px', border: '1px solid #ede9e4', backgroundColor: '#fafaf9' }}>
                                <div className="designer-tab-card-header" style={{ marginBottom: '10px' }}>
                                  <input
                                    style={{ flex: 1, padding: '4px 8px', fontSize: '13px' }}
                                    value={tab.label}
                                    onChange={(event) => updateTabLabel(selectedComponent.id, tab.key, event.target.value)}
                                  />
                                  <div className="button-row" style={{ gap: '4px' }}>
                                    <button type="button" className="button-sm" style={{ padding: '2px 6px' }} disabled={tabIndex === 0} onClick={() => moveTab(selectedComponent.id, tab.key, 'left')}>←</button>
                                    <button type="button" className="button-sm" style={{ padding: '2px 6px' }} disabled={tabIndex === tabs.length - 1} onClick={() => moveTab(selectedComponent.id, tab.key, 'right')}>→</button>
                                    <button type="button" className="button-sm" aria-label="删除分页" style={{ padding: '2px 6px', color: '#e03131' }} onClick={() => removeTab(selectedComponent.id, tab.key)}>×</button>
                                  </div>
                                </div>
                                <div className="button-row" style={{ marginBottom: '10px' }}>
                                  <button className="button-sm" type="button" onClick={() => addTabChild(selectedComponent.id, tab.key, 'text_input')}>+ 文本</button>
                                  <button className="button-sm" type="button" onClick={() => addTabChild(selectedComponent.id, tab.key, 'single_select')}>+ 单选</button>
                                </div>
                                <div className="designer-nested-list">
                                  {tab.children.map((child, childIndex, children) => (
                                    <div key={child.id} className="designer-nested-item" style={{ padding: '6px 10px', background: '#fff' }}>
                                      <div style={{ flex: 1 }}>
                                        <strong style={{ fontSize: '12px' }}>{getChildComponentLabel(child, childIndex)}</strong>
                                      </div>
                                      <div className="button-row" style={{ gap: '2px' }}>
                                        <button type="button" className="button-sm" style={{ padding: '2px 4px' }} onClick={() => setSelectedPath({ type: 'tab-child', parentId: selectedComponent.id, tabKey: tab.key, componentId: child.id })}>📝</button>
                                        <button type="button" className="button-sm" style={{ padding: '2px 4px' }} disabled={childIndex === 0} onClick={() => moveTabChild(selectedComponent.id, tab.key, child.id, 'up')}>↑</button>
                                        <button type="button" className="button-sm" style={{ padding: '2px 4px' }} disabled={childIndex === children.length - 1} onClick={() => moveTabChild(selectedComponent.id, tab.key, child.id, 'down')}>↓</button>
                                        <button type="button" className="button-sm" aria-label="删除分页子组件" style={{ padding: '2px 4px', color: '#e03131' }} onClick={() => removeTabChild(selectedComponent.id, tab.key, child.id)}>×</button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ display: 'grid', gap: '20px' }}>
                            {/* Left Slot Management */}
                            <div style={{ padding: '12px', border: '1px solid #ede9e4', borderRadius: '8px', backgroundColor: '#f6f5f4' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <strong style={{ fontSize: '13px', color: '#1a1a1a' }}>左侧插槽 (Left Slot)</strong>
                                <div className="button-row">
                                  <button className="button-sm" type="button" onClick={() => addCompareChild(selectedComponent.id, 'left', 'field_display')}>+ 文本</button>
                                  <button className="button-sm" type="button" onClick={() => addCompareChild(selectedComponent.id, 'left', 'field_image')}>+ 图片</button>
                                </div>
                              </div>
                              <div className="designer-nested-list">
                                {(selectedComponent.children_left ?? []).map((child, index, children) => (
                                  <div key={child.id} className="designer-nested-item" style={{ padding: '6px 10px', background: '#fff' }}>
                                    <div style={{ flex: 1 }}>
                                      <strong style={{ fontSize: '12px' }}>{getChildComponentLabel(child, index)}</strong>
                                    </div>
                                    <div className="button-row" style={{ gap: '2px' }}>
                                      <button type="button" className="button-sm" style={{ padding: '2px 4px' }} onClick={() => setSelectedPath({ type: 'compare-child-left', parentId: selectedComponent.id, componentId: child.id })}>📝</button>
                                      <button type="button" className="button-sm" style={{ padding: '2px 4px' }} disabled={index === 0} onClick={() => moveCompareChild(selectedComponent.id, 'left', child.id, 'up')}>↑</button>
                                      <button type="button" className="button-sm" style={{ padding: '2px 4px' }} disabled={index === children.length - 1} onClick={() => moveCompareChild(selectedComponent.id, 'left', child.id, 'down')}>↓</button>
                                      <button type="button" className="button-sm" style={{ padding: '2px 4px', color: '#e03131' }} onClick={() => removeCompareChild(selectedComponent.id, 'left', child.id)}>×</button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Right Slot Management */}
                            <div style={{ padding: '12px', border: '1px solid #ede9e4', borderRadius: '8px', backgroundColor: '#f6f5f4' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <strong style={{ fontSize: '13px', color: '#1a1a1a' }}>右侧插槽 (Right Slot)</strong>
                                <div className="button-row">
                                  <button className="button-sm" type="button" onClick={() => addCompareChild(selectedComponent.id, 'right', 'field_display')}>+ 文本</button>
                                  <button className="button-sm" type="button" onClick={() => addCompareChild(selectedComponent.id, 'right', 'field_image')}>+ 图片</button>
                                </div>
                              </div>
                              <div className="designer-nested-list">
                                {(selectedComponent.children_right ?? []).map((child, index, children) => (
                                  <div key={child.id} className="designer-nested-item" style={{ padding: '6px 10px', background: '#fff' }}>
                                    <div style={{ flex: 1 }}>
                                      <strong style={{ fontSize: '12px' }}>{getChildComponentLabel(child, index)}</strong>
                                    </div>
                                    <div className="button-row" style={{ gap: '2px' }}>
                                      <button type="button" className="button-sm" style={{ padding: '2px 4px' }} onClick={() => setSelectedPath({ type: 'compare-child-right', parentId: selectedComponent.id, componentId: child.id })}>📝</button>
                                      <button type="button" className="button-sm" style={{ padding: '2px 4px' }} disabled={index === 0} onClick={() => moveCompareChild(selectedComponent.id, 'right', child.id, 'up')}>↑</button>
                                      <button type="button" className="button-sm" style={{ padding: '2px 4px' }} disabled={index === children.length - 1} onClick={() => moveCompareChild(selectedComponent.id, 'right', child.id, 'down')}>↓</button>
                                      <button type="button" className="button-sm" style={{ padding: '2px 4px', color: '#e03131' }} onClick={() => removeCompareChild(selectedComponent.id, 'right', child.id)}>×</button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 显示与校验 Section */}
                    {selectedComponent.type !== 'show_item' && selectedComponent.type !== 'group' && selectedComponent.type !== 'tab_container' && !selectedComponent.type.startsWith('field_') ? (
                      <div className="designer-container-section" style={{ backgroundColor: '#fff', padding: '16px' }}>
                        <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px', color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: '#5645d4' }}>●</span> 显示与校验
                        </h4>
                        {renderRuleEditor(selectedComponent)}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: '24px' }}>
                    <div className="designer-container-section" style={{ backgroundColor: '#fff', padding: '16px' }}>
                      <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px', color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: '#5645d4' }}>⚙</span> 模板全局设置
                      </h4>
                      <div className="form-grid">
                        <label className="form-field">
                          <span>模板名称</span>
                          <input
                            value={templateName}
                            onChange={(event) => setTemplateName(event.target.value)}
                          />
                        </label>
                        <label className="form-field">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <span>绑定数据集</span>
                            <Link to="/owner/datasets" style={{ fontSize: '11px', color: '#5645d4', textDecoration: 'none' }}>管理数据集 →</Link>
                          </div>
                          <select
                            value={designDatasetId ?? ''}
                            onChange={(e) => setDesignDatasetId(parseDatasetSelectValue(e.target.value))}
                          >
                            <option value="">请选择数据集</option>
                            {datasetList.map(ds => (
                              <option key={ds.id} value={ds.id}>{ds.name}</option>
                            ))}
                          </select>
                          <p className="field-helper-text">更改数据集将刷新预览样本数据</p>
                        </label>
                        <label className="form-field">
                          <span>模板描述</span>
                          <textarea
                            style={{ minHeight: '80px' }}
                            value={templateDescription}
                            onChange={(event) => setTemplateDescription(event.target.value)}
                          />
                        </label>

                        <div style={{ marginTop: '12px' }}>
                          <button
                            className="button button-primary"
                            style={{ width: '100%', padding: '10px' }}
                            disabled={saving}
                            onClick={() => void handleUpdateBasicInfo()}
                          >
                            {saving ? '正在保存...' : '应用并保存设置'}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div style={{ padding: '0 16px', fontSize: '12px', color: '#a4a097' }}>
                      <p>💡 提示：点击画布中的具体组件可进入组件级属性配置。点击左侧物料可添加新组件。</p>
                    </div>
                  </div>
                )}
              </article>
            )}
          </div>
          <DragOverlay>
            {activeDragMaterial ? (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid #ddd6fe',
                  backgroundColor: '#fff',
                  boxShadow: '0 18px 40px rgba(15, 23, 42, 0.16)',
                  color: '#1a1a1a',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                <span style={{ fontSize: '14px', lineHeight: 1 }}>{activeDragMaterial.icon}</span>
                <span>{activeDragMaterial.name}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>
    </section>
  )
}
