import type { ReactNode } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import {
  formatLoad,
  formatLong,
  formatShort,
  painZone,
  STREAM_LABEL,
  STREAM_UNIT,
  type AcwrPoint,
  type DailyPoint,
  type LoadStream,
  type Settings,
  type ToleranceSummary,
} from '../domain'
import { SERIES, ZONE_HEX, ZONE_LABEL } from './zone'

/** Axis ticks: 12500 → "12.5k". */
const compact = (v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : `${Math.round(v * 10) / 10}`)
const INK = '#78716c'

function TipBox({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-700">{children}</div>
  )
}

const axisProps = { tickLine: false, axisLine: false, tick: { fontSize: 11 } } as const

interface DailyTipProps {
  active?: boolean
  payload?: { payload: DailyPoint }[]
}

function DailyTip({ active, payload }: DailyTipProps) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <TipBox>
      <p className="font-semibold">{formatLong(p.date)}</p>
      {p.logged ? (
        <>
          {p.strengthLoad > 0 && <p>Strength: {formatLoad(p.strengthLoad, 'strength')}</p>}
          {p.cardioLoad > 0 && <p>Cardio: {formatLoad(p.cardioLoad, 'cardio')}</p>}
          <p>Pain: {p.painLogged ? p.pain : '0 (pain not logged)'}</p>
        </>
      ) : (
        <p className="text-stone-500">Not logged — counted as pain 0, no load</p>
      )}
    </TipBox>
  )
}

const STREAM_COLOR: Record<LoadStream, string> = { strength: SERIES[0], cardio: SERIES[1] }

/**
 * Daily strength load (kg) and cardio load (min) as bars, and daily pain as a
 * line: stacked panels sharing the x-axis and tooltip, never a dual-axis chart.
 */
export function LoadPainChart({ data, settings, streams }: { data: DailyPoint[]; settings: Settings; streams: LoadStream[] }) {
  const interval = Math.max(0, Math.ceil(data.length / 7) - 1)
  return (
    <div data-testid="load-pain-chart">
      {streams.map((stream) => (
        <div key={stream} className="mb-2">
          <p className="mb-1 text-xs font-semibold text-stone-500">
            {stream === 'strength' ? 'Strength load per day (kg)' : 'Cardio per day (min)'}
          </p>
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={data} syncId="daily" margin={{ top: 4, right: 8, left: -8, bottom: 0 }} barCategoryGap={1}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" hide />
              <YAxis {...axisProps} width={52} allowDecimals={false} tickFormatter={compact} />
              <Tooltip content={<DailyTip />} cursor={{ fill: 'rgba(120,113,108,0.12)' }} />
              <Bar
                dataKey={stream === 'strength' ? 'strengthLoad' : 'cardioLoad'}
                name={STREAM_LABEL[stream]}
                fill={STREAM_COLOR[stream]}
                radius={[3, 3, 0, 0]}
                maxBarSize={18}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ))}
      <p className="mt-2 mb-1 text-xs font-semibold text-stone-500">Daily pain (0–10) with zones and threshold</p>
      <ResponsiveContainer width="100%" height={170}>
        <ComposedChart data={data} syncId="daily" margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
          <ReferenceArea y1={0} y2={settings.greenMax + 0.5} fill={ZONE_HEX.green} fillOpacity={0.1} ifOverflow="hidden" />
          <ReferenceArea y1={settings.greenMax + 0.5} y2={settings.amberMax + 0.5} fill={ZONE_HEX.amber} fillOpacity={0.14} ifOverflow="hidden" />
          <ReferenceArea y1={settings.amberMax + 0.5} y2={10} fill={ZONE_HEX.red} fillOpacity={0.1} ifOverflow="hidden" />
          <XAxis dataKey="date" {...axisProps} tickFormatter={formatShort} interval={interval} minTickGap={8} />
          <YAxis {...axisProps} width={52} domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} />
          <ReferenceLine
            y={settings.painThreshold}
            stroke={ZONE_HEX.red}
            strokeDasharray="5 4"
            label={{ value: `threshold ${settings.painThreshold}`, position: 'insideTopRight', fontSize: 10, fill: INK }}
          />
          <Tooltip content={<DailyTip />} />
          <Line
            dataKey="pain"
            name="Pain"
            stroke="currentColor"
            className="text-stone-700 dark:text-stone-200"
            strokeWidth={2}
            isAnimationActive={false}
            dot={(props: { cx?: number; cy?: number; payload?: DailyPoint; index?: number }) => {
              const { cx, cy, payload, index } = props
              if (cx == null || cy == null || !payload) return <g key={index} />
              return payload.painLogged ? (
                <circle key={index} cx={cx} cy={cy} r={3.5} fill={ZONE_HEX[painZone(payload.pain, settings)]} stroke="var(--color-white, #fff)" strokeWidth={1} />
              ) : (
                <circle key={index} cx={cx} cy={cy} r={3} fill="none" stroke={INK} strokeDasharray="2 1.5" strokeWidth={1.2} />
              )
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <ChartKey
        items={[
          { swatch: <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: ZONE_HEX.green }} />, label: 'Logged pain (zone colour)' },
          { swatch: <span className="inline-block h-2.5 w-2.5 rounded-full border border-dashed border-stone-500" />, label: 'Not logged (0)' },
          { swatch: <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: ZONE_HEX.red }} />, label: 'Pain threshold' },
        ]}
      />
    </div>
  )
}

