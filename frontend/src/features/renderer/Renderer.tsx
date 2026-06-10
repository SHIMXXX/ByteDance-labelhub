import { useEffect, useState } from 'react'
import type { JsonRecord, ReviewAnswerValue, TemplateComponent, TemplateSchema } from '../../types/domain'
import { MediaValue, formatMediaValue } from './MediaValue'
import { getRenderableRichTextHtml, RichTextEditor } from './RichTextEditor'
import { evaluateVisibleWhen } from './rules'
import { inferTemplateComponentPane } from '../../utils/templateSchema'

type RendererMode = 'preview' | 'answer'

type RendererProps = {
  schema: TemplateSchema
  mode: RendererMode
  values?: Record<string, ReviewAnswerValue>
  source?: JsonRecord
  showSourceFallback?: boolean
  onUpdateAnswer?: (field: string, value: ReviewAnswerValue) => void
  onToggleArrayAnswer?: (field: string, value: string) => void
  onGenerateLLMAnswer?: (field: string, prompt: string) => void
}

function normalizeSchema(schema: TemplateSchema): {
  sourceComponents: TemplateComponent[]
  answerComponents: TemplateComponent[]
} {
  if (Array.isArray(schema)) {
    return {
      sourceComponents: schema.filter((component) => inferTemplateComponentPane(component) === 'source'),
      answerComponents: schema.filter((component) => inferTemplateComponentPane(component) === 'answer'),
    }
  }

  const legacySchema = schema as unknown as { components?: TemplateComponent[] }
  if (Array.isArray(legacySchema.components)) {
    return {
      sourceComponents: legacySchema.components.filter((component) => inferTemplateComponentPane(component) === 'source'),
      answerComponents: legacySchema.components.filter((component) => inferTemplateComponentPane(component) === 'answer'),
    }
  }

  return {
    sourceComponents: schema.sourceView.components,
    answerComponents: schema.answerView.components,
  }
}

function getSourcePathValue(source: JsonRecord | undefined, path: string | undefined) {
  if (!source || !path) {
    return undefined
  }

  const normalizedPath = path.startsWith('source.') ? path.slice('source.'.length) : path
  return normalizedPath.split('.').reduce<unknown>((current, segment) => {
    if (!segment || current === null || current === undefined || typeof current !== 'object') {
      return undefined
    }
    return (current as Record<string, unknown>)[segment]
  }, source)
}

function SourcePreviewFields({ source }: { source?: JsonRecord }) {
  const entries = Object.entries(source ?? {}).filter(([, value]) => value !== undefined && value !== null && value !== '')

  if (entries.length === 0) {
    return null
  }

  return (
    <dl className="template-preview-item renderer-source-fields">
      {entries.map(([key, value]) => (
        <div key={key} className="dataset-preview-kv">
          <dt>{key}</dt>
          <dd>
            <MediaValue fieldName={key} source={source} value={value} />
          </dd>
        </div>
      ))}
    </dl>
  )
}

function componentConsumesSource(component: TemplateComponent): boolean {
  if (component.pane === 'source') {
    return true
  }
  if (component.type === 'compare_panel' || component.type.startsWith('field_')) {
    return true
  }
  if (component.type === 'show_item' && (component.sourceField || component.content?.startsWith('source.'))) {
    return true
  }
  if (component.type === 'group') {
    return (component.children ?? []).some(componentConsumesSource)
  }
  if (component.type === 'tab_container') {
    return (component.tabs ?? []).some((tab) => tab.children.some(componentConsumesSource))
  }
  return false
}

