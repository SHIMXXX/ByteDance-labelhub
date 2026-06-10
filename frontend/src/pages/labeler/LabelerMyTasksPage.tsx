import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiGet, apiPost } from '../../services/api/client'
import { TimeRangeFilter } from '../../components/TimeRangeFilter'
import { filterByTimeRange, type TimeRangeKey } from '../../utils/timeRangeFilter'
import { parseAppDate } from '../../utils/time'
import type {
  LabelerAssignmentSummary,
  LabelerHistoryItem,
  LabelerWorkbenchSummary,
} from '../../types/domain'

type AssignmentBucket = 'pending' | 'completed' | 'revision'

type AssignmentCard = {
  assignment: LabelerAssignmentSummary
  bucket: AssignmentBucket
  pendingReviewCount: number
  draftCount: number
  touchedCount: number
}

function parseTime(value: string | null | undefined) {
  if (!value) {
    return 0
  }
  return parseAppDate(value)?.getTime() ?? 0
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return '暂无记录'
  }
  const date = parseAppDate(value)
  if (!date) {
    return value
  }
  return date.toLocaleString('zh-CN', { hour12: false })
}

function groupHistoryByAssignment(items: LabelerHistoryItem[]) {
  return items.reduce<Record<number, LabelerHistoryItem[]>>((accumulator, item) => {
    accumulator[item.assignmentId] = [...(accumulator[item.assignmentId] ?? []), item]
    return accumulator
  }, {})
}

function categorizeAssignment(
  assignment: LabelerAssignmentSummary,
  historyItems: LabelerHistoryItem[],
): AssignmentCard {
  const pendingReviewCount = historyItems.filter((item) => item.status === 'submitted' || item.status === 'ai_passed').length
  const draftCount = historyItems.filter((item) => item.status === 'draft').length
  const touchedCount = historyItems.length

  if (assignment.needsRevision > 0) {
    return {
      assignment,
      bucket: 'revision',
      pendingReviewCount,
      draftCount,
      touchedCount,
    }
  }

  const isCompleted =
    draftCount === 0 &&
    assignment.reviewPassed + pendingReviewCount >= assignment.total

  return {
    assignment,
    bucket: isCompleted ? 'completed' : 'pending',
    pendingReviewCount,
    draftCount,
    touchedCount,
  }
}

function sortCards(items: AssignmentCard[]) {
  return [...items].sort((left, right) => {
    const leftTime =
      left.bucket === 'revision'
        ? parseTime(left.assignment.latestRejectAt ?? left.assignment.latestUpdatedAt)
        : parseTime(left.assignment.latestUpdatedAt)
    const rightTime =
      right.bucket === 'revision'
        ? parseTime(right.assignment.latestRejectAt ?? right.assignment.latestUpdatedAt)
        : parseTime(right.assignment.latestUpdatedAt)
    return rightTime - leftTime
  })
}

