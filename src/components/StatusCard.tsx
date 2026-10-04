import { useState } from 'react'
import type { Guidance } from '../domain'
import { Icon } from './Icon'

const STYLE = {
  GREEN: { box: 'bg-green-50 ring-green-300 dark:bg-green-950/40 dark:ring-green-800', badge: 'bg-zone-green text-white', icon: 'check' },
  AMBER: { box: 'bg-amber-50 ring-amber-300 dark:bg-amber-950/40 dark:ring-amber-800', badge: 'bg-zone-amber text-stone-950', icon: 'pause' },
  RED: { box: 'bg-red-50 ring-red-300 dark:bg-red-950/40 dark:ring-red-800', badge: 'bg-zone-red text-white', icon: 'down' },
} as const

const STATE_LABEL = { fired: 'Triggered', ok: 'OK', insufficient: 'Not enough data yet' }

export function StatusCard({ guidance }: { guidance: Guidance }) {
  const [open, setOpen] = useState(false)
  const st = STYLE[guidance.status]
  return (
    <section
      className={`rounded-2xl p-4 ring-1 ${st.box}`}
      data-testid="status-card"
      data-status={guidance.status}
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${st.badge}`}>
          <Icon name={st.icon} width={24} height={24} strokeWidth={2.5} />
        </span>
        <div>
          <p className="text-xs font-bold tracking-wider text-stone-600 uppercase dark:text-stone-300">{guidance.status}</p>
          <h2 className="text-xl leading-tight font-bold" data-testid="status-headline">
            {guidance.headline}
          </h2>
        </div>
      </div>

      <ul className="mt-3 space-y-1.5 text-[15px] leading-snug" data-testid="status-reasons">
        {guidance.reasons.map((r) => (
          <li key={r} className="flex gap-2">
            <span aria-hidden="true">•</span>
            <span>{r}</span>
          </li>
        ))}
      </ul>

      <div className="mt-3 rounded-xl bg-white/70 p-3 dark:bg-black/20">
        <p className="text-xs font-semibold text-stone-600 uppercase dark:text-stone-400">Suggested load, next 7 days</p>
        <p className="text-2xl font-bold tabular-nums" data-testid="status-target">
          {guidance.target.label} <span className="text-sm font-medium text-stone-600 dark:text-stone-400">load units</span>
        </p>
        <p className="text-sm text-stone-600 dark:text-stone-400">{guidance.target.explanation}</p>
      </div>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mt-2 min-h-11 text-sm font-semibold text-stone-700 underline underline-offset-2 dark:text-stone-300"
        aria-expanded={open}
      >
        {open ? 'Hide' : 'Show'} all rules{guidance.dataNotes.length ? ` (${guidance.dataNotes.length} need more data)` : ''}
      </button>
      {open && (
        <ul className="mt-1 space-y-2 text-sm">
          {guidance.checks.map((c) => (
            <li key={c.id} className="rounded-lg bg-white/60 p-2 dark:bg-black/20">
              <span
                className={`mr-2 rounded px-1.5 py-0.5 text-xs font-bold ${
                  c.state === 'fired'
                    ? c.level === 'RED'
                      ? 'bg-zone-red text-white'
                      : 'bg-zone-amber text-stone-950'
                    : c.state === 'ok'
                      ? 'bg-stone-200 text-stone-800 dark:bg-stone-700 dark:text-stone-100'
                      : 'bg-stone-100 text-stone-500 ring-1 ring-stone-300 ring-dashed dark:bg-stone-800 dark:text-stone-400'
                }`}
              >
                {c.state === 'fired' && (c.id === 'green-streak' || c.id === 'acwr-in-range') ? 'Not met' : STATE_LABEL[c.state]}
              </span>
              {c.message}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-xs text-stone-600 dark:text-stone-400">
        Guidance is based on your own thresholds — check them with your physio.
      </p>
    </section>
  )
}
