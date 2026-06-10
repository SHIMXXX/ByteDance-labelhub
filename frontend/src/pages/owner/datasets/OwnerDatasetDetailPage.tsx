import { Link, useLocation, useParams } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { MediaValue } from '../../../features/renderer/MediaValue'
import { listDatasetItems } from '../../../services/api/datasets'
import type { DatasetItemPreview, DatasetSummary } from '../../../types/dataset'
import { formatDateTime } from '../../../utils/dateTime'

export function OwnerDatasetDetailPage() {
  const { datasetId } = useParams()
  const location = useLocation()
  const taskId = new URLSearchParams(location.search).get('taskId') ?? ''
  const numericDatasetId = Number(datasetId)

  const [dataset, setDataset] = useState<DatasetSummary | null>(null)
  const [items, setItems] = useState<DatasetItemPreview[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [keywordInput, setKeywordInput] = useState('')

  useEffect(() => {
    if (Number.isNaN(numericDatasetId)) return
    void loadItems(keyword)
  }, [numericDatasetId, keyword])

  async function loadItems(nextKeyword: string) {
    setLoading(true)
    setError('')
    try {
      // 默认请求 100 条数据，提升预览能力
      const result = await listDatasetItems(numericDatasetId, nextKeyword, 1, 100)
      setDataset(result.dataset)
      setItems(result.items)
      setSelectedIndex(0)
    } catch {
      setError('数据集预览加载失败，请确认后端服务已启动。')
    } finally {
      setLoading(false)
    }
  }

  const taskHref = useMemo(() => {
    const params = new URLSearchParams({ datasetId: String(numericDatasetId) })
    if (taskId) params.set('taskId', taskId)
    return `/owner/tasks?${params.toString()}`
  }, [numericDatasetId, taskId])

  const currentItem = items[selectedIndex]

  if (Number.isNaN(numericDatasetId)) {
    return (
      <article className="empty-state-card empty-state-card-error">
        <h3>数据集不存在</h3>
        <p>请返回列表重新选择数据集。</p>
      </article>
    )
  }

  return (
    <section className="dashboard-page dataset-detail-page">
      <header className="page-hero page-hero-light">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
           <span className="badge-tag-purple">Dataset Profile</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ fontSize: '32px', fontWeight: 600, marginBottom: '8px' }}>{dataset?.name ?? '数据集详情'}</h2>
            <p style={{ color: '#5d5b54', maxWidth: '600px', fontSize: '16px' }}>{dataset?.description || '暂无描述'}</p>
          </div>
          <div className="button-row">
            <Link className="button" to="/owner/datasets">返回列表</Link>
            <Link className="button button-primary" to={taskHref}>去绑定任务</Link>
          </div>
        </div>
      </header>

      {dataset ? (
        <div className="stat-grid" style={{ marginBottom: '24px' }}>
          <article className="stat-card stat-card-tint-sky">
            <span className="stat-card-label">样本总数</span>
            <strong className="stat-card-value">{dataset.itemCount}</strong>
            <p>数据集中包含的样本题目总量。</p>
          </article>
          <article className="stat-card stat-card-tint-mint">
            <span className="stat-card-label">数据格式</span>
            <strong className="stat-card-value">{dataset.sourceType}</strong>
            <p>数据集导入时的原始文件类型。</p>
          </article>
          <article className="stat-card stat-card-tint-lavender">
            <span className="stat-card-label">最后更新</span>
            <strong className="stat-card-value">{formatDateTime(dataset.updatedAt).split(' ')[0]}</strong>
            <p>该数据集最近一次变动的时间。</p>
          </article>
        </div>
      ) : null}

      <div className="dataset-detail-container">
        {/* 左侧列表 */}
        <aside className="dataset-item-sidebar">
          <div className="sidebar-header">
            <div className="form-field search-box">
              <input 
                placeholder="搜索样本内容..." 
                value={keywordInput}
                onChange={e => setKeywordInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && setKeyword(keywordInput)}
              />
              <button onClick={() => setKeyword(keywordInput)}>搜索</button>
            </div>
          </div>
          
          <div className="item-list-wrapper">
            {loading ? (
              <div className="loading-state">加载中...</div>
            ) : items.length === 0 ? (
              <div className="empty-state">未找到匹配样本</div>
            ) : (
              <div className="item-scroll-list">
                {items.map((item, idx) => (
                  <button
                    key={item.id}
                    className={`item-tab-button ${selectedIndex === idx ? 'is-active' : ''}`}
                    onClick={() => setSelectedIndex(idx)}
                  >
                    <span className="item-seq">#{item.sequence}</span>
                    <span className="item-preview-text">
                      {JSON.stringify(item.source).substring(0, 40)}...
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="list-footer">
              显示前 {items.length} 条预览样本
            </div>
          </div>
        </aside>

        {/* 右侧详情 */}
        <main className="dataset-item-content">
          {currentItem ? (
            <article className="card preview-content-card">
              <div className="section-header">
                <div>
                  <span className="section-eyebrow">Sample data</span>
                  <h3>样本原文预览</h3>
                </div>
              </div>
              
              <div className="dataset-preview-kv-grid">
                {Object.entries(currentItem.source).map(([key, value]) => (
                  <div key={key} className="preview-kv-item">
                    <label>{key}</label>
                    <div className="value-container">
                      <MediaValue fieldName={key} source={currentItem.source} value={value} />
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ) : !loading && (
            <div className="card empty-preview">
              <p>请在左侧选择样本进行预览</p>
            </div>
          )}
        </main>
      </div>
    </section>
  )
}
