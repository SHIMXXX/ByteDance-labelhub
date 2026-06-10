import { useEffect, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'

const RICH_TEXT_RED = '#d14343'
const EMPTY_RICH_TEXT_PREVIEW = '<p>暂无富文本内容</p>'

type RichTextAction = 'bold' | 'underline' | 'strikethrough' | 'red'

type RichTextEditorProps = {
  label: string
  value: string
  placeholder: string
  onChange: (value: string) => void
}

const toolbarActions: Array<{ action: RichTextAction; label: string }> = [
  { action: 'strikethrough', label: '删除横线' },
  { action: 'underline', label: '底部横线' },
  { action: 'bold', label: '加粗' },
  { action: 'red', label: '标红' },
]

function RichTextToolbarIcon({ action }: { action: RichTextAction }) {
  if (action === 'bold') {
    return (
      <svg aria-hidden="true" className="rich-text-editor__icon" viewBox="0 0 20 20">
        <path d="M6 4.5h5.3a3.2 3.2 0 0 1 0 6.4H6zm0 6.4h6.2a3.3 3.3 0 1 1 0 6.6H6z" fill="currentColor" />
      </svg>
    )
  }

  if (action === 'underline') {
    return (
      <svg aria-hidden="true" className="rich-text-editor__icon" viewBox="0 0 20 20">
        <path d="M6.5 4.5v5.3a3.5 3.5 0 0 0 7 0V4.5h1.8v5.4a5.3 5.3 0 0 1-10.6 0V4.5zM4.8 16h10.4v1.7H4.8z" fill="currentColor" />
      </svg>
    )
  }

  if (action === 'strikethrough') {
    return (
      <svg aria-hidden="true" className="rich-text-editor__icon" viewBox="0 0 20 20">
        <path d="M10 4.2c-2.1 0-3.5.9-3.5 2.3 0 .9.6 1.6 1.7 2h3.7c2.2.5 3.3 1.7 3.3 3.4 0 2.5-2.2 4-5.3 4-2.7 0-4.8-1.2-5.4-3.3l1.9-.5c.5 1.4 1.9 2.2 3.6 2.2 1.9 0 3.3-.8 3.3-2.2 0-.9-.7-1.6-2-1.9H7.7c-2-.5-3.1-1.7-3.1-3.4 0-2.4 2.1-4 5.3-4 2.4 0 4.3 1 5 2.8l-1.9.5c-.5-1.1-1.6-1.9-3-1.9Z" fill="currentColor" />
        <path d="M4.2 9.2h11.6v1.7H4.2z" fill="currentColor" />
      </svg>
    )
  }

  return (
    <svg aria-hidden="true" className="rich-text-editor__icon" viewBox="0 0 20 20">
      <path d="M10 3.8 4.7 16h2l1.2-3h4.3l1.2 3h2L10 3.8Zm-1.5 7.5L10 7.4l1.5 3.9Z" fill="currentColor" />
      <path d="M5 17h10v1.7H5z" fill="#d14343" />
    </svg>
  )
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function hasHtmlMarkup(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value)
}

function normalizeColorToken(value: string | null | undefined) {
  if (!value) {
    return null
  }

  const styleColorMatch = value.match(/color\s*:\s*([^;]+)/i)
  const candidate = (styleColorMatch ? styleColorMatch[1] : value).trim().toLowerCase().replace(/\s+/g, '')
  if (candidate === '#d14343' || candidate === 'rgb(209,67,67)' || candidate === 'rgba(209,67,67,1)' || candidate === 'red') {
    return RICH_TEXT_RED
  }

  return null
}

function sanitizeRichTextHtml(html: string) {
  if (!html) {
    return ''
  }

  if (typeof DOMParser === 'undefined' || typeof document === 'undefined') {
    return html
  }

  const parser = new DOMParser()
  const parsed = parser.parseFromString(`<div>${html}</div>`, 'text/html')
  const sourceRoot = parsed.body.firstElementChild
  if (!sourceRoot) {
    return ''
  }

  const outputDocument = document.implementation.createHTMLDocument('')
  const outputRoot = outputDocument.createElement('div')

  const sanitizeNode = (node: Node, ownerDocument: Document): Node | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      return ownerDocument.createTextNode(node.textContent ?? '')
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return null
    }

    const element = node as HTMLElement
    const tagName = element.tagName.toUpperCase()

    if (tagName === 'SCRIPT' || tagName === 'STYLE') {
      return null
    }

    if (tagName === 'BR') {
      return ownerDocument.createElement('br')
    }

    if (tagName === 'DIV' || tagName === 'P') {
      const block = ownerDocument.createElement('div')
      Array.from(element.childNodes).forEach((child) => {
        const sanitizedChild = sanitizeNode(child, ownerDocument)
        if (sanitizedChild) {
          block.appendChild(sanitizedChild)
        }
      })
      return block
    }

    if (tagName === 'STRONG' || tagName === 'B') {
      const strong = ownerDocument.createElement('strong')
      Array.from(element.childNodes).forEach((child) => {
        const sanitizedChild = sanitizeNode(child, ownerDocument)
        if (sanitizedChild) {
          strong.appendChild(sanitizedChild)
        }
      })
      return strong
    }

    if (tagName === 'U') {
      const underline = ownerDocument.createElement('u')
      Array.from(element.childNodes).forEach((child) => {
        const sanitizedChild = sanitizeNode(child, ownerDocument)
        if (sanitizedChild) {
          underline.appendChild(sanitizedChild)
        }
      })
      return underline
    }

    if (tagName === 'S' || tagName === 'STRIKE') {
      const strike = ownerDocument.createElement('s')
      Array.from(element.childNodes).forEach((child) => {
        const sanitizedChild = sanitizeNode(child, ownerDocument)
        if (sanitizedChild) {
          strike.appendChild(sanitizedChild)
        }
      })
      return strike
    }

    if (tagName === 'SPAN' || tagName === 'FONT') {
      const color = normalizeColorToken(element.style.color || element.getAttribute('color') || element.getAttribute('style'))
      if (color) {
        const span = ownerDocument.createElement('span')
        span.style.color = color
        Array.from(element.childNodes).forEach((child) => {
          const sanitizedChild = sanitizeNode(child, ownerDocument)
          if (sanitizedChild) {
            span.appendChild(sanitizedChild)
          }
        })
        return span
      }

      const fragment = ownerDocument.createDocumentFragment()
      Array.from(element.childNodes).forEach((child) => {
        const sanitizedChild = sanitizeNode(child, ownerDocument)
        if (sanitizedChild) {
          fragment.appendChild(sanitizedChild)
        }
      })
      return fragment
    }

    const fragment = ownerDocument.createDocumentFragment()
    Array.from(element.childNodes).forEach((child) => {
      const sanitizedChild = sanitizeNode(child, ownerDocument)
      if (sanitizedChild) {
        fragment.appendChild(sanitizedChild)
      }
    })
    return fragment
  }

  Array.from(sourceRoot.childNodes).forEach((child) => {
    const sanitizedChild = sanitizeNode(child, outputDocument)
    if (sanitizedChild) {
      outputRoot.appendChild(sanitizedChild)
    }
  })

  return outputRoot.innerHTML
}

