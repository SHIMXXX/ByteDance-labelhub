import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { TimeRangeFilter } from '../../../components/TimeRangeFilter'
import { ApiError, apiGet, apiGetBlob, apiPost } from '../../../services/api/client'
import type { ExportFormat, ExportJob, ExportStatus, OwnerTask } from '../../../types/domain'
import { formatDateTime } from '../../../utils/dateTime'
import { filterByTimeRange, type TimeRangeKey } from '../../../utils/timeRangeFilter'

type ExportsResponse = {
  items: ExportJob[]
  total: number
}

type CreateExportResponse = ExportJob

type TaskListResponse = {
  items: Array<{
    id: number
    title: string
    description: string
    status: OwnerTask['status']
    quota: number
    deadline: string | null
    templateId: number | null
  }>
  total: number
}

type FieldMappingItem = {
  sourceKey: string
  targetLabel: string
  enabled: boolean
}

const formats: ExportFormat[] = ['json', 'csv', 'jsonl', 'excel']

const defaultFieldMapping: FieldMappingItem[] = [
  { sourceKey: 'submissionId', targetLabel: 'submissionId', enabled: true },
  { sourceKey: 'taskId', targetLabel: 'taskId', enabled: true },
  { sourceKey: 'labelerName', targetLabel: 'labelerName', enabled: true },
  { sourceKey: 'answers', targetLabel: 'answers', enabled: true },
  { sourceKey: 'finalAnswer', targetLabel: 'finalAnswer', enabled: true },
  { sourceKey: 'source', targetLabel: 'source', enabled: false },
  { sourceKey: 'metadata', targetLabel: 'metadata', enabled: false },
  { sourceKey: 'referenceAnswer', targetLabel: 'referenceAnswer', enabled: false },
  { sourceKey: 'aiDecision', targetLabel: 'aiDecision', enabled: false },
  { sourceKey: 'aiOverallScore', targetLabel: 'aiOverallScore', enabled: false },
  { sourceKey: 'aiSummary', targetLabel: 'aiSummary', enabled: false },
  { sourceKey: 'reviewDecision', targetLabel: 'reviewDecision', enabled: false },
  { sourceKey: 'reviewComment', targetLabel: 'reviewComment', enabled: false },
  { sourceKey: 'reviewReason', targetLabel: 'reviewReason', enabled: false },
]

const fieldKeyLabels: Record<string, string> = {
  submissionId: '提交 ID',
  taskId: '任务 ID',
  labelerName: '标注员名称',
  answers: '原始作答',
  finalAnswer: '最终答案',
  source: '题目原文',
  metadata: '元数据',
  referenceAnswer: '参考答案',
  aiDecision: 'AI 预审结论',
  aiOverallScore: 'AI 预审得分',
  aiSummary: 'AI 预审摘要',
  reviewDecision: '人工审核结论',
  reviewComment: '人工审核评语',
  reviewReason: '人工打回理由',
}

const aiAuditFieldKeys = new Set(['aiDecision', 'aiOverallScore', 'aiSummary'])
const reviewRecordFieldKeys = new Set(['reviewDecision', 'reviewComment', 'reviewReason'])

const statusClassName: Record<ExportStatus, string> = {
  queued: 'export-status-queued',
  processing: 'export-status-processing',
  done: 'export-status-done',
  failed: 'export-status-failed',
}

function parseTaskIdQuery(search: string) {
  const rawValue = new URLSearchParams(search).get('taskId')
  if (!rawValue) {
    return null
  }
  const taskId = Number(rawValue)
  return Number.isFinite(taskId) ? taskId : null
}

function renderStatusBadge(status: ExportStatus) {
  return <span className={`tag-pill ${statusClassName[status]}`}>{status}</span>
}

function getFieldMappingGroups() {
  return [
    {
      title: '基础交付字段',
      description: '默认用于交付和回传，覆盖提交标识、任务标识与主要答案内容。',
      items: ['submissionId', 'taskId', 'labelerName', 'answers', 'finalAnswer'],
    },
    {
      title: '题目与上下文',
      description: '按需补充题面、元数据和参考答案，方便复核或离线分析。',
      items: ['source', 'metadata', 'referenceAnswer'],
    },
    {
      title: 'AI 预审信息',
      description: '启用后会自动附带 AI 预审数据，用于判断模型结论和风险。',
      items: ['aiDecision', 'aiOverallScore', 'aiSummary'],
    },
    {
      title: '人工审核信息',
      description: '启用后会自动附带人工审核记录，便于复盘审核意见和退回原因。',
      items: ['reviewDecision', 'reviewComment', 'reviewReason'],
    },
  ]
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(objectUrl)
}

