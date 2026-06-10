import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ResizableTimelinePanel } from '../../../components/ResizableTimelinePanel'
import { Renderer } from '../../../features/renderer/Renderer'
import { MediaValue } from '../../../features/renderer/MediaValue'
import { apiGet, apiPost } from '../../../services/api/client'
import { TimeRangeFilter } from '../../../components/TimeRangeFilter'
import { projectTemplateSchemaToPane } from '../../../utils/templateSchema'
import type {
  AIDecision,
  JsonRecord,
  ReviewAnswerValue,
  ReviewDetail,
  ReviewPendingItem,
  TemplateComponent,
  TemplateSchema,
} from '../../../types/domain'
import { filterByTimeRange, type TimeRangeKey } from '../../../utils/timeRangeFilter'
import { parseAppDate } from '../../../utils/time'

type PendingReviewsResponse = {
  items: ReviewPendingItem[]
  total: number
}

type ReviewActionResponse = {
  submissionId: number
  status: 'review_passed' | 'needs_revision' | 'ai_passed'
  currentReviewStage?: 'initial' | 'second' | 'final'
  currentReviewRound?: number
}

type ReviewBulkApproveResponse = {
  submissionIds: number[]
  status: 'review_passed' | 'ai_passed'
}

type ReviewBulkRejectResponse = {
  submissionIds: number[]
  status: 'needs_revision'
}

type ReviewUnassignResponse = {
  submissionId: number
  reviewerId: number | null
}

type ViewMode = 'list' | 'detail'
type ReviewSortMode = 'smart' | 'newest'

type PendingReviewGroup = {
  taskId: number
  taskTitle: string
  items: ReviewPendingItem[]
  maxPriorityScore: number
  newestSubmittedAt: number
}

function schemaSupportsPanePreview(schema: TemplateSchema | undefined) {
  if (!schema) return false
  if (!Array.isArray(schema) && 'sourceView' in schema && 'answerView' in schema) return true
  if (Array.isArray(schema)) {
    return schema.some((component) => component.pane === 'source' || component.pane === 'answer')
  }

  const legacySchema = schema as unknown as { components?: unknown }
  if (Array.isArray(legacySchema.components)) {
    return (legacySchema.components as Array<{ pane?: string }>).some((component) => component.pane === 'source' || component.pane === 'answer')
  }
  return false
}

function formatAnswerValue(value: ReviewAnswerValue | undefined) {
  if (value === undefined || value === null || value === '') return '暂无内容'
  return Array.isArray(value) ? value.join(', ') || '暂无内容' : value
}

function formatStage(stage?: 'initial' | 'second' | 'final') {
  if (stage === 'initial') return '初审'
  if (stage === 'second') return '复审'
  if (stage === 'final') return '终审'
  return '待定阶段'
}

function formatReviewTime(value?: string) {
  if (!value) return '时间待同步'
  const date = parseAppDate(value)
  if (!date) return value
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatDecisionBadge(decision: AIDecision) {
  const colors: Record<AIDecision, { bg: string; fg: string; label: string }> = {
    pass: { bg: '#d9f3e1', fg: '#1aae39', label: '建议通过' },
    reject: { bg: '#fde0ec', fg: '#e03131', label: '建议打回' },
    human_review: { bg: '#e6e0f5', fg: '#5645d4', label: '人工复审' },
  }
  const color = colors[decision]
  return (
    <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 600, backgroundColor: color.bg, color: color.fg }}>
      {color.label}
    </span>
  )
}

function formatDecisionLabel(decision: AIDecision) {
  if (decision === 'pass') return '建议通过'
  if (decision === 'reject') return '建议打回'
  return '人工复审'
}

function renderDecisionBadge(decision: AIDecision) {
  const colors: Record<AIDecision, { bg: string; fg: string }> = {
    pass: { bg: '#d9f3e1', fg: '#1aae39' },
    reject: { bg: '#fde0ec', fg: '#e03131' },
    human_review: { bg: '#e6e0f5', fg: '#5645d4' },
  }
  const color = colors[decision]
  return (
    <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, backgroundColor: color.bg, color: color.fg }}>
      {decision}
    </span>
  )
}

function getReviewPriorityVisual(level?: ReviewPendingItem['reviewPriorityLevel']) {
  if (level === 'high') {
    return { label: '高优先级', bg: '#fef2f2', fg: '#e03131', border: '#fecaca' }
  }
  if (level === 'medium') {
    return { label: '中优先级', bg: '#fff7ed', fg: 'var(--color-warning)', border: '#fed7aa' }
  }
  return { label: '常规', bg: '#f5f5f4', fg: '#5d5b54', border: '#e7e5e4' }
}

function getSubmittedAtTime(item: ReviewPendingItem) {
  return parseAppDate(item.submittedAt)?.getTime() ?? 0
}

function compareReviewItems(a: ReviewPendingItem, b: ReviewPendingItem, sortMode: ReviewSortMode) {
  if (sortMode === 'newest') {
    return getSubmittedAtTime(b) - getSubmittedAtTime(a)
  }
  return (b.reviewPriorityScore ?? 0) - (a.reviewPriorityScore ?? 0) || getSubmittedAtTime(a) - getSubmittedAtTime(b)
}

function formatRejectRate(rate?: number) {
  return `${Math.round((rate ?? 0) * 100)}%`
}

function renderSource(source: JsonRecord) {
  return Object.entries(source).map(([key, value]) => (
    <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '16px' }}>
      <span style={{ fontSize: '13px', fontWeight: 600, color: '#787671' }}>{key}</span>
      <div style={{ fontSize: '14px', color: '#1a1a1a', backgroundColor: '#fafaf9', padding: '12px', borderRadius: '8px', border: '1px solid #ede9e4', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        <MediaValue fieldName={key} source={source} value={value} />
      </div>
    </div>
  ))
}

