import { useEffect, useMemo, useState } from 'react'
import { apiGet } from '../../../services/api/client'
import { TimeRangeFilter } from '../../../components/TimeRangeFilter'
import { filterByTimeRange, type TimeRangeKey } from '../../../utils/timeRangeFilter'
import { parseAppDate } from '../../../utils/time'
import type { LabelerAssignmentSummary } from '../../../types/domain'
import { calculateLabelerAbility, formatPercent } from '../../../utils/labelerAbility'

type TabType = 'tasks' | 'labelers' | 'reviewers' | 'ai-jobs'

type TaskProgress = {
  taskId: number
  title: string
  status: string
  createdAt?: string | null
  updatedAt?: string | null
  stats: {
    total: number
    pending_ai: number
    pending_manual: number
    approved: number
    rejected: number
  }
}

type ReviewerWorkload = {
  reviewerId: number
  displayName: string
  latestUpdatedAt?: string | null
  stats: {
    assigned_count: number
    completed_count: number
    pending_count: number
  }
}

type LabelerPerformance = {
  labelerId: number
  displayName: string
  username: string
  latestUpdatedAt?: string | null
  metrics: {
    claimedTaskCount: number
    submittedItemCount: number
    reviewPassedItemCount: number
    needsRevisionItemCount: number
  }
  assignments: LabelerAssignmentSummary[]
}

type LabelerSortKey = 'score-desc' | 'score-asc'

type AIJobStatus = {
  jobId: number
  submissionId: number
  taskTitle: string
  status: string
  flowStatus?: string | null
  aiDecision?: string | null
  submissionStatus?: string | null
  attemptCount: number
  errorReason: string | null
  updatedAt: string
}

type ReviewRecordDetail = {
  recordId: number
  reviewerName: string | null
  assigneeReviewerName: string | null
  stage: string
  round: number
  decision: string
  reason: string
  comment: string
  createdAt: string
}

type ReviewTimelineItem = {
  type: string
  title: string
  createdAt: string
  payload: Record<string, unknown>
}

type SubmissionReviewDetail = {
  submissionId: number
  datasetItemId: number | null
  status: string
  labeler: {
    displayName: string
    username: string
  }
  assignedReviewer: {
    displayName: string
    username: string
  } | null
  answers: Record<string, unknown>
  finalAnswers: Record<string, unknown>
  currentVersionNo: number
  currentReviewStage: string
  currentReviewRound: number
  createdAt: string
  updatedAt: string
  item: {
    itemId: number
    source: Record<string, unknown>
  }
  aiAudit: {
    job: {
      jobId: number
      status: string
      attemptCount: number
      errorMessage: string | null
      updatedAt: string
    } | null
    result: {
      overallScore: number
      decision: string
      summary: string
      scores: unknown[]
      validationStatus: string
      createdAt: string
    } | null
  } | null
  reviewHistory: ReviewRecordDetail[]
  timeline: ReviewTimelineItem[]
}

type TaskReviewDetails = {
  task: {
    taskId: number
    title: string
    status: string
  }
  summary: {
    total: number
    pendingAi: number
    pendingManual: number
    approved: number
    rejected: number
  }
  submissions: SubmissionReviewDetail[]
}

function getStatusIcon(status: string) {
  if (status === 'review_passed') return '✅'
  if (status === 'needs_revision') return '❌'
  if (status === 'ai_passed') return '👤'
  if (status === 'submitted') return '🤖'
  return '📄'
}

function mapTimelineType(type: string) {
  const map: Record<string, string> = {
    review: '人工审核',
    audit: '系统审计',
    submission: '标注提交',
    submission_version: '提交版本',
    ai_job: 'AI 预审作业',
    ai_result: 'AI 预审结果',
    audit_log: '系统日志',
  }
  return map[type] || '其他操作'
}

function mapTimelineTitle(title: string) {
  const map: Record<string, string> = {
    'Submission created': '创建标注提交',
    'Submission submitted': '提交题目',
    'AI audit job created': '触发 AI 预审',
    'AI audit job started': 'AI 开始扫描',
    'AI audit job finished': 'AI 完成判定',
    'Review record created': '记录审核结论',
    'review_approved': '审核通过',
    'review_rejected': '审核打回',
    'review_assigned': '分配审核员',
    'review_unassigned': '取消分配',
    'submission_submitted': '提交题目',
    'submission_version_created': '生成提交版本',
    'submission_resubmitted': '重新提交题目',
    'ai_job_queued': 'AI 作业进入队列',
    'ai_job_started': 'AI 作业开始执行',
    'ai_job_retried': 'AI 作业重试',
    'ai_audit_fallback_human_review': 'AI 转人工复核',
    'ai_audit_succeeded': 'AI 预审通过',
    '提交创建': '提交创建',
    'AI 预审作业': 'AI 预审作业',
    'AI 预审结果': 'AI 预审结果',
    '人工复审': '人工复审',
  }
  if (map[title]) {
    return map[title]
  }
  if (/^第\s*\d+\s*版提交$/.test(title) || /[一-鿿]/.test(title)) {
    return title
  }
  return '未命名操作'
}

function sortSubmissionsByTaskOrder(submissions: SubmissionReviewDetail[]) {
  return [...submissions].sort((a, b) => {
    const itemDelta = (a.item.itemId ?? 0) - (b.item.itemId ?? 0)
    if (itemDelta !== 0) {
      return itemDelta
    }
    return a.submissionId - b.submissionId
  })
}

function filterOwnerTimelineItems(timeline: ReviewTimelineItem[]) {
  return timeline.filter((item) => ['submission', 'submission_version', 'ai_result', 'review'].includes(item.type))
}

function getQualityTone(score: number, processedCount: number) {
  if (score >= 85) return '稳定优秀'
  if (score >= 70) return '表现良好'
  if (processedCount > 0) return '需要校准'
  return '等待积累'
}

