import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiGet, apiPatch, apiPost, ApiError } from '../../../services/api/client'
import { listDatasetItems } from '../../../services/api/datasets'
import type { OwnerTask } from '../../../types/domain'
import { parseAppDate } from '../../../utils/time'
import { AIConfigWorkspace, type AIConfig } from './AIConfigWorkspace'
import { AI_MODEL_OPTIONS, DEFAULT_AI_MODEL } from './aiModelOptions'
import { DeadlinePicker } from './DeadlinePicker'

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

type ReviewerOption = {
  id: number
  username: string
  displayName: string
  role: 'reviewer'
}

type OwnerTaskDetail = OwnerTask & {
  activeTemplateVersionId?: number | null
  activeTemplateVersionNumber?: number | null
  latestTemplateVersionId?: number | null
  latestTemplateVersionNumber?: number | null
  templateName?: string | null
  datasetName?: string | null
  createdAt?: string
  updatedAt?: string
}

type TaskDetailResponse = {
  id: number
  title: string
  description: string
  taskBrief?: string
  taskTags?: string[]
  rewardRule?: string
  status: OwnerTask['status']
  quota: number
  deadline: string | null
  templateId?: number | null
  templateName?: string | null
  datasetId?: number | null
  datasetName?: string | null
  itemCount?: number
  completedItemCount?: number
  passedItemCount?: number
  pendingReviewCount?: number
  passRate?: number
  labelers?: TaskLabelerState[]
  reviewers?: TaskReviewerState[]
  aiConfig?: OwnerTask['aiConfig']
  activeTemplateVersionId?: number | null
  activeTemplateVersionNumber?: number | null
  latestTemplateVersionId?: number | null
  latestTemplateVersionNumber?: number | null
  createdAt?: string
  updatedAt?: string
}
type DatasetItemPreview = {
  id: number
  sequence: number
  source: Record<string, unknown>
}

function formatTask(task: TaskDetailResponse): OwnerTaskDetail {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    taskBrief: task.taskBrief ?? '',
    taskTags: task.taskTags ?? [],
    rewardRule: task.rewardRule ?? '',
    status: task.status,
    quota: task.quota,
    deadline: task.deadline ?? '未设置',
    templateId: task.templateId ?? null,
    datasetId: task.datasetId ?? null,
    itemCount: task.itemCount ?? 0,
    completedItemCount: task.completedItemCount ?? 0,
    passedItemCount: task.passedItemCount ?? 0,
    pendingReviewCount: task.pendingReviewCount ?? 0,
    passRate: task.passRate ?? 0,
    labelers: task.labelers ?? [],
    reviewers: task.reviewers ?? [],
    aiConfig: task.aiConfig,
    activeTemplateVersionId: task.activeTemplateVersionId ?? null,
    activeTemplateVersionNumber: task.activeTemplateVersionNumber ?? null,
    latestTemplateVersionId: task.latestTemplateVersionId ?? null,
    latestTemplateVersionNumber: task.latestTemplateVersionNumber ?? null,
    templateName: task.templateName ?? null,
    datasetName: task.datasetName ?? null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  }
}

function isTaskReadyForStorage(task: Pick<OwnerTask, 'itemCount' | 'passedItemCount' | 'pendingReviewCount'>) {
  const itemCount = task.itemCount ?? 0
  return itemCount > 0 && (task.passedItemCount ?? 0) >= itemCount && (task.pendingReviewCount ?? 0) === 0
}

function formatTaskStatus(task: Pick<OwnerTask, 'status' | 'itemCount' | 'passedItemCount' | 'pendingReviewCount'>) {
  if (task.status === 'ended') return '已入库'
  if (isTaskReadyForStorage(task)) return '已完成'
  if (task.status === 'draft') return '草稿'
  if (task.status === 'published') return '进行中'
  if (task.status === 'paused') return '已暂停'
  return task.status
}

function formatAIModelLabel(modelValue?: string) {
  const normalizedValue = modelValue ?? DEFAULT_AI_MODEL

  return AI_MODEL_OPTIONS.find((option) => option.value === normalizedValue)?.label ?? normalizedValue
}

