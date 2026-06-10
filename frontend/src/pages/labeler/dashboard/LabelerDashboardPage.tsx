import { Link } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { apiGet } from '../../../services/api/client'
import type { LabelerAssignmentSummary, LabelerWorkbenchSummary } from '../../../types/domain'
import { TimeRangeFilter } from '../../../components/TimeRangeFilter'
import { filterByTimeRange, type TimeRangeKey } from '../../../utils/timeRangeFilter'
import { parseAppDate } from '../../../utils/time'

function safePercent(value: number, total: number) {
  if (total <= 0) {
    return 0
  }
  return Math.round((value / total) * 100)
}

function getPendingReviewCount(assignment: LabelerAssignmentSummary) {
  return Math.max(assignment.completed - assignment.reviewPassed - assignment.needsRevision, 0)
}

function getAssignmentPriority(assignment: LabelerAssignmentSummary) {
  if (assignment.needsRevision > 0) {
    return 0
  }
  if (assignment.completed < assignment.total) {
    return 1
  }
  if (getPendingReviewCount(assignment) > 0) {
    return 2
  }
  return 3
}

function getFocusBadge(assignment: LabelerAssignmentSummary) {
  if (assignment.needsRevision > 0) {
    return '待修改'
  }
  if (assignment.completed < assignment.total) {
    return '进行中'
  }
  if (getPendingReviewCount(assignment) > 0) {
    return '待审核'
  }
  return '已完成'
}

