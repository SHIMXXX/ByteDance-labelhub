import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiGet } from '../../services/api/client'
import type { LabelerWorkbenchSummary } from '../../types/domain'
import { TimeRangeFilter } from '../../components/TimeRangeFilter'
import { filterByTimeRange, type TimeRangeKey } from '../../utils/timeRangeFilter'
import { calculateLabelerAbility, formatPercent, safePercent } from '../../utils/labelerAbility'

export function MyContributionPage() {
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
      setError('贡献中心加载失败，请稍后重试。')
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

  const ability = useMemo(() => {
    return calculateLabelerAbility(visibleAssignments)
  }, [visibleAssignments])

  const qualityTone =
    ability.qualityScore >= 85
      ? '稳定优秀'
      : ability.qualityScore >= 70
        ? '表现良好'
        : ability.processedCount > 0
          ? '需要校准'
          : '等待积累'

  return (
    <section className="dashboard-page labeler-page">
      <header className="page-hero page-hero-light">
        <div>
          <span className="page-eyebrow">Contribution center</span>
          <h2>我的贡献</h2>
          <p>用通过率、返修率、完成覆盖和任务稳定性评估当前标注能力。</p>
        </div>
        <div className="button-row">
          <Link className="button" to="/labeler/dashboard">
            返回概览
          </Link>
          <Link className="button button-primary" to="/labeler/plaza">
            去任务广场
          </Link>
        </div>
      </header>

      {loading ? (
        <article className="empty-state-card">
          <h3>正在加载贡献中心</h3>
          <p>稍候即可看到你的质量评分、能力指标和任务表现。</p>
        </article>
      ) : error ? (
        <article className="empty-state-card empty-state-card-error">
          <h3>贡献中心暂时不可用</h3>
          <p>{error}</p>
          <button className="button button-primary" type="button" onClick={() => void loadSummary()}>
            重试
          </button>
        </article>
      ) : (
        <>
          <TimeRangeFilter value={timeRange} onChange={setTimeRange} />
          <div className="contribution-overview">
            <article className="card contribution-score-card">
              <div>
                <span className="section-eyebrow">Ability score</span>
                <h3>标注能力评分</h3>
                <p className="field-helper-text">综合审核通过率、完成覆盖率和返修控制计算。</p>
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

            <article className="card contribution-insight-card">
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

          <div className="stat-grid">
            <article className="stat-card stat-card-tint-sky">
              <span className="stat-card-label">审核通过率</span>
              <strong className="stat-card-value">{formatPercent(ability.passRate)}</strong>
              <p>{`${ability.reviewPassedCount} 题已通过，基于已出审核结论题目计算。`}</p>
            </article>
            <article className="stat-card stat-card-tint-lavender">
              <span className="stat-card-label">完成覆盖率</span>
              <strong className="stat-card-value">{formatPercent(ability.completionRate)}</strong>
              <p>{`${ability.completedItems} / ${ability.totalItems} 题已完成作答或进入审核链路。`}</p>
            </article>
            <article className="stat-card stat-card-tint-peach">
              <span className="stat-card-label">返修率</span>
              <strong className="stat-card-value">{formatPercent(ability.revisionRate)}</strong>
              <p>{`${ability.needsRevisionCount} 题需要修改，越低代表标注一致性越好。`}</p>
            </article>
            <article className="stat-card stat-card-tint-mint">
              <span className="stat-card-label">处理吞吐</span>
              <strong className="stat-card-value">{ability.processedCount}</strong>
              <p>{`${ability.claimedTaskCount} 个任务中已有 ${ability.processedCount} 题产生提交或审核结果。`}</p>
            </article>
          </div>

          <div className="dashboard-grid dashboard-grid-labeler contribution-dashboard-grid">
            <article className="card dashboard-panel contribution-chart-panel">
              <div className="section-header">
                <div>
                  <span className="section-eyebrow">Review outcomes</span>
                  <h3>审核结果分布</h3>
                </div>
              </div>
              {ability.processedCount > 0 ? (
                <div className="contribution-outcome-chart">
                  <div className="contribution-stacked-bar" aria-label="审核结果分布">
                    <span
                      className="contribution-stacked-bar__pass"
                      style={{ width: formatPercent(safePercent(ability.reviewPassedCount, ability.processedCount)) }}
                    />
                    <span
                      className="contribution-stacked-bar__pending"
                      style={{ width: formatPercent(safePercent(ability.submittedCount, ability.processedCount)) }}
                    />
                    <span
                      className="contribution-stacked-bar__revision"
                      style={{ width: formatPercent(safePercent(ability.needsRevisionCount, ability.processedCount)) }}
                    />
                  </div>
                  <div className="contribution-legend-grid">
                    <div><i className="legend-pass" /><span>已通过</span><strong>{ability.reviewPassedCount}</strong></div>
                    <div><i className="legend-pending" /><span>待审核</span><strong>{ability.submittedCount}</strong></div>
                    <div><i className="legend-revision" /><span>待修改</span><strong>{ability.needsRevisionCount}</strong></div>
                  </div>
                </div>
              ) : (
                <div className="empty-state-inline">
                  <p>当前还没有可用于评估的提交结果。</p>
                </div>
              )}
            </article>

            <article className="card dashboard-panel contribution-chart-panel">
              <div className="section-header">
                <div>
                  <span className="section-eyebrow">Task performance</span>
                  <h3>任务表现</h3>
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
                <div className="empty-state-inline">
                  <p>当前没有已领取任务，领取任务后会生成任务表现画像。</p>
                </div>
              )}
            </article>
          </div>

          <article className="card contribution-guidance-panel">
            <div className="section-header">
              <div>
                <span className="section-eyebrow">Calibration</span>
                <h3>能力判断</h3>
              </div>
            </div>
            <div className="contribution-guidance-grid">
              <div>
                <strong>{ability.passRate >= 85 ? '准确性稳定' : ability.passRate >= 70 ? '准确性可用' : '准确性待提升'}</strong>
                <p>审核通过率越高，说明答案与任务规范、审核标准越一致。</p>
              </div>
              <div>
                <strong>{ability.revisionRate <= 10 ? '返修控制优秀' : ability.revisionRate <= 25 ? '返修可控' : '返修偏高'}</strong>
                <p>返修率用于观察是否频繁被 AI 或人工打回。</p>
              </div>
              <div>
                <strong>{ability.completionRate >= 80 ? '推进能力强' : ability.completionRate >= 50 ? '推进正常' : '推进不足'}</strong>
                <p>完成覆盖率反映领取任务后的实际作答推进情况。</p>
              </div>
            </div>
          </article>
        </>
      )}
    </section>
  )
}
