import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { apiDelete, apiGet, apiPatch, apiPost, ApiError } from '../../../services/api/client'
import { listDatasetItems, listDatasets } from '../../../services/api/datasets'
import type { DatasetSummary } from '../../../types/dataset'
import type { OwnerTask } from '../../../types/domain'
import { AIConfigWorkspace } from './AIConfigWorkspace'
import { DeadlinePicker } from './DeadlinePicker'
import { AI_MODEL_OPTIONS, DEFAULT_AI_MODEL } from './aiModelOptions'
import { DEFAULT_AI_PROMPT_TEMPLATE, DEFAULT_AI_SCORE_DIMENSIONS, PROMPT_PRESETS } from './aiPromptPresets'
import { TimeRangeFilter } from '../../../components/TimeRangeFilter'
import { filterByTimeRange, type TimeRangeKey } from '../../../utils/timeRangeFilter'

const DEFAULT_AI_PASS_THRESHOLD = 80

type ReviewerOption = {
  id: number
  username: string
  displayName: string
  role: 'reviewer'
}

type TaskReviewerState = {
  reviewerId: number
  username: string
  displayName: string
}

type TaskLabelerState = {
  labelerId: number
  username: string
  displayName: string
  assignmentId?: number
}

type ViewMode = 'list' | 'create'

type TaskFormState = {
  title: string
  description: string
  taskBrief: string
  taskTags: string
  deadline: string
  quota: string
  templateId: string
  datasetId: string
  aiPromptTemplate: string
  aiScoreDimensions: typeof DEFAULT_AI_SCORE_DIMENSIONS
  aiPassThreshold: string
  reviewGuideline: string
  aiModel: string
}

type TaskListResponse = {
  items: Array<{
    id: number
    title: string
    description: string
    taskBrief?: string
    taskTags?: string[]
    rewardRule?: string
    status: OwnerTask['status']
    quota: number
    deadline: string | null
    templateId: number | null
    datasetId?: number | null
    itemCount?: number
    completedItemCount?: number
    passedItemCount?: number
    pendingReviewCount?: number
    passRate?: number
    createdAt?: string | null
    updatedAt?: string | null
    reviewers?: TaskReviewerState[]
    labelers?: TaskLabelerState[]
    aiConfig?: {
      promptTemplate: string
      scoreDimensions: Array<{
        key: string
        label: string
        description?: string
        weight?: number
        enabled?: boolean
      }>
      passThreshold: number
      reviewGuideline: string
    }
  }>
  total: number
}

type TemplateOption = {
  id: number
  name: string
}

type TemplateListResponse = {
  items: TemplateOption[]
}

type TaskCreateResponse = {
  id: number
  status: OwnerTask['status']
}

type TaskStatusResponse = {
  id: number
  status: OwnerTask['status']
}

type DatasetItemPreview = {
  id: number
  sequence: number
  source: Record<string, unknown>
}

const initialFormState: TaskFormState = {
  title: '',
  description: '',
  taskBrief: '',
  taskTags: '',
  deadline: '',
  quota: '',
  templateId: '',
  datasetId: '',
  aiPromptTemplate: DEFAULT_AI_PROMPT_TEMPLATE,
  aiScoreDimensions: DEFAULT_AI_SCORE_DIMENSIONS,
  aiPassThreshold: String(DEFAULT_AI_PASS_THRESHOLD),
  reviewGuideline: '',
  aiModel: DEFAULT_AI_MODEL,
}

function isTaskReadyForStorage(task: Pick<OwnerTask, 'itemCount' | 'passedItemCount' | 'pendingReviewCount'>) {
  const itemCount = task.itemCount ?? 0
  return itemCount > 0 && (task.passedItemCount ?? 0) >= itemCount && (task.pendingReviewCount ?? 0) === 0
}

function getTaskStatusText(task: OwnerTask) {
  if (task.status === 'ended') {
    return '已入库'
  }
  if (isTaskReadyForStorage(task)) {
    return '已完成'
  }
  if (task.status === 'draft') {
    return '草稿'
  }
  if (task.status === 'published') {
    return '已发布'
  }
  return '已暂停'
}

function formatTask(task: TaskListResponse['items'][number]): OwnerTask {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    taskBrief: task.taskBrief ?? '',
    taskTags: task.taskTags ?? [],
    status: task.status,
    quota: task.quota,
    deadline: task.deadline ?? '未设置',
    templateId: task.templateId,
    datasetId: task.datasetId ?? null,
    itemCount: task.itemCount ?? 0,
    completedItemCount: task.completedItemCount ?? 0,
    passedItemCount: task.passedItemCount ?? 0,
    pendingReviewCount: task.pendingReviewCount ?? 0,
    passRate: task.passRate ?? 0,
    createdAt: task.createdAt ?? null,
    updatedAt: task.updatedAt ?? null,
    reviewers: task.reviewers ?? [],
    labelers: task.labelers ?? [],
    aiConfig: task.aiConfig,
  }
}

