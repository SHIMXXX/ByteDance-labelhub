import { useEffect, useMemo, useState } from 'react'

type DeadlinePickerProps = {
  value: string
  onChange: (value: string) => void
}

const pad2 = (value: number) => String(value).padStart(2, '0')

const range = (start: number, end: number, step = 1) => {
  const values: number[] = []
  for (let value = start; value <= end; value += step) {
    values.push(value)
  }
  return values
}

function parseDeadline(value: string) {
  const fallback = new Date()
  fallback.setDate(fallback.getDate() + 7)
  fallback.setHours(18, 0, 0, 0)

  if (!value || value === '未设置') {
    return fallback
  }

  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const parsed = new Date(normalized)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

function formatDeadline(year: number, month: number, day: number, hour: number, minute: number) {
  return `${year}-${pad2(month)}-${pad2(day)} ${pad2(hour)}:${pad2(minute)}`
}

export function DeadlinePicker({ value, onChange }: DeadlinePickerProps) {
  const initialDate = useMemo(() => parseDeadline(value), [value])
  const currentYear = new Date().getFullYear()
  const minYear = Math.min(currentYear, initialDate.getFullYear())
  const [year, setYear] = useState(initialDate.getFullYear())
  const [month, setMonth] = useState(initialDate.getMonth() + 1)
  const [day, setDay] = useState(initialDate.getDate())
  const [hour, setHour] = useState(initialDate.getHours())
  const [minute, setMinute] = useState(Math.min(55, Math.round(initialDate.getMinutes() / 5) * 5))

  const dayCount = new Date(year, month, 0).getDate()

  useEffect(() => {
    if (day > dayCount) {
      setDay(dayCount)
    }
  }, [day, dayCount])

  useEffect(() => {
    onChange(formatDeadline(year, month, Math.min(day, dayCount), hour, minute === 60 ? 55 : minute))
  }, [year, month, day, dayCount, hour, minute])

  return (
    <div className="deadline-picker" role="group" aria-label="截止时间滚动选择">
      <div className="deadline-picker-column">
        <span>年</span>
        <select aria-label="截止年份" value={year} onChange={(event) => setYear(Number(event.target.value))}>
          {range(minYear, currentYear + 5).map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>
      <div className="deadline-picker-column">
        <span>月</span>
        <select aria-label="截止月份" value={month} onChange={(event) => setMonth(Number(event.target.value))}>
          {range(1, 12).map((item) => <option key={item} value={item}>{pad2(item)}</option>)}
        </select>
      </div>
      <div className="deadline-picker-column">
        <span>日</span>
        <select aria-label="截止日期" value={day} onChange={(event) => setDay(Number(event.target.value))}>
          {range(1, dayCount).map((item) => <option key={item} value={item}>{pad2(item)}</option>)}
        </select>
      </div>
      <div className="deadline-picker-column">
        <span>时</span>
        <select aria-label="截止小时" value={hour} onChange={(event) => setHour(Number(event.target.value))}>
          {range(0, 23).map((item) => <option key={item} value={item}>{pad2(item)}</option>)}
        </select>
      </div>
      <div className="deadline-picker-column">
        <span>分</span>
        <select aria-label="截止分钟" value={minute} onChange={(event) => setMinute(Number(event.target.value))}>
          {range(0, 55, 5).map((item) => <option key={item} value={item}>{pad2(item)}</option>)}
        </select>
      </div>
      <strong className="deadline-picker-preview">{formatDeadline(year, month, Math.min(day, dayCount), hour, minute === 60 ? 55 : minute)}</strong>
    </div>
  )
}