export function OwnerTaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>()
  const [task, setTask] = useState<OwnerTaskDetail | null>(null)
  const [previewItems, setPreviewItems] = useState<DatasetItemPreview[]>([])
  const [previewIndex, setPreviewIndex] = useState(0)
  const [reviewerOptions, setReviewerOptions] = useState<ReviewerOption[]>([])
  const [selectedReviewerIds, setSelectedReviewerIds] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [reviewerLoading, setReviewerLoading] = useState(false)
  const [savingReviewer, setSavingReviewer] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [labelerMessage, setLabelerMessage] = useState('')
  const [labelerError, setLabelerError] = useState('')
  const [reviewerMessage, setReviewerMessage] = useState('')
  const [reviewerError, setReviewerError] = useState('')
  const [templateMessage, setTemplateMessage] = useState('')
  const [templateError, setTemplateError] = useState('')
  const [refreshingTemplate, setRefreshingTemplate] = useState(false)

  // Modal states
  const [showEditTask, setShowEditTask] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [showAIConfig, setShowAIConfig] = useState(false)
  const [showLabelers, setShowLabelers] = useState(false)
  const [showReviewers, setShowReviewers] = useState(false)
  const [showPublishChecklist, setShowPublishChecklist] = useState(false)

  // Edit task form
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editBrief, setEditBrief] = useState('')
  const [editTags, setEditTags] = useState('')
  const [editQuota, setEditQuota] = useState<number>(0)
  const [editDeadline, setEditDeadline] = useState('')
  const [editDatasetId, setEditDatasetId] = useState<number | null>(null)
  const [editTemplateId, setEditTemplateId] = useState<number | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [datasetOptions, setDatasetOptions] = useState<{ id: number, name: string }[]>([])
  const [templateOptions, setTemplateOptions] = useState<{ id: number, name: string }[]>([])
  const [savingAI, setSavingAI] = useState(false)

  const enabledScoreDimensions = useMemo(
    () =>
      (task?.aiConfig?.scoreDimensions ?? []).filter(
        (dimension) => dimension.enabled !== false && dimension.label.trim().length > 0,
      ),
    [task?.aiConfig?.scoreDimensions],
  )

  useEffect(() => {
    if (!taskId) {
      setLoading(false)
      setPageError('缺少任务 ID，无法加载详情。')
      return
    }
    void loadTaskDetail(taskId)
  }, [taskId])

  async function loadTaskDetail(nextTaskId: string) {
    setLoading(true)
    setPageError('')
    try {
      const result = await apiGet<TaskDetailResponse>(`/tasks/${nextTaskId}`)
      const formattedTask = formatTask(result)
      setTask(formattedTask)
      setSelectedReviewerIds(formattedTask.reviewers?.map((item) => item.reviewerId) ?? [])
    } catch {
      setPageError('任务详情加载失败，请稍后重试。')
    } finally {
      setLoading(false)
    }
  }

  async function openPreview() {
    if (!task?.datasetId) return
    setShowPreview(true)
    setPreviewLoading(true)
    try {
      const result = await listDatasetItems(task.datasetId)
      setPreviewItems(result.items)
      setPreviewIndex(0)
    } catch {
      setPageError('数据集题目预览加载失败，请稍后重试。')
    } finally {
      setPreviewLoading(false)
    }
  }

  async function loadReviewerOptions() {
    if (reviewerOptions.length > 0) {
      setReviewerError('')
      return
    }
    setReviewerLoading(true)
    setReviewerError('')
    try {
      const result = await apiGet<{ items: ReviewerOption[] }>('/users/reviewers')
      setReviewerOptions(result.items)
    } catch {
      setReviewerError('审核员列表加载失败，请稍后重试。')
    } finally {
      setReviewerLoading(false)
    }
  }

  function toggleReviewer(reviewerId: number) {
    setSelectedReviewerIds((current) =>
      current.includes(reviewerId) ? current.filter((item) => item !== reviewerId) : [...current, reviewerId],
    )
  }

  async function saveReviewers() {
    if (!task) return
    setSavingReviewer(true)
    setReviewerMessage('')
    setReviewerError('')
    try {
      await apiPost(`/tasks/${task.id}/reviewers`, { reviewerIds: selectedReviewerIds })
      const nextReviewers = reviewerOptions.filter((item) => selectedReviewerIds.includes(item.id)).map((item) => ({
        reviewerId: item.id, username: item.username, displayName: item.displayName,
      }))
      setTask((current) => (current ? { ...current, reviewers: nextReviewers } : current))
      setReviewerMessage('审核分配已更新。')
      setShowReviewers(false)
    } catch {
      setReviewerError('审核分配保存失败，请稍后重试。')
    } finally {
      setSavingReviewer(false)
    }
  }

  async function updateStatus(nextStatus: OwnerTask['status']) {
    if (!task) return
    setUpdatingStatus(true)
    setPageError('')
    try {
      const result = await apiPatch<TaskDetailResponse, { status: OwnerTask['status'] }>(`/tasks/${task.id}/status`, { status: nextStatus })
      setTask((current) => (current ? formatTask(result) : current))
    } catch (e: unknown) {
      if (import.meta.env.DEV) console.debug('update task status error:', e)
      if (e instanceof ApiError) {
        setPageError(e.detail || '任务状态更新失败，请稍后重试。')
      } else {
        setPageError('任务状态更新失败，请稍后重试。')
      }
    } finally {
      setUpdatingStatus(false)
    }
  }

  async function openEditTask() {
    if (!task) return
    setEditTitle(task.title)
    setEditDescription(task.description)
    setEditBrief(task.taskBrief ?? '')
    setEditTags((task.taskTags ?? []).join(','))
    setEditQuota(task.quota)
    setEditDeadline(task.deadline ?? '')
    setEditDatasetId(task.datasetId ?? null)
    setEditTemplateId(task.templateId ?? null)
    setShowEditTask(true)

    // 加载数据集和模板选项
    try {
      const [dsRes, tplRes] = await Promise.all([
        apiGet<{ items: { id: number, name: string }[] }>('/datasets'),
        apiGet<{ items: { id: number, name: string }[] }>('/templates'),
      ])
      setDatasetOptions(dsRes.items)
      setTemplateOptions(tplRes.items)
    } catch {
      // 加载失败不阻塞编辑
    }
  }

  async function saveEditTask() {
    if (!task) return
    setSavingEdit(true)
    try {
      const body = {
        title: editTitle,
        description: editDescription,
        taskBrief: editBrief,
        taskTags: editTags.split(',').map((t) => t.trim()).filter(Boolean),
        quota: editQuota,
        deadline: editDeadline || null,
        datasetId: editDatasetId,
        templateId: editTemplateId,
      }
      const result = await apiPatch<{ task: TaskDetailResponse }, typeof body>(`/tasks/${task.id}`, body)
      setTask(formatTask(result.task))
      setShowEditTask(false)
    } catch {
      setPageError('修改任务失败，请稍后重试。')
    } finally {
      setSavingEdit(false)
    }
  }

  async function refreshTemplateVersion() {
    if (!task?.templateId) return
    setRefreshingTemplate(true)
    setTemplateMessage('')
    setTemplateError('')
    try {
      const result = await apiPost<{ task: TaskDetailResponse }, Record<string, never>>(
        `/tasks/${task.id}/template-version/refresh`,
        {},
      )
      const nextTask = formatTask(result.task)
      setTask(nextTask)
      const versionLabel = nextTask.activeTemplateVersionNumber ?? nextTask.activeTemplateVersionId
      setTemplateMessage(versionLabel ? `已更新到模板 v${versionLabel}。` : '模板已更新。')
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        setTemplateError(e.detail || '模板更新失败，请稍后重试。')
      } else {
        setTemplateError('模板更新失败，请稍后重试。')
      }
    } finally {
      setRefreshingTemplate(false)
    }
  }

  async function saveAIConfig(newConfig: AIConfig) {
    if (!task) return
    setSavingAI(true)
    try {
      await apiPatch(`/tasks/${task.id}/ai-config`, newConfig)
      setTask((current) => current ? {
        ...current,
        aiConfig: newConfig,
      } : current)
      setShowAIConfig(false)
    } catch {
      setPageError('AI 配置保存失败，请稍后重试。')
    } finally {
      setSavingAI(false)
    }
  }

  const progressPercent = useMemo(() => {
    if (!task || !task.itemCount) return 0
    return Math.round(((task.completedItemCount ?? 0) / task.itemCount) * 100)
  }, [task])

  const readyForStorage = task ? isTaskReadyForStorage(task) : false

  if (loading) {
    return (
      <section>
        <header className="page-header"><div><h2>任务详情</h2></div></header>
        <article className="empty-state-card"><h3>任务详情加载中</h3></article>
      </section>
    )
  }

  if (pageError || !task) {
    return (
      <section>
        <header className="page-header">
          <div><h2>任务详情</h2></div>
          <Link className="button" to="/owner/tasks">返回任务列表</Link>
        </header>
        <article className="empty-state-card empty-state-card-error">
          <h3>暂时无法打开任务详情</h3>
          <p className="review-error-message">{pageError || '当前任务不存在或你没有权限查看。'}</p>
          <button className="button button-primary" type="button" onClick={() => taskId && void loadTaskDetail(taskId)}>重试</button>
        </article>
      </section>
    )
  }

  const hasDatasetReady = Boolean(task.datasetId && (task.itemCount ?? 0) > 0)
  const hasTemplateReady = Boolean(task.templateId && task.activeTemplateVersionId)
  const canPublishTask = hasDatasetReady && hasTemplateReady
  const currentTemplateVersionLabel = task.activeTemplateVersionNumber ?? task.activeTemplateVersionId
  const latestTemplateVersionLabel = task.latestTemplateVersionNumber ?? task.latestTemplateVersionId
  const hasNewerTemplateVersion = Boolean(
    task.activeTemplateVersionId &&
      task.latestTemplateVersionId &&
      task.activeTemplateVersionId !== task.latestTemplateVersionId,
  )

  return (
    <section className="task-detail-page owner-task-detail-page">
      <header className="page-hero page-hero-light">
        <div>
          <span className="page-eyebrow">任务详情</span>
          <h2>{task.title}</h2>
        </div>
        <div className="button-row">
          <Link className="button" to="/owner/tasks">返回列表</Link>
          <button className="button button-primary" type="button" onClick={() => openEditTask()}>修改任务</button>
        </div>
      </header>

      <div className="stat-grid" style={{ marginBottom: '32px' }}>
        <article className="stat-card stat-card-tint-sky">
          <span className="stat-card-label">运行状态</span>
          <strong className="stat-card-value">{formatTaskStatus(task)}</strong>
          <p>当前任务的生命周期阶段</p>
        </article>
        <article className="stat-card stat-card-tint-lavender">
          <span className="stat-card-label">已触达题量</span>
          <strong className="stat-card-value">{task.completedItemCount ?? 0}</strong>
          <p>{`总计 ${task.itemCount ?? 0} 题 (${progressPercent}%)`}</p>
        </article>
        <article className="stat-card stat-card-tint-peach">
          <span className="stat-card-label">待审核积压</span>
          <strong className="stat-card-value">{task.pendingReviewCount ?? 0}</strong>
          <p>需要 Reviewer 介入处理的条目</p>
        </article>
        <article className="stat-card stat-card-tint-mint">
          <span className="stat-card-label">质量通过率</span>
          <strong className="stat-card-value">{task.passRate ?? 0}%</strong>
          <p>{`已通过 ${task.passedItemCount ?? 0} 题`}</p>
        </article>
      </div>

      <div className="owner-task-detail-grid" style={{ gap: '24px', alignItems: 'start' }}>
        <div className="owner-task-detail-main">
          <article className="card detail-main-card owner-task-detail-card">
            <div className="designer-section-header" style={{ marginBottom: '24px' }}>
              <div>
                <span className="section-eyebrow">Task breakdown</span>
                <h3>任务执行情况</h3>
              </div>
              <div className="button-row">
                <a className="button button-sm" href={`/owner/tasks/${task.id}/analytics`}>详细数据分析</a>
              </div>
            </div>

            <div className="detail-numbers" style={{ marginBottom: '32px' }}>
              <div className="detail-number">
                <strong>{task.itemCount ?? 0}</strong>
                <span>总题量</span>
              </div>
              <div className="detail-number">
                <strong>{task.completedItemCount ?? 0}</strong>
                <span>已提交</span>
              </div>
              <div className="detail-number detail-number--pass">
                <strong>{task.passedItemCount ?? 0}</strong>
                <span>已通过</span>
              </div>
              <div className="detail-number detail-number--pending">
                <strong>{task.pendingReviewCount ?? 0}</strong>
                <span>待审核</span>
              </div>
              <div className="detail-number">
                <strong>{task.passRate ?? 0}%</strong>
                <span>通过率</span>
              </div>
            </div>

            <div className="task-card-progress owner-task-detail-progress">
              <div className="task-card-progress-track">
                <div className="task-card-progress-fill" style={{ width: `${progressPercent}%`, height: '8px' }} />
              </div>
              <span className="task-card-progress-label" style={{ fontWeight: 600 }}>{progressPercent}%</span>
            </div>
            <p className="field-helper-text">整体完成进度按已提交题目数计算。</p>
          </article>

          <article className="card detail-main-card owner-task-detail-card">
            <div className="designer-section-header" style={{ marginBottom: '20px' }}>
              <div>
                <span className="section-eyebrow">Content & Resources</span>
                <h3>任务描述与资源</h3>
              </div>
            </div>

            <div className="detail-section">
              {task.description ? <p className="detail-desc" style={{ fontSize: '15px', lineHeight: 1.6, color: '#37352f', marginBottom: '20px' }}>{task.description}</p> : null}
              
              <div className="owner-task-detail-section-grid">
                <div className="detail-info-block">
                  <span className="detail-info-label">关联数据集</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    <strong style={{ fontSize: '14px' }}>{task.datasetName ?? 'N/A'}</strong>
                    <span className="badge-tag-gray">#{task.datasetId}</span>
                  </div>
                </div>
                <div className="detail-info-block">
                  <span className="detail-info-label">关联模板</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '14px' }}>{task.templateName ?? 'N/A'}</strong>
                    {currentTemplateVersionLabel ? <span className="badge-tag-gray">v{currentTemplateVersionLabel}</span> : null}
                    {hasNewerTemplateVersion && latestTemplateVersionLabel ? <span className="badge-tag-gray">最新 v{latestTemplateVersionLabel}</span> : null}
                    {task.templateId ? (
                      <button
                        className="button-sm"
                        type="button"
                        onClick={() => void refreshTemplateVersion()}
                        disabled={refreshingTemplate}
                        style={{ padding: '4px 10px' }}
                      >
                        {refreshingTemplate ? '更新中...' : '更新模板'}
                      </button>
                    ) : null}
                  </div>
                  {templateMessage ? <p className="feedback-message" style={{ margin: '8px 0 0' }}>{templateMessage}</p> : null}
                  {templateError ? <p className="review-error-message" style={{ margin: '8px 0 0' }}>{templateError}</p> : null}
                </div>
              </div>

              {task.taskBrief ? (
                <div className="detail-info-block" style={{ marginBottom: '20px' }}>
                  <span className="detail-info-label">任务详细说明</span>
                  <p className="detail-info-value" style={{ marginTop: '4px', background: '#f6f5f4', padding: '12px', borderRadius: '8px', fontSize: '14px' }}>{task.taskBrief}</p>
                </div>
              ) : null}

              {task.taskTags && task.taskTags.length > 0 ? (
                <div className="detail-info-block">
                  <span className="detail-info-label">任务标签</span>
                  <div className="detail-tag-row" style={{ marginTop: '8px' }}>
                    {task.taskTags.map((tag) => <span key={tag} className="tag-pill" style={{ background: '#e6e0f5', color: '#5645d4' }}>{tag}</span>)}
                  </div>
                </div>
              ) : null}
            </div>
          </article>

          <article className="card detail-main-card owner-task-detail-card">
            <div className="designer-section-header" style={{ marginBottom: '20px' }}>
              <div>
                <span className="section-eyebrow">AI & Quality Control</span>
                <h3>AI 预审与质量配置</h3>
              </div>
              <div className="button-row">
                <button className="button button-sm" type="button" onClick={() => setShowAIConfig(true)}>编辑配置</button>
              </div>
            </div>

            <div className="detail-section">
              <div className="owner-task-detail-section-grid">
                <div className="detail-info-block">
                  <span className="detail-info-label">AI 预审状态</span>
                  <strong style={{ display: 'block', marginTop: '4px', color: task.aiConfig?.promptTemplate ? '#1aae39' : '#a4a097' }}>
                    {task.aiConfig?.promptTemplate ? '● 已启用' : '○ 未启用'}
                  </strong>
                </div>
                <div className="detail-info-block">
                  <span className="detail-info-label">自动通过阈值</span>
                  <strong style={{ display: 'block', marginTop: '4px' }}>{task.aiConfig?.passThreshold != null ? `${task.aiConfig.passThreshold} 分` : '未设置'}</strong>
                </div>
              </div>

              {task.aiConfig ? (
                <div className="detail-info-block" style={{ marginBottom: '20px' }}>
                  <div className="owner-task-detail-section-grid">
                    <div className="detail-info-block">
                      <span className="detail-info-label">评分维度</span>
                      {enabledScoreDimensions.length > 0 ? (
                        <div className="detail-tag-row" style={{ marginTop: '8px' }}>
                          {enabledScoreDimensions.map((dimension) => (
                            <span key={dimension.key} className="tag-pill" style={{ background: '#e8f0fe', color: '#1d4ed8' }}>
                              {dimension.label}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="detail-info-value detail-info-value--muted" style={{ marginTop: '8px' }}>
                          未配置评分维度
                        </p>
                      )}
                    </div>
                    <div className="detail-info-block">
                      <span className="detail-info-label">当前模型</span>
                      <strong style={{ display: 'block', marginTop: '4px' }}>
                        {formatAIModelLabel(task.aiConfig.aiModel ?? DEFAULT_AI_MODEL)}
                      </strong>
                    </div>
                  </div>
                </div>
              ) : null}

              {task.aiConfig?.reviewGuideline ? (
                <div className="detail-info-block">
                  <span className="detail-info-label">人工审核标准</span>
                  <p className="detail-info-value" style={{ marginTop: '8px', fontSize: '14px', borderLeft: '3px solid #5645d4', paddingLeft: '12px' }}>{task.aiConfig.reviewGuideline}</p>
                </div>
              ) : null}
            </div>
          </article>
        </div>

        <div className="owner-task-detail-sidebar">
          <article className="card owner-task-detail-sidebar-card">
            <h4 className="owner-task-detail-sidebar-title">管理控制台</h4>
            <div className="owner-task-detail-action-stack">
              {task.status === 'draft' ? (
                <button className="button button-primary" style={{ justifyContent: 'center' }} type="button" disabled={updatingStatus} onClick={() => setShowPublishChecklist(true)}>
                  发布任务
                </button>
              ) : null}
              {task.status === 'published' ? (
                <button className="button" style={{ justifyContent: 'center', color: 'var(--color-warning)' }} type="button" disabled={updatingStatus || readyForStorage} onClick={() => void updateStatus('paused')}>
                  {updatingStatus ? '暂停中...' : '暂停任务'}
                </button>
              ) : null}
              {task.status === 'paused' ? (
                <button className="button button-primary" style={{ justifyContent: 'center' }} type="button" disabled={updatingStatus || readyForStorage} onClick={() => void updateStatus('published')}>
                  恢复发布
                </button>
              ) : null}
              <button className="button" style={{ justifyContent: 'center' }} type="button" onClick={() => openEditTask()}>修改基本信息</button>
              <button className="button" style={{ justifyContent: 'center' }} type="button" onClick={() => openPreview()}>预览数据集题目</button>
              <Link className="button" style={{ justifyContent: 'center' }} to={`/owner/exports?taskId=${task.id}`}>数据导出</Link>
              {task.status !== 'ended' ? (
                <button
                  className="button"
                  style={{ justifyContent: 'center', color: '#dc2626' }}
                  type="button"
                  disabled={updatingStatus}
                  onClick={() => {
                    const confirmed = window.confirm(
                      readyForStorage
                        ? '确定要将任务入库吗？入库后任务会进入已入库分栏，并保留导出入口。'
                        : '确定要结束任务吗？结束后标注员将无法再提交。',
                    )
                    if (confirmed) {
                      void updateStatus('ended')
                    }
                  }}
                >
                  {updatingStatus ? (readyForStorage ? '入库中...' : '结束中...') : (readyForStorage ? '入库' : '结束任务')}
                </button>
              ) : null}
            </div>
          </article>

          <article className="card owner-task-detail-sidebar-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h4 className="owner-task-detail-sidebar-title" style={{ margin: 0 }}>审核团队</h4>
              <button className="button-sm" type="button" onClick={() => { setShowReviewers(true); void loadReviewerOptions() }}>分配</button>
            </div>
            {task.reviewers && task.reviewers.length > 0 ? (
              <div className="owner-task-detail-reviewer-list">
                {task.reviewers.map((r) => (
                  <div key={r.reviewerId} className="owner-task-detail-reviewer-item">
                    <div className="owner-task-detail-reviewer-avatar">
                      {r.displayName.charAt(0)}
                    </div>
                    <span style={{ fontSize: '14px', color: '#1a1a1a' }}>{r.displayName}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: '13px', color: '#a4a097', textAlign: 'center', margin: '10px 0' }}>暂未分配审核员</p>
            )}
          </article>

          <article className="card owner-task-detail-sidebar-card">
            <h4 className="owner-task-detail-sidebar-title">时间配额</h4>
            <div className="owner-task-detail-meta-list">
              <div className="owner-task-detail-meta-row">
                <span style={{ color: '#787671' }}>发放配额</span>
                <strong style={{ color: '#1a1a1a' }}>{task.quota}</strong>
              </div>
              <div className="owner-task-detail-meta-row">
                <span style={{ color: '#787671' }}>截止日期</span>
                <strong style={{ color: '#1a1a1a' }}>{task.deadline}</strong>
              </div>
              <div className="owner-task-detail-meta-row">
                <span style={{ color: '#787671' }}>创建于</span>
                <strong style={{ color: '#a4a097' }}>{task.createdAt ? (parseAppDate(task.createdAt)?.toLocaleDateString() ?? task.createdAt) : '-'}</strong>
              </div>
            </div>
          </article>
        </div>
      </div>


      {/* ── Edit Task Modal ── */}
      {showEditTask ? (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowEditTask(false) }}>
          <div className="modal-card">
            <h3>修改任务</h3>
            <div className="form-grid">
              <label className="form-field"><span>任务标题</span><input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} /></label>
              <label className="form-field"><span>任务描述</span><textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={2} /></label>
              <label className="form-field"><span>任务说明</span><textarea value={editBrief} onChange={(e) => setEditBrief(e.target.value)} rows={2} /></label>
              <label className="form-field"><span>标签（逗号分隔）</span><input value={editTags} onChange={(e) => setEditTags(e.target.value)} /></label>
              <label className="form-field"><span>配额</span><input type="number" value={editQuota} onChange={(e) => setEditQuota(Number(e.target.value))} /></label>
              <label className="form-field">
                <span>截止时间</span>
                <DeadlinePicker value={editDeadline} onChange={setEditDeadline} />
                <p className="field-helper-text">按年月日时分滚动调整，保存后用于发布和任务广场展示。</p>
              </label>
              <label className="form-field">
                <span>绑定数据集</span>
                <select value={editDatasetId ?? ''} onChange={(e) => setEditDatasetId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">不绑定</option>
                  {datasetOptions.map((ds) => <option key={ds.id} value={ds.id}>{ds.name} (#{ds.id})</option>)}
                </select>
              </label>
              <label className="form-field">
                <span>绑定模板</span>
                <select value={editTemplateId ?? ''} onChange={(e) => setEditTemplateId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">不绑定</option>
                  {templateOptions.map((tpl) => <option key={tpl.id} value={tpl.id}>{tpl.name} (#{tpl.id})</option>)}
                </select>
              </label>
            </div>
            <div className="button-row modal-actions">
              <button className="button button-primary" type="button" onClick={() => void saveEditTask()} disabled={savingEdit}>{savingEdit ? '保存中...' : '保存'}</button>
              <button className="button" type="button" onClick={() => setShowEditTask(false)} disabled={savingEdit}>取消</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── AI Config Workspace ── */}
      {showAIConfig && task ? (
        <AIConfigWorkspace
          taskId={task.id}
          initialConfig={{
            promptTemplate: task.aiConfig?.promptTemplate ?? '',
            passThreshold: task.aiConfig?.passThreshold ?? 80,
            reviewGuideline: task.aiConfig?.reviewGuideline ?? '',
            scoreDimensions: (task.aiConfig?.scoreDimensions ?? []).map(d => ({
              key: d.key,
              label: d.label,
              description: d.description ?? '',
              weight: d.weight ?? 1,
              enabled: d.enabled ?? true
            })),
            aiModel: task.aiConfig?.aiModel ?? DEFAULT_AI_MODEL,
          }}
          onSave={saveAIConfig}
          onClose={() => setShowAIConfig(false)}
        />
      ) : null}

      {/* ── Preview Modal ── */}
      {showPreview ? (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowPreview(false) }}>
          <div className="modal-card modal-card-wide">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ marginBottom: '0.25rem' }}>数据集抽样预览</h3>
                <p className="field-helper-text">快速确认题面字段与数据质量，支持通过下拉框切换样本。</p>
              </div>
              {task.datasetId ? (
                <a className="button" href={`/owner/datasets`} target="_blank" rel="noreferrer">前往数据集管理</a>
              ) : null}
            </div>

            {previewLoading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>加载抽样数据中...</div>
            ) : previewItems.length > 0 ? (
              <>
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', backgroundColor: '#f9fafb', padding: '1rem', borderRadius: '6px' }}>
                  <div style={{ flex: 1 }}>
                    <span className="detail-info-label">总体统计</span>
                    <p style={{ marginTop: '0.25rem', fontSize: '1.25rem', fontWeight: 600 }}>{task.itemCount ?? 0} <span style={{ fontSize: '0.875rem', fontWeight: 'normal', color: '#6b7280' }}>条样本</span></p>
                  </div>
                  <div style={{ flex: 2 }}>
                    <span className="detail-info-label">抽样字段发现 ({previewItems.length} 条)</span>
                    <p style={{ marginTop: '0.25rem', fontSize: '0.875rem', color: '#374151' }}>
                      {Array.from(new Set(previewItems.flatMap((item) => Object.keys(item.source ?? {})))).join(', ') || '暂无字段'}
                    </p>
                  </div>
                  <div style={{ flex: 1 }}>
                    <span className="detail-info-label">当前查看</span>
                    <select 
                      style={{ width: '100%', marginTop: '0.25rem', padding: '0.25rem' }} 
                      value={previewIndex} 
                      onChange={(e) => setPreviewIndex(Number(e.target.value))}
                    >
                      {previewItems.map((item, idx) => (
                        <option key={item.id} value={idx}>第 {item.sequence} 题 (ID: {item.id})</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="property-list compact-list" style={{ maxHeight: '400px', overflowY: 'auto', backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '6px' }}>
                  {Object.entries(previewItems[previewIndex]?.source ?? {}).map(([key, value]) => (
                    <div key={key} className="selection-item dataset-preview-kv" style={{ display: 'flex', padding: '0.75rem', borderBottom: '1px solid #f3f4f6' }}>
                      <strong style={{ width: '150px', flexShrink: 0, color: '#111827' }}>{key}</strong>
                      <div style={{ flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#4b5563', fontFamily: 'monospace', fontSize: '0.875rem' }}>{String(value)}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p>暂无题目数据</p>
            )}
            <div className="button-row modal-actions" style={{ marginTop: '1.5rem' }}>
              <button className="button" type="button" onClick={() => setShowPreview(false)}>关闭</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Labeler Modal ── */}
      {showLabelers ? (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowLabelers(false) }}>
          <div className="modal-card">
            <h3>标注分配</h3>
            <p className="field-helper-text">当前标注阶段只支持先到先得。发布后，符合条件的标注员可在任务广场领取任务，无需提前指定标注员。</p>
            <div className="selection-list">
              <div className="selection-item">
                <div>
                  <strong>先到先得</strong>
                  <p className="field-helper-text">任务发布后按领取顺序占用配额，配额上限为 {task.quota}。</p>
                </div>
              </div>
            </div>
            {labelerMessage ? <p className="feedback-message">{labelerMessage}</p> : null}
            {labelerError ? <p className="review-error-message">{labelerError}</p> : null}
            <div className="button-row modal-actions">
              <button className="button button-primary" type="button" onClick={() => { setLabelerMessage('标注分配方式已确认：先到先得。'); setShowLabelers(false) }}>确认</button>
              <button className="button" type="button" onClick={() => setShowLabelers(false)}>关闭</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Reviewer Modal ── */}
      {showReviewers ? (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowReviewers(false) }}>
          <div className="modal-card">
            <h3>审核分配</h3>
            <p className="field-helper-text">当前审核阶段只支持按人分配。被分配的审核员可处理 AI 预审后需要人工复核的提交。</p>
            {reviewerLoading ? <p className="inline-notice">加载中...</p> : null}
            {reviewerError ? <p className="review-error-message">{reviewerError}</p> : null}
            {reviewerOptions.length > 0 ? (
              <div className="selection-list">
                {reviewerOptions.map((reviewer) => (
                  <label className="selection-item" key={reviewer.id}>
                    <input type="checkbox" checked={selectedReviewerIds.includes(reviewer.id)} onChange={() => toggleReviewer(reviewer.id)} />
                    <span>{reviewer.displayName}</span>
                  </label>
                ))}
              </div>
            ) : reviewerError ? null : (
              <p>{task.reviewers && task.reviewers.length > 0 ? task.reviewers.map((item) => item.displayName).join('、') : '暂无审核员。'}</p>
            )}
            {reviewerMessage ? <p className="feedback-message">{reviewerMessage}</p> : null}
            <div className="button-row modal-actions">
              <button className="button button-primary" type="button" onClick={() => void saveReviewers()} disabled={savingReviewer}>{savingReviewer ? '保存中...' : '保存'}</button>
              <button className="button" type="button" onClick={() => setShowReviewers(false)} disabled={savingReviewer}>取消</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Publish Checklist Modal ── */}
      {showPublishChecklist ? (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowPublishChecklist(false) }}>
          <div className="modal-card modal-card-wide">
            <h3>任务发布前检查</h3>
            <p className="field-helper-text" style={{ marginBottom: '1rem' }}>发布任务前，请核对以下配置项，标红项为必填缺失项。</p>
            <div className="publish-checklist" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', backgroundColor: hasDatasetReady ? '#f0fdf4' : '#fef2f2', border: `1px solid ${hasDatasetReady ? '#bbf7d0' : '#fecaca'}`, borderRadius: '6px' }}>
                <span style={{ color: '#374151', fontWeight: 500 }}>数据集绑定（必填）</span>
                <strong style={{ color: hasDatasetReady ? '#166534' : '#991b1b' }}>{hasDatasetReady ? `已就绪 (${task.itemCount} 道题目)` : '未绑定或数据集为空'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', backgroundColor: hasTemplateReady ? '#f0fdf4' : '#fef2f2', border: `1px solid ${hasTemplateReady ? '#bbf7d0' : '#fecaca'}`, borderRadius: '6px' }}>
                <span style={{ color: '#374151', fontWeight: 500 }}>模板配置（必填）</span>
                <strong style={{ color: hasTemplateReady ? '#166534' : '#991b1b' }}>{hasTemplateReady ? `已就绪 (版本 v${task.activeTemplateVersionId})` : '未配置有效模板'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px' }}>
                <span style={{ color: '#374151', fontWeight: 500 }}>标注分配</span>
                <strong style={{ color: '#166534' }}>先到先得，已就绪</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', backgroundColor: (task.reviewers ?? []).length > 0 ? '#f0fdf4' : '#fffbeb', border: `1px solid ${(task.reviewers ?? []).length > 0 ? '#bbf7d0' : '#fde68a'}`, borderRadius: '6px' }}>
                <span style={{ color: '#374151', fontWeight: 500 }}>审核分配（建议）</span>
                <strong style={{ color: (task.reviewers ?? []).length > 0 ? '#166534' : '#92400e' }}>{(task.reviewers ?? []).length > 0 ? `按人分配 ${(task.reviewers ?? []).length} 人` : '未分配审核员'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', backgroundColor: task.aiConfig?.promptTemplate ? '#f0fdf4' : '#fffbeb', border: `1px solid ${task.aiConfig?.promptTemplate ? '#bbf7d0' : '#fde68a'}`, borderRadius: '6px' }}>
                <span style={{ color: '#374151', fontWeight: 500 }}>AI 预审配置（建议）</span>
                <strong style={{ color: task.aiConfig?.promptTemplate ? '#166534' : '#92400e' }}>{task.aiConfig?.promptTemplate ? '已开启' : '未开启（所有提交将直接进入人工审核）'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', backgroundColor: task.aiConfig?.reviewGuideline ? '#f0fdf4' : '#fffbeb', border: `1px solid ${task.aiConfig?.reviewGuideline ? '#bbf7d0' : '#fde68a'}`, borderRadius: '6px' }}>
                <span style={{ color: '#374151', fontWeight: 500 }}>审核标准说明（建议）</span>
                <strong style={{ color: task.aiConfig?.reviewGuideline ? '#166534' : '#92400e' }}>{task.aiConfig?.reviewGuideline ? '已提供' : '未提供明确的审核准则'}</strong>
              </div>
            </div>
            
            {!canPublishTask ? (
              <p className="review-error-message" style={{ marginBottom: '1rem' }}>由于缺少必填的发布条件，当前无法发布，请先修复标红项配置。</p>
            ) : null}
            
            <div className="button-row modal-actions">
              <button 
                className="button button-primary" 
                type="button" 
                onClick={() => { setShowPublishChecklist(false); void updateStatus('published'); }} 
                disabled={updatingStatus || !canPublishTask}
              >
                {updatingStatus ? '发布中...' : '确认无误，发布任务'}
              </button>
              <button className="button" type="button" onClick={() => setShowPublishChecklist(false)} disabled={updatingStatus}>取消返回</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