function getTimelineVisual(item: ReviewTimelineItem) {
  if (item.type === 'submission') {
    return {
      badgeLabel: '提交创建',
      badgeBg: '#eef2ff',
      badgeColor: '#5645d4',
      title: '创建标注提交',
      dotColor: '#5645d4',
      summary: '',
    }
  }

  if (item.type === 'submission_version') {
    const submitterName = typeof item.payload?.submitterName === 'string' ? item.payload.submitterName : ''
    return {
      badgeLabel: '版本提交',
      badgeBg: '#f5f3ff',
      badgeColor: '#6d28d9',
      title: mapTimelineTitle(item.title),
      dotColor: '#6d28d9',
      summary: submitterName ? `提交者：${submitterName}` : '',
    }
  }

  if (item.type === 'ai_result') {
    const decision = typeof item.payload?.decision === 'string' ? item.payload.decision : ''
    const summary = typeof item.payload?.summary === 'string' ? item.payload.summary : ''
    if (decision === 'pass') {
      return {
        badgeLabel: 'AI 预审通过',
        badgeBg: '#f0fdf4',
        badgeColor: '#1aae39',
        title: 'AI 预审通过',
        dotColor: '#1aae39',
        summary,
      }
    }
    if (decision === 'reject') {
      return {
        badgeLabel: 'AI 预审打回',
        badgeBg: '#fef2f2',
        badgeColor: '#e03131',
        title: 'AI 预审打回',
        dotColor: '#e03131',
        summary,
      }
    }
    return {
      badgeLabel: 'AI 转人工',
      badgeBg: '#f5f3ff',
      badgeColor: '#5645d4',
      title: 'AI 转人工复核',
      dotColor: '#5645d4',
      summary,
    }
  }

  if (item.type === 'review') {
    const decision = typeof item.payload?.decision === 'string' ? item.payload.decision : ''
    const reason = typeof item.payload?.reason === 'string' ? item.payload.reason : ''
    const comment = typeof item.payload?.comment === 'string' ? item.payload.comment : ''
    const summary = reason || comment
    const isApprove = decision === 'approve'
    return {
      badgeLabel: isApprove ? '人工复审通过' : '人工复审打回',
      badgeBg: isApprove ? '#f0fdf4' : '#fef2f2',
      badgeColor: isApprove ? '#1aae39' : '#e03131',
      title: isApprove ? '人工复审通过' : '人工复审打回',
      dotColor: isApprove ? '#1aae39' : '#e03131',
      summary,
    }
  }

  return {
    badgeLabel: mapTimelineType(item.type),
    badgeBg: '#f5f5f4',
    badgeColor: '#787671',
    title: mapTimelineTitle(item.title),
    dotColor: '#a4a097',
    summary: '',
  }
}