function buildAIConfigForm(task: OwnerTask | null): Pick<TaskFormState, 'aiPromptTemplate' | 'aiScoreDimensions' | 'aiPassThreshold' | 'reviewGuideline'> & { aiModel: string } {
  const aiConfig = task?.aiConfig

  return {
    aiPromptTemplate: aiConfig?.promptTemplate ?? DEFAULT_AI_PROMPT_TEMPLATE,
    aiScoreDimensions: (aiConfig?.scoreDimensions ?? DEFAULT_AI_SCORE_DIMENSIONS).map((dimension) => ({
      key: dimension.key,
      label: dimension.label,
      description: dimension.description ?? '',
      weight: dimension.weight ?? 1,
      enabled: dimension.enabled ?? true,
    })),
    aiPassThreshold: aiConfig?.passThreshold ? String(aiConfig.passThreshold) : String(DEFAULT_AI_PASS_THRESHOLD),
    reviewGuideline: aiConfig?.reviewGuideline ?? '',
    aiModel: aiConfig?.aiModel ?? DEFAULT_AI_MODEL,
  }
}

export function OwnerTasksPage() {
  const location = useLocation()
  const exportTargetTaskId = new URLSearchParams(location.search).get('taskId')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [createStage, setCreateStage] = useState<number>(1)
  const [tasks, setTasks] = useState<OwnerTask[]>([])
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('all')
  const [templateOptions, setTemplateOptions] = useState<TemplateOption[]>([])
  const [datasetOptions, setDatasetOptions] = useState<DatasetSummary[]>([])
  const [reviewerOptions, setReviewerOptions] = useState<ReviewerOption[]>([])
  const [reviewerOptionsLoaded, setReviewerOptionsLoaded] = useState(false)
  const [peopleOptionsLoaded, setPeopleOptionsLoaded] = useState(false)
  const [previewTask, setPreviewTask] = useState<OwnerTask | null>(null)
  const [previewItems, setPreviewItems] = useState<DatasetItemPreview[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<OwnerTask | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [unbindTarget, setUnbindTarget] = useState<OwnerTask | null>(null)
  const [unbindError, setUnbindError] = useState('')
  const [unbindingTaskId, setUnbindingTaskId] = useState<number | null>(null)
  const [form, setForm] = useState<TaskFormState>(initialFormState)
  const [errors, setErrors] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [saving, setSaving] = useState(false)
  const [savingAIConfig, setSavingAIConfig] = useState(false)
  const [editingAIConfigTaskId, setEditingAIConfigTaskId] = useState<number | null>(null)
  const [updatingTaskId, setUpdatingTaskId] = useState<number | null>(null)
  const [editingReviewerTaskId, setEditingReviewerTaskId] = useState<number | null>(null)
  const [selectedReviewerIds, setSelectedReviewerIds] = useState<number[]>([])
  const [reviewerMessage, setReviewerMessage] = useState('')
  const [taskActionError, setTaskActionError] = useState('')
  const [reviewerPanelError, setReviewerPanelError] = useState('')
  const [reviewerPanelLoading, setReviewerPanelLoading] = useState(false)
  const [reviewerSaveErrorTaskId, setReviewerSaveErrorTaskId] = useState<number | null>(null)
  const [reviewerSaveMessageTaskId, setReviewerSaveMessageTaskId] = useState<number | null>(null)
  const [savingReviewerTaskId, setSavingReviewerTaskId] = useState<number | null>(null)
  const [createReviewerIds, setCreateReviewerIds] = useState<number[]>([])
  const [taskTab, setTaskTab] = useState<'unstored' | 'stored'>('unstored')

  useEffect(() => {
    void loadTasks()
  }, [])

  const visibleTasks = filterByTimeRange(tasks, timeRange, (task) => task.updatedAt ?? task.createdAt ?? task.deadline)

  const unstoredTasks = useMemo(() => visibleTasks.filter((t) => t.status !== 'ended'), [visibleTasks])
  const storedTasks = useMemo(() => visibleTasks.filter((t) => t.status === 'ended'), [visibleTasks])

  const currentTabTasks = taskTab === 'unstored' ? unstoredTasks : storedTasks

  useEffect(() => {
    const datasetIdFromQuery = new URLSearchParams(location.search).get('datasetId')
    if (!datasetIdFromQuery) {
      return
    }

    setForm((current) =>
      current.datasetId
        ? current
        : {
            ...current,
            datasetId: datasetIdFromQuery,
          },
    )
  }, [location.search])

  async function loadTasks() {
    setLoading(true)
    setPageError('')

    try {
      const [taskResult, templateResult, datasetResult] = await Promise.all([
        apiGet<TaskListResponse>('/tasks'),
        apiGet<TemplateListResponse>('/templates'),
        listDatasets(),
      ])
      setTasks(taskResult.items.map(formatTask))
      setTemplateOptions(templateResult.items)
      setDatasetOptions(datasetResult.items)
    } catch {
      setPageError('任务列表加载失败，请确认后端服务已启动。')
    } finally {
      setLoading(false)
    }
  }

  function handleChange(field: keyof TaskFormState, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function applyCreatePromptPreset(presetName: string) {
    const preset = PROMPT_PRESETS.find((item) => item.name === presetName)
    if (!preset) {
      return
    }
    setForm((current) => ({
      ...current,
      aiPromptTemplate: preset.prompt,
      aiScoreDimensions: preset.dimensions.map((dimension) => ({ ...dimension })),
    }))
  }

  function handleBackToList() {
    setViewMode('list')
    setCreateStage(1)
    setForm(initialFormState)
    setCreateReviewerIds([])
    setEditingAIConfigTaskId(null)
    setErrors([])
  }

  function startEditAIConfig(task: OwnerTask) {
    const aiConfigForm = buildAIConfigForm(task)
    setEditingAIConfigTaskId(task.id)
    setForm((current) => ({
      ...current,
      ...aiConfigForm,
    }))
    setPageError('')
  }

  function cancelEditAIConfig() {
    setEditingAIConfigTaskId(null)
    setForm((current) => ({
      ...current,
      aiPromptTemplate: '',
      aiScoreDimensions: DEFAULT_AI_SCORE_DIMENSIONS,
      aiPassThreshold: '',
      reviewGuideline: '',
    }))
  }

  async function loadPeopleOptions() {
    if (peopleOptionsLoaded) {
      return true
    }

    try {
      const reviewerResult = await apiGet<{ items: ReviewerOption[] }>('/users/reviewers')
      setReviewerOptions(reviewerResult.items)
      setReviewerOptionsLoaded(true)
      setPeopleOptionsLoaded(true)
      return true
    } catch {
      setErrors(['人员列表加载失败，请稍后重试。'])
      return false
    }
  }

  async function openReviewerEditor(task: OwnerTask) {
    setEditingReviewerTaskId(task.id)
    setSelectedReviewerIds(task.reviewers?.map((reviewer) => reviewer.reviewerId) ?? [])
    setReviewerMessage('')
    setReviewerPanelError('')
    setReviewerSaveMessageTaskId(null)
    setReviewerSaveErrorTaskId(null)

    if (reviewerOptionsLoaded) {
      return
    }

    try {
      setReviewerPanelLoading(true)
      const result = await apiGet<{ items: ReviewerOption[] }>('/users/reviewers')
      setReviewerOptions(result.items)
      setReviewerOptionsLoaded(true)
    } catch {
      setReviewerPanelError('审核员列表加载失败，请稍后重试。')
    } finally {
      setReviewerPanelLoading(false)
    }
  }

  function toggleReviewer(reviewerId: number) {
    setSelectedReviewerIds((current) =>
      current.includes(reviewerId)
        ? current.filter((item) => item !== reviewerId)
        : [...current, reviewerId],
    )
  }

  function toggleCreateReviewer(reviewerId: number) {
    setCreateReviewerIds((current) =>
      current.includes(reviewerId)
        ? current.filter((item) => item !== reviewerId)
        : [...current, reviewerId],
    )
  }

  function validateForm() {
    const nextErrors: string[] = []

    if (!form.title.trim()) {
      nextErrors.push('标题不能为空')
    }

    if (!form.deadline.trim()) {
      nextErrors.push('截止时间不能为空')
    }

    const quota = Number(form.quota)
    if (!form.quota.trim() || Number.isNaN(quota) || quota <= 0) {
      nextErrors.push('配额必须是正数')
    }

    return nextErrors
  }

  async function handleSaveTask() {
    const nextErrors = validateForm()
    if (nextErrors.length > 0) {
      setErrors(nextErrors)
      return
    }

    setSaving(true)
    setErrors([])

    try {
      const result = await apiPost<TaskCreateResponse, {
        title: string
        description: string
        taskBrief?: string
        taskTags?: string[]
        quota: number
        deadline?: string
        templateId?: number
        datasetId?: number
        aiPromptTemplate?: string
        aiPassThreshold?: number
        aiModel?: string
      }>('/tasks', {
        title: form.title.trim(),
        description: form.description.trim(),
        ...(form.taskBrief.trim() ? { taskBrief: form.taskBrief.trim() } : {}),
        ...(form.taskTags.trim()
          ? {
              taskTags: form.taskTags
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean),
            }
          : {}),
        quota: Number(form.quota),
        ...(form.deadline.trim() ? { deadline: form.deadline.trim() } : {}),
        ...(form.templateId ? { templateId: Number(form.templateId) } : {}),
        ...(form.datasetId ? { datasetId: Number(form.datasetId) } : {}),
        ...(form.aiPromptTemplate.trim() ? { aiPromptTemplate: form.aiPromptTemplate.trim() } : {}),
        ...(form.aiPassThreshold.trim() ? { aiPassThreshold: Number(form.aiPassThreshold) } : {}),
        aiModel: form.aiModel,
      })

      const newTask: OwnerTask = {
        id: result.id,
        title: form.title.trim(),
        description: form.description.trim(),
        taskBrief: form.taskBrief.trim(),
        taskTags: form.taskTags
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        status: result.status,
        quota: Number(form.quota),
        deadline: form.deadline.trim() || '未设置',
        templateId: form.templateId ? Number(form.templateId) : null,
        datasetId: form.datasetId ? Number(form.datasetId) : null,
        itemCount: datasetOptions.find((dataset) => dataset.id === Number(form.datasetId))?.itemCount ?? 0,
        completedItemCount: 0,
        passedItemCount: 0,
        pendingReviewCount: 0,
        passRate: 0,
        labelers: [],
        reviewers: reviewerOptions
          .filter((item) => createReviewerIds.includes(item.id))
          .map((item) => ({ reviewerId: item.id, username: item.username, displayName: item.displayName })),
      }

      if (createReviewerIds.length > 0) {
        await apiPost(`/tasks/${result.id}/reviewers`, { reviewerIds: createReviewerIds })
      }
      if (form.aiPromptTemplate.trim()) {
        await apiPatch(`/tasks/${result.id}/ai-config`, {
          promptTemplate: form.aiPromptTemplate.trim(),
          scoreDimensions: form.aiScoreDimensions,
          passThreshold: Number(form.aiPassThreshold || DEFAULT_AI_PASS_THRESHOLD),
          reviewGuideline: form.reviewGuideline.trim(),
          aiModel: form.aiModel,
        })
        newTask.aiConfig = {
          promptTemplate: form.aiPromptTemplate.trim(),
          scoreDimensions: form.aiScoreDimensions,
          passThreshold: Number(form.aiPassThreshold || DEFAULT_AI_PASS_THRESHOLD),
          reviewGuideline: form.reviewGuideline.trim(),
          aiModel: form.aiModel,
        }
      }

      setTasks((current) => [newTask, ...current])
      setForm(initialFormState)
      setCreateReviewerIds([])
      setCreateStage(1)
      setViewMode('list')
    } catch {
      setErrors(['保存失败，请确认已使用 owner 身份登录。'])
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdateStatus(taskId: number, status: OwnerTask['status']) {
    setUpdatingTaskId(taskId)
    setPageError('')
    setTaskActionError('')

    try {
      const result = await apiPatch<TaskStatusResponse, { status: OwnerTask['status'] }>(
        `/tasks/${taskId}/status`,
        { status },
      )

      setTasks((current) =>
        current.map((task) =>
          task.id === taskId
            ? {
                ...task,
                status: result.status,
              }
            : task,
        ),
      )
    } catch (e: unknown) {
      if (import.meta.env.DEV) {
        console.debug('update task status error:', e)
      }
      if (e instanceof ApiError) {
        setPageError(e.detail || '任务状态更新失败，请稍后重试。')
      } else {
        setPageError('任务状态更新失败，请稍后重试。')
      }
    } finally {
      setUpdatingTaskId(null)
    }
  }

  async function saveTaskReviewers(taskId: number) {
    setSavingReviewerTaskId(taskId)
    setReviewerMessage('')
    setReviewerPanelError('')
    setReviewerSaveMessageTaskId(null)
    setReviewerSaveErrorTaskId(null)

    try {
      await apiPost(`/tasks/${taskId}/reviewers`, { reviewerIds: selectedReviewerIds })
      setReviewerMessage('审核分配已更新')
      setReviewerSaveMessageTaskId(taskId)
      setEditingReviewerTaskId(null)
      await loadTasks()
    } catch {
      setReviewerSaveErrorTaskId(taskId)
      setReviewerPanelError('审核分配保存失败，请稍后重试。')
    } finally {
      setSavingReviewerTaskId(null)
    }
  }

  async function openDatasetPreview(task: OwnerTask) {
    if (!task.datasetId) {
      return
    }

    setPreviewTask(task)
    setPreviewLoading(true)
    try {
      const result = await listDatasetItems(task.datasetId)
      setPreviewItems(result.items)
    } catch {
      setPageError('数据集题目预览加载失败，请稍后重试。')
      setPreviewTask(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  async function confirmUnbindDataset() {
    if (!unbindTarget) {
      return
    }

    setUnbindingTaskId(unbindTarget.id)
    setUnbindError('')
    try {
      await apiPatch(`/tasks/${unbindTarget.id}/dataset-binding`, { datasetId: null })
      setTasks((current) =>
        current.map((task) =>
          task.id === unbindTarget.id
            ? {
                ...task,
                datasetId: null,
                itemCount: 0,
              }
            : task,
        ),
      )
      setUnbindTarget(null)
    } catch {
      setUnbindError('解绑数据集失败，请确认任务已暂停。')
    } finally {
      setUnbindingTaskId(null)
    }
  }

  async function confirmDeleteTask() {
    if (!deleteTarget) {
      return
    }
    setDeleteError('')
    try {
      await apiDelete(`/tasks/${deleteTarget.id}`)
      setTasks((current) => current.filter((task) => task.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (e: unknown) {
      if (import.meta.env.DEV) {
        console.debug('delete task error:', e)
      }
      if (e instanceof ApiError) {
        const detail = e.detail
        if (detail?.includes('already has assignments')) {
          setDeleteError('删除失败：该任务已经有标注员领取，不能删除。')
        } else if (detail?.includes('already has submissions')) {
          setDeleteError('删除失败：该任务下已经存在标注提交记录，不能删除。')
        } else {
          setDeleteError(detail || '删除任务失败，请稍后重试。')
        }
      } else {
        setDeleteError('删除任务失败，请稍后重试。')
      }
    }
  }

  return (
    <section>
      <header className="page-hero page-hero-light">
        <div>
          <span className="page-eyebrow">Task management</span>
          <h2>任务管理</h2>
          <p>创建任务、维护配置，并进入任务详情页查看审核推进、数据集预览与审核分配情况。</p>
        </div>
        {viewMode === 'list' ? (
          <div className="button-row">
            <Link className="button" to="/owner/dashboard">
              返回概览
            </Link>
            <button className="button button-primary" type="button" onClick={() => setViewMode('create')}>
              新建任务
            </button>
          </div>
        ) : (
          <div className="button-row">
            <button type="button" onClick={handleBackToList} disabled={saving}>
              返回列表
            </button>
            <button className="button button-primary" type="button" onClick={() => void handleSaveTask()} disabled={saving}>
              {saving ? '保存中...' : '保存任务'}
            </button>
          </div>
        )}
      </header>

      {viewMode === 'create' ? (
        <div className="modal-overlay">
          <div className="modal-card modal-card-wide task-create-modal">
            <div className="section-header">
              <div>
                <span className="section-eyebrow">Step {createStage} of 4</span>
                <h3>{createStage === 1 ? '基础信息' : createStage === 2 ? '数据与模板' : createStage === 3 ? '发布方式与人员' : 'AI 预审配置'}</h3>
              </div>
              <button type="button" className="button-close" onClick={handleBackToList}>×</button>
            </div>

            <div className="wizard-stepper" style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
              {[1, 2, 3, 4].map(s => (
                <div key={s} style={{ flex: 1, height: '4px', backgroundColor: createStage >= s ? 'var(--color-primary)' : '#e5e7eb', borderRadius: '2px' }}></div>
              ))}
            </div>

            {createStage === 1 && (
              <div className="form-grid">
                <label className="form-field"><span>标题</span><input value={form.title} onChange={(e) => handleChange('title', e.target.value)} placeholder="输入任务名称" /></label>
                <label className="form-field"><span>描述</span><textarea value={form.description} onChange={(e) => handleChange('description', e.target.value)} /></label>
                <label className="form-field"><span>任务说明</span><textarea value={form.taskBrief} onChange={(e) => handleChange('taskBrief', e.target.value)} /></label>
                <label className="form-field"><span>任务标签</span><input value={form.taskTags} onChange={(e) => handleChange('taskTags', e.target.value)} placeholder="情感,分类" /></label>
                <label className="form-field"><span>配额</span><input type="number" min="1" value={form.quota} onChange={(e) => handleChange('quota', e.target.value)} /></label>
                <label className="form-field">
                  <span>截止时间</span>
                  <DeadlinePicker value={form.deadline} onChange={(val) => handleChange('deadline', val)} />
                  <p className="field-helper-text">默认选择 7 天后的 18:00，可按年月日时分滚动调整。</p>
                </label>
              </div>
            )}

            {createStage === 2 && (
              <div className="form-grid">
                <label className="form-field">
                  <span>数据集</span>
                  <select value={form.datasetId} onChange={(e) => handleChange('datasetId', e.target.value)}>
                    <option value="">暂不绑定数据集</option>
                    {datasetOptions.map((dataset) => (
                      <option key={dataset.id} value={String(dataset.id)}>{dataset.name}（{dataset.itemCount} 题）</option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  <span>模板</span>
                  <select value={form.templateId} onChange={(e) => handleChange('templateId', e.target.value)}>
                    <option value="">暂不绑定模板</option>
                    {templateOptions.map((template) => (
                      <option key={template.id} value={String(template.id)}>{template.name}</option>
                    ))}
                  </select>
                </label>
                <p className="inline-notice" style={{ gridColumn: 'span 2' }}>数据集定义了题量，模板决定了标注界面样式。建议发布前进行完整预览。</p>
              </div>
            )}

            {createStage === 3 && (
              <div className="form-grid">
                <div className="detail-info-block" style={{ gridColumn: 'span 2' }}>
                  <span className="detail-info-label">标注分配</span>
                  <p className="detail-info-value">先到先得。发布后标注员在任务广场领取任务，无需提前指定标注员。</p>
                </div>
                <div className="detail-info-block" style={{ gridColumn: 'span 2' }}>
                  <span className="detail-info-label">审核分配</span>
                  <p className="detail-info-value">按人分配。当前版本仅支持将审核任务分配给 Reviewer。</p>
                </div>
                <div className="form-field" style={{ gridColumn: 'span 2' }}>
                  <span>分配审核员（可选）</span>
                  <p className="field-helper-text">审核阶段使用分配模式，可先跳过，后续在任务详情里补充分配。</p>
                  {reviewerOptions.length > 0 ? (
                    <div className="selection-list">
                      {reviewerOptions.map((reviewer) => (
                        <label className="selection-item" key={reviewer.id}>
                          <input
                            type="checkbox"
                            checked={createReviewerIds.includes(reviewer.id)}
                            onChange={() => toggleCreateReviewer(reviewer.id)}
                          />
                          <span>{reviewer.displayName}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="inline-notice">暂无可分配审核员。</p>
                  )}
                </div>
              </div>
            )}

            {createStage === 4 && (
              <div className="form-grid">
                <div className="form-field">
                  <span>AI Prompt 模板</span>
                  <select
                    aria-label="AI Prompt 预设"
                    value=""
                    onChange={(e) => applyCreatePromptPreset(e.target.value)}
                  >
                    <option value="">快速应用预设...</option>
                    {PROMPT_PRESETS.map((preset) => (
                      <option key={preset.name} value={preset.name}>{preset.name}</option>
                    ))}
                  </select>
                  <textarea aria-label="AI Prompt 模板" value={form.aiPromptTemplate} onChange={(e) => handleChange('aiPromptTemplate', e.target.value)} placeholder="请审查以下提交：{answers}" />
                </div>
                <label className="form-field">
                  <span>通过阈值（百分制）</span>
                  <input aria-label="通过阈值滑块" type="range" min="0" max="100" value={form.aiPassThreshold} onChange={(e) => handleChange('aiPassThreshold', e.target.value)} />
                  <input aria-label="通过阈值" type="number" min="0" max="100" value={form.aiPassThreshold} onChange={(e) => handleChange('aiPassThreshold', e.target.value)} />
                </label>
                <label className="form-field">
                  <span>AI 模型</span>
                  <select value={form.aiModel} onChange={(e) => handleChange('aiModel', e.target.value)}>
                    {AI_MODEL_OPTIONS.map((model) => (
                      <option key={model.value} value={model.value}>
                        {model.label} ({model.tag})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field"><span>审核标准说明</span><textarea value={form.reviewGuideline} onChange={(e) => handleChange('reviewGuideline', e.target.value)} /></label>
                <div className="detail-info-block" style={{ gridColumn: 'span 2' }}>
                  <span className="detail-info-label">默认评分维度</span>
                  <div className="selection-list">
                    {form.aiScoreDimensions.map((dimension) => (
                      <div className="selection-item" key={dimension.key}>
                        <strong>{dimension.label}</strong>
                        <span>{dimension.description} · 权重 {dimension.weight}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {errors.length > 0 ? (
              <ul className="error-list" style={{ marginTop: '16px' }}>
                {errors.map((error) => <li key={error}>{error}</li>)}
              </ul>
            ) : null}

            <div className="button-row modal-actions" style={{ marginTop: '24px' }}>
              {createStage > 1 ? (
                <button type="button" onClick={() => setCreateStage(s => s - 1)}>上一步</button>
              ) : (
                <button type="button" onClick={handleBackToList}>取消</button>
              )}
              
              {createStage < 4 ? (
                <button className="button-primary" type="button" onClick={async () => {
                  const currentErrors = createStage === 1 ? validateForm() : []
                  if (currentErrors.length > 0) {
                    setErrors(currentErrors)
                  } else {
                    if (createStage === 2) {
                      const loaded = await loadPeopleOptions()
                      if (!loaded) {
                        return
                      }
                    }
                    setErrors([])
                    setCreateStage(s => s + 1)
                  }
                }}>
                  下一步
                </button>
              ) : (
                <button className="button-primary" type="button" onClick={() => void handleSaveTask()} disabled={saving}>
                  {saving ? '创建中...' : '完成并创建任务'}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : loading ? (
        <article className="card">
          <p>任务列表加载中...</p>
        </article>
      ) : pageError ? (
        <article className="card">
          <p className="review-error-message">{pageError}</p>
          <button type="button" onClick={() => void loadTasks()}>
            重试
          </button>
        </article>
      ) : (
        <>
          {editingAIConfigTaskId ? (
            <AIConfigWorkspace
              taskId={editingAIConfigTaskId}
              initialConfig={{
                promptTemplate: form.aiPromptTemplate,
                passThreshold: Number(form.aiPassThreshold || DEFAULT_AI_PASS_THRESHOLD),
                reviewGuideline: form.reviewGuideline,
                scoreDimensions: (tasks.find(t => t.id === editingAIConfigTaskId)?.aiConfig?.scoreDimensions ?? []).map(d => ({
                  key: d.key,
                  label: d.label,
                  description: d.description ?? '',
                  weight: d.weight ?? 1,
                  enabled: d.enabled ?? true
                })),
                aiModel: form.aiModel,
              }}
              onSave={async (newConfig) => {
                setForm(prev => ({
                  ...prev,
                  aiPromptTemplate: newConfig.promptTemplate,
                  aiPassThreshold: String(newConfig.passThreshold),
                  reviewGuideline: newConfig.reviewGuideline,
                  aiModel: newConfig.aiModel,
                  aiScoreDimensions: newConfig.scoreDimensions,
                }))
                setSavingAIConfig(true)
                try {
                  const result = await apiPatch<
                    { taskId: number; aiConfig: NonNullable<OwnerTask['aiConfig']> },
                    NonNullable<OwnerTask['aiConfig']>
                  >(`/tasks/${editingAIConfigTaskId}/ai-config`, newConfig)
                  setTasks((current) =>
                    current.map((task) =>
                      task.id === result.taskId
                        ? {
                            ...task,
                            aiConfig: result.aiConfig,
                          }
                        : task,
                    ),
                  )
                  cancelEditAIConfig()
                } catch {
                  setPageError('AI 配置保存失败')
                } finally {
                  setSavingAIConfig(false)
                }
              }}
              onClose={cancelEditAIConfig}
            />
          ) : null}

          <TimeRangeFilter value={timeRange} onChange={setTimeRange} />

          <div className="owner-review-tabs" style={{ marginBottom: '24px' }}>
            <div className="owner-review-tab-list" style={{ display: 'flex', gap: '24px', borderBottom: '1px solid var(--color-hairline-soft)' }}>
              <button
                type="button"
                className={`owner-review-tab ${taskTab === 'unstored' ? 'is-active' : ''}`}
                style={{
                  padding: '12px 4px',
                  border: 'none',
                  background: 'none',
                  fontSize: '15px',
                  fontWeight: taskTab === 'unstored' ? 600 : 500,
                  color: taskTab === 'unstored' ? 'var(--color-primary)' : 'var(--color-steel)',
                  borderBottom: taskTab === 'unstored' ? '2px solid var(--color-primary)' : '2px solid transparent',
                  cursor: 'pointer',
                  borderRadius: 0,
                }}
                onClick={() => setTaskTab('unstored')}
              >
                未入库 ({unstoredTasks.length})
              </button>
              <button
                type="button"
                className={`owner-review-tab ${taskTab === 'stored' ? 'is-active' : ''}`}
                style={{
                  padding: '12px 4px',
                  border: 'none',
                  background: 'none',
                  fontSize: '15px',
                  fontWeight: taskTab === 'stored' ? 600 : 500,
                  color: taskTab === 'stored' ? 'var(--color-primary)' : 'var(--color-steel)',
                  borderBottom: taskTab === 'stored' ? '2px solid var(--color-primary)' : '2px solid transparent',
                  cursor: 'pointer',
                  borderRadius: 0,
                }}
                onClick={() => setTaskTab('stored')}
              >
                已入库 ({storedTasks.length})
              </button>
            </div>
          </div>

          <div className="owner-task-card-list">
            {reviewerMessage ? <p className="feedback-message">{reviewerMessage}</p> : null}
            {taskActionError ? <p className="review-error-message">{taskActionError}</p> : null}
            {currentTabTasks.length === 0 ? (
              <div className="empty-state-inline" style={{ padding: '40px', textAlign: 'center' }}>
                <p>{taskTab === 'unstored' ? '当前没有进行中的任务。' : '当前没有已入库的任务。'}</p>
              </div>
            ) : (
              currentTabTasks.map((task: OwnerTask, idx: number) => {
                const isEnded = task.status === 'ended'
                const readyForStorage = isTaskReadyForStorage(task)
                const canUnbindDataset = task.status === 'paused' && !readyForStorage && Boolean(task.datasetId)
                const statusText = getTaskStatusText(task)
                const itemCount = task.itemCount ?? 0
                const progressPct = itemCount > 0 ? Math.round(((task.completedItemCount ?? 0) / itemCount) * 100) : 0

              return (
                <article
                  className="card owner-task-card"
                  key={task.id}
                  data-testid={`owner-task-card-${task.id}`}
                  style={{ animationDelay: `${idx * 60}ms` }}
                >
                  <div className="owner-task-card__hero">
                    <div>
                      <div className="task-card-badge-row">
                        <span className={`status-badge status-task-${task.status}`}>{statusText}</span>
                        {task.taskTags && task.taskTags.length > 0 ? (
                          <div className="owner-task-card__tags">
                            {task.taskTags.map((tag: string) => (
                              <span key={tag} className="tag-pill">{tag}</span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <h3>{task.title}</h3>
                    </div>
                    <Link className="button button-primary" to={`/owner/tasks/${task.id}`}>
                      查看详情
                    </Link>
                  </div>

                  <div className="owner-task-card__numbers">
                    <div className="owner-task-num">
                      <strong>{task.itemCount ?? 0}</strong>
                      <span>题量</span>
                    </div>
                    <div className="owner-task-num">
                      <strong>{task.completedItemCount ?? 0}</strong>
                      <span>已完成</span>
                    </div>
                    <div className="owner-task-num owner-task-num--pass">
                      <strong>{task.passedItemCount ?? 0}</strong>
                      <span>已通过</span>
                    </div>
                    <div className="owner-task-num owner-task-num--pending">
                      <strong>{task.pendingReviewCount ?? 0}</strong>
                      <span>待审核</span>
                    </div>
                    <div className="owner-task-num">
                      <strong>{task.quota}</strong>
                      <span>配额</span>
                    </div>
                    <div className="owner-task-num">
                      <strong>{task.passRate ?? 0}%</strong>
                      <span>通过率</span>
                    </div>
                  </div>

                  <div className="owner-task-progress" aria-hidden="true">
                    <div className="owner-task-progress-track">
                      <div className="owner-task-progress-fill" style={{ width: `${progressPct}%` }} />
                    </div>
                    <span className="owner-task-progress-label">{progressPct}%</span>
                  </div>

                  <div className="owner-task-card__resources">
                    <span className={`owner-task-resource-chip${task.datasetId ? '' : ' owner-task-resource-chip--missing'}`}>
                      {task.datasetId ? `数据集 #${task.datasetId}` : '未绑定数据集'}
                    </span>
                    <span className={`owner-task-resource-chip${task.templateId ? '' : ' owner-task-resource-chip--missing'}`}>
                      {task.templateId ? `模板 #${task.templateId}` : '未绑定模板'}
                    </span>
                    {task.reviewers && task.reviewers.length > 0 ? (
                      <span className="owner-task-resource-chip">审核员：{task.reviewers.map((r: TaskReviewerState) => r.displayName).join('、')}</span>
                    ) : null}
                    <span className="owner-task-resource-chip">标注分配：先到先得</span>
                    <span className="owner-task-resource-chip">截止：{task.deadline}</span>
                  </div>

                  <div className="owner-task-card__actions">
                    <div className="button-row">
                      {!isEnded ? (
                        <button
                          type="button"
                          disabled={task.status === 'published' || readyForStorage || updatingTaskId === task.id}
                          onClick={() => void handleUpdateStatus(task.id, 'published')}
                        >
                          {updatingTaskId === task.id && task.status !== 'published' ? '发布中...' : '发布'}
                        </button>
                      ) : null}
                      {!isEnded ? (
                        <button
                          type="button"
                          disabled={task.status !== 'published' || readyForStorage || updatingTaskId === task.id}
                          onClick={() => void handleUpdateStatus(task.id, 'paused')}
                        >
                          {updatingTaskId === task.id && task.status === 'published' ? '暂停中...' : '暂停'}
                        </button>
                      ) : null}
                      {!isEnded ? (
                        <button
                          type="button"
                          disabled={updatingTaskId === task.id}
                          onClick={() => void handleUpdateStatus(task.id, 'ended')}
                        >
                          {updatingTaskId === task.id ? (readyForStorage ? '入库中...' : '结束中...') : (readyForStorage ? '入库' : '结束')}
                        </button>
                      ) : null}
                      {isEnded ? (
                        <Link className="button" to={`/owner/tasks/${task.id}/analytics`}>
                          查看审核进度
                        </Link>
                      ) : null}
                      {isEnded ? (
                        <Link className="button" to={`/owner/exports?taskId=${task.id}`}>
                          前往导出
                        </Link>
                      ) : null}
                    </div>
                    <div className="button-row">
                      {canUnbindDataset ? (
                        <button
                          type="button"
                          disabled={unbindingTaskId === task.id}
                          onClick={() => setUnbindTarget(task)}
                        >
                          {unbindingTaskId === task.id ? '解绑中...' : '解绑数据集'}
                        </button>
                      ) : null}
                      <button type="button" onClick={(event) => { event.preventDefault(); setDeleteTarget(task) }} aria-label={`删除任务 ${task.title}`}>
                        删除
                      </button>
                    </div>
                  </div>
                </article>
              )
            })
          )}
        </div>

          {previewTask ? (
            <article className="card empty-state-card">
              <h3>数据集题目预览</h3>
              <p>{previewTask.title}</p>
              {previewLoading ? (
                <p>题目加载中...</p>
              ) : (
                previewItems.map((item) => (
                  <p key={item.id}>{`item-${String(item.sequence).padStart(3, '0')}`}</p>
                ))
              )}
              <button type="button" onClick={() => setPreviewTask(null)}>
                关闭预览
              </button>
            </article>
          ) : null}
        </>
      )}

      {unbindTarget ? (
        <div className="modal-overlay" onClick={(event) => {
          if (event.target === event.currentTarget && unbindingTaskId !== unbindTarget.id) {
            setUnbindTarget(null)
            setUnbindError('')
          }
        }}>
          <div className="modal-content">
            <h3>确认解绑数据集</h3>
            <p>{`确定要从任务“${unbindTarget.title}”中解绑当前数据集吗？`}</p>
            {unbindError ? <p className="review-error-message">{unbindError}</p> : null}
            <div className="button-row">
              <button type="button" onClick={() => void confirmUnbindDataset()} disabled={unbindingTaskId === unbindTarget.id}>
                {unbindingTaskId === unbindTarget.id ? '解绑中...' : '确认解绑'}
              </button>
              <button type="button" onClick={() => { setUnbindTarget(null); setUnbindError('') }} disabled={unbindingTaskId === unbindTarget.id}>
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setDeleteTarget(null); setDeleteError(''); } }}>
          <div className="modal-content">
            <h3>确定删除</h3>
            <p>{`确定要删除任务 “${deleteTarget.title}” 吗？`}</p>
            {deleteError ? <p className="review-error-message">{deleteError}</p> : null}
            <div className="button-row">
              <button type="button" onClick={(e) => { e.preventDefault(); void confirmDeleteTask(); }}>
                确认删除
              </button>
              <button type="button" onClick={(e) => { e.preventDefault(); setDeleteTarget(null); setDeleteError(''); }}>
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