export function OwnerExportsPage() {
  const location = useLocation()
  const queryTaskId = parseTaskIdQuery(location.search)
  const [jobs, setJobs] = useState<ExportJob[]>([])
  const [taskOptions, setTaskOptions] = useState<Array<{ id: number; title: string }>>([])
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
  const [reportTaskId, setReportTaskId] = useState<number | null>(null)
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('json')
  const [fieldMapping, setFieldMapping] = useState<FieldMappingItem[]>(defaultFieldMapping)
  const [exportScope, setExportScope] = useState<'all' | 'review_passed'>('all')
  const [feedback, setFeedback] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [downloadingReport, setDownloadingReport] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isReportModalOpen, setIsReportModalOpen] = useState(false)
  const [exportStage, setExportStage] = useState<1 | 2 | 3>(1)
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('all')
  const hasAutoOpenedRef = useRef(false)
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollingTimerRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    void loadPageData()

    return () => {
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current)
      }
      pollingTimerRef.current.forEach((timer) => clearTimeout(timer))
      pollingTimerRef.current.clear()
    }
  }, [])

  async function loadPageData() {
    setLoading(true)
    setLoadError('')

    try {
      const [tasksResult, exportsResult] = await Promise.all([
        apiGet<TaskListResponse>('/tasks'),
        apiGet<ExportsResponse>('/exports'),
      ])
      const nextTaskOptions = tasksResult.items.map((task) => ({ id: task.id, title: task.title }))
      const matchedQueryTask = queryTaskId ? nextTaskOptions.find((task) => task.id === queryTaskId) : null
      const nextSelectedTaskId = matchedQueryTask?.id ?? nextTaskOptions[0]?.id ?? null
      setTaskOptions(nextTaskOptions)
      setSelectedTaskId(nextSelectedTaskId)
      setReportTaskId((current) => current ?? nextSelectedTaskId)
      setJobs(exportsResult.items)
      if (matchedQueryTask && !hasAutoOpenedRef.current) {
        setExportStage(1)
        setIsCreateModalOpen(true)
        hasAutoOpenedRef.current = true
      }
    } catch {
      setLoadError('导出页面加载失败，请确认任务与导出后端接口已启动。')
    } finally {
      setLoading(false)
    }
  }

  function schedulePolling(jobId: number, remainingAttempts = 20) {
    if (remainingAttempts <= 0) {
      pollingTimerRef.current.delete(jobId)
      return
    }

    const currentTimer = pollingTimerRef.current.get(jobId)
    if (currentTimer) {
      clearTimeout(currentTimer)
    }

    const nextTimer = setTimeout(async () => {
      try {
        const latest = await apiGet<ExportJob>(`/exports/${jobId}`)
        setJobs((current) => current.map((job) => (job.jobId === jobId ? latest : job)))
        if (latest.status === 'queued' || latest.status === 'processing') {
          schedulePolling(jobId, remainingAttempts - 1)
        } else {
          pollingTimerRef.current.delete(jobId)
        }
      } catch {
        pollingTimerRef.current.delete(jobId)
        setLoadError('导出状态刷新失败，请稍后手动刷新页面。')
      }
    }, 1000)

    pollingTimerRef.current.set(jobId, nextTimer)
  }

  async function handleCreateExport() {
    if (!selectedTaskId) {
      setLoadError('暂无可导出的任务。')
      return
    }

    setLoadError('')
    setFeedback('')
    setSubmitting(true)

    try {
      const queuedJob = await apiPost<
        CreateExportResponse,
        {
          taskId: number
          format: ExportFormat
          fieldMapping: FieldMappingItem[]
          includeAiAudit: boolean
          includeReviewRecords: boolean
          exportScope: 'all' | 'review_passed'
        }
      >('/exports', {
        taskId: selectedTaskId,
        format: selectedFormat,
        fieldMapping,
        includeAiAudit: fieldMapping.some((item) => item.enabled && aiAuditFieldKeys.has(item.sourceKey)),
        includeReviewRecords: fieldMapping.some((item) => item.enabled && reviewRecordFieldKeys.has(item.sourceKey)),
        exportScope,
      })
      setJobs((prev) => [queuedJob, ...prev])
      setFeedback(`已为「${queuedJob.taskTitle}」创建 ${queuedJob.format} 导出，任务已进入队列。`)
      schedulePolling(queuedJob.jobId)
      setIsCreateModalOpen(false)
      setExportStage(1)
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current)
      }
      feedbackTimerRef.current = setTimeout(() => setFeedback(''), 3000)
    } catch (error) {
      const message = error instanceof Error ? error.message : '发起导出失败，请稍后重试。'
      setLoadError(
        message.includes('export queue is unavailable')
          ? '导出队列当前不可用，请先启动 Redis 与 Celery Worker。'
          : '发起导出失败，请稍后重试。',
      )
    } finally {
      setSubmitting(false)
    }
  }

  function updateFieldMapping(index: number, patch: Partial<FieldMappingItem>) {
    setFieldMapping((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)))
  }

  async function handleDownloadExport(job: ExportJob) {
    setLoadError('')

    try {
      const { blob, filename } = await apiGetBlob(`/exports/${job.jobId}/download`)
      triggerBlobDownload(blob, filename ?? `export-task-${job.taskId}.${job.format === 'excel' ? 'xlsx' : job.format}`)
    } catch (error) {
      const message = error instanceof ApiError ? error.detail || error.message : ''
      setLoadError(message || '下载导出结果失败，请稍后重试。')
    }
  }

  function openReportWizard() {
    setLoadError('')
    setFeedback('')
    setReportTaskId((current) => current ?? selectedTaskId ?? taskOptions[0]?.id ?? null)
    setIsReportModalOpen(true)
  }

  async function handleDownloadTaskReport() {
    if (!reportTaskId) {
      setLoadError('请先选择需要生成报告的任务。')
      return
    }

    setLoadError('')
    setFeedback('')
    setDownloadingReport(true)

    const taskTitle = taskOptions.find((task) => task.id === reportTaskId)?.title ?? '未选择任务'

    try {
      const { blob, filename } = await apiGetBlob(`/exports/tasks/${reportTaskId}/report`)
      triggerBlobDownload(blob, filename ?? `task-report-${reportTaskId}.html`)

      setFeedback(`已为「${taskTitle}」生成 HTML 任务报告。`)
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current)
      }
      feedbackTimerRef.current = setTimeout(() => setFeedback(''), 3000)
      setIsReportModalOpen(false)
    } catch (error) {
      const message = error instanceof ApiError ? error.detail || error.message : ''
      setLoadError(message || '生成任务报告失败，请稍后重试。')
    } finally {
      setDownloadingReport(false)
    }
  }

  const visibleJobs = filterByTimeRange(jobs, timeRange, (job) => job.createdAt)
  const totalJobs = visibleJobs.length
  const successJobs = visibleJobs.filter((job) => job.status === 'done').length
  const activeJobs = visibleJobs.filter((job) => job.status === 'queued' || job.status === 'processing').length
  const failedJobs = visibleJobs.filter((job) => job.status === 'failed').length
  const enabledFieldCount = fieldMapping.filter((item) => item.enabled).length
  const enabledAiFieldCount = fieldMapping.filter((item) => item.enabled && aiAuditFieldKeys.has(item.sourceKey)).length
  const enabledReviewFieldCount = fieldMapping.filter((item) => item.enabled && reviewRecordFieldKeys.has(item.sourceKey)).length
  const selectedTaskTitle = taskOptions.find((task) => task.id === selectedTaskId)?.title ?? '未选择任务'
  const reportTaskTitle = taskOptions.find((task) => task.id === reportTaskId)?.title ?? '未选择任务'

  return (
    <section className="dashboard-page">
      <header className="page-hero page-hero-light">
        <div>
          <span className="page-eyebrow">Export center</span>
          <h2>导出管理</h2>
          <p>集中发起结果导出、查看状态，并从历史记录中快速下载交付产物。</p>
        </div>
        <div className="button-row export-report-action">
          <span className="tag-pill export-report-tag">亮点功能</span>
          <span className="tag-pill export-report-tag">HTML 报告</span>
          <button
            className="button button-report"
            type="button"
            onClick={openReportWizard}
            disabled={taskOptions.length === 0 || loading || downloadingReport}
          >
            一键生成任务报告
          </button>
          <button
            className="button"
            type="button"
            onClick={() => {
              setExportStage(1)
              setIsCreateModalOpen(true)
            }}
          >
            发起导出
          </button>
        </div>
      </header>

      <TimeRangeFilter value={timeRange} onChange={setTimeRange} />

      <div className="stat-grid">
        <article className="stat-card stat-card-tint-sky">
          <span className="stat-card-label">导出总数</span>
          <strong className="stat-card-value">{totalJobs}</strong>
          <p>当前导出中心已记录的全部导出任务。</p>
        </article>
        <article className="stat-card stat-card-tint-mint">
          <span className="stat-card-label">最近成功</span>
          <strong className="stat-card-value">{successJobs}</strong>
          <p>已完成并可下载的导出任务数量。</p>
        </article>
        <article className="stat-card stat-card-tint-lavender">
          <span className="stat-card-label">处理中</span>
          <strong className="stat-card-value">{activeJobs}</strong>
          <p>仍在排队或处理中，建议稍后刷新状态。</p>
        </article>
        <article className="stat-card stat-card-tint-peach">
          <span className="stat-card-label">最近失败</span>
          <strong className="stat-card-value">{failedJobs}</strong>
          <p>需要排查配置或后端执行链路的失败任务。</p>
        </article>
      </div>

      {feedback ? <p className="feedback-message">{feedback}</p> : null}
      {loadError ? <p className="review-error-message">{loadError}</p> : null}

      {isReportModalOpen ? (
        <div
          className="modal-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget && !downloadingReport) {
              setIsReportModalOpen(false)
            }
          }}
        >
          <div className="modal-content export-report-modal">
            <div className="section-header">
              <div>
                <span className="section-eyebrow">Report Wizard · Step 1 / 1</span>
                <h3>生成任务报告</h3>
                <p className="field-helper-text">选择一个任务，系统将生成 HTML 报告，汇总质量指标、AI 评分分布、标注员贡献、常见问题和导出文件信息。</p>
              </div>
              <span className="tag-pill">HTML 报告</span>
            </div>

            <section className="export-config-grid">
              <label className="form-field">
                <span>报告任务</span>
                <select
                  aria-label="报告任务"
                  value={reportTaskId ?? ''}
                  onChange={(event) => setReportTaskId(Number(event.target.value))}
                  disabled={taskOptions.length === 0 || downloadingReport}
                >
                  {taskOptions.map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.title}
                    </option>
                  ))}
                </select>
              </label>

              <div className="property-item export-summary-card">
                <span>当前报告对象</span>
                <strong>{reportTaskTitle}</strong>
              </div>
            </section>

            <div className="button-row modal-actions">
              <button type="button" onClick={() => setIsReportModalOpen(false)} disabled={downloadingReport}>
                取消
              </button>
              <button className="button-primary" type="button" onClick={() => void handleDownloadTaskReport()} disabled={!reportTaskId || downloadingReport}>
                {downloadingReport ? '生成报告中...' : '生成 HTML 报告'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isCreateModalOpen ? (
        <div
          className="modal-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget && !submitting) {
              setIsCreateModalOpen(false)
              setExportStage(1)
            }
          }}
        >
          <div className="modal-content export-create-modal">
            <div className="section-header">
              <div>
                <span className="section-eyebrow">Export Wizard · Step {exportStage} / 3</span>
                <h3>发起导出</h3>
                <p className="field-helper-text">
                  {exportStage === 1 && '第一步：选择导出目标与文件格式'}
                  {exportStage === 2 && '第二步：配置导出内容与字段映射'}
                  {exportStage === 3 && '第三步：确认配置并提交导出'}
                </p>
              </div>
              <div className="export-stepper" style={{ display: 'flex', gap: '8px' }}>
                <div style={{ width: '24px', height: '4px', borderRadius: '2px', backgroundColor: exportStage >= 1 ? '#5645d4' : '#ede9e4' }}></div>
                <div style={{ width: '24px', height: '4px', borderRadius: '2px', backgroundColor: exportStage >= 2 ? '#5645d4' : '#ede9e4' }}></div>
                <div style={{ width: '24px', height: '4px', borderRadius: '2px', backgroundColor: exportStage >= 3 ? '#5645d4' : '#ede9e4' }}></div>
              </div>
            </div>

            {exportStage === 1 && (
              <section className="export-config-grid">
                <div className="section-header">
                  <div>
                    <span className="section-eyebrow">Basic setup</span>
                    <h3>基础配置</h3>
                    <p className="field-helper-text">决定本次导出的任务对象、文件格式与结果范围。</p>
                  </div>
                </div>
                <div className="form-grid">
                  <label className="form-field">
                    <span>任务</span>
                    <select
                      aria-label="任务"
                      value={selectedTaskId ?? ''}
                      onChange={(event) => setSelectedTaskId(Number(event.target.value))}
                      disabled={taskOptions.length === 0}
                    >
                      {taskOptions.map((task) => (
                        <option key={task.id} value={task.id}>
                          {task.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="form-field">
                    <span>导出格式</span>
                    <select
                      aria-label="导出格式"
                      value={selectedFormat}
                      onChange={(event) => setSelectedFormat(event.target.value as ExportFormat)}
                    >
                      {formats.map((format) => (
                        <option key={format} value={format}>
                          {format}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="form-field">
                  <span>导出范围</span>
                  <div className="export-scope-options" role="radiogroup" aria-label="导出范围">
                    <label className="selection-item export-selection-card">
                      <input
                        type="radio"
                        name="export-scope"
                        value="all"
                        checked={exportScope === 'all'}
                        onChange={() => setExportScope('all')}
                      />
                      <div>
                        <strong>全量导出</strong>
                        <p>导出当前任务下全部提交结果，适合完整复核与问题排查。</p>
                      </div>
                    </label>
                    <label className="selection-item export-selection-card">
                      <input
                        type="radio"
                        name="export-scope"
                        value="review_passed"
                        checked={exportScope === 'review_passed'}
                        onChange={() => setExportScope('review_passed')}
                      />
                      <div>
                        <strong>仅导出已审核通过</strong>
                        <p>更适合交付、归档与训练集产出。</p>
                      </div>
                    </label>
                  </div>
                  <p className="field-helper-text">导出范围只影响筛选结果，不改变字段结构。</p>
                  <p className="field-helper-text">当前开放 JSON / CSV / JSONL / Excel 四种导出格式。</p>
                </div>
              </section>
            )}

            {exportStage === 2 && (
              <section className="export-mapping-section">
                <div className="section-header">
                  <div>
                    <span className="section-eyebrow">Field mapping</span>
                    <h3>字段映射</h3>
                    <p>在一处决定本次导出的字段、列名与是否附带 AI / 人工审核数据。</p>
                  </div>
                  <span className="tag-pill">已启用 {enabledFieldCount} / {fieldMapping.length}</span>
                </div>
                <p className="field-helper-text">启用 AI 或人工审核相关字段后，系统会自动附带对应的审核数据。</p>
                <div className="export-mapping-groups">
                  {getFieldMappingGroups().map((group) => {
                    const rows = fieldMapping.filter((item) => group.items.includes(item.sourceKey))
                    return (
                      <article className="export-mapping-group" key={group.title}>
                        <div className="export-mapping-group__header">
                          <h4>{group.title}</h4>
                          <p>{group.description}</p>
                        </div>
                        <div className="export-mapping-list">
                          {rows.map((item) => {
                            const index = fieldMapping.findIndex((field) => field.sourceKey === item.sourceKey)
                            return (
                              <label className={`export-mapping-row ${item.enabled ? 'is-enabled' : 'is-disabled'}`} key={item.sourceKey}>
                                <span className="checkbox-field export-mapping-toggle">
                                  <input
                                    aria-label={`导出 ${item.sourceKey}`}
                                    type="checkbox"
                                    checked={item.enabled}
                                    onChange={(event) => updateFieldMapping(index, { enabled: event.target.checked })}
                                  />
                                  <span>导出</span>
                                </span>
                                <span className="export-mapping-source">{fieldKeyLabels[item.sourceKey] || item.sourceKey}</span>
                                <span className="form-field export-mapping-alias">
                                  <span>{fieldKeyLabels[item.sourceKey] || item.sourceKey} 别名</span>
                                  <input
                                    aria-label={`${item.sourceKey} 别名`}
                                    value={item.targetLabel}
                                    placeholder="留空则沿用原字段名"
                                    title="留空则沿用原字段名"
                                    onChange={(event) => updateFieldMapping(index, { targetLabel: event.target.value })}
                                  />
                                </span>
                              </label>
                            )
                          })}
                        </div>
                      </article>
                    )
                  })}
                </div>
              </section>
            )}

            {exportStage === 3 && (
              <section className="export-config-grid">
                <div className="section-header">
                  <div>
                    <span className="section-eyebrow">Export summary</span>
                    <h3>导出摘要</h3>
                    <p className="field-helper-text">提交前快速确认本次导出的关键配置。</p>
                  </div>
                </div>
                <div className="property-list export-summary-grid">
                  <div className="property-item export-summary-card">
                    <span>当前任务</span>
                    <strong>{selectedTaskTitle}</strong>
                  </div>
                  <div className="property-item export-summary-card">
                    <span>导出格式</span>
                    <strong>{selectedFormat}</strong>
                  </div>
                  <div className="property-item export-summary-card">
                    <span>导出范围</span>
                    <strong>{exportScope === 'all' ? '全量导出' : '仅导出已审核通过'}</strong>
                  </div>
                  <div className="property-item export-summary-card">
                    <span>已选字段</span>
                    <strong>{enabledFieldCount} / {fieldMapping.length}</strong>
                  </div>
                  <div className="property-item export-summary-card">
                    <span>AI 预审字段</span>
                    <strong>{enabledAiFieldCount > 0 ? `${enabledAiFieldCount} 项` : '未启用'}</strong>
                  </div>
                  <div className="property-item export-summary-card">
                    <span>人工审核字段</span>
                    <strong>{enabledReviewFieldCount > 0 ? `${enabledReviewFieldCount} 项` : '未启用'}</strong>
                  </div>
                </div>
                <p className="export-empty-message" style={{ marginTop: '20px' }}>
                  确认无误后，点击下方的“确认发起导出”按钮。导出将在后台进行，您可以在导出历史中查看进度。
                </p>
              </section>
            )}

            <div className="button-row modal-actions">
              {exportStage > 1 ? (
                <button type="button" onClick={() => setExportStage((stage) => (stage - 1) as 1 | 2 | 3)} disabled={submitting}>
                  上一步
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateModalOpen(false)
                    setExportStage(1)
                  }}
                  disabled={submitting}
                >
                  取消
                </button>
              )}

              {exportStage < 3 ? (
                <button className="button-primary" type="button" onClick={() => setExportStage((stage) => (stage + 1) as 1 | 2 | 3)}>
                  下一步
                </button>
              ) : (
                <button className="button-primary" type="button" onClick={() => void handleCreateExport()} disabled={!selectedTaskId || submitting}>
                  {submitting ? '发起中...' : '确认发起导出'}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <article className="card">
        <div className="section-header">
          <div>
            <span className="section-eyebrow">History</span>
            <h3>导出历史</h3>
          </div>
        </div>
        {loading ? (
          <p className="export-empty-message">导出历史加载中...</p>
        ) : visibleJobs.length === 0 ? (
          <p className="export-empty-message">暂无导出记录</p>
        ) : (
          <div className="card-list">
            {visibleJobs.map((job, idx) => (
              <article className="card export-history-card" key={job.jobId} style={{ animationDelay: `${idx * 60}ms` }}>
                <div className="section-header">
                  <div>
                    <div className="task-card-badge-row">
                      <span className="section-eyebrow">#{job.jobId}</span>
                      {renderStatusBadge(job.status)}
                    </div>
                    <h4>{job.taskTitle}</h4>
                  </div>
                  {job.status === 'done' && job.downloadUrl ? (
                    <button type="button" className="button button-primary" onClick={() => void handleDownloadExport(job)}>
                      下载
                    </button>
                  ) : null}
                </div>
                <div className="meta-row">
                  <span>格式：{job.format}</span>
                  <span>创建：{formatDateTime(job.createdAt)}</span>
                  <span>完成：{formatDateTime(job.finishedAt)}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </article>
    </section>
  )
}
