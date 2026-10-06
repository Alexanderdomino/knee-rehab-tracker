import { useMemo, useState } from 'react'
import {
  acwrSeries,
  formatLoad,
  formatLong,
  formatShort,
  greenStreaks,
  loadVsNextDayPain,
  painZone,
  statusTimeline,
  STREAM_LABEL,
  STREAM_UNIT,
  weeklySummaries,
  type LoadStream,
  type WeekSummary,
} from '../domain'
import { AcwrChart, BreakdownChart, LoadPainChart, ToleranceChart } from '../components/charts'
import { PageHeader } from '../components/Layout'
import { Segmented } from '../components/PainScale'
import { SERIES, STATUS_ZONE, ZONE_FILL } from '../components/zone'
import { useData } from '../state/data'

type Range = '4w' | '12w' | 'all'
const RANGE_DAYS: Record<Range, number> = { '4w': 28, '12w': 84, all: Infinity }

/** Show the `n` largest keys and fold the rest into "Other" (keeps colours to the fixed palette). */
function topKeys(totals: Record<string, number>, n: number): string[] {
  return Object.entries(totals)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k)
}

function foldRows(weeks: WeekSummary[], pick: (w: WeekSummary) => Record<string, number>, keys: string[]) {
  return weeks.map((w) => {
    const values: Record<string, number> = {}
    for (const [k, v] of Object.entries(pick(w))) {
      const key = keys.includes(k) ? k : 'Other'
      values[key] = (values[key] ?? 0) + v
    }
    return { week: w.weekStart, values }
  })
}

function StreamToggle({ streams, value, onChange }: { streams: LoadStream[]; value: LoadStream; onChange: (s: LoadStream) => void }) {
  if (streams.length < 2) return null
  return (
    <div className="mb-3">
      <Segmented
        label="Load type"
        value={value}
        onChange={onChange}
        options={streams.map((s) => ({ value: s, label: `${STREAM_LABEL[s]} (${STREAM_UNIT[s]})` }))}
      />
    </div>
  )
}

