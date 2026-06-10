import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Renderer } from '../../../features/renderer/Renderer'
import { MediaValue } from '../../../features/renderer/MediaValue'
import { getActiveComponents, validateAnswers as validateRendererAnswers } from '../../../features/renderer/rules'
import { apiGet, apiPost, ApiError } from '../../../services/api/client'
import type { JsonRecord, LabelerWorkItem, ReviewAnswerValue, ReviewDiffItem, TemplateComponent, TemplateSchema, WorkbenchItemStatus } from '../../../types/domain'
import { parseAppDate } from '../../../utils/time'
import { extractTemplateSchemaComponents, inferTemplateComponentPane, projectTemplateSchemaToPane, splitTemplateSchemaByPane } from '../../../utils/templateSchema'

type AnswerValue = ReviewAnswerValue
type AnswerState = Record<string, AnswerValue>
type ItemAnswers = Record<number, AnswerState>

function normalizeWorkItemSchema(raw: unknown): TemplateSchema {
  if (!raw) {
    return []
  }
  // Legacy style { components: [...] }
  if (typeof raw === 'object' && !Array.isArray(raw) && 'components' in (raw as Record<string, unknown>) && Array.isArray((raw as Record<string, unknown>).components)) {
    return (raw as Record<string, unknown>).components as TemplateComponent[]
  }
  // Already TemplateComponent[] or TemplateSchemaV3
  return raw as TemplateSchema
}

type ItemSubmissionIds = Record<number, number | undefined>

type WorkbenchResponse = {
  assignmentId: number
  task: {
    id: number
    title: string
  }
  template: {
    templateId: number | null
    templateVersionId: number | null
    schema: TemplateSchema
  }
  progress?: {
    total: number
    completed: number
  }
  items: Array<{
    itemId: number
    index: number
    source: JsonRecord
    draftSubmission: {
      submissionId: number
      status: string
      statusLabel?: WorkbenchItemStatus
      savedAt?: string
      answers: Record<string, ReviewAnswerValue>
      previousAnswers?: Record<string, ReviewAnswerValue> | null
      diffItems?: ReviewDiffItem[]
      currentVersionNo?: number
      latestRejectReason?: string | null
    } | null
  }>
}

function formatSourceValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return value.map(formatSourceValue).filter(Boolean).join(', ')
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => `${key}: ${formatSourceValue(entry)}`)
      .filter(Boolean)
      .join('；')
  }
  return String(value)
}

function formatAnswerValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '空'
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(', ') : '空'
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (typeof value === 'object') {
    const summary = Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => `${key}: ${formatAnswerValue(entry)}`)
      .filter(Boolean)
      .join('；')
    return summary || '已填写结构化内容'
  }
  return String(value)
}

function SourceFieldList({
  source,
  emptyClassName = '',
}: {
  source?: JsonRecord
  emptyClassName?: string
}) {
  const entries = Object.entries(source ?? {})

  return (
    <div className="selection-list">
      {entries.length > 0 ? entries.map(([key, value]) => (
        <div key={key} className="selection-item dataset-preview-kv workbench-source-field-row">
          <strong>{key}</strong>
          <div>
            <MediaValue fieldName={key} source={source} value={value} />
          </div>
        </div>
      )) : (
        <div className={`field-helper-text ${emptyClassName}`.trim()}>当前样本没有 source 字段</div>
      )}
    </div>
  )
}

function buildAnswerDiffItems(previousAnswers: Record<string, ReviewAnswerValue>, currentAnswers: AnswerState): ReviewDiffItem[] {
  const keys = Array.from(new Set([...Object.keys(previousAnswers), ...Object.keys(currentAnswers)]))
    .filter((key) => !key.startsWith('_loading_'))
    .sort()
  return keys.map((key) => {
    const previousValue = previousAnswers[key]
    const currentValue = currentAnswers[key]
    let changeType: ReviewDiffItem['changeType'] = 'changed'
    if (previousValue === undefined && currentValue !== undefined) {
      changeType = 'added'
    } else if (previousValue !== undefined && currentValue === undefined) {
      changeType = 'removed'
    } else if (JSON.stringify(previousValue) === JSON.stringify(currentValue)) {
      changeType = 'unchanged'
    }
    return {
      field: key,
      previousValue,
      currentValue,
      changeType,
    }
  })
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  if (target.isContentEditable) {
    return true
  }
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}

function normalizeLLMAssistPrompt(prompt: string, source: JsonRecord) {
  const sourceText = Object.entries(source)
    .filter(([key]) => !key.startsWith('_'))
    .map(([key, value]) => `${key}: ${formatSourceValue(value)}`)
    .join('\n')

  const basePrompt = prompt.trim() || '请先根据题面和素材独立判断，再给出建议标注员应如何填写或修改；不要默认当前答案正确，也不要直接顺着现有答案给出满分结论。'
  const constraintText = '请优先依据题面和素材独立判断；当前答案仅供参考，可能有误。如发现现有答案不准确、不完整或理由不足，请直接指出并给出建议修改方向。'
  
  if (sourceText) {
    return `题面内容：\n${sourceText}\n\n指令：\n${basePrompt}\n\n补充约束：\n${constraintText}`
  }
  
  return `${basePrompt}\n\n补充约束：\n${constraintText}`
}

function getLLMAssistFields(schema: TemplateSchema): string[] {
  const fields: string[] = []
  
  function traverse(components: TemplateComponent[]) {
    components.forEach((component) => {
      if (component.type === 'llm_assist' && component.field) {
        fields.push(component.field)
      }
      if (component.children) {
        traverse(component.children)
      }
      if (component.tabs) {
        component.tabs.forEach((tab) => traverse(tab.children))
      }
      if (component.children_left) {
        traverse(component.children_left)
      }
      if (component.children_right) {
        traverse(component.children_right)
      }
    })
  }
  
  traverse(extractTemplateSchemaComponents(schema))
  return fields
}

function getPersistedAnswerFields(schema: TemplateSchema): string[] {
  const fields = new Set<string>()

  function traverse(components: TemplateComponent[]) {
    components.forEach((component) => {
      if (component.type === 'group') {
        traverse(component.children ?? [])
        return
      }
      if (component.type === 'tab_container') {
        component.tabs?.forEach((tab) => traverse(tab.children))
        return
      }
      if (component.type === 'compare_panel') {
        traverse(component.children_left ?? [])
        traverse(component.children_right ?? [])
      }

      if (component.field && inferTemplateComponentPane(component) === 'answer') {
        fields.add(component.field)
      }
    })
  }

  traverse(extractTemplateSchemaComponents(schema))
  return [...fields]
}

