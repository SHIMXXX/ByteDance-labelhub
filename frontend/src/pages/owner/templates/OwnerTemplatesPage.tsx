import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiDelete, apiGet, apiPost, ApiError } from '../../../services/api/client'
import { importDataset, listDatasets } from '../../../services/api/datasets'
import type { DatasetImportResponse, DatasetSummary } from '../../../types/dataset'
import { formatDateTime } from '../../../utils/dateTime'

type TemplateLibraryItem = {
  id: number
  name: string
  description?: string
  latestVersion?: number
  latestTemplateVersionId?: number | null
  taskUsageCount?: number
  updatedAt?: string
  datasetId?: number | null
  sampleItemId?: number | null
}

type TemplateListResponse = {
  items: TemplateLibraryItem[]
}

type TemplateCreateResponse = {
  id: number
  name: string
  description: string
  datasetId?: number | null
  sampleItemId?: number | null
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

export function OwnerTemplatesPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<TemplateLibraryItem[]>([])
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [creating, setCreating] = useState(false)
  const [duplicatingId, setDuplicatingId] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TemplateLibraryItem | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [createMode, setCreateMode] = useState<'pick' | 'import'>('pick')
  const [datasetOptions, setDatasetOptions] = useState<DatasetSummary[]>([])
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | null>(null)
  const [datasetLoading, setDatasetLoading] = useState(false)
  const [newDatasetName, setNewDatasetName] = useState('')
  const [newDatasetDescription, setNewDatasetDescription] = useState('')
  const [newDatasetFile, setNewDatasetFile] = useState<File | null>(null)
  const [newDatasetImportMode, setNewDatasetImportMode] = useState<'normal' | 'gold_sample' | 'demo'>('normal')
  const [createFlowError, setCreateFlowError] = useState('')

  useEffect(() => {
    void loadTemplates()
  }, [])

  async function loadTemplates() {
    setLoading(true)
    setPageError('')
    try {
      const result = await apiGet<TemplateListResponse>('/templates')
      setItems(result.items)
    } catch {
      setPageError('模板库加载失败，请稍后重试。')
    } finally {
      setLoading(false)
    }
  }

  async function openCreateModal() {
    setIsCreateModalOpen(true)
    setCreateMode('pick')
    setCreateFlowError('')
    setNewDatasetName('')
    setNewDatasetDescription('')
    setNewDatasetFile(null)
    setNewDatasetImportMode('normal')

    if (datasetOptions.length > 0) {
      return
    }

    try {
      setDatasetLoading(true)
      const result = await listDatasets()
      setDatasetOptions(result.items)
      setSelectedDatasetId((current) => current ?? result.items[0]?.id ?? null)
    } catch {
      setCreateFlowError('数据集列表加载失败，请稍后重试。')
    } finally {
      setDatasetLoading(false)
    }
  }

  function closeCreateModal() {
    setIsCreateModalOpen(false)
    setCreateFlowError('')
    setCreating(false)
  }

  async function createTemplateWithDataset(datasetId: number) {
    setCreating(true)
    setCreateFlowError('')
    try {
      const created = await apiPost<TemplateCreateResponse, { name: string; description: string; datasetId: number }>('/templates', {
        name: '未命名模板',
        description: '请基于样本数据搭建题面和作答区。',
        datasetId,
      })
      navigate(`/owner/templates/${created.id}/designer`)
    } catch {
      setCreateFlowError('新建模板失败，请稍后重试。')
    } finally {
      setCreating(false)
    }
  }

  async function handleImportAndCreateTemplate() {
    if (!newDatasetFile || !newDatasetName.trim()) {
      setCreateFlowError('请先填写数据集名称并选择文件。')
      return
    }

    setCreating(true)
    setCreateFlowError('')
    try {
      const contentBase64 = await toBase64(newDatasetFile)
      const importResult = await importDataset({
        name: newDatasetName,
        description: newDatasetDescription,
        fileName: newDatasetFile.name,
        contentBase64,
        importMode: newDatasetImportMode,
      })
      await createTemplateWithDataset(importResult.dataset.id)
    } catch {
      setCreateFlowError('导入数据集并创建模板失败，请稍后重试。')
      setCreating(false)
    }
  }

  async function handleDuplicate(templateId: number) {
    setDuplicatingId(templateId)
    try {
      const duplicated = await apiPost<TemplateLibraryItem, Record<string, never>>(`/templates/${templateId}/duplicate`, {})
      setItems((current) => [duplicated, ...current])
    } catch {
      setPageError('复制模板失败，请稍后重试。')
    } finally {
      setDuplicatingId(null)
    }
  }

  async function confirmDeleteTemplate() {
    if (!deleteTarget) {
      return
    }
    setDeleteError('')
    try {
      await apiDelete(`/templates/${deleteTarget.id}`)
      setItems((current) => current.filter((item) => item.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        const detail = e.detail
        if (detail?.includes('still linked to a task')) {
          setDeleteError('删除失败：该模板已关联到任务，请先解绑后再删除。')
        } else {
          setDeleteError(detail || '删除模板失败，请稍后重试。')
        }
      } else {
        setDeleteError('删除模板失败，请稍后重试。')
      }
    }
  }

  const filteredItems = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase()
    if (!normalizedKeyword) {
      return items
    }
    return items.filter((item) => `${item.name} ${item.description ?? ''}`.toLowerCase().includes(normalizedKeyword))
  }, [items, keyword])

  return (
    <section>
      <header className="page-hero page-hero-light">
        <div>
          <span className="page-eyebrow">Template library</span>
          <h2>模板库</h2>
          <p>把常用任务模板沉淀成可复用的资产，支撑数据集、任务与审核流程的快速搭建。</p>
        </div>
        <div className="button-row">
          <button className="button button-primary" type="button" onClick={() => void openCreateModal()} disabled={creating}>
            新建模板
          </button>
        </div>
      </header>

      <div className="stat-grid">
        <article className="stat-card stat-card-tint-lavender">
          <span className="stat-card-label">模板总数</span>
          <strong className="stat-card-value">{items.length}</strong>
          <p>当前 Owner 可复用的模板资产数量。</p>
        </article>
        <article className="stat-card stat-card-tint-sky">
          <span className="stat-card-label">已被任务使用</span>
          <strong className="stat-card-value">{items.filter((item) => (item.taskUsageCount ?? 0) > 0).length}</strong>
          <p>已绑定到真实任务中的模板数量。</p>
        </article>
      </div>

      <article className="card filter-panel">
        <label className="form-field">
          <span>搜索模板</span>
          <input aria-label="搜索模板" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
        </label>
      </article>

      {loading ? (
        <article className="card">
          <p>模板库加载中...</p>
        </article>
      ) : pageError ? (
        <article className="empty-state-card empty-state-card-error">
          <h3>暂时无法打开模板库</h3>
          <p>{pageError}</p>
          <button className="button button-primary" type="button" onClick={() => void loadTemplates()}>
            重试
          </button>
        </article>
      ) : filteredItems.length === 0 ? (
        <article className="empty-state-card">
          <h3>还没有模板资产</h3>
          <p>可以先从空白模板开始，沉淀常用题型与审核结构。</p>
        </article>
      ) : (
        <div className="dashboard-grid">
          {filteredItems.map((item) => (
            <article className="card dashboard-panel" key={item.id}>
              <div className="section-header">
                <div>
                  <h3>{item.name}</h3>
                  <p>{item.description || '暂无模板说明'}</p>
                </div>
              </div>
              <div className="property-list">
                <div className="property-item">
                  <span className="property-label">最近版本</span>
                  <strong className="property-value">v{item.latestVersion ?? 0}</strong>
                </div>
                <div className="property-item">
                  <span className="property-label">关联任务</span>
                  <strong className="property-value">{item.taskUsageCount ?? 0}</strong>
                </div>
                <div className="property-item property-item-column">
                  <span className="property-label">最近更新时间</span>
                  <p className="property-copy">{formatDateTime(item.updatedAt)}</p>
                </div>
              </div>
              <div className="button-row">
                <button
                  type="button"
                  onClick={() => void handleDuplicate(item.id)}
                  disabled={duplicatingId === item.id}
                  aria-label={`复制模板 ${item.name}`}
                >
                  {duplicatingId === item.id ? '复制中...' : '复制模板'}
                </button>
                <Link className="button button-primary" to={`/owner/templates/${item.id}/designer`} aria-label={`进入 Designer ${item.name}`}>
                  进入 Designer
                </Link>
                <button type="button" onClick={(e) => { e.preventDefault(); setDeleteTarget(item) }} aria-label={`删除模板 ${item.name}`}>
                  删除
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {isCreateModalOpen ? (
        <div className="modal-overlay" onClick={(event) => {
          if (event.target === event.currentTarget && !creating) {
            closeCreateModal()
          }
        }}>
          <div className="modal-content template-create-modal">
            <h3>新建模板</h3>
            <div className="button-row">
              <button type="button" className={createMode === 'pick' ? 'button button-primary' : 'button'} onClick={() => setCreateMode('pick')}>
                选择已有数据集
              </button>
              <button type="button" className={createMode === 'import' ? 'button button-primary' : 'button'} onClick={() => setCreateMode('import')}>
                导入新数据集
              </button>
            </div>

            {createMode === 'pick' ? (
              <div className="form-grid">
                <p>选择已有数据集</p>
                {datasetLoading ? <p>数据集加载中...</p> : null}
                <label className="form-field">
                  <span>参考数据集</span>
                  <select aria-label="参考数据集" value={selectedDatasetId ?? ''} onChange={(event) => setSelectedDatasetId(Number(event.target.value))}>
                    <option value="">请选择数据集</option>
                    {datasetOptions.map((dataset) => (
                      <option key={dataset.id} value={dataset.id}>{dataset.name}</option>
                    ))}
                  </select>
                </label>
                <div className="button-row">
                  <button type="button" onClick={() => void createTemplateWithDataset(selectedDatasetId ?? 0)} disabled={!selectedDatasetId || creating}>
                    {creating ? '创建中...' : '继续创建模板'}
                  </button>
                  <button type="button" onClick={closeCreateModal} disabled={creating}>取消</button>
                </div>
              </div>
            ) : (
              <div className="form-grid">
                <p>导入新数据集</p>
                <label className="form-field">
                  <span>数据集名称</span>
                  <input aria-label="数据集名称" value={newDatasetName} onChange={(event) => setNewDatasetName(event.target.value)} />
                </label>
                <label className="form-field">
                  <span>数据集描述</span>
                  <textarea aria-label="数据集描述" value={newDatasetDescription} onChange={(event) => setNewDatasetDescription(event.target.value)} />
                </label>
                <label className="form-field">
                  <span>选择文件</span>
                  <input aria-label="选择文件" type="file" accept=".json,.jsonl,.xlsx" onChange={(event) => setNewDatasetFile(event.target.files?.[0] ?? null)} />
                </label>
                <label className="form-field">
                  <span>导入模式</span>
                  <select aria-label="导入模式" value={newDatasetImportMode} onChange={(event) => setNewDatasetImportMode(event.target.value as 'normal' | 'gold_sample' | 'demo')}>
                    <option value="normal">普通待标注</option>
                    <option value="gold_sample">Gold Sample</option>
                    <option value="demo">演示数据</option>
                  </select>
                </label>
                <div className="button-row">
                  <button type="button" onClick={() => void handleImportAndCreateTemplate()} disabled={!newDatasetName.trim() || !newDatasetFile || creating}>
                    {creating ? '导入并创建中...' : '导入并继续'}
                  </button>
                  <button type="button" onClick={closeCreateModal} disabled={creating}>取消</button>
                </div>
              </div>
            )}

            {createFlowError ? <p className="review-error-message">{createFlowError}</p> : null}
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setDeleteTarget(null); setDeleteError('') } }}>
          <div className="modal-content">
            <h3>确定删除</h3>
            <p>{`确定要删除模板 “${deleteTarget.name}” 吗？`}</p>
            {deleteError ? <p className="review-error-message">{deleteError}</p> : null}
            <div className="button-row">
              <button type="button" onClick={(e) => { e.preventDefault(); void confirmDeleteTemplate() }}>
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
