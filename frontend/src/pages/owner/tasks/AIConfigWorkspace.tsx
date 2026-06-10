import { useEffect, useState } from 'react'
import { apiGet, apiPost, ApiError } from '../../../services/api/client'
import type { JsonRecord, ReviewAnswerValue } from '../../../types/domain'
import { AI_MODEL_OPTIONS } from './aiModelOptions'
import { DEFAULT_AI_SCORE_DIMENSIONS, PROMPT_PRESETS } from './aiPromptPresets'

type AIDimension = {
  key: string
  label: string
  description: string
  weight: number
  enabled: boolean
}

export type AIConfig = {
    promptTemplate: string
    passThreshold: number
    reviewGuideline: string
    scoreDimensions: AIDimension[]
    aiModel: string
}

type AIConfigWorkspaceProps = {
  taskId: number
  initialConfig: AIConfig
  onSave: (config: AIConfig) => Promise<void>
  onClose: () => void
}

type TaskDetailForAI = {
  datasetId?: number | null
}

type DatasetSampleItem = {
  id: number
  sequence: number
  source: JsonRecord
}

type DatasetItemsResponse = {
  items: DatasetSampleItem[]
}

type TestRunPayload = AIConfig & {
  itemId?: number
  mockAnswers: JsonRecord
}

type AIExecutionResult = {
  scores: Array<{ dimension: string; score: number; reason: string }>
  overallScore: number
  decision: 'pass' | 'reject' | 'human_review'
  summary: string
}

