import { useMemo, useState } from 'react'
import {
  acwrSeries,
  formatLong,
  formatShort,
  greenStreaks,
  loadVsNextDayPain,
  painZone,
  statusTimeline,
  weeklySummaries,
  type WeekSummary,
} from '../domain'
import { AcwrChart, BreakdownChart, LoadPainChart, ToleranceChart } from '../components/charts'
import { PageHeader } from '../components/Layout'
import { Segmented } from '../components/PainScale'
import { SERIES, STATUS_ZONE, ZONE_FILL } from '../components/zone'
import { useData } from '../state/data'

type Range = '4w' | '12w' | 'all'
const RANGE_DAYS: Record<Range, number> = { '4w': 28, '12w': 84, all: Infinity }

export function Stats() {
  const { series, settings, loading } = useData()
  const [range, setRange] = useState<Range>('4w')

  const acwr = useMemo(() => acwrSeries(series), [series])
  const weeks = useMemo(() => weeklySummaries(series, settings), [series, settings])
  const tolerance = useMemo(() => loadVsNextDayPain(series, settings), [series, settings])
  const streaks = useMemo(() => greenStreaks(series, settings), [series, settings])
  const timeline = useMemo(() => statusTimeline(series, settings), [series, settings])

  if (loading) return <p className="py-10 text-center text-stone-500">Loading…</p>
  if (series.length === 0) {
    return (
      <div>
        <PageHeader title="Statistics" />
        <p className="card text-stone-600 dark:text-stone-400">No data yet — log some pain scores and sessions first.</p>
      </div>
    )
  }

  const n = Math.min(series.length, RANGE_DAYS[range])
  const daily = series.slice(-n)
  const acwrVisible = acwr.slice(-n)
  const firstVisible = daily[0].date
  // Weeks that overlap the visible range
  const weeksVisible = weeks.filter((w) => w.weekStart > addWeek(firstVisible, -1))

  // Stable colour per activity: settings order first, then any legacy names.
  const typeNames = [...settings.activityTypes.map((t) => t.name)]
  for (const w of weeks) for (const k of Object.keys(w.loadByType)) if (!typeNames.includes(k)) typeNames.push(k)
  const usedTypes = typeNames.filter((name) => weeksVisible.some((w) => (w.loadByType[name] ?? 0) > 0))

  return (
    <div className="space-y-4">
      <PageHeader title="Statistics" />
      <Segmented
        label="Range"
        value={range}
        onChange={setRange}
        options={[
          { value: '4w', label: '4 weeks' },
          { value: '12w', label: '12 weeks' },
          { value: 'all', label: 'All' },
        ]}
      />

      <section className="grid grid-cols-2 gap-3" data-testid="streaks">
        <div className="card">
          <p className="text-xs font-semibold text-stone-500 uppercase">Current green streak</p>
          <p className="text-3xl font-bold tabular-nums" data-testid="streak-current">{streaks.current}</p>
          <p className="text-xs text-stone-500">logged days</p>
        </div>
        <div className="card">
          <p className="text-xs font-semibold text-stone-500 uppercase">Longest green streak</p>
          <p className="text-3xl font-bold tabular-nums" data-testid="streak-longest">{streaks.longest}</p>
          <p className="text-xs text-stone-500">logged days</p>
        </div>
        <p className="col-span-2 -mt-1 text-xs text-stone-500">Days you didn’t log are skipped — they don’t extend or break a streak.</p>
      </section>

      <section className="card">
        <h2 className="section-title">Load & pain</h2>
        <LoadPainChart data={daily} settings={settings} />
      </section>

      <section className="card">
        <h2 className="section-title">Weekly summary</h2>
        <WeeklyTable weeks={[...weeksVisible].reverse()} />
      </section>

      <section className="card">
        <h2 className="section-title">Acute vs chronic load</h2>
        <AcwrChart data={acwrVisible} settings={settings} />
        {series.length < 28 && <p className="mt-2 text-xs text-stone-500">ACWR needs 28 days of history — not enough data yet ({series.length} days).</p>}
      </section>

      <section className="card">
        <h2 className="section-title">Load vs next-day pain</h2>
        <ToleranceChart t={tolerance} settings={settings} />
        <p className="mt-2 text-sm text-stone-700 dark:text-stone-300" data-testid="tolerance-summary">
          {tolerance.points.length === 0
            ? 'Not enough data yet: needs days followed by a logged pain score.'
            : tolerance.greenRange
              ? <>
                  Next-day pain stayed green after loads of <b>{tolerance.greenRange.min}–{tolerance.greenRange.max}</b>.
                  {tolerance.safeUpTo !== null && <> Every day with load up to <b>{tolerance.safeUpTo}</b> was followed by green pain (shaded).</>}
                </>
              : 'Next-day pain has not been green after any logged day yet.'}
        </p>
        <p className="mt-1 text-xs text-stone-500">Only pairs where the next day has a logged pain score are shown.</p>
      </section>

      <section className="card">
        <h2 className="section-title">Load by activity per week</h2>
        {usedTypes.length ? <BreakdownChart weeks={weeksVisible} types={usedTypes} /> : <p className="text-sm text-stone-500">No sessions in this range.</p>}
        {usedTypes.length > SERIES.length && <p className="text-xs text-stone-500">Colours repeat after {SERIES.length} activity types.</p>}
      </section>

      <section className="card">
        <h2 className="section-title">Status changes</h2>
        <ol className="space-y-3" data-testid="timeline">
          {[...timeline].reverse().map((c) => (
            <li key={c.date} className="flex gap-3">
              <span className={`mt-0.5 h-fit shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${ZONE_FILL[STATUS_ZONE[c.status]]}`}>{c.status}</span>
              <div className="text-sm">
                <p className="font-semibold">
                  {formatLong(c.date)}
                  {c.from && <span className="font-normal text-stone-500"> · from {c.from}</span>}
                </p>
                <ul className="text-stone-600 dark:text-stone-400">
                  {c.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}

function addWeek(date: string, n: number) {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 7 * n)
  return d.toISOString().slice(0, 10)
}

function WeeklyTable({ weeks }: { weeks: WeekSummary[] }) {
  const { settings } = useData()
  const bad = 'bg-red-100 text-red-900 font-bold dark:bg-red-950 dark:text-red-200'
  const warn = 'bg-amber-100 text-amber-900 font-bold dark:bg-amber-950 dark:text-amber-200'
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[520px] text-sm tabular-nums" data-testid="weekly-table">
        <thead>
          <tr className="text-left text-xs text-stone-500">
            <th className="py-1 pr-2 font-semibold">Week of</th>
            <th className="px-1 text-right font-semibold">Load</th>
            <th className="px-1 text-right font-semibold">WoW</th>
            <th className="px-1 text-right font-semibold">Avg pain</th>
            <th className="px-1 text-right font-semibold">Max pain</th>
            <th className="px-1 text-right font-semibold">Days &gt; {settings.painThreshold}</th>
            <th className="px-1 text-right font-semibold">Logged</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => {
            const avgZone = painZone(w.avgPain, settings)
            return (
              <tr key={w.weekStart} className="border-t border-stone-200 dark:border-stone-800">
                <td className="py-2 pr-2">{formatShort(w.weekStart)}</td>
                <td className="px-1 text-right">{Math.round(w.totalLoad)}</td>
                <td className={`px-1 text-right ${w.wowPct !== null && w.wowPct > settings.maxWeeklyIncreasePct ? bad : ''}`} title={w.wowPct !== null && w.wowPct > settings.maxWeeklyIncreasePct ? `Above max +${settings.maxWeeklyIncreasePct}%` : undefined}>
                  {w.wowPct === null ? '–' : `${w.wowPct > 0 ? '+' : ''}${Math.round(w.wowPct)}%`}
                </td>
                <td className={`px-1 text-right ${avgZone === 'red' ? bad : avgZone === 'amber' ? warn : ''}`}>{w.avgPain.toFixed(1)}</td>
                <td className={`px-1 text-right ${w.maxPain > settings.painThreshold ? bad : ''}`}>{w.maxPain}</td>
                <td className={`px-1 text-right ${w.daysOverThreshold > 0 ? bad : ''}`}>{w.daysOverThreshold}</td>
                <td className="px-1 text-right">
                  {w.daysLogged}/7{w.daysInRange < 7 && <span className="text-xs text-stone-500"> ({w.daysInRange} in range)</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-stone-500">Highlighted cells broke a rule. Average pain counts unlogged days as 0.</p>
    </div>
  )
}
