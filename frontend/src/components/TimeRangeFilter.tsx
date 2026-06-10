import { timeRangeOptions, type TimeRangeKey } from '../utils/timeRangeFilter'

type TimeRangeFilterProps = {
  value: TimeRangeKey
  onChange: (value: TimeRangeKey) => void
  label?: string
}

export function TimeRangeFilter({ value, onChange, label = '时间筛选' }: TimeRangeFilterProps) {
  return (
    <div className="time-range-filter" aria-label={label}>
      <span>{label}</span>
      <div role="group" aria-label={label}>
        {timeRangeOptions.map((option) => (
          <button
            key={option.key}
            type="button"
            className={value === option.key ? 'is-active' : ''}
            onClick={() => onChange(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