const DEFAULT_PASS_THRESHOLD = 80

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function AIConfigWorkspace({ taskId, initialConfig, onSave, onClose }: AIConfigWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<'config' | 'test'>('config')
  const [config, setConfig] = useState({
    ...initialConfig,
    passThreshold: initialConfig.passThreshold || DEFAULT_PASS_THRESHOLD,
    scoreDimensions: initialConfig.scoreDimensions.length > 0 ? initialConfig.scoreDimensions : DEFAULT_AI_SCORE_DIMENSIONS,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Test Run states
  const [samples, setSamples] = useState<DatasetSampleItem[]>([])
  const [selectedSampleIndex, setSelectedSampleIndex] = useState(0)
  const [mockAnswers, setMockAnswers] = useState<string>('')
  const [testResult, setTestResult] = useState<AIExecutionResult | null>(null)
  const [testing, setTestLoading] = useState(false)

  useEffect(() => {
    void loadSamples()
  }, [])

  async function loadSamples() {
    try {
      // We assume task has a dataset
      const res = await apiGet<TaskDetailForAI>(`/tasks/${taskId}`)
      if (res.datasetId) {
        const items = await apiGet<DatasetItemsResponse>(`/datasets/${res.datasetId}/items?pageSize=5`)
        setSamples(items.items || [])
        if (items.items?.[0]) {
          // Initialize mock answers based on existing logic if possible, or empty JSON
          setMockAnswers('{\n  "answer": "这里输入你的测试答案"\n}')
        }
      }
    } catch (e) {
      console.error('Failed to load samples for testing', e)
    }
  }

  const handleAddDimension = () => {
    const newDim: AIDimension = { key: '', label: '', description: '', weight: 1, enabled: true }
    setConfig(prev => ({ ...prev, scoreDimensions: [...prev.scoreDimensions, newDim] }))
  }

  const handleUpdateDimension = (index: number, updates: Partial<AIDimension>) => {
    const nextDims = [...config.scoreDimensions]
    nextDims[index] = { ...nextDims[index], ...updates }
    setConfig(prev => ({ ...prev, scoreDimensions: nextDims }))
  }

  const handleRemoveDimension = (index: number) => {
    setConfig(prev => ({ ...prev, scoreDimensions: prev.scoreDimensions.filter((_, i) => i !== index) }))
  }

  const applyPreset = (preset: typeof PROMPT_PRESETS[0]) => {
    if (window.confirm('应用预设将覆盖当前的 Prompt 和评分维度，确定吗？')) {
      setConfig(prev => ({
        ...prev,
        promptTemplate: preset.prompt,
        scoreDimensions: preset.dimensions as AIDimension[]
      }))
    }
  }

  const runTest = async () => {
    if (!mockAnswers.trim()) {
      alert('请先输入模拟答案')
      return
    }
    let parsedAnswers: JsonRecord
    try {
      const parsed = JSON.parse(mockAnswers) as unknown
      if (!isJsonRecord(parsed)) {
        alert('模拟答案格式不正确，请确保顶层是 JSON 对象')
        return
      }
      parsedAnswers = parsed
    } catch {
      alert('模拟答案格式不正确，请确保是合法的 JSON')
      return
    }

    setTestLoading(true)
    setTestResult(null)
    setError('')
    try {
      const result = await apiPost<AIExecutionResult, TestRunPayload>(`/tasks/${taskId}/ai-config/test-run`, {
        ...config,
        itemId: samples[selectedSampleIndex]?.id,
        mockAnswers: parsedAnswers
      })
      setTestResult(result)
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.detail || err.message : '测试运行失败')
    } finally {
      setTestLoading(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card modal-card-workspace">
        <div className="workspace-header">
          <div className="workspace-title">
            <h3>AI 预审工作台</h3>
            <p className="field-helper-text">配置、调试并优化你的 AI 自动化审核策略</p>
          </div>
          <div className="workspace-tabs">
            <button className={activeTab === 'config' ? 'active' : ''} onClick={() => setActiveTab('config')}>1. 配置规则</button>
            <button className={activeTab === 'test' ? 'active' : ''} onClick={() => setActiveTab('test')}>2. 效果测试</button>
          </div>
          <button className="button-close" onClick={onClose}>×</button>
        </div>

        <div className="workspace-body">
          {activeTab === 'config' ? (
            <div className="config-pane">
              <div className="form-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="section-label">Prompt 模板</label>
                  <select className="preset-select" aria-label="AI Prompt 预设" onChange={(e) => {
                    const preset = PROMPT_PRESETS.find(p => p.name === e.target.value)
                    if (preset) applyPreset(preset)
                    e.target.value = ''
                  }}>
                    <option value="">快速应用预设...</option>
                    {PROMPT_PRESETS.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                  </select>
                </div>
                <div className="prompt-editor-wrapper">
                  <textarea
                    className="prompt-textarea"
                    value={config.promptTemplate}
                    onChange={(e) => setConfig(prev => ({ ...prev, promptTemplate: e.target.value }))}
                    rows={8}
                    placeholder="输入 Prompt 模板，使用 {answers}、{source}、{reference_answer} 作为占位符"
                  />
                  <div className="variable-hints">
                    可用变量：<code>{"{answers}"}</code> (标注答案), <code>{"{source}"}</code> (原始题面), <code>{"{reference_answer}"}</code> (参考/Gold)
                  </div>
                </div>
              </div>

              <div className="form-section">
                <label className="section-label">评分维度</label>
                <div className="dimension-list">
                  {config.scoreDimensions.map((dim, idx) => (
                    <div key={idx} className="dimension-item">
                      <input placeholder="维度 Key (如 accuracy)" value={dim.key} onChange={(e) => handleUpdateDimension(idx, { key: e.target.value })} />
                      <input placeholder="显示名称 (如 准确性)" value={dim.label} onChange={(e) => handleUpdateDimension(idx, { label: e.target.value })} />
                      <input className="dim-desc" placeholder="打分逻辑描述..." value={dim.description} onChange={(e) => handleUpdateDimension(idx, { description: e.target.value })} />
                      <button className="button-icon-delete" onClick={() => handleRemoveDimension(idx)}>×</button>
                    </div>
                  ))}
                  <button className="button button-dashed" onClick={handleAddDimension}>+ 添加评分维度</button>
                </div>
              </div>

              <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <label className="form-field">
                  <span>AI 模型</span>
                  <select value={config.aiModel} onChange={(e) => setConfig(prev => ({ ...prev, aiModel: e.target.value }))}>
                    {AI_MODEL_OPTIONS.map((model) => (
                      <option key={model.value} value={model.value}>
                        {model.label} ({model.tag})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  <span>通过阈值（百分制）</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <input type="range" min="0" max="100" step="1" value={config.passThreshold} onChange={(e) => setConfig(prev => ({ ...prev, passThreshold: Number(e.target.value) }))} />
                    <strong style={{ fontSize: '18px', color: 'var(--color-primary)' }}>{config.passThreshold}分</strong>
                  </div>
                </label>
              </div>

              <label className="form-field">
                <span>人工审核标准 (Review Guideline)</span>
                <textarea
                  value={config.reviewGuideline}
                  onChange={(e) => setConfig(prev => ({ ...prev, reviewGuideline: e.target.value }))}
                  rows={3}
                  placeholder="说明当 AI 无法裁决时，人工审查员应关注的要点"
                />
              </label>
            </div>
          ) : (
            <div className="test-pane">
              <div className="test-sidebar">
                <label className="section-label">1. 选择测试样本</label>
                <div className="sample-list">
                  {samples.map((s, i) => (
                    <div key={s.id} className={`sample-item ${i === selectedSampleIndex ? 'active' : ''}`} onClick={() => setSelectedSampleIndex(i)}>
                      #{s.sequence} (ID: {s.id})
                    </div>
                  ))}
                  {samples.length === 0 && <p className="field-helper-text">未找到样本数据</p>}
                </div>

                <div className="sample-preview-box">
                  <span className="tiny-label">题面预览</span>
                  <pre>{JSON.stringify(samples[selectedSampleIndex]?.source || {}, null, 2)}</pre>
                </div>
              </div>

              <div className="test-main">
                <label className="section-label">2. 输入模拟作答答案 (JSON)</label>
                <textarea
                  className="mock-answer-textarea"
                  value={mockAnswers}
                  onChange={(e) => setMockAnswers(e.target.value)}
                  rows={6}
                />

                <div className="test-actions">
                  <button className="button button-primary" onClick={runTest} disabled={testing}>
                    {testing ? '正在调用大模型审计...' : '🚀 运行测试审核'}
                  </button>
                </div>

                {error && <p className="error-text" style={{ marginTop: '12px' }}>{error}</p>}

                {testResult && (
                  <div className="test-result-card">
                    <div className="result-header">
                      <span className={`decision-tag decision-${testResult.decision}`}>
                        AI 决策：{testResult.decision === 'pass' ? '通过' : testResult.decision === 'reject' ? '拒绝' : '转人工'}
                      </span>
                      <strong className="overall-score">总分：{testResult.overallScore ?? 0} / 100</strong>
                    </div>
                    <div className="result-scores">
                      {testResult.scores.map(s => (
                        <div key={s.dimension} className="score-row">
                          <div className="score-info">
                            <strong>{s.dimension}</strong>
                            <span className="score-num">{s.score}分</span>
                          </div>
                          <p className="score-reason">{s.reason}</p>
                        </div>
                      ))}
                    </div>
                    <div className="result-summary">
                      <strong>AI 总结：</strong>
                      <p>{testResult.summary}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="workspace-footer">
          <div className="status-info">
            {saving ? '正在保存配置...' : '所有修改在点击下方按钮前不会生效'}
          </div>
          <div className="button-row">
            <button className="button" onClick={onClose}>取消</button>
            <button className="button button-primary" onClick={() => void onSave(config)} disabled={saving}>
              保存并应用 AI 配置
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .modal-card-workspace {
          max-width: 1100px;
          width: 95vw;
          height: 85vh;
          display: flex;
          flex-direction: column;
          padding: 0;
          overflow: hidden;
        }
        .workspace-header {
          padding: 20px 24px;
          border-bottom: 1px solid var(--color-hairline);
          display: flex;
          align-items: center;
          gap: 40px;
        }
        .workspace-title { flex: 1; }
        .workspace-title h3 { margin: 0 0 4px 0; }
        .workspace-tabs { display: flex; background: var(--color-canvas); padding: 4px; border-radius: 8px; }
        .workspace-tabs button {
          padding: 8px 20px;
          border: none;
          background: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
          color: var(--color-steel);
        }
        .workspace-tabs button.active {
          background: #fff;
          color: var(--color-primary);
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }
        .workspace-body { flex: 1; overflow: hidden; display: flex; }
        .config-pane { flex: 1; overflow-y: auto; padding: 24px; display: flex; flex-direction: column; gap: 24px; }
        .test-pane { flex: 1; display: flex; overflow: hidden; }
        .test-sidebar { width: 300px; border-right: 1px solid var(--color-hairline); padding: 20px; display: flex; flex-direction: column; gap: 16px; background: var(--color-canvas); }
        .test-main { flex: 1; overflow-y: auto; padding: 24px; }
        
        .section-label { display: block; font-weight: 600; margin-bottom: 12px; color: var(--color-ink); font-size: 15px; }
        .prompt-textarea { width: 100%; border: 1px solid var(--color-hairline-strong); border-radius: 8px; padding: 12px; font-family: monospace; font-size: 14px; line-height: 1.6; }
        .variable-hints { margin-top: 8px; font-size: 12px; color: var(--color-steel); }
        .variable-hints code { background: #fee2e2; color: #991b1b; padding: 2px 4px; border-radius: 4px; }
        
        .dimension-item { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; }
        .dimension-item input { padding: 8px; border: 1px solid var(--color-hairline); border-radius: 6px; }
        .dim-desc { flex: 1; }
        .button-icon-delete { background: none; border: none; font-size: 20px; color: #ccc; cursor: pointer; }
        .button-icon-delete:hover { color: var(--color-negative); }
        
        .sample-list { display: flex; flex-direction: column; gap: 4px; }
        .sample-item { padding: 10px; border-radius: 6px; cursor: pointer; font-size: 13px; }
        .sample-item:hover { background: rgba(0,0,0,0.05); }
        .sample-item.active { background: var(--color-primary); color: #fff; }
        .sample-preview-box pre { background: #1e293b; color: #e2e8f0; padding: 12px; border-radius: 8px; font-size: 12px; overflow: auto; max-height: 300px; }
        
        .mock-answer-textarea { width: 100%; font-family: monospace; padding: 12px; border: 1px solid var(--color-hairline-strong); border-radius: 8px; margin-bottom: 16px; }
        
        .test-result-card { border: 1px solid var(--color-hairline-strong); border-radius: 12px; background: #fff; padding: 20px; margin-top: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        .result-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
        .overall-score { font-size: 15px; color: var(--color-ink); }
        .decision-tag { padding: 4px 12px; border-radius: 20px; font-weight: 600; font-size: 14px; }
        .decision-pass { background: #f0fdf4; color: #166534; }
        .decision-reject { background: #fef2f2; color: #991b1b; }
        .decision-human_review { background: #fffbeb; color: #92400e; }
        
        .score-row { margin-top: 16px; border-bottom: 1px solid var(--color-hairline); padding-bottom: 12px; }
        .score-info { display: flex; justify-content: space-between; margin-bottom: 4px; }
        .score-num { color: var(--color-primary); font-weight: bold; }
        .score-reason { font-size: 13px; color: var(--color-steel); margin: 0; }
        
        .workspace-footer { padding: 16px 24px; border-top: 1px solid var(--color-hairline); display: flex; justify-content: space-between; align-items: center; }
        .preset-select { padding: 4px 8px; border-radius: 4px; border: 1px solid var(--color-hairline); font-size: 12px; }
      `}</style>
    </div>
  )
}