function ChartKey({ items }: { items: { swatch: ReactNode; label: string }[] }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-600 dark:text-stone-400">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          {i.swatch}
          {i.label}
        </li>
      ))}
    </ul>
  )
}

interface AcwrTipProps {
  active?: boolean
  payload?: { payload: AcwrPoint }[]
  unit: string
}
function AcwrTip({ active, payload, unit }: AcwrTipProps) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  const f = (n: number | null, d = 0) => (n === null ? 'not enough data' : n.toFixed(d))
  return (
    <TipBox>
      <p className="font-semibold">{formatLong(p.date)}</p>
      <p>Acute (7-day avg): {f(p.acute)} {p.acute !== null && unit}</p>
      <p>Chronic (28-day avg): {f(p.chronic)} {p.chronic !== null && unit}</p>
      <p>ACWR: {f(p.acwr, 2)}</p>
    </TipBox>
  )
}

export function AcwrChart({ data, settings, stream }: { data: AcwrPoint[]; settings: Settings; stream: LoadStream }) {
  const interval = Math.max(0, Math.ceil(data.length / 7) - 1)
  const maxRatio = Math.max(2, ...data.map((d) => d.acwr ?? 0))
  return (
    <div data-testid="acwr-chart">
      <p className="mb-1 text-xs font-semibold text-stone-500">Rolling average daily {STREAM_LABEL[stream].toLowerCase()} load ({STREAM_UNIT[stream]})</p>
      <ResponsiveContainer width="100%" height={150}>
        <LineChart data={data} syncId="acwr" margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="date" hide />
          <YAxis {...axisProps} width={52} tickFormatter={compact} />
          <Tooltip content={<AcwrTip unit={STREAM_UNIT[stream]} />} />
          <Legend verticalAlign="top" height={22} iconType="plainline" wrapperStyle={{ fontSize: 11 }} />
          <Line dataKey="acute" name="Acute (7 d)" stroke={SERIES[0]} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
          <Line dataKey="chronic" name="Chronic (28 d)" stroke={SERIES[1]} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
      <p className="mt-2 mb-1 text-xs font-semibold text-stone-500">
        Acute:chronic ratio (green band = your limits {settings.acwrLower}–{settings.acwrUpper})
      </p>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={data} syncId="acwr" margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
          <ReferenceArea y1={settings.acwrLower} y2={settings.acwrUpper} fill={ZONE_HEX.green} fillOpacity={0.12} />
          <ReferenceLine y={settings.acwrUpper} stroke={ZONE_HEX.red} strokeDasharray="5 4" />
          <ReferenceLine y={settings.acwrLower} stroke={INK} strokeDasharray="5 4" />
          <XAxis dataKey="date" {...axisProps} tickFormatter={formatShort} interval={interval} minTickGap={8} />
          <YAxis {...axisProps} width={52} domain={[0, Math.ceil(maxRatio * 2) / 2]} />
          <Tooltip content={<AcwrTip unit={STREAM_UNIT[stream]} />} />
          <Line dataKey="acwr" name="ACWR" stroke="currentColor" className="text-stone-700 dark:text-stone-200" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

interface ScatterTipProps {
  active?: boolean
  payload?: { payload: { date: string; load: number; nextDayPain: number } }[]
  stream: LoadStream
}
function ScatterTip({ active, payload, stream }: ScatterTipProps) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <TipBox>
      <p className="font-semibold">{formatLong(p.date)}</p>
      <p>{STREAM_LABEL[stream]}: {formatLoad(p.load, stream)}</p>
      <p>Next-day pain: {p.nextDayPain}</p>
    </TipBox>
  )
}