export function Renderer({
  schema,
  mode,
  values = {},
  source,
  showSourceFallback = true,
  onUpdateAnswer,
  onToggleArrayAnswer,
  onGenerateLLMAnswer,
}: RendererProps) {
  const normalized = normalizeSchema(schema)
  const visibilityContext = { ...(source ?? {}), ...values }
  const visibleSourceComponents = normalized.sourceComponents.filter((component) => evaluateVisibleWhen(component.visibleWhen, visibilityContext))
  const visibleAnswerComponents = normalized.answerComponents.filter((component) => evaluateVisibleWhen(component.visibleWhen, visibilityContext))
  const shouldRenderSourceFallback = showSourceFallback
    && mode === 'preview'
    && visibleSourceComponents.length === 0
    && !visibleAnswerComponents.some(componentConsumesSource)

  return (
    <div className="form-grid">
      {shouldRenderSourceFallback ? <SourcePreviewFields source={source} /> : null}
      {visibleSourceComponents.map((component) => (
        <RendererField
          component={component}
          key={component.id || component.field || component.label}
          mode={mode}
          source={source}
          values={values}
          onGenerateLLMAnswer={onGenerateLLMAnswer}
          onToggleArrayAnswer={onToggleArrayAnswer}
          onUpdateAnswer={onUpdateAnswer}
          value={values[component.field]}
        />
      ))}
      {visibleAnswerComponents.map((component) => (
        <RendererField
          component={component}
          key={component.id || component.field || component.label}
          mode={mode}
          source={source}
          values={values}
          onGenerateLLMAnswer={onGenerateLLMAnswer}
          onToggleArrayAnswer={onToggleArrayAnswer}
          onUpdateAnswer={onUpdateAnswer}
          value={values[component.field]}
        />
      ))}
    </div>
  )
}

type RendererFieldProps = {
  component: TemplateComponent
  mode: RendererMode
  source?: JsonRecord
  values: Record<string, ReviewAnswerValue>
  value?: ReviewAnswerValue
  onUpdateAnswer?: (field: string, value: ReviewAnswerValue) => void
  onToggleArrayAnswer?: (field: string, value: string) => void
  onGenerateLLMAnswer?: (field: string, prompt: string) => void
}

function formatSourceValue(value: unknown) {
  return formatMediaValue(value)
}

function getTextValue(value?: ReviewAnswerValue) {
  return typeof value === 'string' ? value : ''
}