function isStructuredJsonString(value: ReviewAnswerValue | undefined) {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (!trimmed) return false
  if (!(trimmed.startsWith('{') && trimmed.endsWith('}')) && !(trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    return false
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown
    return typeof parsed === 'object' && parsed !== null
  } catch {
    return false
  }
}

function filterReviewerPreviewComponents(
  components: TemplateComponent[],
  hiddenFields: Set<string>,
): TemplateComponent[] {
  return components.flatMap((component) => {
    if (component.type === 'json_editor') {
      if (component.field) hiddenFields.add(component.field)
      return []
    }

    if (component.type === 'group') {
      const children = filterReviewerPreviewComponents(component.children ?? [], hiddenFields)
      return children.length > 0 ? [{ ...component, children }] : []
    }

    if (component.type === 'tab_container') {
      const tabs = (component.tabs ?? [])
        .map((tab) => ({ ...tab, children: filterReviewerPreviewComponents(tab.children ?? [], hiddenFields) }))
        .filter((tab) => tab.children.length > 0)
      return tabs.length > 0 ? [{ ...component, tabs }] : []
    }

    return [component]
  })
}

function sanitizeReviewerPreviewSchema(schema: TemplateSchema) {
  const hiddenFields = new Set<string>()

  if (Array.isArray(schema)) {
    return {
      schema: filterReviewerPreviewComponents(schema, hiddenFields),
      hiddenFields,
    }
  }

  if ('components' in schema && Array.isArray(schema.components)) {
    return {
      schema: {
        ...schema,
        components: filterReviewerPreviewComponents(schema.components as TemplateComponent[], hiddenFields),
      } as TemplateSchema,
      hiddenFields,
    }
  }

  return {
    schema: {
      ...schema,
      sourceView: {
        components: filterReviewerPreviewComponents(schema.sourceView.components, hiddenFields),
      },
      answerView: {
        components: filterReviewerPreviewComponents(schema.answerView.components, hiddenFields),
      },
    } as TemplateSchema,
    hiddenFields,
  }
}

function schemaHasVisibleComponents(schema: TemplateSchema) {
  if (Array.isArray(schema)) return schema.length > 0
  if ('components' in schema && Array.isArray(schema.components)) return schema.components.length > 0
  return schema.sourceView.components.length > 0 || schema.answerView.components.length > 0
}

function renderAnswers(answers: Record<string, ReviewAnswerValue>, hiddenFields: Set<string> = new Set()) {
  const visibleEntries = Object.entries(answers).filter(([key, value]) => !hiddenFields.has(key) && !isStructuredJsonString(value))

  if (visibleEntries.length === 0) {
    return <p style={{ margin: 0, color: '#787671', fontSize: '13px' }}>结构化结果已隐藏</p>
  }

  return visibleEntries.map(([key, value]) => (
    <div key={key} id={`field-${key}`} style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '16px' }}>
      <span style={{ fontSize: '13px', fontWeight: 600, color: '#787671' }}>{key}</span>
      <div style={{ fontSize: '14px', color: '#1a1a1a', backgroundColor: '#fff', padding: '12px', borderRadius: '8px', border: '1px solid #e5e3df', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {formatAnswerValue(value)}
      </div>
    </div>
  ))
}

function renderAIScores(scores: ReviewDetail['aiResult']['scores']) {
  if (scores.length === 0) {
    return <p style={{ color: '#a4a097', fontSize: '13px', margin: 0 }}>AI 预审结果待补充</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {scores.map((score) => {
        const scoreValue = Number(score.score) || 0
        const maxScore = 5
        const barColor = scoreValue <= 2 ? '#e03131' : scoreValue === 3 ? 'var(--color-warning)' : '#1aae39'
        const barWidth = `${Math.min(100, Math.max(0, (scoreValue / maxScore) * 100))}%`
        return (
          <div
            key={score.dimension}
            style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '12px', backgroundColor: '#fafaf9', borderRadius: '8px', border: '1px solid #ede9e4', cursor: 'pointer' }}
            onClick={() => document.getElementById(`field-${score.dimension}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            title="点击定位到对应字段"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, color: '#1a1a1a', fontSize: '13px' }}>{score.dimension}</span>
              <span style={{ fontWeight: 600, color: barColor, fontSize: '13px' }}>{score.score} / {maxScore}</span>
            </div>
            <div style={{ width: '100%', height: '6px', backgroundColor: '#f0eeec', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: barWidth, backgroundColor: barColor }} />
            </div>
            <span style={{ fontSize: '12px', color: '#787671', marginTop: '4px' }}>{score.reason}</span>
          </div>
        )
      })}
    </div>
  )
}

function getLatestRejectReason(detail: ReviewDetail | null) {
  if (!detail) return ''
  const latestRejectRecord = [...(detail.reviewHistory ?? [])]
    .reverse()
    .find((item) => item.decision === 'reject' && item.reason.trim())
  if (latestRejectRecord) return latestRejectRecord.reason
  if (detail.submissionStatus === 'needs_revision' && detail.aiResult.summary.trim()) return detail.aiResult.summary
  return ''
}

function getQueueItemLabel(index: number) {
  return `第 ${index + 1} 题`
}

function mapTimelineTitle(title: string) {
  const map: Record<string, string> = {
    'Submission created': '创建标注提交',
    'Submission submitted': '首次提交',
    'AI audit job created': '触发 AI 预审',
    'AI audit job started': 'AI 开始扫描',
    'AI audit job finished': 'AI 完成判定',
    'Review record created': '记录审核结论',
    'review_approved': '人工审核通过',
    'review_rejected': '人工打回修改',
    'review_assigned': '分配审核员',
    'review_unassigned': '取消分配',
    'submission_submitted': '首次提交题目',
    'submission_version_created': '生成提交版本',
    'submission_resubmitted': '重新提交题目',
    'ai_job_queued': 'AI 作业进入队列',
    'ai_job_started': 'AI 开始执行',
    'ai_audit_completed': 'AI 预审判定',
    'ai_audit_fallback_human_review': 'AI 转人工复核',
    'ai_audit_succeeded': 'AI 预审通过',
  }
  return map[title] || title
}

function getTimelineVisual(item: ReviewDetail['timeline'][number]) {
  const displayTitle = mapTimelineTitle(item.eventType || item.title || '')

  if (item.eventType === 'submission_submitted' || item.eventType === 'submission_resubmitted') {
    return {
      badgeLabel: item.eventType === 'submission_submitted' ? '标注提交' : '版本重提',
      badgeBg: '#eef2ff',
      badgeColor: '#5645d4',
      title: displayTitle,
      dotColor: '#5645d4',
    }
  }

  if (item.eventType === 'ai_audit_completed' || item.type === 'audit') {
    const decision = item.payload?.decision
    if (decision === 'pass') {
      return {
        badgeLabel: 'AI 预审',
        badgeBg: '#f0fdf4',
        badgeColor: '#1aae39',
        title: 'AI 预审通过',
        dotColor: '#1aae39',
      }
    }
    if (decision === 'reject') {
      return {
        badgeLabel: 'AI 预审',
        badgeBg: '#fef2f2',
        badgeColor: '#e03131',
        title: 'AI 预审不通过',
        dotColor: '#e03131',
      }
    }
    return {
      badgeLabel: 'AI 预审',
      badgeBg: '#f5f3ff',
      badgeColor: '#5645d4',
      title: displayTitle === 'ai_audit_completed' ? 'AI 判定完成' : displayTitle,
      dotColor: '#5645d4',
    }
  }

  if (item.type === 'review') {
    const isApprove = item.decision === 'approve'
    return {
      badgeLabel: '人工复核',
      badgeBg: isApprove ? '#f0fdf4' : '#fef2f2',
      badgeColor: isApprove ? '#1aae39' : '#e03131',
      title: isApprove ? '复核通过' : '复核打回',
      dotColor: isApprove ? '#1aae39' : '#e03131',
    }
  }

  return {
    badgeLabel: '系统日志',
    badgeBg: '#f5f5f4',
    badgeColor: '#787671',
    title: displayTitle,
    dotColor: '#a4a097',
  }
}

function renderTimelineItem(item: ReviewDetail['timeline'][number], index: number) {
  const visual = getTimelineVisual(item)
  const reviewerName = item.reviewerName || (typeof item.payload?.reviewerName === 'string' ? item.payload.reviewerName : '')
  const labelerName = item.labelerName || (typeof item.payload?.labelerName === 'string' ? item.payload.labelerName : '')
  const actorMeta = [
    reviewerName ? `审核员：${reviewerName}` : '',
    labelerName ? `标注员：${labelerName}` : '',
  ].filter(Boolean).join('  ')
  return (
    <div key={`${item.type}-${item.createdAt}-${index}`} className="owner-review-timeline-item" style={{ position: 'relative', marginBottom: '16px', paddingLeft: '24px' }}>
      <div style={{ position: 'absolute', left: '0', top: '6px', width: '9px', height: '9px', borderRadius: '50%', background: visual.dotColor, border: '2px solid #fff', zIndex: 2 }} />
      <span style={{ display: 'block', fontSize: '11px', color: '#a4a097', marginBottom: '4px' }}>{formatReviewTime(item.createdAt)}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, backgroundColor: visual.badgeBg, color: visual.badgeColor }}>
          {visual.badgeLabel}
        </span>
        <strong style={{ fontSize: '13px', color: '#1a1a1a' }}>{visual.title}</strong>
      </div>
      {actorMeta ? (
        <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#787671' }}>{actorMeta}</p>
      ) : null}
      {item.type === 'review' && (item.comment || item.reason) ? (
        <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#5d5b54', backgroundColor: '#fafaf9', padding: '8px', borderRadius: '6px', border: '1px solid #ede9e4' }}>
          {item.reason || item.comment}
        </p>
      ) : null}
    </div>
  )
}


function ReviewItemCard({ 
  item, 
  isSelected, 
  onToggle, 
  onView 
}: { 
  item: ReviewPendingItem; 
  isSelected: boolean; 
  onToggle: () => void; 
  onView: () => void;
}) {
  const isHighRisk = item.aiDecision === 'reject' || (item.currentReviewRound ?? 1) > 1
  const priorityScore = item.reviewPriorityScore ?? 0
  const priorityVisual = getReviewPriorityVisual(item.reviewPriorityLevel)
  const factors = item.reviewPriorityFactors
  return (
    <article className="card-base" style={{ border: '1px solid #e5e3df', borderRadius: '8px', backgroundColor: '#fff', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #ede9e4', backgroundColor: isHighRisk ? '#fef2f2' : '#fafaf9', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <input
            aria-label="选择待审项"
            type="checkbox"
            checked={isSelected}
            onChange={onToggle}
            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
          />
          <div>
            <span style={{ display: 'block', fontSize: '11px', color: '#a4a097', marginBottom: '2px' }}>ID: #{item.submissionId} / {formatStage(item.currentReviewStage)}</span>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a1a', margin: 0 }}>{item.taskTitle}</h3>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
          <span
            title="Review Priority Score"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 8px',
              borderRadius: '6px',
              border: `1px solid ${priorityVisual.border}`,
              backgroundColor: priorityVisual.bg,
              color: priorityVisual.fg,
              fontSize: '11px',
              fontWeight: 700,
            }}
          >
            RPS {priorityScore}
          </span>
          {renderDecisionBadge(item.aiDecision)}
        </div>
      </div>
      <div style={{ padding: '16px 20px', flex: 1 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px', fontSize: '13px', color: '#5d5b54' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>提交标注员</span>
            <span style={{ fontWeight: 500, color: '#1a1a1a' }}>{item.labelerName}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>原数据编号</span>
            <span style={{ fontWeight: 500, color: '#1a1a1a' }}>#{item.itemId}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>当前轮次</span>
            <span style={{ fontWeight: 500, color: isHighRisk ? '#e03131' : '#1a1a1a' }}>第 {item.currentReviewRound ?? 1} 轮</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>队列优先级</span>
            <span style={{ fontWeight: 600, color: priorityVisual.fg }}>{priorityVisual.label}</span>
          </div>
        </div>
        {factors ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '6px', marginBottom: '14px' }}>
            <span style={{ padding: '6px 8px', borderRadius: '6px', backgroundColor: '#fafaf9', border: '1px solid #ede9e4', fontSize: '11px', color: '#5d5b54', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>AI {factors.aiRiskScore}</span>
            <span style={{ padding: '6px 8px', borderRadius: '6px', backgroundColor: '#fafaf9', border: '1px solid #ede9e4', fontSize: '11px', color: '#5d5b54', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{Math.round(factors.waitingHours)}h</span>
            <span style={{ padding: '6px 8px', borderRadius: '6px', backgroundColor: '#fafaf9', border: '1px solid #ede9e4', fontSize: '11px', color: '#5d5b54', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>退回 {formatRejectRate(factors.labelerRejectRate)}</span>
            <span style={{ padding: '6px 8px', borderRadius: '6px', backgroundColor: '#fafaf9', border: '1px solid #ede9e4', fontSize: '11px', color: '#5d5b54', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>任务 {factors.taskPriorityScore}</span>
          </div>
        ) : null}
        {item.latestAiSummary ? (
          <div style={{ padding: '10px', backgroundColor: '#f0eeec', borderRadius: '6px', fontSize: '12px', color: '#787671', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {item.latestAiSummary}
          </div>
        ) : null}
      </div>
      <div style={{ padding: '16px 20px', borderTop: '1px solid #ede9e4', backgroundColor: '#fff' }}>
        <button className="button-primary" type="button" onClick={onView} style={{ width: '100%', padding: '10px', borderRadius: '8px', fontWeight: 600 }}>
          查看详情
        </button>
      </div>
    </article>
  )
}

export function ReviewerReviewsPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [pendingItems, setPendingItems] = useState<ReviewPendingItem[]>([])
  const [groupByTask, setGroupByTask] = useState(false)
  const [allTaskOptions, setAllTaskOptions] = useState<number[]>([])
  const [detail, setDetail] = useState<ReviewDetail | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectInput, setShowRejectInput] = useState(false)
  const [reviewerAnswers, setReviewerAnswers] = useState<Record<string, ReviewAnswerValue>>({})
  const [editMode, setEditMode] = useState(false)
  const [rejectError, setRejectError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [taskFilter, setTaskFilter] = useState('')
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('all')
  const [sortMode, setSortMode] = useState<ReviewSortMode>('smart')
  const [bulkAction, setBulkAction] = useState<'approve' | 'reject' | null>(null)
  const [bulkRejectReason, setBulkRejectReason] = useState('')
  const latestRejectReason = useMemo(() => getLatestRejectReason(detail), [detail])
  const canPreviewTemplatePanes = schemaSupportsPanePreview(detail?.template?.schema)
  const answerPreviewConfig = useMemo(() => {
    if (!detail?.template?.schema) {
      return { schema: null, hiddenFields: new Set<string>() }
    }
    return sanitizeReviewerPreviewSchema(projectTemplateSchemaToPane(detail.template.schema, 'answer'))
  }, [detail?.template?.schema])
  const visiblePendingItems = useMemo(() => {
    const filteredItems = filterByTimeRange(pendingItems, timeRange, (item) => item.submittedAt)
    return [...filteredItems].sort((a, b) => compareReviewItems(a, b, sortMode))
  }, [pendingItems, timeRange, sortMode])
  const groupedPendingItems = useMemo(() => {
    const groups: Record<number, PendingReviewGroup> = {}
    visiblePendingItems.forEach((item) => {
      if (!groups[item.taskId]) {
        groups[item.taskId] = {
          taskId: item.taskId,
          taskTitle: item.taskTitle,
          items: [],
          maxPriorityScore: 0,
          newestSubmittedAt: 0,
        }
      }
      groups[item.taskId].items.push(item)
      groups[item.taskId].maxPriorityScore = Math.max(groups[item.taskId].maxPriorityScore, item.reviewPriorityScore ?? 0)
      groups[item.taskId].newestSubmittedAt = Math.max(groups[item.taskId].newestSubmittedAt, getSubmittedAtTime(item))
    })
    return Object.values(groups).sort((a, b) => {
      if (sortMode === 'newest') return b.newestSubmittedAt - a.newestSubmittedAt
      return b.maxPriorityScore - a.maxPriorityScore || b.newestSubmittedAt - a.newestSubmittedAt
    })
  }, [visiblePendingItems, sortMode])
  const visibleSubmissionIds = useMemo(() => new Set(visiblePendingItems.map((item) => item.submissionId)), [visiblePendingItems])
  const selectedVisibleIds = selectedIds.filter((id) => visibleSubmissionIds.has(id))
  const humanReviewCount = visiblePendingItems.filter((item) => item.aiDecision === 'human_review').length
  const highPriorityCount = visiblePendingItems.filter((item) => item.reviewPriorityLevel === 'high').length
  const topPriorityScore = visiblePendingItems.reduce((max, item) => Math.max(max, item.reviewPriorityScore ?? 0), 0)
  const currentReviewIndex = detail ? visiblePendingItems.findIndex((item) => item.submissionId === detail.submissionId) : -1
  const currentQueueItem = currentReviewIndex >= 0 ? visiblePendingItems[currentReviewIndex] : null

  useEffect(() => {
    void loadPendingReviews()
  }, [])

  useEffect(() => {
    if (loading) return
    void loadPendingReviews(taskFilter)
  }, [taskFilter])

  useEffect(() => {
    setSelectedIds([])
  }, [timeRange])

  async function loadPendingReviews(nextTaskFilter = '') {
    setLoading(true)
    setLoadError('')
    try {
      const query = nextTaskFilter ? { taskId: nextTaskFilter } : undefined
      const result = await apiGet<PendingReviewsResponse>('/reviews/pending', query)
      setPendingItems(result.items)
      setSelectedIds([])
      if (!nextTaskFilter) {
        setAllTaskOptions(Array.from(new Set(result.items.map((item) => item.taskId))))
      }
    } catch {
      setLoadError('加载待审核列表失败，请确认后端接口已启动。')
    } finally {
      setLoading(false)
    }
  }

  async function handleViewDetail(submissionId: number) {
    setLoadError('')
    setFeedback('')
    try {
      const result = await apiGet<ReviewDetail>(`/reviews/${submissionId}`)
      setDetail({
        ...result,
        diffItems: result.diffItems ?? [],
        reviewHistory: result.reviewHistory ?? [],
        timeline: result.timeline ?? [],
      })
      setReviewerAnswers(result.finalAnswers ?? result.answers)
      setEditMode(false)
      setShowRejectInput(false)
      setRejectReason('')
      setRejectError('')
      setViewMode('detail')
    } catch {
      setLoadError('加载审核详情失败，请稍后重试。')
    }
  }

  function handleBackToList() {
    setViewMode('list')
    setDetail(null)
    setReviewerAnswers({})
    setEditMode(false)
    setShowRejectInput(false)
    setRejectReason('')
    setRejectError('')
    setFeedback('')
    setLoadError('')
  }

  function removeCurrentSubmission() {
    if (!detail) return
    setPendingItems((items) => items.filter((item) => item.submissionId !== detail.submissionId))
  }

  function toggleSelected(submissionId: number) {
    setSelectedIds((current) =>
      current.includes(submissionId)
        ? current.filter((id) => id !== submissionId)
        : [...current, submissionId],
    )
  }

  function updateReviewerAnswer(field: string, value: ReviewAnswerValue) {
    setReviewerAnswers((current) => ({ ...current, [field]: value }))
  }

  function toggleReviewerArrayAnswer(field: string, value: string) {
    const currentValue = reviewerAnswers[field]
    const values = Array.isArray(currentValue) ? currentValue : []
    updateReviewerAnswer(field, values.includes(value) ? values.filter((item) => item !== value) : [...values, value])
  }

  async function handleApprove() {
    if (!detail) return
    setActionLoading(true)
    try {
      const result = await apiPost<ReviewActionResponse, { comment: string; finalAnswers?: Record<string, ReviewAnswerValue> }>(`/reviews/${detail.submissionId}/approve`, {
        comment: editMode ? '修订后通过' : '通过',
        ...(editMode ? { finalAnswers: reviewerAnswers } : {}),
      })
      if (result.status === 'review_passed') {
        removeCurrentSubmission()
        setFeedback('审核通过，提交已进入 review_passed。')
      } else {
        setFeedback('审核通过，提交已进入下一轮人工审核。')
        setDetail((current) => current ? {
          ...current,
          submissionStatus: result.status,
          currentReviewStage: result.currentReviewStage ?? current.currentReviewStage,
          currentReviewRound: result.currentReviewRound ?? current.currentReviewRound,
          finalAnswers: reviewerAnswers,
        } : current)
      }
    } catch {
      setLoadError('操作失败，请稍后重试。')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleBulkApprove() {
    if (selectedVisibleIds.length === 0) return
    setActionLoading(true)
    try {
      await apiPost<ReviewBulkApproveResponse, { submissionIds: number[]; comment: string }>('/reviews/bulk/approve', {
        submissionIds: selectedVisibleIds,
        comment: '批量通过',
      })
      setFeedback('已批量通过所选待审项。')
      setBulkAction(null)
      await loadPendingReviews(taskFilter)
    } catch {
      setLoadError('批量通过失败，请稍后重试。')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleBulkReject() {
    if (selectedVisibleIds.length === 0) return
    if (!bulkRejectReason.trim()) {
      setLoadError('批量打回理由不能为空')
      return
    }
    setActionLoading(true)
    try {
      await apiPost<ReviewBulkRejectResponse, { submissionIds: number[]; reason: string }>('/reviews/bulk/reject', {
        submissionIds: selectedVisibleIds,
        reason: bulkRejectReason,
      })
      setFeedback('已批量打回所选待审项。')
      setBulkAction(null)
      setBulkRejectReason('')
      await loadPendingReviews(taskFilter)
    } catch {
      setLoadError('批量打回失败，请稍后重试。')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleReject() {
    if (!detail) return
    if (!rejectReason.trim()) {
      setRejectError('打回理由不能为空')
      return
    }
    setActionLoading(true)
    try {
      await apiPost<ReviewActionResponse, { reason: string }>(`/reviews/${detail.submissionId}/reject`, {
        reason: rejectReason,
      })
      removeCurrentSubmission()
      setShowRejectInput(false)
      setRejectReason('')
      setRejectError('')
      setFeedback('已打回，标注人可查看理由并修改后重新提交。')
    } catch {
      setLoadError('打回失败，请稍后重试。')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleUnassign() {
    if (!detail) return
    setActionLoading(true)
    try {
      await apiPost<ReviewUnassignResponse, undefined>(`/reviews/${detail.submissionId}/unassign`, undefined)
      setFeedback('已撤回当前提交的专属分配。')
    } catch {
      setLoadError('撤回分配失败，请稍后重试。')
    } finally {
      setActionLoading(false)
    }
  }

  function goToAdjacentReview(direction: 'previous' | 'next') {
    if (currentReviewIndex < 0) return
    const nextIndex = direction === 'previous' ? currentReviewIndex - 1 : currentReviewIndex + 1
    const nextItem = visiblePendingItems[nextIndex]
    if (nextItem) {
      void handleViewDetail(nextItem.submissionId)
    }
  }

  if (viewMode === 'detail' && detail) {
    return (
      <section className="workbench-shell reviewer-workbench animate-fade-in">
        {/* 紧凑型顶部控制中心 - 对齐标注工作台 */}
        <header className="reviewer-workbench__topbar reviewer-workbench__topbar-compact">
          <div className="reviewer-workbench__toolbar">
            <div className="reviewer-workbench__title">
              <button aria-label="返回列表" type="button" onClick={handleBackToList}>←</button>
              <div>
                <div className="reviewer-workbench__meta-line">
                  <span>审核工作台</span>
                  <small>提交 #{detail.submissionId}</small>
                </div>
                <h2>{detail.task.title}</h2>
              </div>
            </div>
            <div className="button-row reviewer-workbench__actions">
              <button className="button-sm" type="button" onClick={() => void handleUnassign()} disabled={actionLoading}>
                撤回分配
              </button>
              <button className="button-sm" type="button" onClick={handleBackToList}>
                返回队列
              </button>
            </div>
          </div>

          <div className="reviewer-workbench__summary-strip">
            <div className="reviewer-workbench__summary-metrics">
              <div className="reviewer-workbench__summary-item">
                <span>当前轮次</span>
                <strong>第 {detail.currentReviewRound ?? 1} 轮</strong>
              </div>
              <div className="reviewer-workbench__summary-item">
                <span>审核阶段</span>
                <strong>{formatStage(detail.currentReviewStage)}</strong>
              </div>
              <div className="reviewer-workbench__summary-item">
                <span>AI 建议</span>
                <strong>{formatDecisionLabel(detail.aiResult.decision)}</strong>
              </div>
              <div className="reviewer-workbench__summary-item">
                <span>当前状态</span>
                <strong>{detail.submissionStatus}</strong>
              </div>
            </div>

            <div className="reviewer-workbench__summary-progress">
              <div className="reviewer-workbench__summary-progress-body">
                <div className="reviewer-workbench__summary-progress-head">
                  <span>审核队列进度</span>
                  <strong>{currentReviewIndex + 1} / {visiblePendingItems.length}</strong>
                </div>
                <div className="reviewer-workbench__summary-progress-track">
                  <div className="reviewer-workbench__summary-progress-fill" style={{ width: `${((currentReviewIndex + 1) / visiblePendingItems.length) * 100}%` }}></div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {loadError ? <p role="alert" className="reviewer-workbench__alert reviewer-workbench__alert--error">{loadError}</p> : null}

        <div className="reviewer-workbench__grid">
          <aside className="reviewer-workbench__nav">
            <div className="section-header">
              <div>
                <span className="section-eyebrow">审核队列</span>
                <h3>待审题目</h3>
              </div>
            </div>
            <div className="focus-panel labeler-workbench__nav-card">
              <h4>{currentReviewIndex >= 0 ? `第 ${currentReviewIndex + 1} / ${visiblePendingItems.length} 题` : '当前提交'}</h4>
              <p>{currentQueueItem ? `标注员：${currentQueueItem.labelerName}` : `原数据 #${detail.item.itemId}`}</p>
            </div>
            <div className="workbench-task-list">
              {visiblePendingItems.map((item, index) => {
                const badgeStyle = item.aiDecision === 'reject' ? { backgroundColor: '#fef2f2', color: '#e03131', borderColor: '#fca5a5' } : 
                                   item.aiDecision === 'pass' ? { backgroundColor: '#f0fdf4', color: '#1aae39', borderColor: '#bbf7d0' } :
                                   { backgroundColor: '#e6e0f5', color: '#5645d4', borderColor: '#d8b4fe' }
                return (
                  <button
                    key={item.submissionId}
                    type="button"
                    className={`workbench-task-button ${item.submissionId === detail.submissionId ? 'is-active' : ''}`}
                    onClick={() => void handleViewDetail(item.submissionId)}
                    disabled={actionLoading}
                    style={{ padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #ede9e4', borderRadius: '8px', backgroundColor: item.submissionId === detail.submissionId ? '#f1efff' : '#fff' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <strong style={{ fontSize: '14px', color: '#1a1a1a' }}>{getQueueItemLabel(index)}</strong>
                      <span style={{ fontSize: '11px', color: '#787671', fontWeight: 600 }}>RPS {item.reviewPriorityScore ?? 0}</span>
                    </div>
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, border: '1px solid', ...badgeStyle }}>
                      {formatDecisionLabel(item.aiDecision)}
                    </span>
                  </button>
                )
              })}
            </div>
          </aside>

          <main className="reviewer-workbench__canvas" style={{ overflowY: 'auto' }}>
            <section className="reviewer-canvas-section" style={{ background: '#fff', borderRadius: '12px' }}>
              <div className="reviewer-section-heading">
                <div>
                  <span className="section-eyebrow">Source</span>
                  <h3>原始题目</h3>
                </div>
              </div>
              {canPreviewTemplatePanes && detail.template?.schema ? (
                <Renderer
                  schema={projectTemplateSchemaToPane(detail.template.schema, 'source')}
                  mode="preview"
                  source={detail.item.source}
                  values={detail.finalAnswers ?? detail.answers}
                />
              ) : (
                <div className="reviewer-source-grid">{renderSource(detail.item.source)}</div>
              )}
            </section>

            <section className={`reviewer-canvas-section ${editMode ? 'is-editing' : ''}`} style={{ background: '#fff', borderRadius: '12px' }}>
              <div className="reviewer-section-heading">
                <div>
                  <span className="section-eyebrow">Answer</span>
                  <h3>标注结果</h3>
                </div>
                <button className="button-sm" type="button" onClick={() => setEditMode((current) => !current)} disabled={actionLoading}>
                  {editMode ? '取消修订' : '修订答案'}
                </button>
              </div>
              {editMode ? (
                <Renderer
                  schema={detail.template?.schema ? projectTemplateSchemaToPane(detail.template.schema, 'answer') : []}
                  mode="answer"
                  source={detail.item.source}
                  values={reviewerAnswers}
                  onUpdateAnswer={updateReviewerAnswer}
                  onToggleArrayAnswer={toggleReviewerArrayAnswer}
                />
              ) : (
                canPreviewTemplatePanes && detail.template?.schema ? (
                  answerPreviewConfig.schema && schemaHasVisibleComponents(answerPreviewConfig.schema) ? (
                    <Renderer
                      schema={answerPreviewConfig.schema}
                      mode="preview"
                      showSourceFallback={false}
                      source={detail.item.source}
                      values={detail.finalAnswers ?? detail.answers}
                    />
                  ) : (
                    <p style={{ margin: 0, color: '#787671', fontSize: '13px' }}>结构化结果已隐藏</p>
                  )
                ) : (
                  <div className="reviewer-answer-grid">{renderAnswers(detail.finalAnswers ?? detail.answers, answerPreviewConfig.hiddenFields)}</div>
                )
              )}
            </section>

            {(detail.diffItems ?? []).length > 0 ? (
              <section className="reviewer-canvas-section" style={{ background: '#fff', borderRadius: '12px' }}>
                <div className="reviewer-section-heading">
                  <div>
                    <span className="section-eyebrow">Revision</span>
                    <h3>答案差异</h3>
                  </div>
                </div>
                <div className="reviewer-diff-list">
                  {(detail.diffItems ?? []).map((item) => (
                    <div key={item.field} className="reviewer-diff-item">
                      <strong>{item.field}</strong>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                          <small style={{ color: '#787671', display: 'block', marginBottom: '4px' }}>修改前</small>
                          <div className="reviewer-diff-item__previous">{item.previousValue === undefined || item.previousValue === null || item.previousValue === '' ? '空' : String(item.previousValue)}</div>
                        </div>
                        <div>
                          <small style={{ color: '#787671', display: 'block', marginBottom: '4px' }}>修改后</small>
                          <div className="reviewer-diff-item__current">{item.currentValue === undefined || item.currentValue === null || item.currentValue === '' ? '空' : String(item.currentValue)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

          </main>

          <aside className="reviewer-workbench__side" style={{ overflowY: 'auto' }}>
            <section className="reviewer-side-section" style={{ background: '#fff', borderRadius: '12px' }}>
              <div className="reviewer-section-heading">
                <div>
                  <span className="section-eyebrow">AI Audit</span>
                  <h3>AI 预审结果</h3>
                </div>
                {renderDecisionBadge(detail.aiResult.decision)}
              </div>
              <div className="reviewer-ai-score" style={{ marginBottom: '12px' }}>
                <span>百分制总分</span>
                <strong style={{ fontSize: '24px' }}>{detail.aiResult.overallScore ?? 0} <small style={{ fontSize: '14px', fontWeight: 400 }}>/ 100</small></strong>
              </div>
              <p style={{ fontSize: '13px', lineHeight: 1.5, color: '#5d5b54', background: '#fafaf9', padding: '12px', borderRadius: '8px', border: '1px solid #ede9e4', marginBottom: '16px' }}>{detail.aiResult.summary || '当前没有 AI 审核摘要。'}</p>
              {renderAIScores(detail.aiResult.scores)}
            </section>

            <section className="reviewer-side-section" style={{ background: '#fff', borderRadius: '12px' }}>
              <div className="reviewer-section-heading">
                <div>
                  <span className="section-eyebrow">Timeline</span>
                  <h3>审核时间线</h3>
                </div>
              </div>
              <ResizableTimelinePanel
                className="reviewer-timeline-panel"
                defaultHeight={300}
                maxHeight={560}
                minHeight={180}
                storageKey="reviewer-review-timeline-height"
              >
                <div style={{ position: 'relative', paddingLeft: '8px', marginTop: '12px' }}>
                  <div style={{ position: 'absolute', left: '4px', top: '0', bottom: '0', width: '1px', background: '#ede9e4' }} />
                  {(detail.timeline ?? []).length > 0 ? (
                    detail.timeline.map(renderTimelineItem)
                  ) : (
                    <p className="reviewer-empty-note">暂无时间线记录。</p>
                  )}
                </div>
              </ResizableTimelinePanel>
            </section>

            {latestRejectReason ? (
              <section className="reviewer-side-section reviewer-side-section--warning" style={{ borderRadius: '12px' }}>
                <div className="reviewer-section-heading">
                  <div>
                    <span className="section-eyebrow">Revision Note</span>
                    <h3>最新打回理由</h3>
                  </div>
                </div>
                <p>{latestRejectReason}</p>
              </section>
            ) : null}
          </aside>
        </div>

        <div className={`reviewer-action-dock ${showRejectInput ? 'is-expanded' : ''}`} aria-label="审核操作">
          <div className="workbench-save-state">
            {feedback ? (
              <>
                <span className="workbench-save-state__item workbench-save-state__item--saved">{feedback}</span>
                <button className="button-sm" type="button" onClick={handleBackToList}>回到队列</button>
              </>
            ) : showRejectInput ? (
              <div className="reviewer-reject-panel">
                <label htmlFor="reject-reason">打回理由</label>
                <textarea
                  id="reject-reason"
                  value={rejectReason}
                  onChange={(event) => {
                    setRejectReason(event.target.value)
                    setRejectError('')
                  }}
                  placeholder="请具体说明需要修改的地方"
                />
                {rejectError ? <p>{rejectError}</p> : null}
              </div>
            ) : (
              <span className="workbench-save-state__item">{editMode ? '修订内容会随通过操作一起保存。' : `正在审核提交 #${detail.submissionId}`}</span>
            )}
          </div>
          <div className="workbench-action-dock__buttons">
            {showRejectInput ? (
              <>
                <button className="button-sm" type="button" onClick={() => { setShowRejectInput(false); setRejectReason(''); setRejectError('') }} disabled={actionLoading}>
                  取消
                </button>
                <button className="button-sm button-danger" type="button" onClick={() => void handleReject()} disabled={actionLoading}>
                  确认打回
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => goToAdjacentReview('previous')} disabled={actionLoading || currentReviewIndex <= 0}>
                  上一题
                </button>
                <button type="button" onClick={() => goToAdjacentReview('next')} disabled={actionLoading || currentReviewIndex < 0 || currentReviewIndex >= visiblePendingItems.length - 1}>
                  下一题
                </button>
                <button className="button-primary" type="button" onClick={() => void handleApprove()} disabled={actionLoading}>
                  {actionLoading ? '处理中...' : '通过入库'}
                </button>
                <button type="button" onClick={() => setShowRejectInput(true)} disabled={actionLoading}>
                  打回修改
                </button>
              </>
            )}
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="dashboard-page reviewer-review-page">
      <header className="page-hero page-hero-light">
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap', width: '100%' }}>
          <div style={{ flex: 1, minWidth: '300px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span className="badge-tag-purple" style={{ backgroundColor: '#e6e0f5', color: '#5645d4', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600 }}>Review Queue</span>
            </div>
            <h2 style={{ fontSize: '32px', fontWeight: 600, marginBottom: '8px', color: '#1a1a1a' }}>审核台</h2>
            <p style={{ color: '#5d5b54', fontSize: '14px', margin: 0 }}>
              按 RPS 智能排序队列，高效处理标注结果并确保存储质量。
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            {/* Inline Stats */}
            <div style={{ padding: '8px 12px', backgroundColor: '#f0f4ff', border: '1px solid #d0e2ff', borderRadius: '10px', textAlign: 'center', minWidth: '80px' }}>
              <span style={{ display: 'block', fontSize: '10px', color: '#0043ce', fontWeight: 700, textTransform: 'uppercase', marginBottom: '2px' }}>待审核总数</span>
              <strong style={{ fontSize: '18px', color: '#0043ce' }}>{visiblePendingItems.length}</strong>
            </div>
            <div style={{ padding: '8px 12px', backgroundColor: '#fff1f1', border: '1px solid #ffd7d7', borderRadius: '10px', textAlign: 'center', minWidth: '80px' }}>
              <span style={{ display: 'block', fontSize: '10px', color: '#da1e28', fontWeight: 700, textTransform: 'uppercase', marginBottom: '2px' }}>需人工复核</span>
              <strong style={{ fontSize: '18px', color: '#da1e28' }}>{humanReviewCount}</strong>
            </div>
            <div style={{ padding: '8px 12px', backgroundColor: '#f6f5f4', border: '1px solid #ede9e4', borderRadius: '10px', textAlign: 'center', minWidth: '80px' }}>
              <span style={{ display: 'block', fontSize: '10px', color: '#5d5b54', fontWeight: 700, textTransform: 'uppercase', marginBottom: '2px' }}>任务数</span>
              <strong style={{ fontSize: '18px', color: '#1a1a1a' }}>{groupedPendingItems.length}</strong>
            </div>
            <div style={{ padding: '8px 12px', backgroundColor: '#f3ffed', border: '1px solid #d9f3e1', borderRadius: '10px', textAlign: 'center', minWidth: '80px' }}>
              <span style={{ display: 'block', fontSize: '10px', color: '#198038', fontWeight: 700, textTransform: 'uppercase', marginBottom: '2px' }}>当前已选</span>
              <strong style={{ fontSize: '18px', color: '#198038' }}>{selectedIds.length}</strong>
            </div>
          </div>
          
          <Link className="button" to="/reviewer/dashboard" style={{ padding: '8px 16px', borderRadius: '8px', fontWeight: 500, marginLeft: 'auto' }}>
            ← 返回概览
          </Link>
        </div>
      </header>

      {loadError ? <p role="alert" style={{ color: '#e03131', fontSize: '13px' }}>{loadError}</p> : null}

      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#a4a097' }}>正在调取审核队列...</div>
      ) : (
        <>
          <div className="card-base" style={{ padding: '20px 24px', border: '1px solid #e5e3df', borderRadius: '8px', backgroundColor: '#fff', marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: visiblePendingItems.length > 0 ? '16px' : 0, gap: '16px', flexWrap: 'wrap' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#1a1a1a', margin: 0 }}>批量处理面板</h3>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                <TimeRangeFilter value={timeRange} onChange={setTimeRange} />
                <button 
                  className="button-sm" 
                  type="button"
                  onClick={() => setGroupByTask(!groupByTask)}
                  style={{ backgroundColor: '#fff', border: '1px solid #ede9e4', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {groupByTask ? '🔍 切换到平铺视图' : '📂 切换到任务分组'}
                </button>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#5d5b54', fontWeight: 600 }}>
                  任务筛选
                  <select
                    style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #ede9e4', fontSize: '13px', color: '#1a1a1a', minWidth: '160px' }}
                    value={taskFilter}
                    onChange={(event) => setTaskFilter(event.target.value)}
                  >
                    <option value="">全部任务</option>
                    {allTaskOptions.map((taskId) => (
                      <option key={taskId} value={String(taskId)}>任务 #{taskId}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {visiblePendingItems.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', backgroundColor: '#fafaf9', borderRadius: '8px', border: '1px solid #ede9e4', gap: '12px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '13px', color: '#787671', fontWeight: 500 }}>
                  {selectedVisibleIds.length === 0 ? '当前未选择待审项' : `已选择 ${selectedVisibleIds.length} 条待审项`}
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    aria-label="全选本页"
                    className="button-sm"
                    type="button"
                    onClick={() => setSelectedIds(visiblePendingItems.map(i => i.submissionId))}
                    style={{ border: '1px solid #ede9e4', backgroundColor: '#fff' }}
                  >
                    全选
                  </button>
                  <button
                    aria-label="清除"
                    className="button-sm"
                    type="button"
                    onClick={() => setSelectedIds([])}
                    style={{ border: '1px solid #ede9e4', backgroundColor: '#fff' }}
                  >
                    清除
                  </button>
                  <button
                    aria-label="批量通过"
                    className="button-sm"
                    type="button"
                    onClick={() => setBulkAction('approve')}
                    disabled={selectedVisibleIds.length === 0 || actionLoading}
                    style={{ border: '1px solid #1aae39', color: '#1aae39', backgroundColor: selectedVisibleIds.length > 0 ? '#f0fdf4' : 'transparent' }}
                  >
                    批量通过
                  </button>
                  <button
                    aria-label="批量打回"
                    className="button-sm"
                    type="button"
                    onClick={() => setBulkAction('reject')}
                    disabled={selectedVisibleIds.length === 0 || actionLoading}
                    style={{ border: '1px solid #e03131', color: '#e03131', backgroundColor: selectedVisibleIds.length > 0 ? '#fef2f2' : 'transparent' }}
                  >
                    批量打回
                  </button>
                </div>
              </div>
            )}
            {feedback ? <p style={{ color: '#1aae39', fontSize: '13px', marginTop: '12px', marginBottom: 0, fontWeight: 500 }}>{feedback}</p> : null}
          </div>

          {visiblePendingItems.length === 0 ? (
            <article className="card-base" style={{ padding: '60px 24px', textAlign: 'center', border: '1px solid #e5e3df', borderRadius: '8px', backgroundColor: '#f6f5f4' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#1a1a1a', marginBottom: '8px' }}>暂无待审核项</h3>
              <p style={{ color: '#a4a097', fontSize: '14px' }}>当前时间范围内没有需要人工审核的提交，可以切换时间范围查看。</p>
            </article>
          ) : (
            <>
          <section className="card-base" style={{ padding: '20px 24px', border: '1px solid #d7d2ff', borderRadius: '8px', backgroundColor: '#fbfaff', marginBottom: '24px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '20px', alignItems: 'center' }}>
            <div>
              <span style={{ display: 'inline-flex', padding: '3px 8px', borderRadius: '4px', backgroundColor: '#e6e0f5', color: '#5645d4', fontSize: '11px', fontWeight: 700, marginBottom: '10px' }}>智能审核队列</span>
              <h3 style={{ margin: 0, color: '#1a1a1a', fontSize: '18px', fontWeight: 700 }}>Review Priority Score 自动排序</h3>
              <p style={{ margin: '8px 0 0', color: '#5d5b54', fontSize: '13px', lineHeight: 1.6 }}>
                按 AI 风险 40%、等待时间 20%、标注员历史退回率 20%、任务优先级 20% 计算，高优先级提交会优先进入审核动线。
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <div style={{ display: 'flex', border: '1px solid #d7d2ff', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#fff' }}>
                <button
                  type="button"
                  onClick={() => setSortMode('smart')}
                  style={{
                    padding: '8px 12px',
                    border: 'none',
                    backgroundColor: sortMode === 'smart' ? '#5645d4' : '#fff',
                    color: sortMode === 'smart' ? '#fff' : '#5d5b54',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  智能排序
                </button>
                <button
                  type="button"
                  onClick={() => setSortMode('newest')}
                  style={{
                    padding: '8px 12px',
                    border: 'none',
                    borderLeft: '1px solid #d7d2ff',
                    backgroundColor: sortMode === 'newest' ? '#5645d4' : '#fff',
                    color: sortMode === 'newest' ? '#fff' : '#5d5b54',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  最新提交
                </button>
              </div>
              <div style={{ minWidth: '92px', padding: '10px 12px', backgroundColor: '#fff', border: '1px solid #ede9e4', borderRadius: '8px' }}>
                <span style={{ display: 'block', color: '#787671', fontSize: '11px', marginBottom: '4px' }}>高优先级</span>
                <strong style={{ color: '#e03131', fontSize: '20px' }}>{highPriorityCount}</strong>
              </div>
              <div style={{ minWidth: '92px', padding: '10px 12px', backgroundColor: '#fff', border: '1px solid #ede9e4', borderRadius: '8px' }}>
                <span style={{ display: 'block', color: '#787671', fontSize: '11px', marginBottom: '4px' }}>最高 RPS</span>
                <strong style={{ color: '#5645d4', fontSize: '20px' }}>{topPriorityScore}</strong>
              </div>
            </div>
          </section>

          {bulkAction ? (
            <div className="modal-overlay" onClick={(event) => { if (event.target === event.currentTarget) setBulkAction(null) }} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="modal-card animate-fade-in" style={{ backgroundColor: '#fff', padding: '32px', borderRadius: '8px', width: '100%', maxWidth: '480px', boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}>
                <h3 style={{ fontSize: '20px', fontWeight: 600, color: '#1a1a1a', marginBottom: '16px', marginTop: 0 }}>批量操作确认</h3>
                <p style={{ fontSize: '14px', color: '#5d5b54', marginBottom: '24px' }}>
                  当前已选 <strong>{selectedVisibleIds.length}</strong> 条待审项{taskFilter ? `，筛选任务 #${taskFilter}` : '，跨多个任务'}。
                </p>
                {bulkAction === 'reject' ? (
                  <div style={{ marginBottom: '24px' }}>
                    <label htmlFor="bulk-reject-reason" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#1a1a1a', marginBottom: '8px' }}>批量打回理由</label>
                    <textarea
                      id="bulk-reject-reason"
                      value={bulkRejectReason}
                      onChange={(event) => setBulkRejectReason(event.target.value)}
                      rows={3}
                      placeholder="请输入统一的修改建议"
                      style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ede9e4', fontSize: '14px' }}
                    />
                  </div>
                ) : (
                  <p style={{ marginBottom: '24px', color: '#166534', backgroundColor: '#f0fdf4', padding: '16px', borderRadius: '8px', border: '1px solid #bbf7d0', fontSize: '14px' }}>
                    确认将选中的待审项批量标记为审核通过吗？
                  </p>
                )}
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                  <button className="button" type="button" onClick={() => setBulkAction(null)} disabled={actionLoading} style={{ padding: '8px 24px', borderRadius: '8px' }}>取消</button>
                  {bulkAction === 'approve' ? (
                    <button className="button button-primary" type="button" onClick={() => { void handleBulkApprove() }} disabled={actionLoading} style={{ padding: '8px 24px', borderRadius: '8px', backgroundColor: '#1aae39', borderColor: '#1aae39' }}>确认批量通过</button>
                  ) : (
                    <button className="button button-primary" type="button" onClick={() => { void handleBulkReject() }} disabled={actionLoading || !bulkRejectReason.trim()} style={{ padding: '8px 24px', borderRadius: '8px', backgroundColor: '#e03131', borderColor: '#e03131' }}>确认批量打回</button>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {groupByTask ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              {groupedPendingItems.map((group) => (
                <div key={group.taskId} style={{ border: '1px solid #e5e3df', borderRadius: '12px', backgroundColor: '#fff', overflow: 'hidden' }}>
                  <div style={{ padding: '20px 24px', backgroundColor: '#fafaf9', borderBottom: '1px solid #ede9e4', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#1a1a1a' }}>{group.taskTitle}</h3>
                      <p style={{ fontSize: '13px', color: '#787671', margin: '4px 0 0 0' }}>任务 ID: #{group.taskId} · 共 {group.items.length} 条待审核</p>
                    </div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', padding: '6px 10px', borderRadius: '6px', border: '1px solid #d7d2ff', backgroundColor: '#fbfaff', color: '#5645d4', fontSize: '12px', fontWeight: 700 }}>
                        最高 RPS {group.maxPriorityScore}
                      </span>
                      <button 
                        className="button-sm" 
                        type="button"
                        onClick={() => {
                          const groupIds = group.items.map(i => i.submissionId);
                          setSelectedIds(prev => Array.from(new Set([...prev, ...groupIds])));
                        }}
                        style={{ backgroundColor: '#fff', border: '1px solid #ede9e4' }}
                      >
                        选择全部
                      </button>
                    </div>
                  </div>
                  <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
                    {group.items.map((item) => (
                      <ReviewItemCard 
                        key={item.submissionId} 
                        item={item} 
                        isSelected={selectedIds.includes(item.submissionId)}
                        onToggle={() => toggleSelected(item.submissionId)}
                        onView={() => void handleViewDetail(item.submissionId)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
              {visiblePendingItems.map((item) => (
                <ReviewItemCard 
                  key={item.submissionId} 
                  item={item} 
                  isSelected={selectedIds.includes(item.submissionId)}
                  onToggle={() => toggleSelected(item.submissionId)}
                  onView={() => void handleViewDetail(item.submissionId)}
                />
              ))}
            </div>
          )}
        </>
          )}
        </>
      )}
    </section>
  )
}