export function OwnerReviewManagementPage() {
  const [activeTab, setActiveTab] = useState<TabType>('tasks')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [taskData, setTaskData] = useState<TaskProgress[]>([])
  const [labelerData, setLabelerData] = useState<LabelerPerformance[]>([])
  const [reviewerData, setReviewerData] = useState<ReviewerWorkload[]>([])
  const [aiJobData, setAIJobData] = useState<AIJobStatus[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [reviewDetails, setReviewDetails] = useState<TaskReviewDetails | null>(null)
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('all')
  const [labelerSort, setLabelerSort] = useState<LabelerSortKey>('score-desc')
  const [selectedLabeler, setSelectedLabeler] = useState<LabelerPerformance | null>(null)

  useEffect(() => {
    void loadData()
  }, [activeTab])

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      if (activeTab === 'tasks') {
        const res = await apiGet<{ items: TaskProgress[] }>('/owner-reviews/tasks')
        setTaskData(res.items)
      } else if (activeTab === 'labelers') {
        const res = await apiGet<{ items: LabelerPerformance[] }>('/owner-reviews/labelers')
        setLabelerData(res.items)
      } else if (activeTab === 'reviewers') {
        const res = await apiGet<{ items: ReviewerWorkload[] }>('/owner-reviews/reviewers')
        setReviewerData(res.items)
      } else if (activeTab === 'ai-jobs') {
        const res = await apiGet<{ items: AIJobStatus[] }>('/owner-reviews/ai-jobs')
        setAIJobData(res.items)
      }
    } catch {
      setError('加载数据失败，请确认后端接口已启动。')
    } finally {
      setLoading(false)
    }
  }

  async function openTaskReviewDetails(taskId: number) {
    setDetailLoading(true)
    setDetailError('')
    setReviewDetails(null)
    try {
      const res = await apiGet<TaskReviewDetails>(`/owner-reviews/tasks/${taskId}/details`)
      setReviewDetails(res)
    } catch {
      setDetailError('审核详情加载失败，请稍后重试。')
    } finally {
      setDetailLoading(false)
    }
  }

  const visibleTaskData = filterByTimeRange(taskData, timeRange, (task) => task.updatedAt ?? task.createdAt)
  const visibleLabelerData = filterByTimeRange(labelerData, timeRange, (labeler) => labeler.latestUpdatedAt)
  const visibleReviewerData = filterByTimeRange(reviewerData, timeRange, (reviewer) => reviewer.latestUpdatedAt)
  const visibleAIJobData = filterByTimeRange(aiJobData, timeRange, (job) => job.updatedAt)
  const sortedLabelerData = useMemo(() => {
    const data = [...visibleLabelerData]
    data.sort((left, right) => {
      const leftAbility = calculateLabelerAbility(left.assignments)
      const rightAbility = calculateLabelerAbility(right.assignments)
      if (labelerSort === 'score-asc') {
        return (
          leftAbility.qualityScore - rightAbility.qualityScore ||
          leftAbility.processedCount - rightAbility.processedCount ||
          left.displayName.localeCompare(right.displayName, 'zh-CN')
        )
      }
      return (
        rightAbility.qualityScore - leftAbility.qualityScore ||
        rightAbility.processedCount - leftAbility.processedCount ||
        left.displayName.localeCompare(right.displayName, 'zh-CN')
      )
    })
    return data
  }, [labelerSort, visibleLabelerData])

  return (
    <section className="dashboard-page">
      <header className="page-hero" style={{ paddingBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span className="badge-tag-purple" style={{ backgroundColor: '#e6e0f5', color: '#5645d4' }}>Quality Center</span>
        </div>
        <h2 style={{ fontSize: '32px', fontWeight: 600, marginBottom: '12px' }}>审核管理</h2>
        <p style={{ color: '#5d5b54', maxWidth: '600px', fontSize: '16px' }}>
          监控全链路审核进度，确保 AI 预审与人工审查流程高效闭环。
        </p>
      </header>

      <div className="tabs-container" style={{ marginBottom: '24px', borderBottom: '1px solid #ede9e4' }}>
        <div className="tabs-list" style={{ display: 'flex', gap: '32px' }}>
          <button
            className={`tab-item ${activeTab === 'tasks' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('tasks')}
            style={{
              padding: '12px 4px',
              fontSize: '15px',
              fontWeight: activeTab === 'tasks' ? 600 : 400,
              color: activeTab === 'tasks' ? '#1a1a1a' : '#787671',
              borderBottom: activeTab === 'tasks' ? '2px solid #1a1a1a' : '2px solid transparent',
              background: 'none',
              cursor: 'pointer'
            }}
          >
            任务进度
          </button>
          <button
            className={`tab-item ${activeTab === 'labelers' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('labelers')}
            style={{
              padding: '12px 4px',
              fontSize: '15px',
              fontWeight: activeTab === 'labelers' ? 600 : 400,
              color: activeTab === 'labelers' ? '#1a1a1a' : '#787671',
              borderBottom: activeTab === 'labelers' ? '2px solid #1a1a1a' : '2px solid transparent',
              background: 'none',
              cursor: 'pointer'
            }}
          >
            标注员效能
          </button>
          <button
            className={`tab-item ${activeTab === 'reviewers' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('reviewers')}
            style={{
              padding: '12px 4px',
              fontSize: '15px',
              fontWeight: activeTab === 'reviewers' ? 600 : 400,
              color: activeTab === 'reviewers' ? '#1a1a1a' : '#787671',
              borderBottom: activeTab === 'reviewers' ? '2px solid #1a1a1a' : '2px solid transparent',
              background: 'none',
              cursor: 'pointer'
            }}
          >
            审查员负载
          </button>
          <button
            className={`tab-item ${activeTab === 'ai-jobs' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('ai-jobs')}
            style={{
              padding: '12px 4px',
              fontSize: '15px',
              fontWeight: activeTab === 'ai-jobs' ? 600 : 400,
              color: activeTab === 'ai-jobs' ? '#1a1a1a' : '#787671',
              borderBottom: activeTab === 'ai-jobs' ? '2px solid #1a1a1a' : '2px solid transparent',
              background: 'none',
              cursor: 'pointer'
            }}
          >
            AI 预审流水
          </button>
        </div>
      </div>

      <TimeRangeFilter value={timeRange} onChange={setTimeRange} />

      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#a4a097' }}>正在调取最新质量看板...</div>
      ) : error ? (
        <div className="card-feature-rose" style={{ padding: '24px', textAlign: 'center', backgroundColor: '#fde0ec', borderRadius: '12px' }}>
          <p style={{ color: '#e03131', fontWeight: 500 }}>{error}</p>
        </div>
      ) : (
        <div className="tab-content animate-fade-in">
          {activeTab === 'tasks' && <AuditTasksTab data={visibleTaskData} onOpenDetails={(taskId) => void openTaskReviewDetails(taskId)} />}
          {activeTab === 'labelers' && (
            <LabelerPerformanceTab
              data={sortedLabelerData}
              sort={labelerSort}
              onSortChange={setLabelerSort}
              onOpenDetails={setSelectedLabeler}
            />
          )}
          {activeTab === 'reviewers' && <ManualReviewQueueTab data={visibleReviewerData} />}
          {activeTab === 'ai-jobs' && <AIAuditMonitorTab data={visibleAIJobData} />}
        </div>
      )}
      {detailLoading || detailError || reviewDetails ? (
        <TaskReviewDetailsModal
          loading={detailLoading}
          error={detailError}
          details={reviewDetails}
          onClose={() => {
            setReviewDetails(null)
            setDetailError('')
            setDetailLoading(false)
          }}
        />
      ) : null}
      {selectedLabeler ? <LabelerPerformanceModal item={selectedLabeler} onClose={() => setSelectedLabeler(null)} /> : null}
    </section>
  )
}

function AuditTasksTab({ data, onOpenDetails }: { data: TaskProgress[], onOpenDetails: (taskId: number) => void }) {
  if (data.length === 0) {
    return (
      <div className="card-base" style={{ textAlign: 'center', padding: '60px 20px', backgroundColor: '#f6f5f4' }}>
        <p style={{ color: '#a4a097' }}>当前暂无任务审核数据</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
      {data.map((task) => {
        const completed = task.stats.approved + task.stats.rejected
        const progress = task.stats.total > 0 ? Math.round((completed / task.stats.total) * 100) : 0

        return (
          <article className="card-base" key={task.taskId} style={{ padding: '20px', border: '1px solid #e5e3df', borderRadius: '12px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '16px', minHeight: '180px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                <span style={{ fontSize: '12px', color: '#a4a097', fontWeight: 600, flexShrink: 0 }}>#{task.taskId}</span>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#1a1a1a', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '220px' }} title={task.title}>{task.title}</h3>
              </div>
              <span className={`status-badge status-${task.status}`} style={{ fontSize: '11px', padding: '4px 10px', flexShrink: 0 }}>
                {task.status}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px' }}>
              <div>
                <span style={{ display: 'block', fontSize: '11px', color: '#787671', marginBottom: '4px' }}>审核进度</span>
                <strong style={{ fontSize: '26px', color: '#1a1a1a', lineHeight: 1 }}>{progress}%</strong>
              </div>
              <span style={{ fontSize: '12px', color: '#a4a097' }}>{completed} / {task.stats.total} 已处理</span>
            </div>

            <div style={{ height: '6px', backgroundColor: '#f0eeec', borderRadius: '999px', overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', backgroundColor: progress === 100 ? '#1aae39' : '#5645d4' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px', alignItems: 'end' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '11px', color: '#787671' }}>AI 待处理</span>
                <strong style={{ fontSize: '16px', color: '#dd5b00' }}>{task.stats.pending_ai}</strong>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '11px', color: '#787671' }}>人工待审</span>
                <strong style={{ fontSize: '16px', color: '#2563eb' }}>{task.stats.pending_manual}</strong>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '11px', color: '#787671' }}>已通过</span>
                <strong style={{ fontSize: '16px', color: '#1aae39' }}>{task.stats.approved}</strong>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="button-sm" type="button" onClick={() => onOpenDetails(task.taskId)} style={{ padding: '6px 14px' }}>
                管理明细
              </button>
            </div>
          </article>
        )
      })}
    </div>
  )
}

function formatTime(value: string | null | undefined) {
  if (!value) return '-'
  const date = parseAppDate(value)
  if (!date) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="json-preview-block">
      {JSON.stringify(value ?? {}, null, 2)}
    </pre>
  )
}

function decisionLabel(decision: string) {
  if (decision === 'approve') return '通过'
  if (decision === 'reject') return '打回'
  if (decision === 'pass') return 'AI 通过'
  if (decision === 'human_review') return '需人工复核'
  return decision
}

function getAIJobStatusMeta(status: string, aiDecision?: string | null, submissionStatus?: string | null, flowStatus?: string | null) {
  if (flowStatus === 'rejected') {
    return { label: '已打回', color: '#e03131' }
  }
  if (flowStatus === 'passed') {
    return { label: '已通过', color: '#1aae39' }
  }
  if (flowStatus === 'fallback_human_review') {
    return { label: '失败转人工复核', color: '#5645d4' }
  }
  if (flowStatus === 'queued') {
    return { label: '排队中', color: '#dd5b00' }
  }

  if (['succeeded', 'done', 'finished'].includes(status)) {
    if (aiDecision === 'reject' || submissionStatus === 'needs_revision') {
      return { label: '已打回', color: '#e03131' }
    }
    if (aiDecision === 'human_review') {
      return { label: '失败转人工复核', color: '#5645d4' }
    }
    return { label: '已通过', color: '#1aae39' }
  }
  if (status === 'failed') {
    return { label: '失败转人工复核', color: '#5645d4' }
  }
  if (status === 'fallback_human_review') {
    return { label: '失败转人工复核', color: '#5645d4' }
  }
  if (status === 'queued' || status === 'running') {
    return { label: '排队中', color: '#dd5b00' }
  }
  return { label: status || '未知', color: '#787671' }
}

function getSeparatedAIJobStatusMeta(status: string, aiDecision?: string | null, submissionStatus?: string | null, flowStatus?: string | null) {
  if (flowStatus === 'rejected') {
    return { label: '已打回', color: '#e03131' }
  }
  if (flowStatus === 'passed') {
    return { label: '已通过', color: '#1aae39' }
  }
  if (flowStatus === 'human_review') {
    return { label: '转人工复核', color: '#5645d4' }
  }
  if (flowStatus === 'failed') {
    return { label: '失败', color: '#e03131' }
  }
  if (flowStatus === 'queued') {
    return { label: '排队中', color: '#dd5b00' }
  }

  if (['succeeded', 'done', 'finished'].includes(status)) {
    if (aiDecision === 'reject' || submissionStatus === 'needs_revision') {
      return { label: '已打回', color: '#e03131' }
    }
    if (aiDecision === 'human_review') {
      return { label: '转人工复核', color: '#5645d4' }
    }
    return { label: '已通过', color: '#1aae39' }
  }
  if (status === 'failed' || status === 'fallback_human_review') {
    return { label: '失败', color: '#e03131' }
  }
  if (status === 'queued' || status === 'running') {
    return { label: '排队中', color: '#dd5b00' }
  }
  return { label: status || '未知', color: '#787671' }
}

function AIAuditFlow({ submission }: { submission: SubmissionReviewDetail }) {
  const statusMeta = getSeparatedAIJobStatusMeta(
    submission.aiAudit?.job?.status || '',
    submission.aiAudit?.result?.decision,
    submission.status,
  )
  
  return (
    <div className="owner-review-ai-box" style={{ background: '#f8f9fa', padding: '20px', borderRadius: '12px', border: '1px solid #e9ecef' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="badge-tag-purple" style={{ fontSize: '11px', fontWeight: 600 }}>AI WORKFLOW</span>
          <h5 style={{ margin: 0, fontSize: '15px' }}>判定链路</h5>
        </div>
        <span style={{ fontSize: '12px', color: statusMeta.color, fontWeight: 600 }}>作业状态: {statusMeta.label}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: submission.aiAudit?.job ? '#1aae39' : '#e9ecef', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', flexShrink: 0 }}>1</div>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a' }}>AI 扫描分析</span>
            <p style={{ fontSize: '12px', color: '#787671', margin: '4px 0 0' }}>
              {submission.aiAudit?.job?.status === 'succeeded' ? '完成数据提取与模型判定' : submission.aiAudit?.job?.errorMessage || '等待 AI 调度执行...'}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: submission.aiAudit?.result ? '#5645d4' : '#e9ecef', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', flexShrink: 0 }}>2</div>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a' }}>预审结论</span>
            {submission.aiAudit?.result ? (
              <div style={{ marginTop: '8px', background: '#fff', padding: '12px', borderRadius: '8px', border: '1px solid #e5e3df' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <span style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    backgroundColor: submission.aiAudit.result.decision === 'pass' ? '#d9f3e1' : '#fde0ec',
                    color: submission.aiAudit.result.decision === 'pass' ? '#1aae39' : '#e03131'
                  }}>
                    {decisionLabel(submission.aiAudit.result.decision)}
                  </span>
                  <strong style={{ fontSize: '16px', color: '#1a1a1a' }}>{submission.aiAudit.result.overallScore} 分</strong>
                </div>
                <p style={{ fontSize: '13px', color: '#37352f', margin: 0, lineHeight: 1.5 }}>{submission.aiAudit.result.summary}</p>
              </div>
            ) : (
              <p style={{ fontSize: '12px', color: '#a4a097', margin: '4px 0 0' }}>等待判定结果回传</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function SubmissionProgressStepper({ submission }: { submission: SubmissionReviewDetail }) {
  const steps = [
    { label: '标注提交', active: true, time: submission.createdAt },
    { label: 'AI 预审', active: !!submission.aiAudit?.result, time: submission.aiAudit?.result?.createdAt },
    { label: '人工复核', active: submission.reviewHistory.length > 0, time: submission.reviewHistory[0]?.createdAt },
    { label: '归档完成', active: submission.status === 'review_passed' || submission.status === 'rejected', time: submission.updatedAt }
  ]

  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '20px 0', borderBottom: '1px solid #ede9e4', marginBottom: '24px' }}>
      {steps.map((step, idx) => (
        <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
          <div style={{ 
            width: '12px', 
            height: '12px', 
            borderRadius: '50%', 
            background: step.active ? '#5645d4' : '#e9ecef',
            zIndex: 2,
            marginBottom: '8px'
          }} />
          <span style={{ fontSize: '11px', fontWeight: 600, color: step.active ? '#1a1a1a' : '#a4a097' }}>{step.label}</span>
          {step.time && <span style={{ fontSize: '10px', color: '#a4a097', marginTop: '2px' }}>{parseAppDate(step.time)?.toLocaleDateString() ?? step.time}</span>}
          {idx < steps.length - 1 && (
            <div style={{ 
              position: 'absolute', 
              top: '5px', 
              left: '50%', 
              width: '100%', 
              height: '2px', 
              background: step.active && steps[idx+1].active ? '#5645d4' : '#e9ecef',
              zIndex: 1
            }} />
          )}
        </div>
      ))}
    </div>
  )
}

