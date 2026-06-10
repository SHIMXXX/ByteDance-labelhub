import { Link } from 'react-router-dom'
import { apiGet } from '../../../services/api/client'
import type { OwnerTask } from '../../../types/domain'
import { useEffect, useMemo, useState } from 'react'
import { TimeRangeFilter } from '../../../components/TimeRangeFilter'
import { filterByTimeRange, type TimeRangeKey } from '../../../utils/timeRangeFilter'

type TaskListResponse = {
  items: Array<{
    id: number
    title: string
    description: string
    status: OwnerTask['status']
    quota: number
    deadline: string | null
    templateId: number | null
    datasetId?: number | null
    itemCount?: number
    completedItemCount?: number
    passedItemCount?: number
    pendingReviewCount?: number
    passRate?: number
    createdAt?: string | null
    updatedAt?: string | null
  }>
  total: number
}

function formatTask(task: TaskListResponse['items'][number]): OwnerTask {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    quota: task.quota,
    deadline: task.deadline ?? '未设置',
    templateId: task.templateId,
    datasetId: task.datasetId ?? null,
    itemCount: task.itemCount ?? 0,
    completedItemCount: task.completedItemCount ?? 0,
    passedItemCount: task.passedItemCount ?? 0,
    pendingReviewCount: task.pendingReviewCount ?? 0,
    passRate: task.passRate ?? 0,
    createdAt: task.createdAt ?? null,
    updatedAt: task.updatedAt ?? null,
  }
}

