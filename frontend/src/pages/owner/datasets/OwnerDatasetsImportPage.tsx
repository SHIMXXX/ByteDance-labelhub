import { Link, useLocation } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { ApiError } from '../../../services/api/client'
import { importDataset } from '../../../services/api/datasets'
import type { DatasetImportResponse } from '../../../types/dataset'

type Step = 1 | 2 | 3

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

export function OwnerDatasetsImportPage() {
  const location = useLocation()
  const taskId = new URLSearchParams(location.search).get('taskId') ?? ''
  const [step, setStep] = useState<Step>(1)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [importMode, setImportMode] = useState<'normal' | 'gold_sample' | 'demo'>('normal')
  const [error, setError] = useState('')
  const [result, setResult] = useState<DatasetImportResponse | null>(null)

  const listHref = useMemo(() => {
    if (!result?.dataset.id) {
      return taskId ? `/owner/datasets?taskId=${taskId}` : '/owner/datasets'
    }

    const params = new URLSearchParams({ highlightDatasetId: String(result.dataset.id) })
    if (taskId) {
      params.set('taskId', taskId)
    }
    return `/owner/datasets?${params.toString()}`
  }, [result, taskId])

  async function handleImport() {
    if (!file) {
      setError('请先选择要导入的文件。')
      return
    }

    setLoading(true)
    setError('')
    try {
      const contentBase64 = await toBase64(file)
      const nextResult = await importDataset({
        name,
        description,
        fileName: file.name,
        contentBase64,
        importMode,
      })
      setResult(nextResult)
      setStep(3)
    } catch (error) {
      setError(error instanceof ApiError ? error.detail || error.message : '数据集导入失败，请稍后重试。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="dashboard-page">
      <header className="page-hero page-hero-light">
        <div>
          <span className="page-eyebrow">Dataset import</span>
          <h2>导入数据集</h2>
          <p>上传样本文件，确认导入信息，并把结果回流到数据集运营台。</p>
        </div>
      </header>

      <article className="card dataset-wizard-card">
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
              <button type="button" onClick={() => setStep(1)}>
                返回上一步
              </button>
              <button type="button" className="button-dark" onClick={() => void handleImport()} disabled={loading}>
                {loading ? '导入中...' : '开始导入'}
              </button>
            </div>
          </div>
        ) : null}

        {step === 3 && result ? (
          <div className="card-list compact-list">
            <article className="focus-panel">
              <h4>导入完成</h4>
              <p>{result.dataset.name}</p>
              <p>已导入 {result.summary.total} 条样本</p>
              {result.errors.length > 0 ? (
                <p className="review-error-message">错误数：{result.errors.length}</p>
              ) : (
                <p className="feedback-message">未发现导入错误</p>
              )}
            </article>
            <div className="button-row">
              <Link className="button button-dark" to={listHref}>
                返回数据集列表
              </Link>
              <Link className="button" to={`/owner/datasets/${result.dataset.id}${taskId ? `?taskId=${taskId}` : ''}`}>
                查看新数据集详情
              </Link>
            </div>
          </div>
        ) : null}

        {error ? <p className="review-error-message">{error}</p> : null}
      </article>
    </section>
  )
}