function cleanAnswers(answers: AnswerState, schema?: TemplateSchema, options: { excludeLLMAssist?: boolean } = {}): AnswerState {
  const next = { ...answers }
  const llmFields = schema && options.excludeLLMAssist ? getLLMAssistFields(schema) : []
  const allowedFields = schema ? new Set(getPersistedAnswerFields(schema)) : null
  
  Object.keys(next).forEach((key) => {
    if (key.startsWith('_loading_')) {
      delete next[key]
    }
    if (llmFields.includes(key)) {
      delete next[key]
    }
    if (allowedFields && !allowedFields.has(key)) {
      delete next[key]
    }
  })
  return next
}

type DraftResponse = {
  submissionId: number
  status: string
  savedAt: string
}

type SubmitResponse = {
  submissionId: number
  status: string
  submittedAt: string
  aiJobStatus?: 'queued' | 'running' | 'succeeded' | 'failed' | 'fallback_human_review'
  aiDecision?: 'pass' | 'reject' | 'human_review'
}

type LLMAssistResponse = {
  suggestion: string
  provider: string
  model: string
}

type BulkSubmitResult = {
  submittedCount: number
  invalidItems: string[]
  failedItems: string[]
}

const AUTO_SAVE_DELAY = 1200
const SUBMIT_ALL_CONCURRENCY = 4
const WORKBENCH_STATUSES: WorkbenchItemStatus[] = ['not_started', 'draft', 'submitted', 'ai_reviewing', 'manual_reviewing', 'needs_revision', 'review_passed']

function buildSourceText(source: JsonRecord) {
  const values = Object.values(source).map(formatSourceValue).filter(Boolean)
  return values.length > 0 ? values.join('\n') : '当前任务暂无原文内容。'
}

function formatDateTime(value: string | undefined) {
  if (!value) {
    return '暂无记录'
  }

  const date = parseAppDate(value)
  if (!date) {
    return value
  }

  return date.toLocaleString('zh-CN', { hour12: false })
}

function hasAnswerContent(answers: AnswerState | undefined) {
  return Object.entries(answers ?? {}).some(([field, value]) => (
    !field.startsWith('_loading_')
    && (Array.isArray(value) ? value.length > 0 : String(value ?? '').trim())
  ))
}

function getDisplayStatus(currentItem: LabelerWorkItem | undefined, itemValue: AnswerState | undefined, itemErrors: string[]) {
  const status = currentItem?.draftStatus
  if (status === 'submitted') {
    return '待 AI 处理'
  }
  if (status === 'ai_reviewing') {
    return 'AI 审核中'
  }
  if (status === 'manual_reviewing') {
    return '人工复审中'
  }
  if (status === 'needs_revision') {
    return '待修改'
  }
  if (status === 'review_passed') {
    return '已通过'
  }
  if (status === 'draft' || status === 'not_started' || !status) {
    if (hasAnswerContent(itemValue)) {
      return itemErrors.length === 0 ? '待提交' : '草稿'
    }
    return status === 'draft' ? '草稿' : '未开始'
  }
  return '未开始'
}

function getStatusText(currentItem: LabelerWorkItem | undefined, itemValue?: AnswerState, itemErrors: string[] = []) {
  return getDisplayStatus(currentItem, itemValue, itemErrors)
}

function getStatusClassName(currentItem: LabelerWorkItem | undefined, itemValue?: AnswerState, itemErrors: string[] = []) {
  const displayStatus = getDisplayStatus(currentItem, itemValue, itemErrors)
  if (displayStatus === '待提交') {
    return 'status-workbench-ready'
  }
  const status = currentItem?.draftStatus
  if (status === 'draft') {
    return 'status-workbench-draft'
  }
  if (status === 'submitted') {
    return 'status-workbench-submitted'
  }
  if (status === 'ai_reviewing') {
    return 'status-workbench-ai_reviewing'
  }
  if (status === 'manual_reviewing') {
    return 'status-workbench-manual_reviewing'
  }
  if (status === 'needs_revision') {
    return 'status-workbench-needs_revision'
  }
  if (status === 'review_passed') {
    return 'status-workbench-review_passed'
  }
  return 'status-tag-neutral'
}

function getLocateActionClassName(type: 'incomplete' | 'revision', hasTarget: boolean) {
  if (!hasTarget) {
    return 'workbench-locate-button workbench-locate-button--neutral'
  }
  return `workbench-locate-button workbench-locate-button--${type}`
}

function getNextWorkbenchStatus(result: SubmitResponse): WorkbenchItemStatus {
  if (result.aiDecision === 'human_review' || result.aiJobStatus === 'fallback_human_review') {
    return 'manual_reviewing'
  }
  if (result.aiJobStatus === 'queued' || result.aiJobStatus === 'running') {
    return 'ai_reviewing'
  }
  if (result.status === 'review_passed') {
    return 'review_passed'
  }
  if (result.status === 'needs_revision') {
    return 'needs_revision'
  }
  if (result.status === 'ai_passed') {
    return 'manual_reviewing'
  }
  return 'submitted'
}

type DraftSubmissionPayload = NonNullable<WorkbenchResponse['items'][number]['draftSubmission']>

function mapDraftStatus(status: string | undefined, statusLabel: DraftSubmissionPayload['statusLabel']): WorkbenchItemStatus {
  if (statusLabel) {
    return statusLabel
  }
  if (status === 'draft') {
    return 'draft'
  }
  if (status === 'submitted') {
    return 'submitted'
  }
  if (status === 'ai_passed') {
    return 'manual_reviewing'
  }
  if (status === 'needs_revision') {
    return 'needs_revision'
  }
  if (status === 'review_passed') {
    return 'review_passed'
  }
  return 'not_started'
}

function isEditableWorkbenchStatus(status: WorkbenchItemStatus | undefined) {
  return !status || ['not_started', 'draft', 'needs_revision'].includes(status)
}

