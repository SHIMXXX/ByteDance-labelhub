const offsetPattern = /([zZ]|[+-]\d{2}:?\d{2})$/
const dateTimePattern = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?$/

export function normalizeTimeString(value: string | null | undefined) {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed || trimmed === '未设置') return null
  if (offsetPattern.test(trimmed)) return trimmed
  if (dateTimePattern.test(trimmed)) return `${trimmed.replace(' ', 'T')}Z`
  return trimmed
}

export function parseAppDate(value: string | null | undefined) {
  const normalized = normalizeTimeString(value)
  if (!normalized) return null
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

export function serializeLocalDateTime(value: string | null | undefined) {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed || trimmed === '未设置') return null
  const parsed = offsetPattern.test(trimmed)
    ? new Date(trimmed)
    : new Date(trimmed.replace(' ', 'T'))
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}