function normalizeRichTextValue(value: string) {
  if (!value.trim()) {
    return ''
  }

  const htmlCandidate = hasHtmlMarkup(value) ? value : escapeHtml(value).replace(/\n/g, '<br>')
  return sanitizeRichTextHtml(htmlCandidate)
}

function createWrapperForAction(action: RichTextAction) {
  if (typeof document === 'undefined') {
    return null
  }

  if (action === 'bold') {
    return document.createElement('strong')
  }

  if (action === 'underline') {
    return document.createElement('u')
  }

  if (action === 'strikethrough') {
    return document.createElement('s')
  }

  if (action === 'red') {
    const span = document.createElement('span')
    span.style.color = RICH_TEXT_RED
    return span
  }

  return null
}

function restoreSavedSelection(root: HTMLElement, savedRange: Range | null) {
  const selection = window.getSelection()
  if (!selection || !savedRange) {
    return false
  }

  if (!root.contains(savedRange.commonAncestorContainer)) {
    return false
  }

  selection.removeAllRanges()
  selection.addRange(savedRange)
  return true
}

function applyRangeFormatting(action: RichTextAction, root: HTMLElement, savedRangeRef: MutableRefObject<Range | null>) {
  const selection = window.getSelection()
  const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : savedRangeRef.current
  if (!range || range.collapsed || !root.contains(range.commonAncestorContainer)) {
    return false
  }

  if (!range.toString().trim()) {
    return false
  }

  const wrapper = createWrapperForAction(action)
  if (!wrapper) {
    return false
  }

  const fragment = range.extractContents()
  wrapper.appendChild(fragment)
  range.insertNode(wrapper)

  const nextRange = document.createRange()
  nextRange.selectNodeContents(wrapper)
  selection?.removeAllRanges()
  selection?.addRange(nextRange)
  savedRangeRef.current = nextRange.cloneRange()
  return true
}