export function LabelerMyTasksPage() {
  const [summary, setSummary] = useState<LabelerWorkbenchSummary | null>(null)
  const [history, setHistory] = useState<LabelerHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<AssignmentBucket>('pending')
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('all')

  useEffect(() => {
    void loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    setError('')

    try {
      const [nextSummary, nextHistory] = await Promise.all([
        apiGet<LabelerWorkbenchSummary>('/workbench/summary'),
        apiGet<{ items: LabelerHistoryItem[] }>('/workbench/history'),
      ])
      setSummary(nextSummary)
      setHistory(nextHistory.items)
    } catch {
      setError('我的任务加载失败，请确认后端服务已启动后重试。')
    } finally {
      setLoading(false)
    }
  }

  async function handleUnclaim(taskId: number, taskTitle: string) {
    if (!window.confirm(`确认要放弃任务「${taskTitle}」吗？\n放弃后，您在该任务下的所有草稿与进度将永久删除，且名额将重新释放给其他标注员。`)) {
      return
    }

    try {
      setLoading(true)
      await apiPost(`/tasks/${taskId}/unclaim`, {})
      await loadData()
    } catch {
      setError('放弃任务失败，请稍后重试。')
      setLoading(false)
    }
  }

  const taskCards = useMemo(() => {
    const historyByAssignment = groupHistoryByAssignment(history)
    const visibleAssignments = filterByTimeRange(summary?.assignments ?? [], timeRange, (assignment) => assignment.latestRejectAt ?? assignment.latestUpdatedAt)
    return visibleAssignments.map((assignment) =>
      categorizeAssignment(assignment, historyByAssignment[assignment.assignmentId] ?? []),
    )
  }, [history, summary, timeRange])

  const pendingCards = useMemo(() => sortCards(taskCards.filter((item) => item.bucket === 'pending')), [taskCards])
  const completedCards = useMemo(() => sortCards(taskCards.filter((item) => item.bucket === 'completed')), [taskCards])
  const revisionCards = useMemo(() => sortCards(taskCards.filter((item) => item.bucket === 'revision')), [taskCards])

  useEffect(() => {
    const nextAvailableTab = (
      [
        ['revision', revisionCards],
        ['pending', pendingCards],
        ['completed', completedCards],
      ] as const
    ).find(([, items]) => items.length > 0)?.[0]

    if (!nextAvailableTab) {
      setActiveTab('pending')
      return
    }

    // 只有当当前选中的 Tab 为空，且有其他 Tab 有数据时，才自动切换
    // 这样可以允许用户手动切到空的 Tab 查看空状态，而不会被立刻弹回
    const currentTabHasItems =
      (activeTab === 'pending' && pendingCards.length > 0) ||
      (activeTab === 'completed' && completedCards.length > 0) ||
      (activeTab === 'revision' && revisionCards.length > 0)

    if (!currentTabHasItems) {
      setActiveTab(nextAvailableTab)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCards, completedCards, revisionCards])

  const focusedCard = revisionCards[0] ?? pendingCards[0] ?? completedCards[0] ?? null
  const tabItems: Array<{ key: AssignmentBucket; label: string; description: string; count: number }> = [
    { key: 'pending', label: '待完成', description: '仍有草稿或未完成题目，适合继续推进。', count: pendingCards.length },
    { key: 'completed', label: '已完成', description: '已全部作答，包含待审核和已入库任务。', count: completedCards.length },
    { key: 'revision', label: '打回修改', description: '优先处理已收到打回意见的任务。', count: revisionCards.length },
  ]

  const currentCards =
    activeTab === 'completed' ? completedCards : activeTab === 'revision' ? revisionCards : pendingCards

  return (
    <section className="dashboard-page labeler-page labeler-task-page">
      <header className="page-hero page-hero-light">
        <div>
          <span className="page-eyebrow">Task manager</span>
          <h2>我的任务</h2>
          <p>把待完成、待审核和打回修改统一收进一个任务视图，用任务卡片直接回到全屏作答工作区。</p>
        </div>
        <div className="button-row">
          <Link className="button" to="/labeler/plaza">
            去任务广场
          </Link>
          <Link className="button button-primary" to="/labeler/contributions">
            查看我的贡献
          </Link>
        </div>
      </header>

      {loading ? (
        <article className="empty-state-card">
          <h3>正在加载我的任务</h3>
          <p>稍候即可看到当前任务分区、状态概览与继续入口。</p>
        </article>
      ) : error ? (
        <article className="empty-state-card empty-state-card-error">
          <h3>我的任务暂时不可用</h3>
          <p>{error}</p>
          <button className="button button-primary" type="button" onClick={() => void loadData()}>
            重试
          </button>
        </article>
      ) : taskCards.length === 0 ? (
        <article className="empty-state-card">
          <h3>当前还没有已领取任务</h3>
          <p>先去任务广场领取一个任务，你的进行中任务、待审核任务和打回任务都会汇总在这里。</p>
        </article>
      ) : (
        <>
          <TimeRangeFilter value={timeRange} onChange={setTimeRange} />
          {focusedCard ? (
            <article className="card task-hub-focus-card">
              <div className="designer-section-header">
                <div>
                  <span className="section-eyebrow">
                    {focusedCard.bucket === 'revision'
                      ? 'Needs revision'
                      : focusedCard.bucket === 'completed'
                        ? 'Completed'
                        : 'Continue now'}
                  </span>
                  <h3>{focusedCard.assignment.taskTitle}</h3>
                  <p className="field-helper-text">
                    {focusedCard.bucket === 'revision'
                      ? '优先根据最近一次打回意见继续修改，避免任务长时间停留在待处理状态。'
                      : focusedCard.bucket === 'completed'
                        ? '该任务已全部作答，待审核与已入库题目会在状态区分中展示。'
                        : '该任务仍有未完成题目或草稿，建议优先继续处理保持作答连贯性。'}
                  </p>
                </div>
                <div className="button-row">
                  {focusedCard.bucket !== 'completed' && (
                    <button
                      className="button button-danger"
                      type="button"
                      onClick={() => void handleUnclaim(focusedCard.assignment.taskId, focusedCard.assignment.taskTitle)}
                    >
                      放弃任务
                    </button>
                  )}
                  <Link
                    className="button button-primary"
                    to={`/labeler/workbench?assignmentId=${focusedCard.assignment.assignmentId}`}
                  >
                    {focusedCard.bucket === 'completed' ? '查看详情' : '继续任务'}
                  </Link>
                </div>
              </div>
              <div className="task-hub-strip">
                <span>{`总题量 ${focusedCard.assignment.total}`}</span>
                <span>{`已通过 ${focusedCard.assignment.reviewPassed}`}</span>
                <span>{`待审核 ${focusedCard.pendingReviewCount}`}</span>
                <span>{`草稿中 ${focusedCard.draftCount}`}</span>
                <span>{`待修改 ${focusedCard.assignment.needsRevision}`}</span>
              </div>
              {focusedCard.assignment.latestRejectReason ? (
                <p className="inline-notice inline-notice-warning">最近打回：{focusedCard.assignment.latestRejectReason}</p>
              ) : null}
            </article>
          ) : null}

          <article className="card task-hub-panel">
            <div className="designer-preview-header">
              <div>
                <span className="section-eyebrow">Task buckets</span>
                <h3>任务分区</h3>
                <p className="field-helper-text">切换不同分类查看任务卡片，所有卡片都可直接进入全屏作答工作区。</p>
              </div>
            </div>

            <div className="task-hub-tabs" role="tablist" aria-label="我的任务分类">
              {tabItems.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.key}
                  className={activeTab === tab.key ? 'task-hub-tab is-active' : 'task-hub-tab'}
                  onClick={() => setActiveTab(tab.key)}
                >
                  <strong>{tab.label}</strong>
                  <span>{`${tab.count} 个任务`}</span>
                  <small>{tab.description}</small>
                </button>
              ))}
            </div>

            {currentCards.length === 0 ? (
              <div className="empty-state-inline task-hub-empty">
                <p>
                  {activeTab === 'revision'
                    ? '当前没有打回修改任务，可以先去推进进行中的任务。'
                    : activeTab === 'completed'
                      ? '当前没有已完成任务，继续完成更多题目后会出现在这里。'
                      : '当前没有待完成任务，可以去任务广场领取新任务。'}
                </p>
              </div>
            ) : (
              <div className="card-list task-hub-card-list">
                {currentCards.map((card, idx) => {
                  const cardProgress =
                    card.assignment.total > 0
                      ? Math.round(
                          ((card.assignment.reviewPassed + card.pendingReviewCount + card.assignment.needsRevision + card.draftCount) /
                            card.assignment.total) *
                            100,
                        )
                      : 0

                  return (
                    <article
                      className="card task-hub-task-card"
                      key={card.assignment.assignmentId}
                      style={{ animationDelay: `${idx * 60}ms` }}
                    >
                      <div className="task-card-inner">
                        <div className="task-card-left">
                          <div className="task-card-badge-row">
                            <span
                              className={`task-card-status-badge task-card-status-badge--${card.bucket === 'revision' ? 'revision' : card.bucket === 'completed' ? 'completed' : 'pending'}`}
                            >
                              {card.bucket === 'revision' ? '待修改' : card.bucket === 'completed' ? (card.pendingReviewCount > 0 ? '待审核' : '已入库') : '进行中'}
                            </span>
                            <span className="task-card-meta-chip">{`${card.assignment.total} 题 · ${card.touchedCount} 已触达`}</span>
                          </div>

                          <h3 className="task-card-title">{card.assignment.taskTitle}</h3>

                          <div className="task-card-numbers">
                            <div className="task-card-number">
                              <strong>{card.assignment.reviewPassed}</strong>
                              <span>已通过</span>
                            </div>
                            <div className="task-card-number">
                              <strong>{card.pendingReviewCount}</strong>
                              <span>待审核</span>
                            </div>
                            <div className="task-card-number">
                              <strong>{card.draftCount}</strong>
                              <span>草稿</span>
                            </div>
                            {card.bucket === 'revision' ? (
                              <div className="task-card-number task-card-number--warn">
                                <strong>{card.assignment.needsRevision}</strong>
                                <span>待修改</span>
                              </div>
                            ) : null}
                          </div>

                          <div className="task-card-progress" aria-hidden="true">
                            <div className="task-card-progress-track">
                              <div className="task-card-progress-fill" style={{ width: `${cardProgress}%` }} />
                            </div>
                            <span className="task-card-progress-label">{cardProgress}%</span>
                          </div>

                          {card.assignment.latestRejectReason ? (
                            <p className="task-card-reject-note">{card.assignment.latestRejectReason}</p>
                          ) : null}
                          {card.assignment.revisionItemIds && card.assignment.revisionItemIds.length > 0 ? (
                            <p className="task-card-meta">{`待修改题号：${card.assignment.revisionItemIds.map((id) => `#${id}`).join('、')}`}</p>
                          ) : null}
                        </div>

                        <div className="task-card-right">
                          {card.bucket !== 'completed' && (
                            <button
                              className="button button-sm button-danger"
                              type="button"
                              onClick={() => void handleUnclaim(card.assignment.taskId, card.assignment.taskTitle)}
                            >
                              放弃任务
                            </button>
                          )}
                          <Link
                            className={`button ${card.bucket === 'completed' ? 'button-outline' : 'button-primary'} task-card-action`}
                            to={`/labeler/workbench?assignmentId=${card.assignment.assignmentId}`}
                          >
                            {card.bucket === 'completed' ? '查看详情' : '继续任务'}
                          </Link>
                          <span className="task-card-updated">{`更新于 ${formatDateTime(card.assignment.latestUpdatedAt)}`}</span>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </article>
        </>
      )}
    </section>
  )
}