export function LabelerDashboardPage() {
  const [summary, setSummary] = useState<LabelerWorkbenchSummary | null>(null)
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    void loadSummary()
  }, [])

  async function loadSummary() {
    setLoading(true)
    setError('')
    try {
      const result = await apiGet<LabelerWorkbenchSummary>('/workbench/summary')
      setSummary(result)
    } catch {
      setError('概览加载失败，请稍后重试。')
    } finally {
      setLoading(false)
    }
  }

  const metrics = summary?.metrics ?? {
    claimedTaskCount: 0,
    submittedItemCount: 0,
    reviewPassedItemCount: 0,
    needsRevisionItemCount: 0,
  }

  const visibleAssignments = useMemo(
    () => filterByTimeRange(summary?.assignments ?? [], timeRange, (assignment) => assignment.latestUpdatedAt),
    [summary, timeRange],
  )

  const dashboardStats = useMemo(() => {
    const assignments = visibleAssignments
    const totalItems = assignments.reduce((total, assignment) => total + assignment.total, 0)
    const completedItems = assignments.reduce((total, assignment) => total + assignment.completed, 0)
    const pendingReviewItems = assignments.reduce((total, assignment) => total + getPendingReviewCount(assignment), 0)
    const reviewPassedCount = assignments.reduce((sum, a) => sum + a.reviewPassed, 0)
    const needsRevisionCount = assignments.reduce((sum, a) => sum + a.needsRevision, 0)

    const evaluatedItems = reviewPassedCount + needsRevisionCount
    const completionRate = safePercent(completedItems, totalItems)
    const passRate = safePercent(reviewPassedCount, evaluatedItems)
    const qualityScore = Math.round(passRate * 0.65 + completionRate * 0.35)

    return {
      totalItems,
      completedItems,
      pendingReviewItems,
      remainingItems: Math.max(totalItems - completedItems, 0),
      completionRate,
      passRate,
      qualityScore,
      claimedTaskCount: assignments.length,
      needsRevisionCount,
    }
  }, [visibleAssignments])

  const continueAssignment = useMemo(() => {
    const assignments = visibleAssignments
    return [...assignments].sort((left, right) => {
      const priorityDiff = getAssignmentPriority(left) - getAssignmentPriority(right)
      if (priorityDiff !== 0) {
        return priorityDiff
      }
      return (parseAppDate(right.latestUpdatedAt)?.getTime() ?? 0) - (parseAppDate(left.latestUpdatedAt)?.getTime() ?? 0)
    })[0] ?? null
  }, [visibleAssignments])

  const focusCompletionRate = continueAssignment ? safePercent(continueAssignment.completed, continueAssignment.total) : 0
  const focusPendingReviewCount = continueAssignment ? getPendingReviewCount(continueAssignment) : 0
  const focusBadge = continueAssignment ? getFocusBadge(continueAssignment) : ''
  const nextActionText =
    continueAssignment?.needsRevision
      ? '优先处理打回修改，减少返修积压。'
      : continueAssignment && continueAssignment.completed < continueAssignment.total
        ? '继续完成剩余题目，保持任务推进。'
        : focusPendingReviewCount > 0
          ? '等待审核结果，同时可以领取新任务。'
          : '当前任务已完成，可以去任务广场领取新任务。'

  return (
    <section className="dashboard-page labeler-page">
      <header className="page-hero page-hero-light">
        <div>
          <span className="page-eyebrow">Progress overview</span>
          <h2>标注员概览</h2>
          <p>集中查看当前任务、质量表现与下一步动作，快速进入作答、任务分区和能力看板。</p>
        </div>
        <div className="button-row">
          <Link className="button button-primary" to="/labeler/plaza">
            去任务广场
          </Link>
          <Link className="button" to="/labeler/tasks">
            查看我的任务
          </Link>
        </div>
      </header>

      {loading ? (
        <article className="empty-state-card">
          <h3>正在加载概览</h3>
          <p>稍候即可看到你的任务进度与最近贡献。</p>
        </article>
      ) : error ? (
        <article className="empty-state-card empty-state-card-error">
          <h3>概览暂时不可用</h3>
          <p>{error}</p>
          <button className="button button-primary" type="button" onClick={() => void loadSummary()}>
            重试
          </button>
        </article>
      ) : (
        <>
          <TimeRangeFilter value={timeRange} onChange={setTimeRange} />
          <div className="stat-grid">
            <article className="stat-card stat-card-tint-sky">
              <span className="stat-card-label">已领取任务</span>
              <strong className="stat-card-value">{dashboardStats.claimedTaskCount}</strong>
              <p>已进入当前工作区，可在我的任务中继续推进。</p>
            </article>
            <article className="stat-card stat-card-tint-lavender">
              <span className="stat-card-label">完成覆盖率</span>
              <strong className="stat-card-value">{dashboardStats.completionRate}%</strong>
              <p>{`${dashboardStats.completedItems} / ${dashboardStats.totalItems} 题已完成或进入审核链路。`}</p>
            </article>
            <article className="stat-card stat-card-tint-peach">
              <span className="stat-card-label">待修改</span>
              <strong className="stat-card-value">{dashboardStats.needsRevisionCount}</strong>
              <p>收到 AI / 人工打回后，仍需要继续修正的题目。</p>
            </article>
            <article className="stat-card stat-card-tint-mint">
              <span className="stat-card-label">能力评分</span>
              <strong className="stat-card-value">{dashboardStats.qualityScore}</strong>
              <p>{`通过率 ${dashboardStats.passRate}%，结合完成覆盖率综合计算。`}</p>
            </article>
          </div>

          <div className="dashboard-grid dashboard-grid-labeler labeler-home-grid">
            <article className="card dashboard-panel">
              <div className="section-header">
                <div>
                  <span className="section-eyebrow">Focus task</span>
                  <h3>当前优先任务</h3>
                </div>
                <Link className="button" to="/labeler/tasks">
                  查看分区
                </Link>
              </div>
              {continueAssignment ? (
                <div className="focus-panel labeler-home-focus">
                  <div className="task-card-badge-row">
                    <span className={`task-card-status-badge task-card-status-badge--${continueAssignment.needsRevision > 0 ? 'revision' : focusBadge === '已完成' ? 'completed' : focusBadge === '待审核' ? 'completed' : 'pending'}`}>
                      {focusBadge}
                    </span>
                    <span className="task-card-meta-chip">{`完成 ${focusCompletionRate}%`}</span>
                  </div>
                  <h4>{continueAssignment.taskTitle}</h4>
                  <p>{`已完成 ${continueAssignment.completed} / ${continueAssignment.total}，待审核 ${focusPendingReviewCount} 题，待修改 ${continueAssignment.needsRevision} 题，已通过 ${continueAssignment.reviewPassed} 题。`}</p>
                  <div className="task-card-progress" aria-hidden="true">
                    <div className="task-card-progress-track">
                      <div className="task-card-progress-fill" style={{ width: `${focusCompletionRate}%` }} />
                    </div>
                    <span className="task-card-progress-label">{`${focusCompletionRate}%`}</span>
                  </div>
                  {continueAssignment.latestRejectReason ? (
                    <p className="inline-notice inline-notice-warning">最近打回：{continueAssignment.latestRejectReason}</p>
                  ) : null}
                  <p className="inline-notice">{nextActionText}</p>
                  <div className="button-row">
                    <Link className="button button-primary" to={`/labeler/workbench?assignmentId=${continueAssignment.assignmentId}`}>
                      继续作答
                    </Link>
                    <Link className="button" to="/labeler/contributions">
                      查看能力看板
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="empty-state-inline">
                  <p>当前还没有已领取任务，可以先前往任务广场开始第一条标注链路。</p>
                </div>
              )}
            </article>

            <article className="card dashboard-panel">
              <div className="section-header">
                <div>
                  <span className="section-eyebrow">Quick actions</span>
                  <h3>快捷入口</h3>
                </div>
              </div>
              <div className="quick-link-grid labeler-home-quick-grid">
                <Link className="quick-link-card" to="/labeler/tasks">
                  <h4>我的任务</h4>
                  <p>按待完成、已完成、打回修改查看任务。</p>
                </Link>
                <Link className="quick-link-card" to="/labeler/plaza">
                  <h4>任务广场</h4>
                  <p>领取新的标注任务，补充当前工作量。</p>
                </Link>
                <Link className="quick-link-card" to="/labeler/contributions">
                  <h4>能力看板</h4>
                  <p>查看通过率、返修率和任务表现。</p>
                </Link>
              </div>

              <div className="insight-banner labeler-home-insight">
                <span className="section-eyebrow">Next step</span>
                <h4>{nextActionText}</h4>
                <p>{`当前还有 ${dashboardStats.remainingItems} 题未完成、${dashboardStats.pendingReviewItems} 题待审核。优先处理打回项可以提升整体能力评分。`}</p>
              </div>
            </article>
          </div>
        </>
      )}
    </section>
  )
}
