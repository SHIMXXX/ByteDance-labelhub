import { Link } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { apiGet } from '../../../services/api/client'
import { TimeRangeFilter } from '../../../components/TimeRangeFilter'
import type { AIDecision, ReviewPendingItem } from '../../../types/domain'
import { filterByTimeRange, type TimeRangeKey } from '../../../utils/timeRangeFilter'

type PendingReviewsResponse = {
  items: ReviewPendingItem[]
  total: number
}

export function ReviewerDashboardPage() {
  const [items, setItems] = useState<ReviewPendingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('all')

  useEffect(() => {
    void loadPendingReviews()
  }, [])

  async function loadPendingReviews() {
    setLoading(true)
    setError('')
    try {
      const result = await apiGet<PendingReviewsResponse>('/reviews/pending')
      setItems(result.items)
    } catch {
      setError('概览加载失败，请稍后重试。')
    } finally {
      setLoading(false)
    }
  }

  const visibleItems = useMemo(
    () => filterByTimeRange(items, timeRange, (item) => item.submittedAt),
    [items, timeRange],
  )

  const decisionCounts = useMemo(() => {
    const counts: Record<AIDecision, number> = {
      pass: 0,
      human_review: 0,
      reject: 0,
    }
    visibleItems.forEach((item) => {
      if (counts[item.aiDecision] !== undefined) {
        counts[item.aiDecision] += 1
      }
    })
    return counts
  }, [visibleItems])

  const tasksSummary = useMemo(() => {
    const map = new Map<number, { taskId: number; taskTitle: string; count: number }>()
    visibleItems.forEach((item) => {
      const current = map.get(item.taskId)
      map.set(item.taskId, {
        taskId: item.taskId,
        taskTitle: item.taskTitle,
        count: (current?.count ?? 0) + 1
      })
    })
    return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 5)
  }, [visibleItems])

  return (
    <section className="dashboard-page reviewer-dashboard-page">
      <header className="page-hero page-hero-light">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span className="badge-tag-purple" style={{ backgroundColor: '#e6e0f5', color: '#5645d4', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600 }}>Reviewer Workspace</span>
            </div>
            <h2 style={{ fontSize: '32px', fontWeight: 600, marginBottom: '12px', color: '#1a1a1a' }}>审核员概览</h2>
            <p style={{ color: '#5d5b54', maxWidth: '600px', fontSize: '16px', margin: 0 }}>
              快速定位待审任务、AI 预审判定分布与最近提交，保持数据质量管控的高效流转。
            </p>
          </div>
          <div className="button-row">
            <Link className="button button-primary" to="/reviewer/reviews" style={{ padding: '8px 24px', borderRadius: '8px', fontWeight: 600 }}>
              进入审核工作台
            </Link>
          </div>
        </div>
      </header>

      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#a4a097' }}>正在调取审核队列...</div>
      ) : error ? (
        <div className="card-feature-rose" style={{ padding: '24px', textAlign: 'center', backgroundColor: '#fde0ec', borderRadius: '12px' }}>
          <p style={{ color: '#e03131', fontWeight: 500, marginBottom: '12px' }}>{error}</p>
          <button className="button button-sm" type="button" onClick={() => void loadPendingReviews()} style={{ border: '1px solid #e03131', color: '#e03131' }}>重试</button>
        </div>
      ) : (
        <>
          <TimeRangeFilter value={timeRange} onChange={setTimeRange} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px', marginBottom: '32px' }}>
            <article className="card-base" style={{ padding: '24px', border: '1px solid #e5e3df', borderRadius: '12px', backgroundColor: '#fff' }}>
              <span style={{ display: 'block', fontSize: '13px', color: '#787671', fontWeight: 500, marginBottom: '8px' }}>待审总数</span>
              <strong style={{ display: 'block', fontSize: '36px', fontWeight: 600, color: '#1a1a1a', marginBottom: '8px' }}>{visibleItems.length}</strong>
              <p style={{ fontSize: '12px', color: '#a4a097', margin: 0 }}>当前等待人工处理的全部提交</p>
            </article>
            <article className="card-base" style={{ padding: '24px', border: '1px solid #1aae39', borderRadius: '12px', backgroundColor: '#f0fdf4' }}>
              <span style={{ display: 'block', fontSize: '13px', color: '#166534', fontWeight: 500, marginBottom: '8px' }}>AI 判定通过</span>
              <strong style={{ display: 'block', fontSize: '36px', fontWeight: 600, color: '#1aae39', marginBottom: '8px' }}>{decisionCounts.pass}</strong>
              <p style={{ fontSize: '12px', color: '#166534', margin: 0, opacity: 0.8 }}>低风险，建议优先确认</p>
            </article>
            <article className="card-base" style={{ padding: '24px', border: '1px solid #5645d4', borderRadius: '12px', backgroundColor: '#f5f2ff' }}>
              <span style={{ display: 'block', fontSize: '13px', color: '#391c57', fontWeight: 500, marginBottom: '8px' }}>待人工复核</span>
              <strong style={{ display: 'block', fontSize: '36px', fontWeight: 600, color: '#5645d4', marginBottom: '8px' }}>{decisionCounts.human_review}</strong>
              <p style={{ fontSize: '12px', color: '#391c57', margin: 0, opacity: 0.8 }}>模型不确定，需介入判断</p>
            </article>
            <article className="card-base" style={{ padding: '24px', border: '1px solid #e03131', borderRadius: '12px', backgroundColor: '#fef2f2' }}>
              <span style={{ display: 'block', fontSize: '13px', color: '#991b1b', fontWeight: 500, marginBottom: '8px' }}>AI 已拒绝</span>
              <strong style={{ display: 'block', fontSize: '36px', fontWeight: 600, color: '#e03131', marginBottom: '8px' }}>{decisionCounts.reject}</strong>
              <p style={{ fontSize: '12px', color: '#991b1b', margin: 0, opacity: 0.8 }}>高风险，需核实并打回</p>
            </article>
          </div>

          <div className="reviewer-dashboard-grid" style={{ gap: '24px' }}>
            <article className="card-base" style={{ border: '1px solid #e5e3df', borderRadius: '12px', backgroundColor: '#fff', overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #ede9e4', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#1a1a1a', margin: 0 }}>最近待审队列</h3>
                <Link className="button-sm" to="/reviewer/reviews" style={{ textDecoration: 'none', color: '#5645d4', fontWeight: 500 }}>
                  查看全部 →
                </Link>
              </div>
              {visibleItems.length === 0 ? (
                <div style={{ padding: '60px 24px', textAlign: 'center', color: '#a4a097' }}>
                  <p>当前没有待审核项，可以稍后回来查看新提交结果。</p>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#fafaf9' }}>
                      <th style={{ padding: '12px 24px', fontSize: '12px', fontWeight: 500, color: '#787671', borderBottom: '1px solid #ede9e4' }}>任务信息</th>
                      <th style={{ padding: '12px 24px', fontSize: '12px', fontWeight: 500, color: '#787671', borderBottom: '1px solid #ede9e4' }}>提交记录</th>
                      <th style={{ padding: '12px 24px', fontSize: '12px', fontWeight: 500, color: '#787671', borderBottom: '1px solid #ede9e4' }}>AI 建议</th>
                      <th style={{ padding: '12px 24px', fontSize: '12px', fontWeight: 500, color: '#787671', borderBottom: '1px solid #ede9e4' }}>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.slice(0, 5).map((item) => (
                      <tr key={item.submissionId} style={{ borderBottom: '1px solid #ede9e4' }}>
                        <td style={{ padding: '16px 24px' }}>
                          <span style={{ display: 'block', fontWeight: 600, color: '#1a1a1a', fontSize: '14px', marginBottom: '4px' }}>{item.taskTitle}</span>
                          <span style={{ fontSize: '12px', color: '#a4a097' }}>ID: #{item.taskId}</span>
                        </td>
                        <td style={{ padding: '16px 24px', fontSize: '13px', color: '#37352f' }}>
                          <span style={{ display: 'block' }}>提交 #{item.submissionId}</span>
                          <span style={{ color: '#a4a097' }}>题目 #{item.itemId}</span>
                        </td>
                        <td style={{ padding: '16px 24px' }}>
                          <span style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            backgroundColor: item.aiDecision === 'pass' ? '#d9f3e1' : item.aiDecision === 'reject' ? '#fde0ec' : '#e6e0f5',
                            color: item.aiDecision === 'pass' ? '#1aae39' : item.aiDecision === 'reject' ? '#e03131' : '#5645d4'
                          }}>
                            {item.aiDecision}
                          </span>
                        </td>
                        <td style={{ padding: '16px 24px', fontSize: '12px', color: '#787671' }}>
                          第 {item.currentReviewRound ?? 1} 轮 / {item.currentReviewStage === 'final' ? '终审' : item.currentReviewStage === 'second' ? '复审' : '初审'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </article>

            <article className="card-base" style={{ border: '1px solid #e5e3df', borderRadius: '12px', backgroundColor: '#fff', overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #ede9e4' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#1a1a1a', margin: 0 }}>任务积压排行</h3>
              </div>
              <div style={{ padding: '16px 24px' }}>
                {tasksSummary.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {tasksSummary.map((item) => {
                      const percentage = Math.min(100, Math.max(5, (item.count / visibleItems.length) * 100))
                      return (
                        <div key={item.taskId}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 500, color: '#37352f', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '70%' }} title={item.taskTitle}>
                              {item.taskTitle}
                            </span>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: '#5645d4' }}>{item.count} 条</span>
                          </div>
                          <div style={{ width: '100%', height: '6px', backgroundColor: '#f0eeec', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${percentage}%`, backgroundColor: '#5645d4', borderRadius: '3px' }}></div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div style={{ padding: '40px 0', textAlign: 'center', color: '#a4a097' }}>
                    <p>当前没有待审任务分组。</p>
                  </div>
                )}
              </div>
            </article>
          </div>
        </>
      )}
    </section>
  )
}
