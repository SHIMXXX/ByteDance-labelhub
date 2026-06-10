import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiGet, apiPost } from '../../../services/api/client'
import type { LabelerTask } from '../../../types/domain'
import { TimeRangeFilter } from '../../../components/TimeRangeFilter'
import { filterByTimeRange, type TimeRangeKey } from '../../../utils/timeRangeFilter'

type PlazaResponse = {
  items: Array<{
    id: number
    title: string
    description: string
    status: LabelerTask['status']
    quota: number
    claimedCount: number
    claimedByCurrentUser?: boolean
    assignmentId?: number | null
    deadline: string | null
    createdAt?: string | null
    updatedAt?: string | null
  }>
  total: number
}

type ClaimResponse = {
  assignmentId: number
  taskId: number
  userId: number
  claimedAt: string
}

function toLabelerTask(task: PlazaResponse['items'][number]): LabelerTask {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    quota: task.quota,
    deadline: task.deadline ?? '未设置',
    remaining: Math.max(task.quota - task.claimedCount, 0),
    claimed: task.claimedByCurrentUser ?? false,
    assignmentId: task.assignmentId ?? undefined,
    createdAt: task.createdAt ?? null,
    updatedAt: task.updatedAt ?? null,
  }
}

export function LabelerPlazaPage() {
  const [tasks, setTasks] = useState<LabelerTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [claimingTaskId, setClaimingTaskId] = useState<number | null>(null)
  const [keyword, setKeyword] = useState('')
  const [claimStatus, setClaimStatus] = useState('all')
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('all')

  const visibleTasks = filterByTimeRange(tasks, timeRange, (task) => task.updatedAt ?? task.createdAt ?? task.deadline)
  const availableTaskCount = visibleTasks.filter((task) => !task.claimed).length
  const claimedTaskCount = visibleTasks.filter((task) => task.claimed).length
  const totalRemaining = visibleTasks.reduce((sum, task) => sum + task.remaining, 0)

  useEffect(() => {
    void loadTasks()
  }, [])

  async function loadTasks(nextKeyword = keyword, nextClaimStatus = claimStatus) {
    setLoading(true)
    setError('')

    try {
      const result = await apiGet<PlazaResponse>('/tasks/plaza', {
        ...(nextKeyword.trim() ? { keyword: nextKeyword.trim() } : {}),
        ...(nextClaimStatus !== 'all' ? { claimStatus: nextClaimStatus } : {}),
      })
      setTasks(result.items.map(toLabelerTask))
    } catch {
      setError('任务广场加载失败，请确认后端服务已启动。')
    } finally {
      setLoading(false)
    }
  }

  async function handleClaim(taskId: number) {
    setClaimingTaskId(taskId)
    setError('')

    try {
      const result = await apiPost<ClaimResponse, Record<string, never>>(`/tasks/${taskId}/claim`, {})
      setTasks((current) =>
        current.map((task) =>
          task.id === taskId
            ? {
                ...task,
                claimed: true,
                assignmentId: result.assignmentId,
                remaining: Math.max(task.remaining - 1, 0),
              }
            : task,
        ),
      )
    } catch {
      setError('领取失败，请稍后重试。')
    } finally {
      setClaimingTaskId(null)
    }
  }

  return (
    <section className="dashboard-page labeler-page labeler-plaza-page">
      <header className="page-hero page-hero-light">
        <div>
          <span className="page-eyebrow">Task plaza</span>
          <h2>任务广场</h2>
          <p>像浏览任务市场一样快速筛选可领取任务，并直接进入连续作答工作台。</p>
        </div>
        <div className="plaza-hero-summary" aria-label="任务广场概览">
          <div>
            <span>可领取</span>
            <strong>{availableTaskCount}</strong>
          </div>
          <div>
            <span>已领取</span>
            <strong>{claimedTaskCount}</strong>
          </div>
          <div>
            <span>剩余额度</span>
            <strong>{totalRemaining}</strong>
          </div>
        </div>
      </header>


      <article className="card plaza-filter-card plaza-filter-card-compact">
        <div className="section-header">
          <div>
            <span className="section-eyebrow">Marketplace filters</span>
            <h3 className="plaza-filter-title">任务筛选器</h3>
          </div>
        </div>
        <div className="form-grid plaza-filter-grid">
          <label className="form-field">
            <span>搜索任务</span>
            <input value={keyword} onChange={(event) => setKeyword(event.target.value)} />
          </label>
          <label className="form-field">
            <span>领取状态</span>
            <select value={claimStatus} onChange={(event) => setClaimStatus(event.target.value)}>
              <option value="all">全部</option>
              <option value="available">可领取</option>
              <option value="claimed">已领取</option>
            </select>
          </label>
        </div>
        <div className="plaza-time-filter">
          <TimeRangeFilter value={timeRange} onChange={setTimeRange} label="时间范围" />
        </div>
        <div className="button-row">
          <button type="button" onClick={() => void loadTasks(keyword, claimStatus)}>
            筛选任务
          </button>
        </div>
      </article>

      {loading ? (
        <article className="card">
          <p>任务广场加载中...</p>
        </article>
      ) : error ? (
        <article className="card">
          <p>{error}</p>
          <button type="button" onClick={() => void loadTasks()}>
            重试
          </button>
        </article>
      ) : (
        <div className="card-list plaza-card-list">
          {visibleTasks.map((task) => (
            <article aria-label={task.title} className="card plaza-task-card" key={task.id}>
              <div className="section-header">
                <div>
                  <span className="section-eyebrow">{task.claimed ? 'Claimed' : 'Available'}</span>
                  <h3>{task.title}</h3>
                  <p className="property-copy">{task.description}</p>
                </div>
              </div>
              <div className="meta-row">
                <span>状态：{task.claimed ? '已领取' : '可领取'}</span>
                <span>预计剩余 {task.remaining} 个名额</span>
              </div>
              <div className="meta-row">
                <span>总配额：{task.quota}</span>
                <span>截止时间：{task.deadline}</span>
              </div>
              <div className="button-row">
                {task.claimed && task.assignmentId ? (
                  <Link className="button" to={`/labeler/workbench?assignmentId=${task.assignmentId}`}>
                    继续作答
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="button-dark"
                    onClick={() => void handleClaim(task.id)}
                    disabled={claimingTaskId === task.id}
                  >
                    {claimingTaskId === task.id ? '领取中...' : '立即领取'}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
