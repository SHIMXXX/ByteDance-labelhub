import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { apiDelete, ApiError } from '../../../services/api/client'
import { importDataset, listDatasets } from '../../../services/api/datasets'
import type { DatasetImportResponse, DatasetSummary } from '../../../types/dataset'
import { parseAppDate } from '../../../utils/time'

function formatDate(value: string) {
  const date = parseAppDate(value)
  if (!date) {
    return value
  }

  return date.toLocaleString('zh-CN', { hour12: false })
}

async function toBase64(file: File) {
  const buffer = typeof file.arrayBuffer === 'function'
    ? await file.arrayBuffer()
    : await new Response(file).arrayBuffer()
  let binary = ''
  new Uint8Array(buffer).forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return window.btoa(binary)
}

export function OwnerDatasetsPage() {
  const location = useLocation()
  const searchParams = new URLSearchParams(location.search)
  const queryHighlightDatasetId = Number(searchParams.get('highlightDatasetId') ?? '') || null
  const taskId = searchParams.get('taskId') ?? ''

  const [items, setItems] = useState<DatasetSummary[]>([])
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<DatasetSummary | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [highlightDatasetId, setHighlightDatasetId] = useState<number | null>(queryHighlightDatasetId)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [importMode, setImportMode] = useState<'normal' | 'gold_sample' | 'demo'>('normal')
  const [submittingImport, setSubmittingImport] = useState(false)
  const [importError, setImportError] = useState('')
  const [importResult, setImportResult] = useState<DatasetImportResponse | null>(null)

  useEffect(() => {
    void loadDatasets(keyword)
  }, [keyword])

  async function loadDatasets(nextKeyword: string) {
    setLoading(true)
    setError('')

    try {
      const result = await listDatasets(nextKeyword)
      setItems(result.items)
    } catch {
      setError('数据集列表加载失败，请确认后端服务已启动。')
    } finally {
      setLoading(false)
    }
  }

  function resetCreateModal() {
    setIsCreateModalOpen(false)
    setStep(1)
    setName('')
    setDescription('')
    setFile(null)
    setImportMode('normal')
    setSubmittingImport(false)
    setImportError('')
    setImportResult(null)
  }

  async function handleImport() {
    if (!file) {
      setImportError('请先选择要导入的文件。')
      return
    }

    setSubmittingImport(true)
    setImportError('')

    try {
      const contentBase64 = await toBase64(file)
      const nextResult = await importDataset({
        name,
        description,
        fileName: file.name,
        contentBase64,
        importMode,
      })
      setImportResult(nextResult)
      setHighlightDatasetId(nextResult.dataset.id)
      setStep(3)
      await loadDatasets(keyword)
    } catch {
      setImportError('数据集导入失败，请稍后重试。')
    } finally {
      setSubmittingImport(false)
    }
  }

  const totalItemCount = useMemo(
    () => items.reduce((sum, item) => sum + item.itemCount, 0),
    [items],
  )

  async function confirmDeleteDataset() {
    if (!deleteTarget) {
      return
    }
    setDeleteError('')
    try {
      await apiDelete(`/datasets/${deleteTarget.id}`)
      setItems((current) => current.filter((item) => item.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        const detail = e.detail
        if (detail?.includes('still linked to a task')) {
          setDeleteError('删除失败：该数据集已关联到任务，请先解绑后再删除。')
        } else {
          setDeleteError(detail || '删除数据集失败，请稍后重试。')
        }
      } else {
        setDeleteError('删除数据集失败，请稍后重试。')
      }
    }
  }

  return (
    <section className="dashboard-page">
      <header className="page-hero page-hero-light">
        <div>
          <span className="page-eyebrow">Dataset operations</span>
          <h2>数据集</h2>
          <p>集中管理导入样本、查看题量与快速进入任务绑定。</p>
        </div>
        <div className="button-row">
          <button className="button button-dark" type="button" onClick={() => setIsCreateModalOpen(true)}>
            新建数据集
          </button>
        </div>
      </header>

      <div className="stat-grid">
        <article className="stat-card stat-card-tint-sky">
          <span className="stat-card-label">datasets</span>
          <strong className="stat-card-value">{items.length}</strong>
          <p>当前结果中的数据集数量。</p>
        </article>
        <article className="stat-card stat-card-tint-lavender">
          <span className="stat-card-label">items</span>
          <strong className="stat-card-value">{totalItemCount}</strong>
          <p>当前结果中的总题量。</p>
        </article>
      </div>

      <article className="card dataset-toolbar-card">
        <div className="form-grid dataset-toolbar-grid">
          <label className="form-field">
            <span>搜索数据集</span>
            <input
              aria-label="搜索数据集"
              value={keywordInput}
              onChange={(event) => setKeywordInput(event.target.value)}
              placeholder="按名称或描述过滤"
            />
          </label>
        </div>
        <div className="button-row">
          <button type="button" onClick={() => setKeyword(keywordInput)}>
            搜索
          </button>
          <button
            type="button"
            onClick={() => {
              setKeywordInput('')
              setKeyword('')
            }}
          >
            刷新
          </button>
        </div>
        {error ? <p className="review-error-message">{error}</p> : null}
      </article>

      {loading ? (
        <article className="card">
          <p className="inline-notice">数据集加载中...</p>
        </article>
      ) : items.length === 0 ? (
        <article className="empty-state-card">
          <h3>还没有可用数据集</h3>
          <p>先新建第一批样本，再去绑定模板和任务。</p>
          <div className="button-row">
            <button className="button button-dark" type="button" onClick={() => setIsCreateModalOpen(true)}>
              新建数据集
            </button>
          </div>
        </article>
      ) : (
        <div className="owner-dataset-grid">
          {items.map((dataset) => (
            <article
              key={dataset.id}
              data-testid={`dataset-row-${dataset.id}`}
              className={`card dataset-card-item${highlightDatasetId === dataset.id ? ' dataset-row-highlighted' : ''}`}
            >
              <div className="dataset-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="badge-tag-purple">{dataset.sourceType}</span>
                  <span style={{ fontSize: '11px', color: '#a4a097' }}>#{dataset.id}</span>
                </div>
                <h3 title={dataset.name}>{dataset.name}</h3>
                <p className="dataset-description" title={dataset.description}>{dataset.description || '暂无描述'}</p>
              </div>

              <div className="dataset-card-stats">
                <div className="dataset-stat">
                  <strong>{dataset.itemCount}</strong>
                  <span>总题量</span>
                </div>
                <div className="dataset-stat">
                  <strong>{formatDate(dataset.updatedAt).split(' ')[0]}</strong>
                  <span>最后更新</span>
                </div>
              </div>

              <div className="dataset-card-actions">
                <Link className="button button-sm button-primary" to={`/owner/datasets/${dataset.id}${taskId ? `?taskId=${taskId}` : ''}`}>
                  详情
                </Link>
                <Link className="button button-sm" to={`/owner/tasks?datasetId=${dataset.id}${taskId ? `&taskId=${taskId}` : ''}`}>
                  绑定任务
                </Link>
                <button
                  className="button button-sm button-danger"
                  type="button"
                  onClick={(e) => { e.preventDefault(); setDeleteTarget(dataset) }}
                >
                  删除
                </button>
              </div>
            </article>
          ))}
        </div>
      ) }

      {isCreateModalOpen ? (
        <div className="modal-overlay" onClick={(event) => {
          if (event.target === event.currentTarget && !submittingImport) {
            resetCreateModal()
          }
        }}>
          <div className="modal-content dataset-create-modal">
            <h3>新建数据集</h3>
            <div className="meta-row dataset-step-row">
              <span className={step === 1 ? 'tag-pill' : 'dataset-step-text'}>1 上传文件</span>
              <span className={step === 2 ? 'tag-pill' : 'dataset-step-text'}>2 格式确认</span>
              <span className={step === 3 ? 'tag-pill' : 'dataset-step-text'}>3 导入结果</span>
            </div>

            {step === 1 ? (
              <div className="form-grid">
                <label className="form-field">
                  <span>数据集名称</span>
                  <input aria-label="数据集名称" value={name} onChange={(event) => setName(event.target.value)} />
                </label>
                <label className="form-field">
                  <span>数据集描述</span>
                  <textarea aria-label="数据集描述" value={description} onChange={(event) => setDescription(event.target.value)} />
                </label>
                <label className="form-field">
                  <span>选择文件</span>
                  <input
                    aria-label="选择文件"
                    type="file"
                    accept=".json,.jsonl,.xlsx"
                    onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  />
                </label>
                <label className="form-field">
                  <span>导入模式</span>
                  <select aria-label="导入模式" value={importMode} onChange={(event) => setImportMode(event.target.value as 'normal' | 'gold_sample' | 'demo')}>
                    <option value="normal">普通待标注</option>
                    <option value="gold_sample">Gold Sample</option>
                    <option value="demo">演示数据</option>
                  </select>
                </label>
                <p className="inline-notice">支持 JSON / JSONL / Excel（.xlsx）文件。</p>
                <div className="button-row">
                  <button type="button" onClick={() => setStep(2)} disabled={!name.trim() || !file}>
                    下一步
                  </button>
                  <button type="button" onClick={resetCreateModal} disabled={submittingImport}>
                    取消
                  </button>
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="card-list compact-list">
                <article className="focus-panel">
                  <h4>导入信息确认</h4>
                  <p>名称：{name}</p>
                  <p>描述：{description || '暂无描述'}</p>
                  <p>文件名：{file?.name}</p>
                  <p>导入模式：{importMode === 'normal' ? '普通待标注' : importMode === 'gold_sample' ? 'Gold Sample' : '演示数据'}</p>
                  <p>将按系统默认解析规则导入。</p>
                </article>
                <div className="button-row">
                  <button type="button" onClick={() => setStep(1)} disabled={submittingImport}>
                    返回上一步
                  </button>
                  <button type="button" className="button-dark" onClick={() => void handleImport()} disabled={submittingImport}>
                    {submittingImport ? '导入中...' : '开始导入'}
                  </button>
                </div>
              </div>
            ) : null}

            {step === 3 && importResult ? (
              <div className="card-list compact-list">
                <article className="focus-panel">
                  <h4>导入完成</h4>
                  <p>{importResult.dataset.name}</p>
                  <p>已导入 {importResult.summary.total} 条样本</p>
                  {importResult.errors.length > 0 ? (
                    <p className="review-error-message">错误数：{importResult.errors.length}</p>
                  ) : (
                    <p className="feedback-message">未发现导入错误</p>
                  )}
                </article>
                <div className="button-row">
                  <button type="button" className="button button-dark" onClick={resetCreateModal}>
                    返回数据集列表
                  </button>
                  <Link className="button" to={`/owner/datasets/${importResult.dataset.id}${taskId ? `?taskId=${taskId}` : ''}`}>
                    查看新数据集详情
                  </Link>
                </div>
              </div>
            ) : null}

            {importError ? <p className="review-error-message">{importError}</p> : null}
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setDeleteTarget(null); setDeleteError('') } }}>
          <div className="modal-content">
            <h3>确定删除</h3>
            <p>{`确定要删除数据集 “${deleteTarget.name}” 吗？`}</p>
            {deleteError ? <p className="review-error-message">{deleteError}</p> : null}
            <div className="button-row">
              <button type="button" onClick={(e) => { e.preventDefault(); void confirmDeleteDataset() }}>
                确认删除
              </button>
              <button type="button" onClick={(e) => { e.preventDefault(); setDeleteTarget(null); setDeleteError('') }}>
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
