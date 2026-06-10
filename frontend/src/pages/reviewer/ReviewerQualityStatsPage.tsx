import { useEffect, useMemo, useState } from 'react'
import { apiGet } from '../../services/api/client'
import { TimeRangeFilter } from '../../components/TimeRangeFilter'
import type { ReviewerQualityHistoryItem, ReviewerQualityStats } from '../../types/domain'
import { formatDateTime } from '../../utils/dateTime'
import { filterByTimeRange, type TimeRangeKey } from '../../utils/timeRangeFilter'

function formatStage(stage: ReviewerQualityHistoryItem['reviewStage']) {
  if (stage === 'initial') return '初审'
  if (stage === 'second') return '复审'
  return '终审'
}

function renderReviewDecisionBadge(decision: ReviewerQualityHistoryItem['decision']) {
  const isApprove = decision === 'approve'
  return (
    <span
      style={{
        padding: '4px 8px',
        borderRadius: '999px',
        fontSize: '12px',
        fontWeight: 600,
        backgroundColor: isApprove ? '#f0fdf4' : '#fef2f2',
        color: isApprove ? '#1aae39' : '#e03131',
      }}
    >
      {isApprove ? '审核通过' : '已打回'}
    </span>
  )
}

export function ReviewerQualityStatsPage() {
  const [data, setData] = useState<ReviewerQualityStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 5

  // Reset to first page when search or time range changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, timeRange])

  const visibleHistoryReviews = useMemo(
    () => filterByTimeRange(data?.historyReviews ?? [], timeRange, (item) => item.createdAt),
    [data, timeRange],
  )

  const filteredHistoryReviews = useMemo(() => {
    if (!searchQuery.trim()) return visibleHistoryReviews
    const query = searchQuery.toLowerCase()
    return visibleHistoryReviews.filter(
      (item) =>
        item.taskTitle.toLowerCase().includes(query) ||
        item.labelerName.toLowerCase().includes(query) ||
        item.itemId.toString().includes(query) ||
        item.submissionId.toString().includes(query),
    )
  }, [visibleHistoryReviews, searchQuery])

  const totalPages = Math.max(1, Math.ceil(filteredHistoryReviews.length / pageSize))
  const paginatedReviews = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredHistoryReviews.slice(start, start + pageSize)
  }, [filteredHistoryReviews, currentPage])

  const hasHistoryReviews = (data?.historyReviews ?? []).length > 0

  const visibleDecisionCounts = useMemo(() => {
    if (!hasHistoryReviews) {
      return timeRange === 'all' ? (data?.decisionCounts ?? { approve: 0, reject: 0 }) : { approve: 0, reject: 0 }
    }

    return visibleHistoryReviews.reduce(
      (counts, item) => {
        counts[item.decision] += 1
        return counts
      },
      { approve: 0, reject: 0 },
    )
  }, [data, hasHistoryReviews, timeRange, visibleHistoryReviews])

  const totalReviews = visibleDecisionCounts.approve + visibleDecisionCounts.reject
  const approvalRate = totalReviews > 0 ? Math.round((visibleDecisionCounts.approve / totalReviews) * 100) : 0

  const topRejectReasons = useMemo(() => {
    if (!hasHistoryReviews) {
      return timeRange === 'all' ? (data?.topRejectReasons ?? []) : []
    }

    const counts = new Map<string, number>()
    visibleHistoryReviews.forEach((item) => {
      if (item.decision !== 'reject') return
      const reason = item.reason.trim() || '未填写打回原因'
      counts.set(reason, (counts.get(reason) ?? 0) + 1)
    })
    return Array.from(counts.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
  }, [data, hasHistoryReviews, timeRange, visibleHistoryReviews])

  useEffect(() => {
    void apiGet<ReviewerQualityStats>('/reviews/quality-stats')
      .then(setData)
      .catch(() => setError('质检统计加载失败，请稍后重试。'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <section className="dashboard-page reviewer-stats-page">
      <header className="page-hero page-hero-light" style={{ padding: '32px', marginBottom: '32px' }}>
        <div>
          <span className="page-eyebrow" style={{ color: 'var(--color-steel)', letterSpacing: '1px', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Quality analytics</span>
          <h2 style={{ fontSize: '32px', fontWeight: 700, margin: '0 0 12px 0', color: 'var(--color-ink)' }}>质检统计</h2>
          <p style={{ color: 'var(--color-slate)', fontSize: '16px', margin: 0 }}>查看历史审核结论、整体通过率与常见打回原因分布，追踪数据质量趋势。</p>
        </div>
      </header>

      {loading ? (
        <article className="empty-state-card" style={{ padding: '60px', textAlign: 'center' }}>
          <h3 style={{ margin: '0 0 8px 0' }}>正在加载统计数据</h3>
          <p style={{ margin: 0 }}>稍候即可看到你的质量看板与审核历史。</p>
        </article>
      ) : error ? (
        <article className="empty-state-card empty-state-card-error" style={{ padding: '40px', textAlign: 'center' }}>
          <h3 style={{ color: 'var(--color-error)', margin: '0 0 12px 0' }}>统计中心暂时不可用</h3>
          <p style={{ marginBottom: '20px' }}>{error}</p>
          <button className="button button-primary" type="button" onClick={() => window.location.reload()}>
            重试
          </button>
        </article>
      ) : (
        <>
          <div style={{ marginBottom: '24px' }}>
            <TimeRangeFilter value={timeRange} onChange={setTimeRange} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '32px' }}>
            <article className="card-base" style={{ padding: '24px', backgroundColor: '#fff', border: '1px solid var(--color-hairline)', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
              <span style={{ fontSize: '13px', color: 'var(--color-steel)', fontWeight: 500 }}>总审核数</span>
              <strong style={{ fontSize: '32px', color: 'var(--color-ink)', fontWeight: 700 }}>{totalReviews}</strong>
              <div style={{ fontSize: '12px', color: 'var(--color-muted)' }}>当前质检记录总量</div>
            </article>
            <article className="card-base" style={{ padding: '24px', backgroundColor: '#fff', border: '1px solid var(--color-hairline)', borderRadius: '16px', borderLeft: '4px solid var(--color-primary)', display: 'flex', flexDirection: 'column', gap: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
              <span style={{ fontSize: '13px', color: 'var(--color-primary)', fontWeight: 600 }}>通过率</span>
              <strong style={{ fontSize: '32px', color: 'var(--color-primary)', fontWeight: 700 }}>{approvalRate}%</strong>
              <div style={{ fontSize: '12px', color: 'var(--color-slate)' }}>基于人工审核决策</div>
            </article>
            <article className="card-base" style={{ padding: '24px', backgroundColor: '#fff', border: '1px solid var(--color-hairline)', borderRadius: '16px', borderLeft: '4px solid var(--color-success)', display: 'flex', flexDirection: 'column', gap: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
              <span style={{ fontSize: '13px', color: 'var(--color-success)', fontWeight: 600 }}>已通过</span>
              <strong style={{ fontSize: '32px', color: 'var(--color-success)', fontWeight: 700 }}>{visibleDecisionCounts.approve}</strong>
              <div style={{ fontSize: '12px', color: 'var(--color-slate)' }}>复核无误准予入库</div>
            </article>
            <article className="card-base" style={{ padding: '24px', backgroundColor: '#fff', border: '1px solid var(--color-hairline)', borderRadius: '16px', borderLeft: '4px solid var(--color-error)', display: 'flex', flexDirection: 'column', gap: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
              <span style={{ fontSize: '13px', color: 'var(--color-error)', fontWeight: 600 }}>已打回</span>
              <strong style={{ fontSize: '32px', color: 'var(--color-error)', fontWeight: 700 }}>{visibleDecisionCounts.reject}</strong>
              <div style={{ fontSize: '12px', color: 'var(--color-slate)' }}>不符合标准退回重做</div>
            </article>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '32px', alignItems: 'start' }}>
            <article className="card-base" style={{ padding: 0, overflow: 'hidden', backgroundColor: '#fff', border: '1px solid var(--color-hairline)', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-hairline-soft)', backgroundColor: 'var(--color-surface-soft)' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--color-ink)' }}>打回原因分布</h3>
              </div>
              <div style={{ padding: '24px' }}>
                {topRejectReasons.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {topRejectReasons.map((item, index) => {
                      const percentage = Math.round((item.count / (visibleDecisionCounts.reject || 1)) * 100)
                      return (
                        <div key={item.reason} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                            <span style={{ color: 'var(--color-charcoal)', fontWeight: 600 }}>{item.reason}</span>
                            <span style={{ color: 'var(--color-steel)', fontWeight: 500 }}>{item.count} 次 ({percentage}%)</span>
                          </div>
                          <div style={{ height: '8px', backgroundColor: 'var(--color-surface)', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${percentage}%`, backgroundColor: index === 0 ? 'var(--color-error)' : 'var(--color-steel)', borderRadius: '4px', transition: 'width 0.6s ease' }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--color-muted)' }}>暂无打回记录</div>
                )}
              </div>
            </article>

            <article className="card-base" style={{ padding: 0, overflow: 'hidden', backgroundColor: '#fff', border: '1px solid var(--color-hairline)', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-hairline-soft)', backgroundColor: 'var(--color-surface-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--color-ink)' }}>审核历史</h3>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="搜索任务、题号或人员..."
                    style={{ padding: '8px 16px', fontSize: '14px', width: '280px', borderRadius: '10px', border: '1px solid var(--color-hairline-strong)', outline: 'none' }}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--color-surface-soft)', borderBottom: '1px solid var(--color-hairline-soft)' }}>
                      <th style={{ padding: '16px 24px', fontSize: '13px', fontWeight: 600, color: 'var(--color-steel)' }}>审核时间</th>
                      <th style={{ padding: '16px 24px', fontSize: '13px', fontWeight: 600, color: 'var(--color-steel)' }}>任务标题</th>
                      <th style={{ padding: '16px 24px', fontSize: '13px', fontWeight: 600, color: 'var(--color-steel)' }}>标注员</th>
                      <th style={{ padding: '16px 24px', fontSize: '13px', fontWeight: 600, color: 'var(--color-steel)' }}>题号</th>
                      <th style={{ padding: '16px 24px', fontSize: '13px', fontWeight: 600, color: 'var(--color-steel)' }}>结论</th>
                      <th style={{ padding: '16px 24px', fontSize: '13px', fontWeight: 600, color: 'var(--color-steel)' }}>详细信息</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedReviews.length > 0 ? (
                      paginatedReviews.map((item, idx) => (
                        <tr key={`${item.submissionId}-${item.createdAt}`} style={{ borderBottom: idx === paginatedReviews.length - 1 ? 'none' : '1px solid var(--color-hairline-soft)' }}>
                          <td style={{ padding: '16px 24px', fontSize: '13px', color: 'var(--color-slate)' }}>
                            <div style={{ fontWeight: 600 }}>{formatDateTime(item.createdAt).split(' ')[0]}</div>
                            <div style={{ opacity: 0.7 }}>{formatDateTime(item.createdAt).split(' ')[1]}</div>
                          </td>
                          <td style={{ padding: '16px 24px', fontWeight: 640, fontSize: '14px', color: 'var(--color-ink)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.taskTitle}
                          </td>
                          <td style={{ padding: '16px 24px', fontSize: '14px' }}>{item.labelerName}</td>
                          <td style={{ padding: '16px 24px' }}>
                            <span style={{ padding: '4px 8px', backgroundColor: 'var(--color-surface)', borderRadius: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--color-slate)' }}>#{item.itemId}</span>
                          </td>
                          <td style={{ padding: '16px 24px' }}>
                            <span style={{ 
                              padding: '4px 10px', 
                              borderRadius: '99px', 
                              fontSize: '12px', 
                              fontWeight: 700, 
                              backgroundColor: item.decision === 'approve' ? '#ecfdf3' : '#fef3f2',
                              color: item.decision === 'approve' ? '#067647' : '#b42318',
                              border: `1px solid ${item.decision === 'approve' ? '#8ad1a2' : '#f2b8b5'}`
                            }}>
                              {item.decision === 'approve' ? '通过' : '打回'}
                            </span>
                          </td>
                          <td style={{ padding: '16px 24px' }}>
                            <div style={{ fontSize: '12px', color: 'var(--color-slate)', maxWidth: '280px' }}>
                              <div style={{ fontWeight: 600, marginBottom: '4px', opacity: 0.8 }}>第 {item.reviewRound} 轮 · {formatStage(item.reviewStage)}</div>
                              {item.reason || item.comment ? (
                                <div style={{ 
                                  padding: '8px 10px', 
                                  backgroundColor: 'var(--color-surface-soft)', 
                                  borderRadius: '6px', 
                                  border: '1px solid var(--color-hairline-soft)',
                                  fontStyle: 'italic',
                                  marginTop: '4px'
                                }}>
                                  “{item.reason || item.comment}”
                                </div>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} style={{ padding: '80px 0', textAlign: 'center', color: 'var(--color-muted)' }}>
                          {searchQuery ? '未找到匹配的记录' : '暂无历史记录'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {filteredHistoryReviews.length > pageSize && (
                <div style={{ padding: '16px 24px', borderTop: '1px solid var(--color-hairline-soft)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'var(--color-surface-soft)' }}>
                  <span style={{ fontSize: '13px', color: 'var(--color-slate)' }}>
                    第 <strong>{currentPage}</strong> / {totalPages} 页 · 共 {filteredHistoryReviews.length} 条
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="button button-sm"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(prev => prev - 1)}
                    >
                      上一页
                    </button>
                    <button
                      className="button button-sm"
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage(prev => prev + 1)}
                    >
                      下一页
                    </button>
                  </div>
                </div>
              )}
            </article>
          </div>
        </>
      )}
    </section>
  )
}
