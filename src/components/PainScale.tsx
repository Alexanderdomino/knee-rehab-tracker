import { painZone, type Settings } from '../domain'
import { ZONE_FILL, ZONE_SOFT } from './zone'

interface Props {
  value: number | null
  onChange: (v: number | null) => void
  settings: Settings
  /** Accessible group label. */
  label: string
  /** Tap the selected value again to clear it. */
  allowClear?: boolean
  min?: number
  size?: 'lg' | 'md'
  testId?: string
}

/** Large 0–10 tap buttons coloured by pain zone. */
export function PainScale({ value, onChange, settings, label, allowClear, min = 0, size = 'lg', testId }: Props) {
  const values = Array.from({ length: 11 - min }, (_, i) => i + min)
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-6 gap-2" data-testid={testId}>
      {values.map((v) => {
        const zone = painZone(v, settings)
        const selected = value === v
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${label} ${v}`}
            onClick={() => onChange(selected && allowClear ? null : v)}
            className={`${size === 'lg' ? 'h-14 text-xl' : 'h-12 text-lg'} rounded-xl font-bold tabular-nums ring-1 transition active:scale-95 ${
              selected ? `${ZONE_FILL[zone]} ring-2 ring-stone-900 dark:ring-white` : ZONE_SOFT[zone]
            }`}
          >
            {v}
          </button>
        )
      })}
    </div>
  )
}

/** Neutral 1–10 scale (RPE). */
export function NumberScale({
  value,
  onChange,
  label,
  from = 1,
  to = 10,
  testId,
}: {
  value: number | null
  onChange: (v: number) => void
  label: string
  from?: number
  to?: number
  testId?: string
}) {
  const values = Array.from({ length: to - from + 1 }, (_, i) => i + from)
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-5 gap-2" data-testid={testId}>
      {values.map((v) => {
        const selected = value === v
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${label} ${v}`}
            onClick={() => onChange(v)}
            className={`h-12 rounded-xl text-lg font-bold tabular-nums ring-1 transition active:scale-95 ${
              selected
                ? 'bg-teal-700 text-white ring-2 ring-stone-900 dark:bg-teal-600 dark:ring-white'
                : 'bg-stone-100 text-stone-800 ring-stone-300 dark:bg-stone-800 dark:text-stone-100 dark:ring-stone-700'
            }`}
          >
            {v}
          </button>
        )
      })}
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-xl bg-stone-100 p-1 dark:bg-stone-800">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-11 flex-1 rounded-lg px-2 text-sm font-semibold transition ${
            value === o.value
              ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-600 dark:text-white'
              : 'text-stone-600 dark:text-stone-300'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