export function LabelerWorkbenchPage({
  items: initialItems,
}: {
  items?: LabelerWorkItem[]
} = {}) {
  const [searchParams] = useSearchParams()
  const assignmentId = searchParams.get('assignmentId') ?? (initialItems ? '101' : null)
  const [items, setItems] = useState<LabelerWorkItem[]>([])
  const [taskTitle, setTaskTitle] = useState('作答任务')
  const [templateVersionId, setTemplateVersionId] = useState<number | null>(null)
  const [itemSubmissionIds, setItemSubmissionIds] = useState<ItemSubmissionIds>({})
  const [currentIndex, setCurrentIndex] = useState(0)
  const [itemAnswers, setItemAnswers] = useState<ItemAnswers>({})
  const [progress, setProgress] = useState({ total: 0, completed: 0 })
  const [errors, setErrors] = useState<string[]>([])
  const [feedback, setFeedback] = useState('')
  const [autosaveFeedback, setAutosaveFeedback] = useState('')
  const [autosaveError, setAutosaveError] = useState('')
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [savingDraft, setSavingDraft] = useState(false)
  const [autosaving, setAutosaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submittingAll, setSubmittingAll] = useState(false)
  const [dirtyItemIds, setDirtyItemIds] = useState<Record<number, boolean>>({})
  const [showSourcePreview, setShowSourcePreview] = useState(false)
  const [bulkSubmitResult, setBulkSubmitResult] = useState<BulkSubmitResult | null>(null)
  const autosaveTimerRef = useRef<number | null>(null)
  const autosaveGenerationRef = useRef(0)
  const submittingRef = useRef(false)

  useEffect(() => {
    if (initialItems) {
      setItems(initialItems)
      setTaskTitle(initialItems[0]?.taskTitle ?? '作答任务')
      setItemAnswers(Object.fromEntries(initialItems.map((item) => [item.id, item.draftAnswers ?? {}])))
      setItemSubmissionIds(Object.fromEntries(initialItems.map((item) => [item.id, item.draftSubmissionId])))
      setProgress({ total: initialItems.length, completed: 0 })
      setDirtyItemIds({})
      setCurrentIndex(0)
      setLoading(false)
      setPageError('')
      return
    }

    if (!assignmentId) {
      setLoading(false)
      setPageError('缺少 assignmentId，无法加载作答内容。')
      return
    }

    void loadWorkbench(Number(assignmentId))
  }, [assignmentId, initialItems])

  async function loadWorkbench(nextAssignmentId: number) {
    setLoading(true)
    setPageError('')

    try {
      const result = await apiGet<WorkbenchResponse>('/workbench/items', {
        assignmentId: nextAssignmentId,
      })
      const workItems = result.items.map((item) => ({
        id: item.itemId,
        taskTitle: result.task.title,
        sourceText: buildSourceText(item.source),
        source: item.source,
        schema: normalizeWorkItemSchema(result.template.schema),
        draftSubmissionId: item.draftSubmission?.submissionId,
        draftAnswers: item.draftSubmission?.answers,
        previousAnswers: item.draftSubmission?.previousAnswers ?? null,
        diffItems: item.draftSubmission?.diffItems ?? [],
        currentVersionNo: item.draftSubmission?.currentVersionNo,
        draftStatus: mapDraftStatus(item.draftSubmission?.status, item.draftSubmission?.statusLabel),
        draftSavedAt: item.draftSubmission?.savedAt,
        latestRejectReason: item.draftSubmission?.latestRejectReason,
      }))

      setTaskTitle(result.task.title)
      setTemplateVersionId(result.template.templateVersionId)
      setItems(workItems)
      setProgress(result.progress ?? { total: workItems.length, completed: 0 })
      setItemSubmissionIds(Object.fromEntries(workItems.map((item) => [item.id, item.draftSubmissionId])))
      setItemAnswers(
        Object.fromEntries(
          workItems.map((item) => [item.id, item.draftAnswers ?? {}]),
        ),
      )
      setDirtyItemIds({})
      setCurrentIndex(0)
    } catch {
      setPageError('作答内容加载失败，请确认已先领取任务。')
    } finally {
      setLoading(false)
    }
  }

  const currentItem = items[currentIndex]
  const revisionReason = currentItem?.draftStatus === 'needs_revision' ? currentItem.latestRejectReason ?? '' : ''
  const previousAnswers = currentItem?.previousAnswers ?? null
  const answers = useMemo(() => {
    if (!currentItem) {
      return {}
    }

    return itemAnswers[currentItem.id] ?? {}
  }, [currentItem, itemAnswers])
  const sourceSchema = currentItem ? projectTemplateSchemaToPane(currentItem.schema, 'source') : []
  const answerSchema = currentItem ? projectTemplateSchemaToPane(currentItem.schema, 'answer') : []
  const hasConfiguredSourceSchema = currentItem ? splitTemplateSchemaByPane(sourceSchema).sourceComponents.length > 0 : false
  const sourceFieldEntries = Object.entries(currentItem?.source ?? {})
  const dirtyCurrentItem = currentItem ? Boolean(dirtyItemIds[currentItem.id]) : false
  const touchedItemCount = items.filter((item) => hasAnswerContent(itemAnswers[item.id] ?? item.draftAnswers ?? {})).length
  const remainingItemCount = Math.max(progress.total - progress.completed, 0)
  const currentItemRequiredErrors = currentItem ? validateAnswersForItem(currentItem) : []
  const incompleteItemCount = items.filter((item) => validateAnswersForItem(item).length > 0).length
  const completedPercent = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0
  const activeAnswerComponents = currentItem ? getActiveComponents(answerSchema, answers) : []
  const activeRequiredCount = activeAnswerComponents.filter((component) => component.required).length
  const activeCompletedRequiredCount = activeRequiredCount - currentItemRequiredErrors.length
  const statusCounts = useMemo(() => (
    items.reduce<Record<WorkbenchItemStatus, number>>((accumulator, item) => {
      const status = item.draftStatus ?? 'not_started'
      accumulator[status] += 1
      return accumulator
    }, Object.fromEntries(WORKBENCH_STATUSES.map((status) => [status, 0])) as Record<WorkbenchItemStatus, number>)
  ), [items])
  const diffItems = useMemo(() => (
    previousAnswers ? buildAnswerDiffItems(previousAnswers, answers) : []
  ), [previousAnswers, answers])
  const changedDiffItems = useMemo(() => diffItems.filter((item) => item.changeType !== 'unchanged'), [diffItems])
  const showAnswerDiff = Boolean(
    currentItem && (
      currentItem.draftStatus === 'needs_revision'
      || previousAnswers
      || (currentItem.currentVersionNo ?? 0) > 0
    )
  )
  const nextRevisionIndex = items.findIndex((item) => item.draftStatus === 'needs_revision')
  const nextIncompleteIndex = items.findIndex((item) => validateAnswersForItem(item).length > 0)
  const hasRevisionItems = nextRevisionIndex >= 0
  const hasIncompleteItems = nextIncompleteIndex >= 0
  const actionBusy = savingDraft || autosaving || submitting || submittingAll

  function updateAnswer(field: string, value: AnswerValue) {
    if (!currentItem) {
      return
    }

    setErrors([])
    setFeedback('')
    setAutosaveError('')
    setItemAnswers((current) => ({
      ...current,
      [currentItem.id]: {
        ...current[currentItem.id],
        [field]: value,
      },
    }))
    setDirtyItemIds((current) => ({
      ...current,
      [currentItem.id]: true,
    }))
  }

  function toggleArrayAnswer(field: string, value: string) {
    const currentValue = answers[field]
    const values = Array.isArray(currentValue) ? currentValue : []
    updateAnswer(field, values.includes(value) ? values.filter((item) => item !== value) : [...values, value])
  }

  async function generateLLMAnswer(field: string, prompt: string) {
    if (!assignmentId || !currentItem) {
      return
    }

    const itemState = items.find((entry) => entry.id === currentItem.id)
    if (!isEditableWorkbenchStatus(itemState?.draftStatus)) {
      setFeedback('当前题目已提交，不能继续生成 AI 建议。')
      return
    }

    // Set per-field loading state
    updateAnswer(`_loading_${field}`, true)
    setFeedback('AI 正在生成建议...')

    try {
      const result = await apiPost<LLMAssistResponse, {
        assignmentId: number
        itemId: number
        field: string
        prompt: string
        currentAnswers: AnswerState
        source: JsonRecord
      }>('/workbench/llm-assist', {
        assignmentId: Number(assignmentId),
        itemId: currentItem.id,
        field,
        prompt: normalizeLLMAssistPrompt(prompt, currentItem.source ?? {}),
        currentAnswers: cleanAnswers(answers, currentItem.schema),
        source: currentItem.source ?? {},
      }, { timeout: 35000 })

      // Update both the content and clear the loading state
      setItemAnswers((current) => ({
        ...current,
        [currentItem.id]: {
          ...current[currentItem.id],
          [field]: result.suggestion,
          [`_loading_${field}`]: false,
        },
      }))
      setFeedback(`AI 建议已生成（${result.provider} / ${result.model}）`)
    } catch (error: unknown) {
      updateAnswer(`_loading_${field}`, false)
      const errorName = error instanceof Error ? error.name : ''
      const message = error instanceof Error ? error.message : ''
      if (errorName === 'AbortError' || message.includes('timeout')) {
        setFeedback('AI 生成超时，请检查网络或稍后重试。')
      } else {
        setFeedback(`AI 建议生成失败: ${message || '未知错误'}`)
      }
    } finally {
      // Explicitly ensure loading state is cleared just in case updateAnswer inside catch/try missed something
      setTimeout(() => {
        updateAnswer(`_loading_${field}`, false)
      }, 500)
    }
  }

  function clearPendingAutosave() {
    autosaveGenerationRef.current += 1
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
  }

  function reportDraftSaveError(context: 'manual' | 'auto' | 'navigation', error: unknown) {
    if (import.meta.env.DEV) {
      console.warn(`Labeler workbench ${context} draft save failed`, error)
    }

    if (error instanceof ApiError && error.detail === 'submitted item cannot be saved as draft') {
      return '当前题目已提交，不能再保存草稿。'
    }

    if (context === 'manual') {
      return '草稿保存失败，请稍后重试。'
    }
    if (context === 'navigation') {
      return '自动保存失败，请先重试。'
    }
    return '自动保存失败，请稍后重试。'
  }

  async function saveDraftForItem(
    item: LabelerWorkItem,
    nextAnswers: AnswerState,
    source: 'manual' | 'auto' | 'navigation',
    options: { shouldApplyResult?: () => boolean } = {},
  ) {
    if (!assignmentId) {
      throw new Error('missing assignmentId')
    }

    const itemState = items.find((entry) => entry.id === item.id)
    if (!isEditableWorkbenchStatus(itemState?.draftStatus)) {
      throw new Error('submitted item cannot be saved as draft')
    }

    const result = await apiPost<DraftResponse, {
      assignmentId: number
      itemId: number
      templateVersionId: number | null
      answers: AnswerState
    }>('/submissions/draft', {
      assignmentId: Number(assignmentId),
      itemId: item.id,
      templateVersionId,
      answers: cleanAnswers(nextAnswers, item.schema, { excludeLLMAssist: true }),
    })

    if (options.shouldApplyResult && !options.shouldApplyResult()) {
      return result
    }

    setItems((current) => current.map((entry) => {
      if (entry.id !== item.id || !isEditableWorkbenchStatus(entry.draftStatus)) {
        return entry
      }
      return {
        ...entry,
        draftAnswers: nextAnswers,
        draftSubmissionId: result.submissionId,
        draftStatus: 'draft',
        draftSavedAt: result.savedAt,
      }
    }))

    setItemSubmissionIds((current) => ({
      ...current,
      [item.id]: result.submissionId,
    }))
    setDirtyItemIds((current) => ({
      ...current,
      [item.id]: false,
    }))

    if (source === 'manual') {
      setFeedback('草稿已保存')
    } else {
      setAutosaveFeedback(`已自动保存于 ${(parseAppDate(result.savedAt) ?? new Date(result.savedAt)).toLocaleTimeString('zh-CN', { hour12: false })}`)
    }

    return result
  }

  useEffect(() => {
    if (!currentItem || !dirtyItemIds[currentItem.id]) {
      return
    }

    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current)
    }

    const autosaveGeneration = autosaveGenerationRef.current
    autosaveTimerRef.current = window.setTimeout(() => {
      setAutosaving(true)
      setAutosaveError('')
      void saveDraftForItem(currentItem, itemAnswers[currentItem.id] ?? {}, 'auto', {
        shouldApplyResult: () => autosaveGeneration === autosaveGenerationRef.current && !submittingRef.current,
      })
        .catch((error: unknown) => {
          if (autosaveGeneration === autosaveGenerationRef.current && !submittingRef.current) {
            setAutosaveError(reportDraftSaveError('auto', error))
          }
        })
        .finally(() => {
          if (autosaveGeneration === autosaveGenerationRef.current) {
            setAutosaving(false)
          }
        })
    }, AUTO_SAVE_DELAY)

    return () => {
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current)
        autosaveTimerRef.current = null
      }
    }
  }, [currentItem, dirtyItemIds, itemAnswers])

  function validateAnswersForItem(item: LabelerWorkItem) {
    const itemValue = itemAnswers[item.id] ?? item.draftAnswers ?? {}
    const activeComponents = getActiveComponents(item.schema, itemValue)

    return activeComponents
      .filter((component) => component.required)
      .filter((component) => {
        const value = itemValue[component.field]
        return Array.isArray(value) ? value.length === 0 : !String(value ?? '').trim()
      })
      .map((component) => `${component.label}不能为空`)
  }

  function validateItemAnswers(item: LabelerWorkItem) {
    const itemValue = itemAnswers[item.id] ?? item.draftAnswers ?? {}
    const requiredErrors = validateAnswersForItem(item)
    const ruleErrors = Object.values(validateRendererAnswers(item.schema, itemValue))
    return [...requiredErrors, ...ruleErrors]
  }

  function validateAnswers() {
    if (!currentItem) {
      return []
    }

    return validateItemAnswers(currentItem)
  }

  async function handleSaveDraft() {
    if (!assignmentId || !currentItem) {
      return
    }

    setSavingDraft(true)
    setErrors([])
    setFeedback('')
    setAutosaveError('')
    clearPendingAutosave()

    try {
      await saveDraftForItem(currentItem, answers, 'manual')
    } catch (error: unknown) {
      setErrors([reportDraftSaveError('manual', error)])
    } finally {
      setSavingDraft(false)
    }
  }

  function getIncompleteItemsSummary() {
    return items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => validateAnswersForItem(item).length > 0)
      .map(({ index }) => `第 ${index + 1} 题`)
  }

  function getInvalidItemsSummary() {
    return items
      .map((item, index) => ({
        index,
        errors: validateItemAnswers(item),
      }))
      .filter(({ errors }) => errors.length > 0)
      .map(({ index, errors }) => `第 ${index + 1} 题：${errors.join('、')}`)
  }

  function canSubmitItem(item: LabelerWorkItem) {
    const status = item.draftStatus ?? 'not_started'
    return isEditableWorkbenchStatus(status)
  }

  async function submitItemForReview(item: LabelerWorkItem) {
    if (!assignmentId) {
      throw new Error('missing assignmentId')
    }

    const nextAnswers = itemAnswers[item.id] ?? item.draftAnswers ?? {}
    const existingSubmissionId = itemSubmissionIds[item.id] ?? item.draftSubmissionId
    const nextSubmissionId = existingSubmissionId
      ? existingSubmissionId
      : (
          await apiPost<DraftResponse, {
            assignmentId: number
            itemId: number
            templateVersionId: number | null
            answers: AnswerState
          }>('/submissions/draft', {
            assignmentId: Number(assignmentId),
            itemId: item.id,
            templateVersionId,
            answers: cleanAnswers(nextAnswers, item.schema, { excludeLLMAssist: true }),
          })
        ).submissionId

    setItemSubmissionIds((current) => ({
      ...current,
      [item.id]: nextSubmissionId,
    }))

    const result = await apiPost<SubmitResponse, { answers: AnswerState }>(
      `/submissions/${nextSubmissionId}/submit`,
      {
        answers: cleanAnswers(nextAnswers, item.schema, { excludeLLMAssist: true }),
      },
    )

    setDirtyItemIds((current) => ({
      ...current,
      [item.id]: false,
    }))
    setItemSubmissionIds((current) => ({
      ...current,
      [item.id]: result.submissionId,
    }))
    setItems((current) => current.map((entry) => {
      if (entry.id !== item.id) {
        return entry
      }
      return {
        ...entry,
        draftAnswers: nextAnswers,
        draftSubmissionId: result.submissionId,
        draftStatus: getNextWorkbenchStatus(result),
        latestRejectReason: result.status === 'needs_revision' ? entry.latestRejectReason : null,
      }
    }))
    setProgress((current) => ({
      ...current,
      completed: result.status === 'review_passed' ? Math.min(current.total, current.completed + 1) : current.completed,
    }))

    return result
  }

  async function handleSubmit() {
    const nextErrors = validateAnswers()
    if (nextErrors.length > 0) {
      setErrors(nextErrors)
      setFeedback('')
      return
    }

    const incompleteItems = getIncompleteItemsSummary()

    if (!assignmentId || !currentItem) {
      setErrors(['缺少 assignmentId，无法提交。'])
      return
    }

    setSubmitting(true)
    submittingRef.current = true
    setErrors([])
    setFeedback('')
    setAutosaveError('')
    clearPendingAutosave()

    try {
      const result = await submitItemForReview(currentItem)
      clearPendingAutosave()
      setAutosaveFeedback('')
      setAutosaveError('')
      const remainingIncompleteItems = incompleteItems.filter((label) => label !== `第 ${currentIndex + 1} 题`)
      if (remainingIncompleteItems.length > 0) {
        setErrors([`仍有未完成题目：${remainingIncompleteItems.join('、')}`])
      }
      setFeedback(result.aiDecision === 'human_review' ? '提交成功，已转人工复核。' : '提交成功，等待 AI 预审')
    } catch {
      setErrors(['该任务已提交，请等待审核结果或返回查看任务状态。'])
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  async function handleSubmitAllCompleted() {
    if (!assignmentId || items.length === 0) {
      return
    }

    const readyItems = items.filter((item) => canSubmitItem(item) && validateItemAnswers(item).length === 0)
    const invalidItems = getInvalidItemsSummary()
    if (readyItems.length === 0) {
      const nextResult = {
        submittedCount: 0,
        invalidItems,
        failedItems: [],
      }
      setBulkSubmitResult(nextResult)
      setErrors([invalidItems.length > 0 ? '没有可提交的已完成题目，请先修正弹窗中的问题。' : '没有可提交的题目。'])
      setFeedback('')
      return
    }

    setSubmittingAll(true)
    submittingRef.current = true
    setErrors([])
    setFeedback('')
    setAutosaveError('')
    clearPendingAutosave()
    const optimisticStatuses = Object.fromEntries(readyItems.map((item) => [item.id, item.draftStatus]))
    const readyItemIds = new Set(readyItems.map((item) => item.id))
    setItems((current) => current.map((item) => (
      readyItemIds.has(item.id)
        ? { ...item, draftStatus: 'ai_reviewing', latestRejectReason: null }
        : item
    )))
    setDirtyItemIds((current) => ({
      ...current,
      ...Object.fromEntries(readyItems.map((item) => [item.id, false])),
    }))

    const submittedLabels: string[] = []
    const failedLabels: string[] = []
    try {
      for (let index = 0; index < readyItems.length; index += SUBMIT_ALL_CONCURRENCY) {
        const batch = readyItems.slice(index, index + SUBMIT_ALL_CONCURRENCY)
        const batchResults = await Promise.all(batch.map(async (item) => {
          const label = `第 ${items.findIndex((entry) => entry.id === item.id) + 1} 题`
          try {
            await submitItemForReview(item)
            return { label, ok: true }
          } catch (error: unknown) {
            if (import.meta.env.DEV) {
              console.warn('Labeler workbench bulk submit failed', { itemId: item.id, error })
            }
            return { label, ok: false }
          }
        }))

        batchResults.forEach((result) => {
          if (result.ok) {
            submittedLabels.push(result.label)
          } else {
            failedLabels.push(result.label)
          }
        })
      }

      if (failedLabels.length > 0) {
        setErrors([`部分题目提交失败：${failedLabels.join('、')}`])
        setItems((current) => current.map((item) => {
          const previousStatus = optimisticStatuses[item.id]
          return previousStatus && failedLabels.includes(`第 ${items.findIndex((entry) => entry.id === item.id) + 1} 题`)
            ? { ...item, draftStatus: previousStatus }
            : item
        }))
      }
      const remainingInvalidItems = invalidItems.filter((label) => !submittedLabels.some((submittedLabel) => label.startsWith(`${submittedLabel}：`)))
      setBulkSubmitResult({
        submittedCount: submittedLabels.length,
        invalidItems: remainingInvalidItems,
        failedItems: failedLabels,
      })
      setFeedback('')
    } finally {
      submittingRef.current = false
      setSubmittingAll(false)
    }
  }

  async function flushCurrentDraftBeforeNavigate(targetIndex: number) {
    if (!currentItem || !dirtyItemIds[currentItem.id]) {
      setCurrentIndex(targetIndex)
      setErrors([])
      setFeedback('')
      setAutosaveError('')
      return
    }

    try {
      setAutosaving(true)
      setAutosaveError('')
      clearPendingAutosave()
      await saveDraftForItem(currentItem, itemAnswers[currentItem.id] ?? {}, 'navigation')
      setCurrentIndex(targetIndex)
      setErrors([])
      setFeedback('')
    } catch (error: unknown) {
      setAutosaveError(reportDraftSaveError('navigation', error))
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

  function jumpToItem(index: number) {
    if (index === currentIndex || index < 0 || index >= items.length) {
      return
    }
    void flushCurrentDraftBeforeNavigate(index)
  }

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
    if (!currentItem || actionBusy || showSourcePreview || event.isComposing || isEditableTarget(event.target)) {
      return
    }

      if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.key === 'ArrowLeft') {
        event.preventDefault()
        goToPrevious()
        return
      }

      if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.key === 'ArrowRight') {
        event.preventDefault()
        goToNext()
        return
      }

      const withCommand = event.ctrlKey || event.metaKey
      if (withCommand && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void handleSaveDraft()
        return
      }

      if (withCommand && !event.altKey && !event.shiftKey && event.key === 'Enter') {
        event.preventDefault()
        void handleSubmit()
      }
    }

    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [currentItem, actionBusy, showSourcePreview, currentIndex, items, answers, dirtyItemIds])

  if (loading) {
    return (
      <section className="workbench-shell">
        <header className="workbench-shell__topbar page-hero page-hero-light">
          <div>
            <span className="page-eyebrow">标注工作台</span>
            <h2>全屏作答工作区</h2>
            <p>正在准备题目、模板、草稿和当前任务状态。</p>
          </div>
          <div className="button-row">
            <Link className="button" to="/labeler/tasks">
              返回我的任务
            </Link>
          </div>
        </header>
        <article className="empty-state-card workbench-shell__state">
          <h3>作答内容加载中</h3>
          <p>正在准备题目、模板和草稿状态。</p>
        </article>
      </section>
    )
  }

  if (pageError) {
    return (
      <section className="workbench-shell">
        <header className="workbench-shell__topbar page-hero page-hero-light">
          <div>
            <span className="page-eyebrow">标注工作台</span>
            <h2>全屏作答工作区</h2>
            <p>当前作答工作区暂时无法打开，可先返回任务管理重新选择任务。</p>
          </div>
          <div className="button-row">
            <Link className="button" to="/labeler/tasks">
              返回我的任务
            </Link>
          </div>
        </header>
        <article className="empty-state-card empty-state-card-error workbench-shell__state">
          <h3>暂时无法打开作答台</h3>
          <p>{pageError}</p>
        </article>
      </section>
    )
  }

  if (items.length === 0 || !currentItem) {
    return (
      <section className="workbench-shell">
        <header className="workbench-shell__topbar page-hero page-hero-light">
          <div>
            <span className="page-eyebrow">标注工作台</span>
            <h2>{taskTitle}</h2>
            <p>当前任务还没有可执行题目，可以先返回任务广场继续领取。</p>
          </div>
          <div className="button-row">
            <Link className="button" to="/labeler/tasks">
              返回我的任务
            </Link>
            <Link className="button button-primary" to="/labeler/plaza">
              返回任务广场
            </Link>
          </div>
        </header>
        <article className="empty-state-card workbench-shell__state">
          <h3>暂无可作答题目</h3>
          <p>当前任务还没有可执行题目，可以先返回广场继续领取。</p>
          <div className="button-row">
            <Link className="button button-primary" to="/labeler/plaza">
              返回任务广场
            </Link>
          </div>
        </article>
      </section>
    )
  }

  return (
    <section className="workbench-shell labeler-workbench">
      {/* 紧凑型顶部控制中心 */}
      <header className="labeler-workbench__topbar">
        <div className="labeler-workbench__toprow">
          <div className="labeler-workbench__title">
            <Link aria-label="返回我的任务" to="/labeler/tasks" className="labeler-workbench__backlink">←</Link>
            <div>
              <div className="labeler-workbench__meta">
                <span className="labeler-workbench__meta-pill">标注任务</span>
                <span className="labeler-workbench__meta-copy">Workplace</span>
              </div>
              <h2>{taskTitle}</h2>
            </div>
          </div>
          <div className="labeler-workbench__toolbar">
            <div className="button-group">
              <Link className="button-sm" to="/labeler/tasks">返回列表</Link>
              <Link className="button-sm" to="/labeler/plaza">任务广场</Link>
            </div>
          </div>
        </div>

        <div className="labeler-workbench__summary-strip">
          <div className="labeler-workbench__summary-metrics">
            <div className="labeler-workbench__summary-item">
              <span className="summary-label">当前进度</span>
              <strong className="summary-value">第 {currentIndex + 1} / {items.length} 题</strong>
            </div>
            <div className="labeler-workbench__summary-item">
              <span className="summary-label">题目状态</span>
              <strong className={`summary-value ${currentItem.draftStatus === 'needs_revision' ? 'is-warning' : ''}`}>
                {getStatusText(currentItem, answers, validateItemAnswers(currentItem))}
              </strong>
            </div>
            <div className="labeler-workbench__summary-item">
              <span className="summary-label">必填项</span>
              <strong className="summary-value">{activeCompletedRequiredCount} / {activeRequiredCount || 0}</strong>
            </div>
            <div className="labeler-workbench__summary-item">
              <span className="summary-label">未完成</span>
              <strong className="summary-value">{incompleteItemCount} 题</strong>
            </div>
          </div>

          <div className="labeler-workbench__summary-progress">
            <div className="labeler-workbench__summary-progress-body">
              <div className="labeler-workbench__summary-progress-head">
                <span>任务总完成度 (已通过 {progress.completed}/{progress.total})</span>
                <strong>{completedPercent}%</strong>
              </div>
              <div className="task-card-progress-track">
                <div className="task-card-progress-fill" style={{ width: `${completedPercent}%`, backgroundColor: '#1aae39', transition: 'width 0.3s ease' }} />
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="workbench-shell__grid">
        <article className="card workbench-shell__nav labeler-workbench__panel">
          <div className="section-header">
            <div>
              <span className="section-eyebrow">题目进度</span>
              <h3>题目导航</h3>
            </div>
          </div>
          <div className="focus-panel labeler-workbench__nav-card">
            <h4>{`已通过 ${progress.completed} / ${progress.total}`}</h4>
            <p>系统会自动保存当前草稿。</p>
          </div>
          <div className="workbench-mini-progress">
            <div className="task-card-progress-track">
              <div className="task-card-progress-fill" style={{ width: `${completedPercent}%` }} />
            </div>
            <span className="task-card-progress-label">{`${completedPercent}%`}</span>
          </div>
          <div className="workbench-quick-actions" aria-label="快速定位">
            <button
              type="button"
              onClick={() => jumpToItem(nextIncompleteIndex)}
              disabled={nextIncompleteIndex < 0 || actionBusy}
            >
              定位未完成
            </button>
            <button
              type="button"
              onClick={() => jumpToItem(nextRevisionIndex)}
              disabled={nextRevisionIndex < 0 || actionBusy}
            >
              定位待修改
            </button>
          </div>
          <div className="workbench-task-list">
            {items.map((item, index) => {
              const itemValue = itemAnswers[item.id] ?? item.draftAnswers ?? {}
              const itemErrors = validateItemAnswers(item)
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`workbench-task-button ${index === currentIndex ? 'is-active' : ''}`}
                  onClick={() => jumpToItem(index)}
                  disabled={actionBusy}
                >
                  <span>
                    <strong>{`第 ${index + 1} 题`}</strong>
                    <small>{itemErrors.length > 0 ? '待补全' : '必填已完成'}</small>
                  </span>
                  <span className={`status-badge ${getStatusClassName(item, itemValue, itemErrors)}`}>{getStatusText(item, itemValue, itemErrors)}</span>
                </button>
              )
            })}
          </div>
        </article>

        <article className="card workbench-shell__main labeler-workbench__panel">
          <div className="section-header">
            <div>
              <span className="section-eyebrow">原始数据</span>
              <h3>原始数据区</h3>
            </div>
          </div>
          <div className="workbench-source-toolbar">
            <span>{`source 字段 ${sourceFieldEntries.length}`}</span>
            <span>{hasConfiguredSourceSchema ? '已按模板展示' : '当前使用原文兜底展示'}</span>
            <button type="button" className="button" onClick={() => setShowSourcePreview(true)}>
              预览 source
            </button>
          </div>
          <div className="workbench-source-panel">
            {hasConfiguredSourceSchema ? (
              <Renderer
                mode="preview"
                schema={sourceSchema}
                source={currentItem.source}
                showSourceFallback={false}
                values={answers}
              />
            ) : (
              <SourceFieldList source={currentItem.source} emptyClassName="workbench-source-empty" />
            )}
          </div>
          {revisionReason ? (
            <div className="focus-panel workbench-revision-panel">
              <span className="section-eyebrow">打回说明</span>
              <h4>最近一次打回理由</h4>
              <p>{revisionReason}</p>
              <p className="inline-notice">请基于原答案修改后重新提交。</p>
            </div>
          ) : null}
          {showAnswerDiff ? (
            <div className="focus-panel workbench-revision-panel" aria-label="答案差异">
              <span className="section-eyebrow">答案差异</span>
              <div className="workbench-revision-header">
                <h4>上次提交 vs 当前修改</h4>
                <p className="inline-notice">基于上次提交答案进行针对性修改</p>
              </div>
              
              {previousAnswers ? (
                changedDiffItems.length > 0 ? (
                  <div className="workbench-diff-list">
                    {changedDiffItems.map((item) => (
                      <div key={item.field} className="workbench-diff-item">
                        <div className="workbench-diff-field-label">
                          <strong>{item.field}</strong>
                          <span className={`diff-tag diff-tag--${item.changeType}`}>
                            {item.changeType === 'added' ? '新增' : item.changeType === 'removed' ? '删除' : '修改'}
                          </span>
                        </div>
                        <div className="workbench-diff-comparison">
                          <div className="workbench-diff-col">
                            <span className="field-helper-text">上次提交</span>
                            <div className="workbench-diff-card workbench-diff-card--previous">
                              {formatAnswerValue(item.previousValue)}
                            </div>
                          </div>
                          <div className="workbench-diff-col">
                            <span className="field-helper-text">当前修改</span>
                            <div className="workbench-diff-card workbench-diff-card--current">
                              {formatAnswerValue(item.currentValue)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="workbench-diff-empty">
                    <p className="inline-notice">当前尚未改动，正在以上次提交答案作为修改基线。</p>
                  </div>
                )
              ) : (
                <div className="workbench-diff-empty">
                  <p className="inline-notice">当前题目暂无历史提交版本，提交后可在重提场景中查看差异。</p>
                </div>
              )}
            </div>
          ) : null}
        </article>

        <div className="workbench-answer-rail">
          <article className="card workbench-shell__answer labeler-workbench__panel">
            <div className="section-header">
              <div>
                <span className="section-eyebrow">作答区</span>
                <h3>作答区</h3>
              </div>
            </div>
            <div className="workbench-answer-summary">
              <div className="workbench-answer-summary__item">
                <span>当前状态</span>
                <strong>{getStatusText(currentItem, answers, validateItemAnswers(currentItem))}</strong>
              </div>
              <div className="workbench-answer-summary__item">
                <span>必填项</span>
                <strong>{`${activeCompletedRequiredCount}/${activeRequiredCount || 0}`}</strong>
              </div>
              <div className="workbench-answer-summary__item">
                <span>未完成题目</span>
                <strong>{incompleteItemCount}</strong>
              </div>
            </div>
            <Renderer
              mode="answer"
              onGenerateLLMAnswer={generateLLMAnswer}
              onToggleArrayAnswer={toggleArrayAnswer}
              onUpdateAnswer={updateAnswer}
              schema={answerSchema}
              source={currentItem.source}
              values={answers}
            />

            {errors.length > 0 ? (
              <ul className="error-list workbench-error-list">
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            ) : null}
          </article>

          <article className="card workbench-answer-footer-card" aria-label="切题与保存">
            <div className="workbench-answer-footer">
              <div className="workbench-answer-footer__meta">
                <div className="workbench-save-state">
                  {autosaving || savingDraft ? (
                    <span className="workbench-save-state__item workbench-save-state__item--saving">
                      <span className="workbench-spinner" aria-hidden="true" />
                      保存中...
                    </span>
                  ) : autosaveError ? (
                    <span className="workbench-save-state__item workbench-save-state__item--error">{autosaveError}</span>
                  ) : dirtyCurrentItem ? (
                    <span className="workbench-save-state__item workbench-save-state__item--dirty">
                      <span className="workbench-state-dot" aria-hidden="true" />
                      有未保存的修改
                    </span>
                  ) : (
                    <span className="workbench-save-state__item workbench-save-state__item--saved">
                      <span className="workbench-state-dot" aria-hidden="true" />
                      {autosaveFeedback || '已自动保存'}
                    </span>
                  )}
                </div>
                {feedback ? (
                  <span className="workbench-feedback-message">{feedback}</span>
                ) : null}
              </div>
              <div className="workbench-answer-footer__actions">
                <button disabled={currentIndex === 0 || actionBusy} type="button" onClick={goToPrevious}>
                  上一题
                </button>
                <button
                  disabled={currentIndex === items.length - 1 || actionBusy}
                  type="button"
                  onClick={goToNext}
                >
                  下一题
                </button>
                <button type="button" onClick={() => void handleSaveDraft()} disabled={actionBusy}>
                  保存
                </button>
              </div>
            </div>
          </article>
        </div>
      </div>

      <div className="workbench-action-dock" role="region" aria-label="作答操作菜单">
        <div className="workbench-action-dock__group workbench-action-dock__group--locate">
          <div className="workbench-action-dock__actions" aria-label="workbench shortcuts">
            <button
              className={getLocateActionClassName('incomplete', hasIncompleteItems)}
              type="button"
              onClick={() => jumpToItem(nextIncompleteIndex)}
              disabled={!hasIncompleteItems || actionBusy}
            >
              定位未完成
            </button>
            <button
              className={getLocateActionClassName('revision', hasRevisionItems)}
              type="button"
              onClick={() => jumpToItem(nextRevisionIndex)}
              disabled={!hasRevisionItems || actionBusy}
            >
              定位待修改
            </button>
          </div>
        </div>
        <div className="workbench-action-dock__group workbench-action-dock__group--submit">
          <div className="workbench-action-dock__actions">
            <button className="button-primary" type="button" onClick={() => void handleSubmit()} disabled={actionBusy}>
              {submitting ? '提交中...' : revisionReason ? '重新提交本题' : '提交本题'}
            </button>
            <button className="button-primary" type="button" onClick={() => void handleSubmitAllCompleted()} disabled={actionBusy}>
              {submittingAll ? '提交中...' : '提交已完成题目'}
            </button>
          </div>
        </div>
      </div>
      {bulkSubmitResult ? (
        <div className="modal-overlay" onClick={(event) => { if (event.target === event.currentTarget) setBulkSubmitResult(null) }}>
          <div className="modal-card workbench-bulk-result-modal">
            <div className="designer-section-header">
              <div>
                <span className="section-eyebrow">Submit result</span>
                <h3>提交结果</h3>
                <p className="field-helper-text">已完成题目会进入 AI 审核队列；未满足校验规则的题目需要修改后再提交。</p>
              </div>
            </div>
            <p className="workbench-bulk-result-brief">
              已提交 {bulkSubmitResult.submittedCount} 题
              {bulkSubmitResult.invalidItems.length > 0 ? `；仍需修正 ${bulkSubmitResult.invalidItems.length} 题` : ''}
              {bulkSubmitResult.failedItems.length > 0 ? `；提交失败 ${bulkSubmitResult.failedItems.length} 题` : ''}
            </p>
            <div className="workbench-bulk-result-summary">
              <div>
                <span>已提交</span>
                <strong>{bulkSubmitResult.submittedCount}</strong>
              </div>
              <div>
                <span>仍需修正</span>
                <strong>{bulkSubmitResult.invalidItems.length}</strong>
              </div>
              <div>
                <span>提交失败</span>
                <strong>{bulkSubmitResult.failedItems.length}</strong>
              </div>
            </div>
            {bulkSubmitResult.invalidItems.length > 0 ? (
              <div className="workbench-bulk-result-section">
                <h4>仍需修正</h4>
                <ul>
                  {bulkSubmitResult.invalidItems.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {bulkSubmitResult.failedItems.length > 0 ? (
              <div className="workbench-bulk-result-section workbench-bulk-result-section--error">
                <h4>提交失败</h4>
                <ul>
                  {bulkSubmitResult.failedItems.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="button-row modal-actions">
              <button type="button" className="button button-primary" onClick={() => setBulkSubmitResult(null)}>知道了</button>
            </div>
          </div>
        </div>
      ) : null}
      {showSourcePreview ? (
        <div className="modal-overlay" onClick={(event) => { if (event.target === event.currentTarget) setShowSourcePreview(false) }}>
          <div className="modal-card workbench-source-modal">
            <div className="designer-section-header">
              <div>
                <span className="section-eyebrow">Source preview</span>
                <h3>{`第 ${currentIndex + 1} 题 source 数据`}</h3>
                <p className="field-helper-text">按字段展示当前样本，方便你对照模板展示与原始入参。</p>
              </div>
            </div>
            <div className="workbench-source-modal__body">
              <SourceFieldList source={currentItem.source} emptyClassName="workbench-source-empty" />
            </div>
            <div className="button-row modal-actions">
              <button type="button" className="button" onClick={() => setShowSourcePreview(false)}>关闭</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
