import { parseAppDate } from './time'

export type TimeRangeKey = 'all' | '1d' | '7d' | '30d'

export const timeRangeOptions: Array<{ key: TimeRangeKey; label: string }> = [
  { key: 'all', label: '全部' },
  { key: '1d', label: '1 天内' },
  { key: '7d', label: '7 天内' },
  { key: '30d', label: '1 个月内' },
]

const rangeDays: Record<Exclude<TimeRangeKey, 'all'>, number> = {
  '1d': 1,
  '7d': 7,
  '30d': 30,
}

export function parseTimeValue(value: string | null | undefined) {
  if (!value || value === '未设置') {
    return null
  }
  const date = parseAppDate(value)
  return date ? date.getTime() : null
}

export function isWithinTimeRange(value: string | null | undefined, range: TimeRangeKey, now = Date.now()) {
  if (range === 'all') {
    return true
  }

  const timestamp = parseTimeValue(value)
  if (timestamp === null) {
    return false
  }

  const start = now - rangeDays[range] * 24 * 60 * 60 * 1000
  return timestamp >= start && timestamp <= now
}

export function filterByTimeRange<T>(
  items: T[],
  range: TimeRangeKey,
  getTimeValue: (item: T) => string | null | undefined,
) {
  return items.filter((item) => isWithinTimeRange(getTimeValue(item), range))
}