function executeBrowserCommand(action: RichTextAction) {
  const richTextDocument = document as Document & {
    execCommand?: (commandId: string, showUI?: boolean, value?: string) => boolean
  }

  if (typeof richTextDocument.execCommand !== 'function') {
    return false
  }

  if (action === 'bold') {
    return richTextDocument.execCommand('bold', false)
  }

  if (action === 'underline') {
    return richTextDocument.execCommand('underline', false)
  }

  if (action === 'strikethrough') {
    return richTextDocument.execCommand('strikeThrough', false)
  }

  if (action === 'red') {
    richTextDocument.execCommand('styleWithCSS', false, 'true')
    return richTextDocument.execCommand('foreColor', false, RICH_TEXT_RED)
  }

  return false
}

export function getRenderableRichTextHtml(value?: string, fallback?: string) {
  const source = typeof value === 'string' && value.trim().length > 0 ? value : fallback ?? ''
  const normalized = normalizeRichTextValue(source)
  return normalized || EMPTY_RICH_TEXT_PREVIEW
}

export function RichTextEditor({ label, value, placeholder, onChange }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const savedSelectionRef = useRef<Range | null>(null)
  const normalizedIncomingValue = normalizeRichTextValue(value)
  const [editorHtml, setEditorHtml] = useState(normalizedIncomingValue)

  useEffect(() => {
    setEditorHtml((currentValue) => (currentValue === normalizedIncomingValue ? currentValue : normalizedIncomingValue))
  }, [normalizedIncomingValue])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) {
      return
    }

    if (editor.innerHTML !== editorHtml) {
      editor.innerHTML = editorHtml
    }
  }, [editorHtml])

  const syncSelection = () => {
    const editor = editorRef.current
    const selection = window.getSelection()
    if (!editor || !selection || selection.rangeCount === 0) {
      return
    }

    const range = selection.getRangeAt(0)
    if (!editor.contains(range.commonAncestorContainer)) {
      return
    }

    savedSelectionRef.current = range.cloneRange()
  }

  const commitEditorHtml = (rawHtml: string) => {
    const normalizedHtml = sanitizeRichTextHtml(rawHtml)
    setEditorHtml(normalizedHtml)
    onChange(normalizedHtml)
  }

  const handleApplyFormatting = (action: RichTextAction) => {
    const editor = editorRef.current
    if (!editor) {
      return
    }

    editor.focus()
    restoreSavedSelection(editor, savedSelectionRef.current)

    const applied = executeBrowserCommand(action) || applyRangeFormatting(action, editor, savedSelectionRef)
    if (!applied) {
      return
    }

    syncSelection()
    commitEditorHtml(editor.innerHTML)
  }

  return (
    <div className="rich-text-editor">
      <div className="rich-text-editor__shell">
        <div className="rich-text-editor__toolbar">
          {toolbarActions.map((item) => (
            <button
              key={item.action}
              aria-label={item.label}
              className="rich-text-editor__tool"
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => handleApplyFormatting(item.action)}
            >
              <RichTextToolbarIcon action={item.action} />
            </button>
          ))}
          <div className="rich-text-editor__toolbar-divider" />
          <span className="rich-text-editor__hint">富文本编辑器</span>
        </div>

        <div
          ref={editorRef}
          aria-label={label}
          className="rich-text-editor__canvas"
          contentEditable
          data-placeholder={placeholder}
          role="textbox"
          suppressContentEditableWarning
          onBlur={syncSelection}
          onContextMenu={syncSelection}
          onInput={() => commitEditorHtml(editorRef.current?.innerHTML ?? '')}
          onKeyUp={syncSelection}
          onMouseUp={syncSelection}
        />
      </div>
    </div>
  )
}
