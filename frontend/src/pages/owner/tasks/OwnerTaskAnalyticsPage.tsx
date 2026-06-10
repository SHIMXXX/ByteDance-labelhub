import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiGet } from '../../../services/api/client'

type TaskAnalyticsResponse = {
  task: {
    id: number
    title: string
    status: string
    taskBrief: string
    taskTags: string[]
    rewardRule: string
  }
  metrics: {
    itemCount: number
    completedItemCount: number
    passedItemCount: number
    pendingReviewCount: number
    passRate: number
  }
  statusBreakdown: Record<string, number>
  reviewers: Array<{
    reviewerId: number
    username: string
    displayName: string
  }>
  dataset: {
    id: number
    name: string
    itemCount: number
  } | null
  template: {
    id: number | null
    activeTemplateVersionId: number | null
  }
  aiConfigEnabled: boolean
}

const statusLabels: Record<string, string> = {
  draft: '草稿',
  submitted: '待审核',
  ai_passed: 'AI 通过待复核',
  needs_revision: '待修改',
  review_passed: '已通过',
}

export function OwnerTaskAnalyticsPage() {
  const { taskId } = useParams<{ taskId: string }>()
  const [data, setData] = useState<TaskAnalyticsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')

  useEffect(() => {
    if (!taskId) {
      setLoading(false)
      setPageError('缺少任务 ID，无法加载分析页。')
      return
    }

    void apiGet<TaskAnalyticsResponse>(`/tasks/${taskId}/analytics`)
      .then(setData)
      .catch(() => setPageError('任务分析加载失败，请稍后重试。'))
      .finally(() => setLoading(false))
  }, [taskId])

  if (loading) {
    return (
      <section>
        <header className="page-header">
          <div>
            <h2>任务进度分析</h2>
            <p>正在加载运营指标与状态分布。</p>
          </div>
        </header>
        <article className="empty-state-card">
          <h3>任务分析加载中</h3>
          <p>正在准备题量、通过率与审核状态分布。</p>
        </article>
      </section>
    )
  }

  if (pageError || !data) {
    return (
      <section>
        <header className="page-header">
          <div>
            <h2>任务进度分析</h2>
            <p>查看任务完成情况、通过率、题量与审核进度。</p>
          </div>
          <Link className="button" to="/owner/tasks">
            返回任务列表
          </Link>
        </header>
        <article className="empty-state-card empty-state-card-error">
          <h3>暂时无法打开任务分析页</h3>
          <p>{pageError || '当前任务不存在或你没有权限查看。'}</p>
        </article>
      </section>
    )
  }

  const hasSubmissions = Object.values(data.statusBreakdown).some((count) => count > 0)
  const breakdownEntries = Object.entries(data.statusBreakdown)
  const totalStatusCount = breakdownEntries.reduce((sum, [, count]) => sum + count, 0)

  return (
    <section className="task-analytics-page">
      <header className="page-hero page-hero-light">
        <div>
          <span className="page-eyebrow">Task analytics</span>
          <h2>任务进度分析</h2>
          <p>{data.task.title}</p>
        </div>
        <div className="button-row">
          <Link className="button" to={`/owner/tasks/${data.task.id}`}>
            返回任务详情
          </Link>
        </div>
      </header>

      <div className="stat-grid">
        <article className="stat-card stat-card-tint-lavender">
          <span className="stat-card-label">总题量</span>
          <strong className="stat-card-value">{data.metrics.itemCount}</strong>
          <p>当前任务绑定数据集的总题目数。</p>
        </article>
        <article className="stat-card stat-card-tint-sky">
          <span className="stat-card-label">已完成进度</span>
          <strong className="stat-card-value">{data.metrics.completedItemCount}</strong>
          <p>{`当前已完成 ${data.metrics.completedItemCount} / ${data.metrics.itemCount}`}</p>
        </article>
        <article className="stat-card stat-card-tint-mint">
          <span className="stat-card-label">通过率</span>
          <strong className="stat-card-value">{data.metrics.passRate}%</strong>
          <p>{`已通过 ${data.metrics.passedItemCount} 题。`}</p>
        </article>
        <article className="stat-card stat-card-tint-peach">
          <span className="stat-card-label">待审核数</span>
          <strong className="stat-card-value">{data.metrics.pendingReviewCount}</strong>
          <p>等待 Reviewer 进一步处理的条目数。</p>
        </article>
      </div>

      <div className="dashboard-grid dashboard-grid-owner-detail">
        <article className="card dashboard-panel">
          <div className="section-header">
            <div>
              <span className="section-eyebrow">Overview</span>
              <h3>运营摘要</h3>
            </div>
          </div>
          <div className="property-list">
            <div className="property-item">
              <span className="property-label">数据集</span>
              <strong className="property-value">{data.dataset ? data.dataset.name : '未绑定'}</strong>
            </div>
            <div className="property-item">
              <span className="property-label">Reviewer 覆盖</span>
              <strong className="property-value">{data.reviewers.length}</strong>
            </div>
            <div className="property-item">
              <span className="property-label">模板版本</span>
              <strong className="property-value">{data.template.activeTemplateVersionId ? `#${data.template.activeTemplateVersionId}` : '待生成'}</strong>
            </div>
            <div className="property-item">
              <span className="property-label">AI 配置</span>
              <strong className="property-value">{data.aiConfigEnabled ? '已启用' : '未启用'}</strong>
            </div>
          </div>
        </article>

        <article className="card dashboard-panel">
          <div className="section-header">
            <div>
              <span className="section-eyebrow">Breakdown</span>
              <h3>状态分布</h3>
            </div>
          </div>
          {!hasSubmissions ? (
            <div className="empty-state-inline">
              <p>尚未开始，可先发布并领取。</p>
            </div>
          ) : (
            <div className="analytics-breakdown">
              {breakdownEntries.map(([status, count]) => {
                const percent = totalStatusCount > 0 ? Math.round((count / totalStatusCount) * 100) : 0
                return (
                  <div className="analytics-progress-row" key={status}>
                    <div className="meta-row">
                      <span>{statusLabels[status] ?? status}</span>
                      <span>{count}</span>
                    </div>
                    <div className="analytics-progress-bar">
                      <div className="analytics-progress-fill" style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </article>
      </div>
    </section>
  )
}