function RendererField({ component, mode, source, values, value, onUpdateAnswer, onToggleArrayAnswer, onGenerateLLMAnswer }: RendererFieldProps) {
  const label = component.required ? `${component.label} *` : component.label
  const [activeTabKey, setActiveTabKey] = useState<string | null>(component.tabs?.[0]?.key ?? null)
  useEffect(() => {
    const tabs = component.tabs ?? []
    if (tabs.length === 0) {
      setActiveTabKey(null)
      return
    }

    if (!activeTabKey || !tabs.some((tab) => tab.key === activeTabKey)) {
      setActiveTabKey(tabs[0].key)
    }
  }, [activeTabKey, component.tabs])

  if (component.type === 'group') {
    return (
      <div className="template-preview-item">
        <h4>{component.label}</h4>
        <Renderer
          schema={component.children ?? []}
          mode={mode}
          values={values}
          source={source}
          onUpdateAnswer={onUpdateAnswer}
          onToggleArrayAnswer={onToggleArrayAnswer}
          onGenerateLLMAnswer={onGenerateLLMAnswer}
        />
      </div>
    )
  }

  if (component.type === 'tab_container') {
    const tabs = component.tabs ?? []
    const currentTab = tabs.find((tab) => tab.key === activeTabKey) ?? tabs[0]
    const currentTabIndex = currentTab ? tabs.findIndex((tab) => tab.key === currentTab.key) : -1

    return (
      <div className="template-preview-item">
        <h4>{component.label}</h4>
        {tabs.length > 0 ? (
          <div className="template-page-shell">
            <div aria-label={component.label} className="template-page-tabs" role="tablist">
              {tabs.map((tab, index) => (
                <button
                  key={tab.key}
                  aria-label={tab.label}
                  aria-selected={currentTab?.key === tab.key}
                  className={currentTab?.key === tab.key ? 'template-page-tab is-active' : 'template-page-tab'}
                  role="tab"
                  type="button"
                  onClick={() => setActiveTabKey(tab.key)}
                >
                  <span>{tab.label}</span>
                  <small>{`第 ${index + 1} 页`}</small>
                </button>
              ))}
            </div>
            {currentTab ? (
              <div className="template-page-panel">
                <div className="template-page-panel__meta">
                  <strong>{currentTab.label}</strong>
                  <span>{`第 ${currentTabIndex + 1} / ${tabs.length} 页`}</span>
                </div>
                <Renderer
                  schema={currentTab.children ?? []}
                  mode={mode}
                  values={values}
                  source={source}
                  onUpdateAnswer={onUpdateAnswer}
                  onToggleArrayAnswer={onToggleArrayAnswer}
                  onGenerateLLMAnswer={onGenerateLLMAnswer}
                />
              </div>
            ) : null}
          </div>
        ) : null}
        {!currentTab ? <p>当前分页还没有可展示的内容。</p> : null}
      </div>
    )
  }

  if (component.type === 'textarea') {
    const isReadOnly = mode === 'preview'
    return (
      <label className="form-field template-preview-item">
        <span>{label}</span>
        <textarea
          aria-label={component.label}
          placeholder={component.content || '请输入多行文本'}
          readOnly={isReadOnly}
          value={getTextValue(value)}
          onChange={(event) => onUpdateAnswer?.(component.field, event.target.value)}
          className={isReadOnly ? 'renderer-generic-display' : ''}
          style={isReadOnly ? { minHeight: '96px',  width: '480px',border: '1px solid var(--color-hairline-strong)' } : {}}
        />
      </label>
    )
  }

  if (component.type === 'rich_text') {
    if (component.pane === 'source' || mode === 'preview') {
      return (
        <div className="template-preview-item">
          {component.label ? <p className="renderer-generic-display-label">{label}</p> : null}
          <div
            className="renderer-generic-display"
            style={{ fontSize: '14px', lineHeight: 1.6, color: '#1a1a1a' }}
            dangerouslySetInnerHTML={{ __html: getRenderableRichTextHtml(getTextValue(value), component.content) }}
          />
        </div>
      )
    }

    return (
      <div className="form-field template-preview-item">
        <span>{label}</span>
        <RichTextEditor
          label={component.label}
          placeholder={component.content || '请输入富文本内容...'}
          value={getTextValue(value)}
          onChange={(nextValue) => onUpdateAnswer?.(component.field, nextValue)}
        />
      </div>
    )
  }

  if (component.type === 'json_editor') {
    const helper = component.content || '{\n  "key": "value"\n}'

    return (
      <div className="form-field template-preview-item">
        <span>{label}</span>
        <div className="json-editor-container">
          <div className="json-editor-header">
            <span>JSON Editor</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ff5f56' }}></div>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ffbd2e' }}></div>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#27c93f' }}></div>
            </div>
          </div>
          <textarea
            aria-label={component.label}
            className="json-editor-textarea"
            placeholder={helper}
            readOnly={mode === 'preview'}
            value={getTextValue(value)}
            onChange={(event) => onUpdateAnswer?.(component.field, event.target.value)}
          />
        </div>
      </div>
    )
  }


  if (component.type === 'llm_assist') {
    const helper = 'AI 辅助建议：基于当前上下文生成参考文本。'
    const instruction = component.llmInstruction || component.content || ''
    const isGenerating = values[`_loading_${component.field}`] === true

    return (
      <div className="template-preview-item llm-assist-card" style={{
        backgroundColor: '#f5f2ff',
        border: '1px solid #d6b6f6',
        borderRadius: '12px',
        padding: '20px',
        marginTop: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '24px',
              height: '24px',
              borderRadius: '6px',
              backgroundColor: '#5645d4',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: '12px',
              fontWeight: 'bold'
            }}>AI</div>
            <span style={{ fontWeight: 600, color: '#391c57', fontSize: '14px' }}>AI 智能辅助</span>
          </div>
          {mode === 'answer' && (
            <button
              className="button-primary"
              disabled={isGenerating}
              style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '6px' }}
              type="button"
              onClick={() => onGenerateLLMAnswer?.(component.field, instruction)}
            >
              {isGenerating ? '正在思考...' : '生成参考建议'}
            </button>
          )}
        </div>

        <label className="form-field" style={{ marginBottom: '8px' }}>
          <textarea
            aria-label={component.label}
            placeholder={isGenerating ? 'AI 正在根据指令生成内容，请稍候...' : helper}
            readOnly={mode === 'preview' || isGenerating}
            style={{
              minHeight: '60px',
              backgroundColor: isGenerating ? '#fafafa' : '#fff',
              borderColor: isGenerating ? '#e5e3df' : '#d6b6f6'
            }}
            value={getTextValue(value)}
            onChange={(event) => onUpdateAnswer?.(component.field, event.target.value)}
          />
        </label>
      </div>
    )
  }

  if (component.type === 'single_select') {
    return (
      <fieldset className="template-preview-item" style={{ border: 'none', padding: 0, margin: '0 0 16px 0' }}>
        <legend style={{ fontSize: '13px', fontWeight: 600, color: '#787671', marginBottom: '10px' }}>{label}</legend>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          {component.options?.map((option) => {
            const isSelected = value === option
            return (
              <label 
                key={option} 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px', 
                  padding: '10px 16px', 
                  border: isSelected ? '1px solid #5645d4' : '1px solid #e5e3df',
                  borderRadius: '8px',
                  backgroundColor: isSelected ? '#f5f2ff' : '#fff',
                  cursor: mode === 'preview' ? 'default' : 'pointer',
                  transition: 'all 0.2s',
                  color: isSelected ? '#391c57' : '#37352f',
                  fontWeight: isSelected ? 600 : 400
                }}
              >
                <input
                  type="radio"
                  name={component.field}
                  value={option}
                  checked={isSelected}
                  disabled={mode === 'preview'}
                  onChange={() => onUpdateAnswer?.(component.field, option)}
                  style={{ accentColor: '#5645d4', width: '16px', height: '16px', margin: 0 }}
                />
                <span style={{ fontSize: '14px', whiteSpace: 'nowrap' }}>{option}</span>
              </label>
            )
          })}
        </div>
      </fieldset>
    )
  }
  if (component.type === 'multi_select') {
    const values = Array.isArray(value) ? value : []
    return (
      <fieldset className="template-preview-item" style={{ border: 'none', padding: 0, margin: '0 0 16px 0' }}>
        <legend style={{ fontSize: '13px', fontWeight: 600, color: '#787671', marginBottom: '10px' }}>{label}</legend>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          {component.options?.map((option) => {
            const isSelected = values.includes(option)
            return (
              <label 
                key={option} 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px', 
                  padding: '10px 16px', 
                  border: isSelected ? '1px solid #5645d4' : '1px solid #e5e3df',
                  borderRadius: '8px',
                  backgroundColor: isSelected ? '#f5f2ff' : '#fff',
                  cursor: mode === 'preview' ? 'default' : 'pointer',
                  transition: 'all 0.2s',
                  color: isSelected ? '#391c57' : '#37352f',
                  fontWeight: isSelected ? 600 : 400
                }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={mode === 'preview'}
                  onChange={() => onToggleArrayAnswer?.(component.field, option)}
                  style={{ accentColor: '#5645d4', width: '16px', height: '16px', margin: 0 }}
                />
                <span style={{ fontSize: '14px', whiteSpace: 'nowrap' }}>{option}</span>
              </label>
            )
          })}
        </div>
      </fieldset>
    )
  }

  if (component.type === 'tag_select') {
    const values = Array.isArray(value) ? value : []
    return (
      <div className="template-preview-item">
        <p>{label}</p>
        <div className="tag-row">
          {component.options?.map((option) => (
            <button
              className={values.includes(option) ? 'tag-pill is-selected' : 'tag-pill'}
              key={option}
              type="button"
              onClick={() => onToggleArrayAnswer?.(component.field, option)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (component.type === 'image_upload') {
    const images = Array.isArray(value) ? value : []

    return (
      <div className="template-preview-item image-upload-container">
        <p className="renderer-generic-display-label">{label}</p>
        <div className="image-upload-grid">
          {images.map((image, index) => (
            <div key={`${image}-${index}`} className="image-upload-item">
              {/* Note: In a real app, this would be a URL, but here we show a placeholder or the name */}
              <div style={{ color: 'var(--color-steel)', fontSize: '24px' }}>🖼️</div>
              <div className="image-upload-item-name">{image}</div>
              {mode === 'answer' && (
                <button
                  type="button"
                  style={{
                    position: 'absolute',
                    top: '4px',
                    right: '4px',
                    padding: '2px 6px',
                    fontSize: '10px',
                    background: 'rgba(255, 255, 255, 0.9)',
                    color: '#e03131',
                    border: '1px solid #ffc9c9',
                    borderRadius: '4px'
                  }}
                  onClick={() => {
                    const next = images.filter((_, i) => i !== index)
                    onUpdateAnswer?.(component.field, next)
                  }}
                >
                  删除
                </button>
              )}
            </div>
          ))}
          {mode === 'answer' && images.length < (component.maxCount ?? 1) && (
            <label className="image-upload-add">
              <span>+</span>
              <small>上传图片</small>
              <input
                aria-label={component.label}
                multiple={(component.maxCount ?? 1) > 1}
                style={{ display: 'none' }}
                type="file"
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []).slice(0, (component.maxCount ?? 1) - images.length)
                  onUpdateAnswer?.(
                    component.field,
                    [...images, ...files.map((file) => file.name)],
                  )
                }}
              />
            </label>
          )}
        </div>
        {images.length === 0 && mode === 'preview' && (
          <div className="upload-placeholder">最多上传 {component.maxCount ?? 1} 张图片</div>
        )}
      </div>
    )
  }

  if (component.type === 'compare_panel') {
    const promptValue = component.promptField ? formatSourceValue(getSourcePathValue(source, component.promptField)) : ''
    const leftValue = component.leftField ? formatSourceValue(getSourcePathValue(source, component.leftField)) : ''
    const rightValue = component.rightField ? formatSourceValue(getSourcePathValue(source, component.rightField)) : ''
    const metadataFields = [...(component.metadataFields ?? []), ...(component.contextFields ?? [])]
    const metadataEntries = Array.from(new Set(metadataFields))
      .map((field) => [field, getSourcePathValue(source, field)] as const)
      .filter(([, entryValue]) => entryValue !== undefined && entryValue !== null && entryValue !== '')

    const hasChildren = (component.children_left?.length ?? 0) > 0 || (component.children_right?.length ?? 0) > 0

    return (
      <div className="template-preview-item compare-panel-container" style={{ width: '100%', margin: '12px 0' }}>
        {component.label ? <h4 style={{ marginBottom: '16px', color: '#1a1a1a', borderLeft: '4px solid #5645d4', paddingLeft: '12px' }}>{component.label}</h4> : null}
        
        {promptValue ? (
          <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#f6f5f4', borderRadius: '8px', border: '1px solid #ede9e4' }}>
            <strong style={{ display: 'block', fontSize: '12px', color: '#787671', marginBottom: '8px', textTransform: 'uppercase' }}>题面 (Context)</strong>
            <div className="renderer-generic-display" style={{ border: 'none', background: 'transparent', padding: 0, fontSize: '15px' }}>{promptValue}</div>
          </div>
        ) : null}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'stretch' }}>
          {/* Left Slot */}
          <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid #e5e3df', borderRadius: '12px', overflow: 'hidden', backgroundColor: '#fff' }}>
            <div style={{ padding: '10px 16px', backgroundColor: '#fafaf9', borderBottom: '1px solid #ede9e4', fontWeight: 600, color: '#37352f', fontSize: '14px' }}>
              {component.leftLabel || '回答 A'}
            </div>
            <div style={{ padding: '16px', flex: 1 }}>
              {hasChildren ? (
                <Renderer
                  schema={component.children_left ?? []}
                  mode={mode}
                  values={values}
                  source={source}
                  onUpdateAnswer={onUpdateAnswer}
                  onToggleArrayAnswer={onToggleArrayAnswer}
                  onGenerateLLMAnswer={onGenerateLLMAnswer}
                />
              ) : (
                <div className="renderer-generic-display" style={{ border: 'none', background: 'transparent', padding: 0 }}>
                  {leftValue || component.content || '暂无内容'}
                </div>
              )}
            </div>
          </div>

          {/* Right Slot */}
          <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid #e5e3df', borderRadius: '12px', overflow: 'hidden', backgroundColor: '#fff' }}>
            <div style={{ padding: '10px 16px', backgroundColor: '#fafaf9', borderBottom: '1px solid #ede9e4', fontWeight: 600, color: '#37352f', fontSize: '14px' }}>
              {component.rightLabel || '回答 B'}
            </div>
            <div style={{ padding: '16px', flex: 1 }}>
              {hasChildren ? (
                <Renderer
                  schema={component.children_right ?? []}
                  mode={mode}
                  values={values}
                  source={source}
                  onUpdateAnswer={onUpdateAnswer}
                  onToggleArrayAnswer={onToggleArrayAnswer}
                  onGenerateLLMAnswer={onGenerateLLMAnswer}
                />
              ) : (
                <div className="renderer-generic-display" style={{ border: 'none', background: 'transparent', padding: 0 }}>
                  {rightValue || component.content || '暂无内容'}
                </div>
              )}
            </div>
          </div>
        </div>

        {metadataEntries.length > 0 ? (
          <div style={{ marginTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {metadataEntries.map(([key, entryValue]) => (
              <div key={key} style={{ padding: '4px 10px', backgroundColor: '#f0f0f0', borderRadius: '4px', fontSize: '12px', color: '#5d5b54', border: '1px solid #e5e3df' }}>
                <strong style={{ marginRight: '4px' }}>{key}:</strong>
                {formatSourceValue(entryValue)}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  if (component.type === 'show_item') {
    const boundValue = component.sourceField
      ? getSourcePathValue(source, component.sourceField)
      : component.content?.startsWith('source.')
        ? getSourcePathValue(source, component.content)
        : undefined
    const displayValue = boundValue === undefined ? component.content : formatSourceValue(boundValue)

    return (
      <div className="template-preview-item">
        {component.label ? <p className="renderer-generic-display-label">{label}</p> : null}
        <div className="renderer-generic-display">
          {displayValue || '请输入展示内容（在属性面板配置）'}
        </div>
      </div>
    )
  }

  if (component.type === 'field_display') {
    const fieldValue = component.sourceField ? formatSourceValue(getSourcePathValue(source, component.sourceField)) : ''
    return (
      <div className="template-preview-item">
        <span aria-label={component.label} className="renderer-generic-display-label">{label}</span>
        <div className="renderer-generic-display">{fieldValue || '暂无数据'}</div>
      </div>
    )
  }

  if (component.type === 'field_textarea') {
    const fieldValue = component.sourceField ? formatSourceValue(getSourcePathValue(source, component.sourceField)) : ''
    return (
      <div className="template-preview-item">
        <span className="renderer-generic-display-label">{label}</span>
        <div className="renderer-generic-display" style={{ minHeight: '80px' }}>
          {fieldValue || '暂无多行文本数据'}
        </div>
      </div>
    )
  }


  if (component.type === 'field_tags') {
    const rawValue = component.sourceField ? getSourcePathValue(source, component.sourceField) : null
    const tagValues: string[] = Array.isArray(rawValue) ? rawValue.map((v) => String(v)) : typeof rawValue === 'string' ? rawValue.split(/[,，]/).map((s) => s.trim()).filter(Boolean) : []
    return (
      <div className="template-preview-item">
        <p>{label}</p>
        <div className="tag-row">
          {tagValues.length > 0 ? tagValues.map((tag) => (
            <span key={tag} className="tag-pill">{tag}</span>
          )) : <span className="field-helper-text">{component.content || '暂无标签数据'}</span>}
        </div>
      </div>
    )
  }

  if (component.type === 'field_hyperlink') {
    const url = component.sourceField ? formatSourceValue(getSourcePathValue(source, component.sourceField)) : ''
    return (
      <div className="template-preview-item">
        <label className="form-field">
          <span>{label}</span>
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer">{component.content || url}</a>
          ) : (
            <span className="field-helper-text">{component.content || '未配置链接字段'}</span>
          )}
        </label>
      </div>
    )
  }

  if (component.type === 'field_image') {
    const imageUrl = component.sourceField ? getSourcePathValue(source, component.sourceField) : ''
    return (
      <div className="template-preview-item">
        <p>{label}</p>
        {formatSourceValue(imageUrl) ? (
          <MediaValue label={component.label} source={source} value={imageUrl} variant="image" />
        ) : <span className="field-helper-text">{component.content || '未配置图片字段'}</span>}
      </div>
    )
  }

  if (component.type === 'field_video') {
    const videoUrl = component.sourceField ? getSourcePathValue(source, component.sourceField) : ''
    return (
      <div className="template-preview-item">
        <p>{label}</p>
        {formatSourceValue(videoUrl) ? (
          <MediaValue label={component.label} source={source} value={videoUrl} variant="video" />
        ) : <span className="field-helper-text">{component.content || '未配置视频字段'}</span>}
      </div>
    )
  }

  if (component.type === 'field_markdown') {
    const markdown = component.sourceField ? getSourcePathValue(source, component.sourceField) : ''
    return (
      <div className="template-preview-item">
        <p>{label}</p>
        {formatSourceValue(markdown) ? (
          <MediaValue label={component.label} source={source} value={markdown} variant="markdown" />
        ) : <span className="field-helper-text">{component.content || '未配置 Markdown 字段'}</span>}
      </div>
    )
  }

  if (mode === 'preview') {
    return (
      <label className="form-field template-preview-item">
        <span>{label}</span>
        <input
          aria-label={component.label}
          className="renderer-generic-display"
          placeholder={component.content || '请输入内容'}
          readOnly
          value=""
        />
      </label>
    )
  }


  return (
    <label className="form-field template-preview-item">
      <span>{label}</span>
      <input
        aria-label={component.label}
        placeholder={component.content || '请输入内容'}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onUpdateAnswer?.(component.field, event.target.value)}
      />
    </label>
  )
}
