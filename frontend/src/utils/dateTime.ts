import { parseAppDate } from './time'

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return '—'
  }

  const date = parseAppDate(value)
  if (!date) {
    return value
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

export function formatRelativeTime(value: string | null | undefined, now = new Date()) {
  if (!value) {
    return '—'
  }

  const date = parseAppDate(value)
  if (!date) {
    return value
  }

  const diffMs = date.getTime() - now.getTime()
  const diffMinutes = Math.round(diffMs / 60000)
  const absMinutes = Math.abs(diffMinutes)

  if (absMinutes < 1) {
    return '刚刚'
  }

  if (absMinutes < 60) {
    return diffMinutes > 0 ? `${absMinutes} 分钟后` : `${absMinutes} 分钟前`
  }

  const diffHours = Math.round(diffMinutes / 60)
  const absHours = Math.abs(diffHours)
  if (absHours < 24) {
    return diffHours > 0 ? `${absHours} 小时后` : `${absHours} 小时前`
  }

  const diffDays = Math.round(diffHours / 24)
  const absDays = Math.abs(diffDays)
  if (absDays === 1) {
    return diffDays > 0 ? '明天' : '昨天'
  }

  if (absDays < 7) {
    return diffDays > 0 ? `${absDays} 天后` : `${absDays} 天前`
  }

  return formatDateTime(value)
}