export function Stats() {
  const { series, settings, loading } = useData()
  const [range, setRange] = useState<Range>('4w')

  // Streams that have any data at all; keeps panels stable when switching range.
  const streams = useMemo(() => {
    const out: LoadStream[] = []
    if (series.some((p) => p.strengthLoad > 0)) out.push('strength')
    if (series.some((p) => p.cardioLoad > 0)) out.push('cardio')
    return out
  }, [series])
  const [acwrPick, setAcwrStream] = useState<LoadStream | null>(null)
  const [tolerancePick, setToleranceStream] = useState<LoadStream | null>(null)
  const acwrStream = acwrPick && streams.includes(acwrPick) ? acwrPick : (streams[0] ?? 'strength')
  const toleranceStream = tolerancePick && streams.includes(tolerancePick) ? tolerancePick : (streams[0] ?? 'strength')

  const acwr = useMemo(() => acwrSeries(series, acwrStream), [series, acwrStream])
  const weeks = useMemo(() => weeklySummaries(series, settings), [series, settings])
  const tolerance = useMemo(() => loadVsNextDayPain(series, settings, toleranceStream), [series, settings, toleranceStream])
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
  const cardioTotals: Record<string, number> = {}
  const exerciseTotals: Record<string, number> = {}
  for (const w of weeksVisible) {
    for (const [k, v] of Object.entries(w.cardioByType)) cardioTotals[k] = (cardioTotals[k] ?? 0) + v
    for (const [k, v] of Object.entries(w.tonnageByExercise)) exerciseTotals[k] = (exerciseTotals[k] ?? 0) + v
  }
  const cardioTypes = settings.activityTypes.map((t) => t.name).filter((name) => (cardioTotals[name] ?? 0) > 0)
  for (const k of Object.keys(cardioTotals)) if (!cardioTypes.includes(k) && cardioTotals[k] > 0) cardioTypes.push(k)
  const cardioKeys = cardioTypes.slice(0, SERIES.length - 1)
  // Biggest exercises get their own colour; sorted by name so a colour stays with its exercise.
  const exerciseKeys = topKeys(exerciseTotals, SERIES.length - 1).sort((a, b) => a.localeCompare(b))
  const withOther = (keys: string[], all: string[]) => (all.length > keys.length ? [...keys, 'Other'] : keys)

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
        <LoadPainChart data={daily} settings={settings} streams={streams} />
        <p className="mt-2 text-xs text-stone-500">Strength load = sets × reps × kg (holds: seconds ÷ 3 count as reps). Cardio load = minutes × the activity’s knee-load factor (knee-min).</p>
      </section>

      <section className="card">
        <h2 className="section-title">Weekly summary</h2>
        <WeeklyTable weeks={[...weeksVisible].reverse()} />
      </section>

      {streams.length > 0 && (
        <section className="card">
          <h2 className="section-title">Acute vs chronic load</h2>
          <StreamToggle streams={streams} value={acwrStream} onChange={setAcwrStream} />
          <AcwrChart data={acwrVisible} settings={settings} stream={acwrStream} />
          {series.length < 28 && <p className="mt-2 text-xs text-stone-500">ACWR needs 28 days of history — not enough data yet ({series.length} days).</p>}
        </section>
      )}

      {streams.length > 0 && (
        <section className="card">
          <h2 className="section-title">Load vs next-day pain</h2>
          <StreamToggle streams={streams} value={toleranceStream} onChange={setToleranceStream} />
          <ToleranceChart t={tolerance} settings={settings} stream={toleranceStream} />
          <p className="mt-2 text-sm text-stone-700 dark:text-stone-300" data-testid="tolerance-summary">
            {tolerance.points.length === 0 ? (
              'Not enough data yet: needs days followed by a logged pain score.'
            ) : tolerance.greenRange ? (
              <>
                Next-day pain stayed green after {STREAM_LABEL[toleranceStream].toLowerCase()} loads of{' '}
                <b>
                  {Math.round(tolerance.greenRange.min).toLocaleString('en-US')}–{formatLoad(tolerance.greenRange.max, toleranceStream)}
                </b>
                .
                {tolerance.safeUpTo !== null && (
                  <>
                    {' '}
                    Every day up to <b>{formatLoad(tolerance.safeUpTo, toleranceStream)}</b> was followed by green pain (shaded).
                  </>
                )}
              </>
            ) : (
              'Next-day pain has not been green after any logged day yet.'
            )}
          </p>
          <p className="mt-1 text-xs text-stone-500">Only pairs where the next day has a logged pain score are shown.</p>
        </section>
      )}

      {exerciseKeys.length > 0 && (
        <section className="card">
          <h2 className="section-title">Strength by exercise per week (kg)</h2>
          <BreakdownChart
            rows={foldRows(weeksVisible, (w) => w.tonnageByExercise, exerciseKeys)}
            types={withOther(exerciseKeys, Object.keys(exerciseTotals).filter((k) => exerciseTotals[k] > 0))}
            unit="kg"
            testId="breakdown-strength"
          />
        </section>
      )}

      {cardioKeys.length > 0 && (
        <section className="card">
          <h2 className="section-title">Cardio by activity per week (knee-min)</h2>
          <BreakdownChart
            rows={foldRows(weeksVisible, (w) => w.cardioByType, cardioKeys)}
            types={withOther(cardioKeys, cardioTypes)}
            unit="knee-min"
            testId="breakdown-cardio"
          />
        </section>
      )}

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
  const over = (pct: number | null) => pct !== null && pct > settings.maxWeeklyIncreasePct
  const pctCell = (pct: number | null) => (pct === null ? '–' : `${pct > 0 ? '+' : ''}${Math.round(pct)}%`)
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[620px] text-sm tabular-nums" data-testid="weekly-table">
        <thead>
          <tr className="text-left text-xs text-stone-500">
            <th className="py-1 pr-2 font-semibold">Week of</th>
            <th className="px-1 text-right font-semibold">Strength kg</th>
            <th className="px-1 text-right font-semibold">WoW</th>
            <th className="px-1 text-right font-semibold">Cardio knee-min</th>
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
                <td className="px-1 text-right" data-testid="week-strength">{Math.round(w.strengthLoad).toLocaleString('en-US')}</td>
                <td className={`px-1 text-right ${over(w.strengthWowPct) ? bad : ''}`}>{pctCell(w.strengthWowPct)}</td>
                <td className="px-1 text-right" data-testid="week-cardio">{Math.round(w.cardioLoad)}</td>
                <td className={`px-1 text-right ${over(w.cardioWowPct) ? bad : ''}`}>{pctCell(w.cardioWowPct)}</td>
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
      <p className="mt-2 text-xs text-stone-500">Highlighted cells broke a rule (WoW above +{settings.maxWeeklyIncreasePct}%, pain over threshold). Average pain counts unlogged days as 0.</p>
    </div>
  )
}