export function OwnerDashboardPage() {
  const [tasks, setTasks] = useState<OwnerTask[]>([])
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    void loadTasks()
  }, [])

  async function loadTasks() {
    setLoading(true)
    setError('')
    try {
      const result = await apiGet<TaskListResponse>('/tasks')
      setTasks(result.items.map(formatTask))
    } catch {
      setError('概览加载失败，请稍后重试。')
    } finally {
      setLoading(false)
    }
  }

  const visibleTasks = useMemo(
    () => filterByTimeRange(tasks, timeRange, (task) => task.updatedAt ?? task.createdAt ?? task.deadline),
    [tasks, timeRange],
  )

  const metrics = useMemo(() => {
    const draftCount = visibleTasks.filter((task) => task.status === 'draft').length
    const activeCount = visibleTasks.filter((task) => task.status === 'published' || task.status === 'paused').length
    const endedCount = visibleTasks.filter((task) => task.status === 'ended').length
    const pendingReviewCount = visibleTasks.reduce((sum, task) => sum + (task.pendingReviewCount ?? 0), 0)
    const totalItems = visibleTasks.reduce((sum, task) => sum + (task.itemCount ?? 0), 0)
    const totalPassedItems = visibleTasks.reduce((sum, task) => sum + (task.passedItemCount ?? 0), 0)
    const overallPassRate = totalItems > 0 ? Math.round((totalPassedItems / totalItems) * 100) : 0
    return {
      total: visibleTasks.length,
      draftCount,
      activeCount,
      endedCount,
      pendingReviewCount,
      overallPassRate,
    }
  }, [visibleTasks])

  const recentTasks = visibleTasks.slice(0, 2)

  return (
    <section className="dashboard-page owner-dashboard-page">
      <header className="page-hero page-hero-light">
        <div>
          <span className="page-eyebrow">Workspace overview</span>
          <h2>任务负责人概览</h2>
          <p>集中查看任务状态、审核压力与近期动作，快速进入创建、配置和导出主链路。</p>
        </div>
        <div className="button-row">
          <Link className="button button-primary" to="/owner/tasks">
            新建任务
          </Link>
          <Link className="button" to="/owner/templates">
            打开模板搭建
          </Link>
        </div>
      </header>

      {loading ? (
        <article className="empty-state-card">
          <h3>正在加载概览</h3>
          <p>稍候即可看到任务概况与近期进展。</p>
        </article>
      ) : error ? (
        <article className="empty-state-card empty-state-card-error">
          <h3>概览暂时不可用</h3>
          <p>{error}</p>
          <button className="button button-primary" type="button" onClick={() => void loadTasks()}>
            重试
          </button>
        </article>
      ) : (
        <>
          <TimeRangeFilter value={timeRange} onChange={setTimeRange} />
          <div className="stat-grid">
            <article className="stat-card stat-card-tint-lavender">
              <span className="stat-card-label">任务总数</span>
              <strong className="stat-card-value">{metrics.total}</strong>
              <p>已进入当前工作区的全部任务。</p>
            </article>
            <article className="stat-card stat-card-tint-peach">
              <span className="stat-card-label">待发布</span>
              <strong className="stat-card-value">{metrics.draftCount}</strong>
              <p>仍处于草稿阶段，适合继续完善模板与数据集。</p>
            </article>
            <article className="stat-card stat-card-tint-mint">
              <span className="stat-card-label">进行中任务</span>
              <strong className="stat-card-value">{metrics.activeCount}</strong>
              <p>包含发布中与暂停中、仍需继续推进的任务。</p>
            </article>
            <article className="stat-card stat-card-tint-sky">
              <span className="stat-card-label">整体通过率</span>
              <strong className="stat-card-value">{metrics.overallPassRate}%</strong>
              <p>按题量加权后的真实通过率，更接近当前运营状态。</p>
            </article>
          </div>

          <div className="dashboard-grid dashboard-grid-owner owner-dashboard-grid">
            <article className="card dashboard-panel owner-dashboard-panel">
              <div className="section-header">
                <div>
                  <span className="section-eyebrow">Recent tasks</span>
                  <h3>最近任务</h3>
                </div>
                <Link className="button" to="/owner/tasks">
                  查看全部
                </Link>
              </div>
              {recentTasks.length === 0 ? (
                <div className="empty-state-inline">
                  <p>还没有任务，先创建一个任务来开始演示链路。</p>
                </div>
              ) : (
                <div className="dashboard-list">
                  {recentTasks.map((task) => (
                    <article className="dashboard-list-card" key={task.id}>
                      <div>
                        <h4>{task.title}</h4>
                        <p>{task.description || '当前任务尚未填写补充说明。'}</p>
                      </div>
                      <div className="meta-row">
                        <span className={`status-badge status-task-${task.status}`}>{task.status}</span>
                        <span>{`待审核 ${task.pendingReviewCount ?? 0}`}</span>
                        <span>{`通过率 ${task.passRate ?? 0}%`}</span>
                      </div>
                      <div className="button-row">
                        <Link className="button" to={`/owner/tasks/${task.id}`}>
                          查看详情
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </article>

            <article className="card dashboard-panel owner-dashboard-panel">
              <div className="section-header">
                <div>
                  <span className="section-eyebrow">Quick actions</span>
                  <h3>快捷入口</h3>
                </div>
              </div>
              <div className="quick-link-grid">
                <Link className="quick-link-card" to="/owner/tasks">
                  <h4>任务管理</h4>
                  <p>创建任务、查看状态并进入详情页。</p>
                </Link>
                <Link className="quick-link-card" to="/owner/templates">
                  <h4>模板搭建</h4>
                  <p>维护表单 schema、规则和预览体验。</p>
                </Link>
                <Link className="quick-link-card" to="/owner/exports">
                  <h4>导出中心</h4>
                  <p>查看导出历史并发起新的结果导出。</p>
                </Link>
              </div>

              <div className="insight-banner owner-dashboard-insight">
                <span className="section-eyebrow">Review load</span>
                <h4>{`当前共有 ${metrics.pendingReviewCount} 条待审核结果`}</h4>
                <p>优先为进行中的任务补齐 Reviewer 分配与审核标准，能显著提升演示闭环的完整度。</p>
              </div>
            </article>
          </div>
        </>
      )}
    </section>
  )
}
