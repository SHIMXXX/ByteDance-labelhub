import type { JsonRecord } from '../../types/domain'

type MediaVariant = 'auto' | 'text' | 'link' | 'image' | 'video' | 'markdown'

type MarkdownPart =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'image'; alt: string; url: string }
  | { type: 'video'; url: string }

type MediaValueProps = {
  value: unknown
  label?: string
  fieldName?: string
  mediaType?: unknown
  source?: JsonRecord
  variant?: MediaVariant
}

const imageExtensionPattern = /\.(png|jpe?g|gif|webp|svg|bmp|avif)(\?.*)?$/i
const videoExtensionPattern = /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i
const urlPattern = /^https?:\/\//i

export function formatMediaValue(value: unknown) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value, null, 2)
}

function normalizeMediaType(mediaType: unknown) {
  return typeof mediaType === 'string' ? mediaType.toLowerCase().trim() : ''
}

function inferMediaVariant({
  fieldName,
  mediaType,
  source,
  value,
}: Pick<MediaValueProps, 'fieldName' | 'mediaType' | 'source' | 'value'>): MediaVariant {
  const text = formatMediaValue(value).trim()
  const loweredField = (fieldName ?? '').toLowerCase()
  const explicitMediaType = normalizeMediaType(mediaType)
  const rowMediaType = normalizeMediaType(source?.media_type)

  if (loweredField.includes('markdown') || explicitMediaType === 'markdown') return 'markdown'
  if (explicitMediaType === 'image') return 'image'
  if (explicitMediaType === 'video') return 'video'
  if (loweredField.includes('media_url') && rowMediaType === 'image') return 'image'
  if (loweredField.includes('media_url') && rowMediaType === 'video') return 'video'
  if (loweredField.includes('image')) return 'image'
  if (loweredField.includes('video')) return 'video'
  if (looksLikeMarkdown(text)) return 'markdown'
  if (imageExtensionPattern.test(text)) return 'image'
  if (videoExtensionPattern.test(text)) return 'video'
  if (loweredField.includes('url') && urlPattern.test(text)) return 'link'
  if (urlPattern.test(text)) return 'link'
  return 'text'
}

function looksLikeMarkdown(text: string) {
  return /^#{1,3}\s+/m.test(text)
    || /!\[[^\]]*]\([^)]+\)/.test(text)
    || /<video\b/i.test(text)
}

function extractVideoSource(markdown: string) {
  const match = markdown.match(/<video\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i)
  return match?.[1] ?? ''
}

function parseMarkdown(markdown: string): MarkdownPart[] {
  const parts: MarkdownPart[] = []
  const blocks = markdown.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean)

  for (const block of blocks) {
    const videoUrl = extractVideoSource(block)
    if (videoUrl) {
      parts.push({ type: 'video', url: videoUrl })
      continue
    }

    const imageMatch = block.match(/^!\[([^\]]*)]\(([^)]+)\)$/)
    if (imageMatch) {
      parts.push({ type: 'image', alt: imageMatch[1] || 'Markdown 图片', url: imageMatch[2] })
      continue
    }

    const headingMatch = block.match(/^(#{1,3})\s+(.+)$/)
    if (headingMatch) {
      parts.push({ type: 'heading', level: headingMatch[1].length as 1 | 2 | 3, text: headingMatch[2] })
      continue
    }

    parts.push({ type: 'paragraph', text: block })
  }

  return parts
}

function renderInlineText(text: string) {
  const nodes: Array<string | JSX.Element> = []
  const pattern = /(!)?\[([^\]]+)]\((https?:\/\/[^)]+)\)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }

    if (match[1]) {
      nodes.push(
        <img
          alt={match[2]}
          className="media-value-image media-value-image-inline"
          key={`${match[3]}-${match.index}`}
          src={match[3]}
        />,
      )
    } else if (videoExtensionPattern.test(match[3])) {
      nodes.push(
        <video className="media-value-video" controls key={`${match[3]}-${match.index}`} preload="metadata" src={match[3]}>
          当前浏览器不支持视频播放。
        </video>,
      )
    } else {
      nodes.push(
        <a href={match[3]} key={`${match[3]}-${match.index}`} rel="noopener noreferrer" target="_blank">
          {match[2]}
        </a>,
      )
    }

    lastIndex = pattern.lastIndex
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes.length > 0 ? nodes : text
}

export function MediaValue({ value, label, fieldName, mediaType, source, variant = 'auto' }: MediaValueProps) {
  const text = formatMediaValue(value)
  const resolvedVariant = variant === 'auto' ? inferMediaVariant({ fieldName, mediaType, source, value }) : variant

  if (!text.trim()) {
    return <span className="field-helper-text">暂无内容</span>
  }

  if (resolvedVariant === 'image') {
    return <img alt={label || fieldName || '图片'} className="media-value-image" src={text} />
  }

  if (resolvedVariant === 'video') {
    return (
      <video className="media-value-video" controls preload="metadata" src={text}>
        当前浏览器不支持视频播放。
      </video>
    )
  }

  if (resolvedVariant === 'link') {
    return (
      <a className="media-value-link" href={text} rel="noopener noreferrer" target="_blank">
        {text}
      </a>
    )
  }

  if (resolvedVariant === 'markdown') {
    const parts = parseMarkdown(text)
    return (
      <div className="media-value-markdown">
        {parts.map((part, index) => {
          if (part.type === 'heading') {
            const HeadingTag = `h${part.level + 2}` as 'h3' | 'h4' | 'h5'
            return <HeadingTag key={`${part.type}-${index}`}>{part.text}</HeadingTag>
          }
          if (part.type === 'image') {
            return <img alt={part.alt} className="media-value-image" key={`${part.type}-${index}`} src={part.url} />
          }
          if (part.type === 'video') {
            return (
              <video className="media-value-video" controls key={`${part.type}-${index}`} preload="metadata" src={part.url}>
                当前浏览器不支持视频播放。
              </video>
            )
          }
          return <p key={`${part.type}-${index}`}>{renderInlineText(part.text)}</p>
        })}
      </div>
    )
  }

  return <span className="media-value-text">{text}</span>
}