export function ToleranceChart({ t, settings, stream }: { t: ToleranceSummary; settings: Settings; stream: LoadStream }) {
  const groups = (['green', 'amber', 'red'] as const).map((z) => ({
    zone: z,
    points: t.points.filter((p) => painZone(p.nextDayPain, settings) === z),
  }))
  return (
    <div data-testid="tolerance-chart">
      <ResponsiveContainer width="100%" height={220}>
        <ScatterChart margin={{ top: 8, right: 8, left: -8, bottom: 8 }}>
          <CartesianGrid />
          {t.safeUpTo !== null && t.safeUpTo > 0 && (
            <ReferenceArea x1={0} x2={t.safeUpTo} fill={ZONE_HEX.green} fillOpacity={0.1} />
          )}
          <XAxis type="number" dataKey="load" name="Load" {...axisProps} tickFormatter={compact} label={{ value: `${STREAM_LABEL[stream]} that day (${STREAM_UNIT[stream]})`, position: 'insideBottom', offset: -4, fontSize: 11 }} />
          <YAxis type="number" dataKey="nextDayPain" name="Next-day pain" {...axisProps} width={52} domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} />
          <ZAxis range={[60, 60]} />
          <ReferenceLine y={settings.painThreshold} stroke={ZONE_HEX.red} strokeDasharray="5 4" />
          <Tooltip content={<ScatterTip stream={stream} />} />
          {groups.map((g) => (
            <Scatter key={g.zone} name={`Next-day ${ZONE_LABEL[g.zone].toLowerCase()}`} data={g.points} fill={ZONE_HEX[g.zone]} stroke="#fff" strokeWidth={1} isAnimationActive={false} />
          ))}
          <Legend verticalAlign="top" height={22} wrapperStyle={{ fontSize: 11 }} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Stacked weekly bars, one segment per key (activity or exercise). */
export function BreakdownChart({
  rows,
  types,
  unit,
  testId,
}: {
  rows: { week: string; values: Record<string, number> }[]
  types: string[]
  unit: string
  testId: string
}) {
  const data = rows.map((r) => ({ week: r.week, ...r.values }))
  return (
    <div data-testid={testId}>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: -8, bottom: 0 }} barCategoryGap="20%">
          <CartesianGrid vertical={false} />
          <XAxis dataKey="week" {...axisProps} tickFormatter={formatShort} minTickGap={8} />
          <YAxis {...axisProps} width={52} allowDecimals={false} tickFormatter={compact} />
          <Tooltip
            labelFormatter={(l) => `Week of ${formatShort(String(l))}`}
            formatter={(v) => `${Math.round(Number(v)).toLocaleString('en-US')} ${unit}`}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
            cursor={{ fill: 'rgba(120,113,108,0.12)' }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {types.map((name, i) => (
            <Bar
              key={name}
              dataKey={name}
              stackId="load"
              fill={SERIES[i % SERIES.length]}
              stroke="var(--chart-gap, #fff)"
              strokeWidth={1}
              isAnimationActive={false}
              radius={i === types.length - 1 ? [3, 3, 0, 0] : 0}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