function SubmissionDetailCard({ submission }: { submission: SubmissionReviewDetail }) {
  const [showRawData, setShowRawData] = useState(false)
  const filteredTimeline = filterOwnerTimelineItems(submission.timeline)

  return (
    <article className="owner-review-submission-card" style={{ border: '1px solid #ede9e4', borderRadius: '16px', overflow: 'hidden', backgroundColor: '#fff' }}>
      <div className="owner-review-submission-head" style={{ padding: '20px 24px', background: '#fafaf9', borderBottom: '1px solid #ede9e4', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#5645d4' }}>#{submission.submissionId}</span>
          <div>
            <h4 style={{ margin: 0, fontSize: '16px' }}>{submission.labeler.displayName} <small style={{ color: '#787671', fontWeight: 400 }}>({submission.labeler.username})</small></h4>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#a4a097' }}>
              题目 ID: #{submission.item.itemId} · 第 {submission.currentReviewRound} 轮 {submission.currentReviewStage === 'final' ? '终审' : submission.currentReviewStage === 'second' ? '复审' : '初审'}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button 
            className="button-sm" 
            type="button" 
            onClick={() => setShowRawData(!showRawData)}
            style={{ fontSize: '11px', padding: '4px 8px' }}
          >
            {showRawData ? '隐藏原始数据' : '查看原始数据'}
          </button>
          <span className={`status-badge status-${submission.status}`} style={{ fontSize: '11px', fontWeight: 600, padding: '4px 12px' }}>
            {submission.status}
          </span>
        </div>
      </div>

      <div style={{ padding: '24px' }}>
        <SubmissionProgressStepper submission={submission} />

        {showRawData && (
          <div className="owner-review-detail-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px', animation: 'fade-in 0.3s ease' }}>
            <section>
              <h5 style={{ fontSize: '13px', color: '#787671', marginBottom: '10px' }}>题面数据</h5>
              <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #ede9e4', borderRadius: '8px' }}>
                <JsonBlock value={submission.item.source} />
              </div>
            </section>
            <section>
              <h5 style={{ fontSize: '13px', color: '#787671', marginBottom: '10px' }}>提交答案</h5>
              <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #ede9e4', borderRadius: '8px' }}>
                <JsonBlock value={submission.answers} />
              </div>
            </section>
          </div>
        )}

        <AIAuditFlow submission={submission} />

        <div style={{ marginTop: '24px', display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '24px' }}>
          <section>
            <h5 style={{ fontSize: '13px', color: '#787671', marginBottom: '10px' }}>人工审核历史</h5>
            {submission.reviewHistory.length === 0 ? (
              <p style={{ fontSize: '12px', color: '#a4a097', background: '#f8f9fa', padding: '12px', borderRadius: '8px' }}>暂无人工复核记录。</p>
            ) : (
              <div className="owner-review-history-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* 过滤掉可能的重复记录（基于 recordId） */}
                {Array.from(new Map(submission.reviewHistory.map(r => [r.recordId, r])).values()).map((record) => (
                  <div className="owner-review-history-item" key={record.recordId} style={{ padding: '12px', borderLeft: `3px solid ${record.decision === 'approve' ? '#1aae39' : '#dc2626'}`, backgroundColor: '#fdfdfd' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <strong style={{ fontSize: '13px' }}>{decisionLabel(record.decision)} · {record.reviewerName ?? '未知审核员'}</strong>
                      <span style={{ fontSize: '11px', color: '#a4a097' }}>{formatTime(record.createdAt)}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '12px', color: '#787671' }}>{record.stage} / 第 {record.round} 轮</p>
                    {record.comment || record.reason ? (
                      <p style={{ margin: '8px 0 0', fontSize: '13px', color: '#37352f', background: '#f6f5f4', padding: '8px', borderRadius: '4px' }}>
                        {record.reason ? `打回理由：${record.reason}` : record.comment}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h5 style={{ fontSize: '13px', color: '#787671', marginBottom: '10px' }}>操作时间线</h5>
            <div className="owner-review-timeline" style={{ position: 'relative', paddingLeft: '16px' }}>
              <div style={{ position: 'absolute', left: '0', top: '0', bottom: '0', width: '2px', background: '#ede9e4' }} />
              {filteredTimeline.slice(-4).map((item, index) => {
                const visual = getTimelineVisual(item)
                return (
                  <div className="owner-review-timeline-item" key={`${item.type}-${item.createdAt}-${index}`} style={{ position: 'relative', marginBottom: '12px' }}>
                    <div style={{ position: 'absolute', left: '-20px', top: '4px', width: '8px', height: '8px', borderRadius: '50%', background: visual.dotColor, border: '2px solid #fff' }} />
                    <span style={{ display: 'block', fontSize: '10px', color: '#a4a097' }}>{formatTime(item.createdAt)}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: 600, backgroundColor: visual.badgeBg, color: visual.badgeColor }}>
                        {visual.badgeLabel}
                      </span>
                      <strong style={{ fontSize: '12px', color: '#1a1a1a', display: 'block' }}>{visual.title}</strong>
                    </div>
                    {visual.summary ? (
                      <p style={{ margin: '6px 0 0', fontSize: '11px', lineHeight: 1.5, color: '#787671' }}>
                        {visual.summary}
                      </p>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      </div>
    </article>
  )
}

function TaskReviewDetailsModal({
  loading,
  error,
  details,
  onClose,
}: {
  loading: boolean
  error: string
  details: TaskReviewDetails | null
  onClose: () => void
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null)

  useEffect(() => {
    if (details?.submissions?.length && selectedId === null) {
      const firstSubmission = sortSubmissionsByTaskOrder(details.submissions)[0]
      if (firstSubmission) {
        setSelectedId(firstSubmission.submissionId)
      }
    }
  }, [details, selectedId])

  const orderedSubmissions = details?.submissions ? sortSubmissionsByTaskOrder(details.submissions) : []
  const selectedSubmission = orderedSubmissions.find(s => s.submissionId === selectedId)

  return (
    <div className="modal-overlay" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="modal-card modal-card-wide owner-review-detail-modal" style={{ maxWidth: '1200px', width: '95vw', height: '90vh', display: 'flex', flexDirection: 'column', padding: 0 }}>
        {/* 顶部总览 - 保持一致 */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #ede9e4', backgroundColor: '#fff', borderTopLeftRadius: '12px', borderTopRightRadius: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ background: '#5645d4', color: '#fff', width: '40px', height: '40px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                {details?.task.taskId}
              </div>
              <div>
                <span className="section-eyebrow">Production Dashboard</span>
                <h3 style={{ margin: 0, fontSize: '18px' }}>{details ? details.task.title : '加载中...'}</h3>
              </div>
            </div>
            <button type="button" className="button-close" onClick={onClose} style={{ fontSize: '24px' }}>×</button>
          </div>
          
          {details && (
            <div className="owner-review-summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
              <div style={{ padding: '10px 16px', background: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef' }}>
                <span style={{ fontSize: '11px', color: '#787671', display: 'block' }}>提交总数</span>
                <strong style={{ fontSize: '18px' }}>{details.summary.total}</strong>
              </div>
              <div style={{ padding: '10px 16px', background: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef' }}>
                <span style={{ fontSize: '11px', color: '#787671', display: 'block' }}>AI 待处理</span>
                <strong style={{ fontSize: '18px', color: '#dd5b00' }}>{details.summary.pendingAi}</strong>
              </div>
              <div style={{ padding: '10px 16px', background: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef' }}>
                <span style={{ fontSize: '11px', color: '#787671', display: 'block' }}>人工待审</span>
                <strong style={{ fontSize: '18px', color: '#5645d4' }}>{details.summary.pendingManual}</strong>
              </div>
              <div style={{ padding: '10px 16px', background: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef' }}>
                <span style={{ fontSize: '11px', color: '#787671', display: 'block' }}>已通过</span>
                <strong style={{ fontSize: '18px', color: '#1aae39' }}>{details.summary.approved}</strong>
              </div>
              <div style={{ padding: '10px 16px', background: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef' }}>
                <span style={{ fontSize: '11px', color: '#787671', display: 'block' }}>已打回</span>
                <strong style={{ fontSize: '18px', color: '#e03131' }}>{details.summary.rejected}</strong>
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#787671' }}>正在调取全链路审核明细...</div>
        ) : error ? (
          <div style={{ flex: 1, padding: '40px', textAlign: 'center', color: '#e03131' }}>{error}</div>
        ) : (
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* 左侧菜单 */}
            <div style={{ width: '280px', borderRight: '1px solid #ede9e4', overflowY: 'auto', backgroundColor: '#fafaf9' }}>
              <div style={{ padding: '12px 16px', fontSize: '12px', color: '#a4a097', fontWeight: 600 }}>提交列表</div>
              {orderedSubmissions.map((s, index) => (
                <button
                  key={s.submissionId}
                  onClick={() => setSelectedId(s.submissionId)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    border: 'none',
                    background: selectedId === s.submissionId ? '#fff' : 'transparent',
                    borderBottom: '1px solid #ede9e4',
                    cursor: 'pointer',
                    textAlign: 'left',
                    boxShadow: selectedId === s.submissionId ? 'inset 4px 0 0 #5645d4' : 'none'
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a' }}>第 {index + 1} 题</span>
                    <span style={{ fontSize: '11px', color: '#787671' }}>提交者：{s.labeler.displayName}</span>
                  </div>
                  <span style={{ fontSize: '16px' }} title={s.status}>{getStatusIcon(s.status)}</span>
                </button>
              ))}
            </div>

            {/* 右侧详情 */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px', backgroundColor: '#fff' }}>
              {selectedSubmission ? (
                <div className="animate-fade-in">
                  <SubmissionDetailCard submission={selectedSubmission} />
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#a4a097' }}>
                  请从左侧选择一个提交项查看详情
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}


function LabelerPerformanceTab({
  data,
  sort,
  onSortChange,
  onOpenDetails,
}: {
  data: LabelerPerformance[]
  sort: LabelerSortKey
  onSortChange: (value: LabelerSortKey) => void
  onOpenDetails: (item: LabelerPerformance) => void
}) {
  if (data.length === 0) {
    return (
      <div className="card-base" style={{ textAlign: 'center', padding: '60px 20px', backgroundColor: '#f6f5f4' }}>
        <p style={{ color: '#a4a097' }}>当前暂无标注员效能数据</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <div
        className="card-base"
        style={{
          padding: '18px 20px',
          border: '1px solid #e5e3df',
          borderRadius: '12px',
          backgroundColor: '#fff',
          display: 'flex',
          justifyContent: 'space-between',
          gap: '16px',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <strong style={{ display: 'block', fontSize: '16px', color: '#1a1a1a', marginBottom: '4px' }}>标注员效能列表</strong>
          <p style={{ margin: 0, color: '#787671', fontSize: '13px' }}>
            评分口径与标注员「我的贡献」保持一致，综合通过率、完成覆盖率和返修控制计算。
          </p>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#5d5b54', fontSize: '13px' }}>
          评分排序
          <select
            aria-label="评分排序"
            value={sort}
            onChange={(event) => onSortChange(event.target.value as LabelerSortKey)}
            style={{ border: '1px solid #d8d3cd', borderRadius: '8px', padding: '8px 12px', background: '#fff' }}
          >
            <option value="score-desc">从高到低</option>
            <option value="score-asc">从低到高</option>
          </select>
        </label>
      </div>

      <div className="card-base" style={{ padding: '0', overflowX: 'auto', border: '1px solid #e5e3df', borderRadius: '12px' }}>
        <table className="data-table" style={{ width: '100%', minWidth: '980px', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#fafaf9', borderBottom: '1px solid #ede9e4' }}>
              <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '13px', color: '#787671', fontWeight: 500 }}>标注员</th>
              <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '13px', color: '#787671', fontWeight: 500 }}>能力评分</th>
              <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '13px', color: '#787671', fontWeight: 500 }}>审核通过率</th>
              <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '13px', color: '#787671', fontWeight: 500 }}>完成覆盖率</th>
              <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '13px', color: '#787671', fontWeight: 500 }}>返修率</th>
              <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '13px', color: '#787671', fontWeight: 500 }}>已处理量</th>
              <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '13px', color: '#787671', fontWeight: 500 }}>任务数</th>
              <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '13px', color: '#787671', fontWeight: 500 }}>最近更新</th>
              <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '13px', color: '#787671', fontWeight: 500 }}>操作</th>
            </tr>
          </thead>
          <tbody style={{ fontSize: '14px' }}>
            {data.map((item) => {
              const ability = calculateLabelerAbility(item.assignments)
              const qualityTone = getQualityTone(ability.qualityScore, ability.processedCount)

              return (
                <tr key={item.labelerId} data-testid={`labeler-row-${item.labelerId}`} style={{ borderBottom: '1px solid #ede9e4' }}>
                  <td style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '50%',
                          backgroundColor: '#e6f4ea',
                          color: '#177245',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                        }}
                      >
                        {item.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ display: 'block', color: '#1a1a1a' }}>{item.displayName}</strong>
                        <span style={{ color: '#787671', fontSize: '12px' }}>@{item.username}</span>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <strong style={{ fontSize: '20px', color: '#177245' }}>{ability.qualityScore}</strong>
                      <span style={{ color: '#787671', fontSize: '12px' }}>{qualityTone}</span>
                    </div>
                  </td>
                  <td style={{ padding: '16px 20px', color: '#37352f' }}>{formatPercent(ability.passRate)}</td>
                  <td style={{ padding: '16px 20px', color: '#37352f' }}>{formatPercent(ability.completionRate)}</td>
                  <td style={{ padding: '16px 20px', color: '#37352f' }}>{formatPercent(ability.revisionRate)}</td>
                  <td style={{ padding: '16px 20px', color: '#37352f' }}>{ability.processedCount}</td>
                  <td style={{ padding: '16px 20px', color: '#37352f' }}>{item.metrics.claimedTaskCount}</td>
                  <td style={{ padding: '16px 20px', color: '#787671', fontSize: '12px' }}>{formatTime(item.latestUpdatedAt)}</td>
                  <td style={{ padding: '16px 20px' }}>
                    <button
                      className="button-sm"
                      type="button"
                      aria-label={`查看 ${item.displayName} 评分`}
                      onClick={() => onOpenDetails(item)}
                      style={{ padding: '6px 14px' }}
                    >
                      查看评分
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}


function LabelerPerformanceModal({ item, onClose }: { item: LabelerPerformance, onClose: () => void }) {
  const ability = calculateLabelerAbility(item.assignments)
  const qualityTone = getQualityTone(ability.qualityScore, ability.processedCount)

  return (
    <div className="modal-overlay" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="modal-card owner-review-detail-modal" style={{ maxWidth: '920px', width: '92vw', padding: 0 }}>
        <div
          style={{
            padding: '24px 28px',
            borderBottom: '1px solid #ede9e4',
            display: 'flex',
            justifyContent: 'space-between',
            gap: '16px',
            alignItems: 'flex-start',
          }}
        >
          <div>
            <span className="section-eyebrow">Labeler efficiency</span>
            <h3 style={{ margin: '4px 0 6px', fontSize: '22px' }}>{item.displayName}</h3>
            <p style={{ margin: 0, color: '#787671', fontSize: '14px' }}>
              @{item.username} · 共认领 {item.metrics.claimedTaskCount} 个任务，最近更新于 {formatTime(item.latestUpdatedAt)}
            </p>
          </div>
          <button type="button" className="button-close" aria-label="关闭评分弹窗" onClick={onClose} style={{ fontSize: '24px' }}>
            ×
          </button>
        </div>

        <div style={{ padding: '24px 28px', display: 'grid', gap: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '24px', alignItems: 'center' }}>
            <article className="card contribution-score-card" style={{ margin: 0 }}>
              <div>
                <span className="section-eyebrow">Ability score</span>
                <h3>标注能力评分</h3>
                <p className="field-helper-text">和“我的贡献”同口径，综合通过率、完成覆盖率和返修控制计算。</p>
              </div>
              <div
                className="contribution-score-ring"
                style={{
                  background: `conic-gradient(#177245 ${ability.qualityScore}%, #edf2ee 0)`,
                }}
              >
                <div>
                  <strong>{ability.qualityScore}</strong>
                  <span>{qualityTone}</span>
                </div>
              </div>
            </article>

            <article className="card contribution-insight-card" style={{ margin: 0 }}>
              <span className="section-eyebrow">Quality profile</span>
              <h3>能力画像</h3>
              <div className="contribution-radar-list">
                <div className="contribution-skill-row">
                  <span>准确性</span>
                  <div><i style={{ width: formatPercent(ability.passRate) }} /></div>
                  <strong>{formatPercent(ability.passRate)}</strong>
                </div>
                <div className="contribution-skill-row">
                  <span>稳定性</span>
                  <div><i style={{ width: formatPercent(ability.consistencyScore) }} /></div>
                  <strong>{formatPercent(ability.consistencyScore)}</strong>
                </div>
                <div className="contribution-skill-row">
                  <span>完成度</span>
                  <div><i style={{ width: formatPercent(ability.completionRate) }} /></div>
                  <strong>{formatPercent(ability.completionRate)}</strong>
                </div>
                <div className="contribution-skill-row">
                  <span>审核推进</span>
                  <div><i style={{ width: formatPercent(100 - ability.pendingReviewRate) }} /></div>
                  <strong>{formatPercent(100 - ability.pendingReviewRate)}</strong>
                </div>
              </div>
            </article>
          </div>

          <div className="owner-review-summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
            <div style={{ padding: '14px 16px', background: '#f8f9fa', borderRadius: '12px', border: '1px solid #e9ecef' }}>
              <span style={{ display: 'block', color: '#787671', fontSize: '12px', marginBottom: '6px' }}>审核通过率</span>
              <strong style={{ fontSize: '20px' }}>{formatPercent(ability.passRate)}</strong>
            </div>
            <div style={{ padding: '14px 16px', background: '#f8f9fa', borderRadius: '12px', border: '1px solid #e9ecef' }}>
              <span style={{ display: 'block', color: '#787671', fontSize: '12px', marginBottom: '6px' }}>完成覆盖率</span>
              <strong style={{ fontSize: '20px' }}>{formatPercent(ability.completionRate)}</strong>
            </div>
            <div style={{ padding: '14px 16px', background: '#f8f9fa', borderRadius: '12px', border: '1px solid #e9ecef' }}>
              <span style={{ display: 'block', color: '#787671', fontSize: '12px', marginBottom: '6px' }}>返修率</span>
              <strong style={{ fontSize: '20px' }}>{formatPercent(ability.revisionRate)}</strong>
            </div>
            <div style={{ padding: '14px 16px', background: '#f8f9fa', borderRadius: '12px', border: '1px solid #e9ecef' }}>
              <span style={{ display: 'block', color: '#787671', fontSize: '12px', marginBottom: '6px' }}>已处理量</span>
              <strong style={{ fontSize: '20px' }}>{ability.processedCount}</strong>
            </div>
          </div>

          <article className="card" style={{ padding: '20px 24px' }}>
            <div className="section-header" style={{ marginBottom: '12px' }}>
              <div>
                <span className="section-eyebrow">Calibration</span>
                <h3 style={{ margin: 0 }}>评分说明</h3>
              </div>
            </div>
            <p style={{ margin: 0, color: '#5d5b54', lineHeight: 1.7 }}>
              能力评分优先观察已出审核结论的题目质量，其中通过率反映答案与规范的一致性，返修率反映稳定性，完成覆盖率反映领取任务后的推进效率。
            </p>
          </article>

          <article className="card" style={{ padding: '20px 24px' }}>
            <div className="section-header" style={{ marginBottom: '12px' }}>
              <div>
                <span className="section-eyebrow">Task performance</span>
                <h3 style={{ margin: 0 }}>任务表现</h3>
              </div>
            </div>
            {ability.taskPerformance.length > 0 ? (
              <div className="contribution-task-chart">
                {ability.taskPerformance.map(({ assignment, completionRate, passRate, revisionRate, pendingReview }) => (
                  <div className="contribution-task-row" key={assignment.assignmentId}>
                    <div>
                      <strong>{assignment.taskTitle}</strong>
                      <span>{`完成 ${formatPercent(completionRate)} · 通过 ${formatPercent(passRate)} · 返修 ${formatPercent(revisionRate)} · 待审 ${pendingReview}`}</span>
                    </div>
                    <div className="contribution-task-bars">
                      <i className="contribution-task-bars__completion" style={{ width: formatPercent(completionRate) }} />
                      <i className="contribution-task-bars__pass" style={{ width: formatPercent(passRate) }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, color: '#787671' }}>当前还没有可用于评估的任务表现。</p>
            )}
          </article>
        </div>
      </div>
    </div>
  )
}


function ManualReviewQueueTab({ data }: { data: ReviewerWorkload[] }) {
  if (data.length === 0) {
    return (
      <div className="card-base" style={{ textAlign: 'center', padding: '60px 20px', backgroundColor: '#f6f5f4' }}>
        <p style={{ color: '#a4a097' }}>当前暂无审查员分配数据</p>
      </div>
    )
  }

  return (
    <div className="card-base" style={{ padding: '0', overflow: 'hidden', border: '1px solid #e5e3df', borderRadius: '12px' }}>
      <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#fafaf9', borderBottom: '1px solid #ede9e4' }}>
            <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '13px', color: '#787671', fontWeight: 500 }}>审查员</th>
            <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '13px', color: '#787671', fontWeight: 500 }}>累计分配</th>
            <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '13px', color: '#787671', fontWeight: 500 }}>已处理</th>
            <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '13px', color: '#787671', fontWeight: 500 }}>待审积压</th>
            <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '13px', color: '#787671', fontWeight: 500 }}>负荷情况</th>
          </tr>
        </thead>
        <tbody style={{ fontSize: '14px' }}>
          {data.map((item) => {
            const loadLevel = item.stats.pending_count > 10 ? 'high' : item.stats.pending_count > 5 ? 'medium' : 'low'
            const loadLabel = loadLevel === 'high' ? '高负载' : loadLevel === 'medium' ? '适中' : '空闲'

            return (
              <tr key={item.reviewerId} style={{ borderBottom: '1px solid #ede9e4' }}>
                <td style={{ padding: '16px 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#e6e0f5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5645d4', fontWeight: 600, fontSize: '12px' }}>
                      {item.displayName.charAt(0).toUpperCase()}
                    </div>
                    <span style={{ fontWeight: 600, color: '#1a1a1a' }}>{item.displayName}</span>
                  </div>
                </td>
                <td style={{ padding: '16px 24px', color: '#37352f' }}>{item.stats.assigned_count}</td>
                <td style={{ padding: '16px 24px', color: '#37352f' }}>{item.stats.completed_count}</td>
                <td style={{ padding: '16px 24px' }}>
                  <span style={{
                    fontWeight: 600,
                    color: item.stats.pending_count > 0 ? '#5645d4' : '#a4a097',
                    backgroundColor: item.stats.pending_count > 0 ? '#e6e0f5' : 'transparent',
                    padding: item.stats.pending_count > 0 ? '2px 8px' : '0',
                    borderRadius: '4px'
                  }}>
                    {item.stats.pending_count}
                  </span>
                </td>
                <td style={{ padding: '16px 24px' }}>
                  <span className={`badge-tag-${loadLevel === 'high' ? 'orange' : loadLevel === 'medium' ? 'purple' : 'green'}`} style={{
                    backgroundColor: loadLevel === 'high' ? '#ffe8d4' : loadLevel === 'medium' ? '#e6e0f5' : '#d9f3e1',
                    color: loadLevel === 'high' ? '#dd5b00' : loadLevel === 'medium' ? '#5645d4' : '#1aae39',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600
                  }}>
                    {loadLabel}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function AIAuditMonitorTab({ data }: { data: AIJobStatus[] }) {
  if (data.length === 0) {
    return (
      <div className="card-base" style={{ textAlign: 'center', padding: '60px 20px', backgroundColor: '#f6f5f4' }}>
        <p style={{ color: '#a4a097' }}>暂无 AI 审核流水记录</p>
      </div>
    )
  }

  return (
    <div className="card-base" style={{ padding: '0', overflow: 'hidden', border: '1px solid #e5e3df', borderRadius: '12px' }}>
      <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#fafaf9', borderBottom: '1px solid #ede9e4' }}>
            <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '13px', color: '#787671', fontWeight: 500 }}>关联任务</th>
            <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '13px', color: '#787671', fontWeight: 500 }}>提交 ID</th>
            <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '13px', color: '#787671', fontWeight: 500 }}>作业状态</th>
            <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '13px', color: '#787671', fontWeight: 500 }}>重试</th>
            <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '13px', color: '#787671', fontWeight: 500 }}>更新于</th>
            <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '13px', color: '#787671', fontWeight: 500 }}>执行反馈</th>
          </tr>
        </thead>
        <tbody style={{ fontSize: '14px' }}>
          {data.map((job) => {
            const statusMeta = getSeparatedAIJobStatusMeta(job.status, job.aiDecision, job.submissionStatus, job.flowStatus)
            return (
              <tr key={job.jobId} style={{ borderBottom: '1px solid #ede9e4' }}>
                <td style={{ padding: '16px 24px', fontWeight: 500, color: '#1a1a1a' }}>{job.taskTitle}</td>
                <td style={{ padding: '16px 24px', color: '#787671' }}>#{job.submissionId}</td>
                <td style={{ padding: '16px 24px' }}>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: statusMeta.color
                  }}>
                    <span style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: statusMeta.color
                    }} />
                    {statusMeta.label}
                  </span>
                </td>
                <td style={{ padding: '16px 24px', color: '#787671' }}>{job.attemptCount}</td>
                <td style={{ padding: '16px 24px', color: '#a4a097', fontSize: '12px' }}>
                  {formatTime(job.updatedAt)}
                </td>
                <td style={{ padding: '16px 24px' }}>
                  {job.errorReason ? (
                    <span style={{ color: '#e03131', fontSize: '12px', display: 'block', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={job.errorReason}>
                      {job.errorReason}
                    </span>
                  ) : (
                    <span style={{ color: '#bbb8b1' }}>-</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
