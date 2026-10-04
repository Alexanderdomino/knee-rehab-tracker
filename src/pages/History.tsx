import { Link } from 'react-router'
import { formatLong, painZone, type DailyPoint, type Settings } from '../domain'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/Layout'
import { ZONE_FILL } from '../components/zone'
import { useData } from '../state/data'

export function History() {
  const { series, settings, loading } = useData()
  if (loading) return <p className="py-10 text-center text-stone-500">Loading…</p>
  const rows = [...series].reverse()
  return (
    <div>
      <PageHeader title="History" />
      {rows.length === 0 ? (
        <p className="card text-stone-600 dark:text-stone-400">Nothing logged yet. Log your knee pain on the Today screen to get started.</p>
      ) : (
        <ul className="space-y-2" data-testid="history-list">
          {rows.map((p) => (
            <HistoryRow key={p.date} p={p} settings={settings} />
          ))}
        </ul>
      )}
    </div>
  )
}

function HistoryRow({ p, settings }: { p: DailyPoint; settings: Settings }) {
  const zone = painZone(p.pain, settings)
  if (!p.logged) {
    return (
      <li>
        <Link
          to={`/day/${p.date}`}
          className="flex min-h-14 items-center gap-3 rounded-2xl border-2 border-dashed border-stone-300 px-4 py-2 text-stone-500 dark:border-stone-700 dark:text-stone-500"
          data-testid="history-row"
          data-date={p.date}
          data-logged="false"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed border-stone-300 text-sm font-semibold dark:border-stone-700">
            0
          </span>
          <span className="flex-1">
            <span className="block text-sm font-medium">{formatLong(p.date)}</span>
            <span className="block text-xs">Not logged · counted as pain 0, load 0</span>
          </span>
          <Icon name="plus" className="text-stone-400" />
        </Link>
      </li>
    )
  }
  return (
    <li>
      <Link
        to={`/day/${p.date}`}
        className="card flex min-h-16 items-center gap-3 py-3!"
        data-testid="history-row"
        data-date={p.date}
        data-logged="true"
      >
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-bold ${
            p.painLogged ? ZONE_FILL[zone] : 'bg-stone-200 text-stone-600 dark:bg-stone-700 dark:text-stone-300'
          }`}
          aria-label={p.painLogged ? `Pain ${p.pain}, ${zone} zone` : 'Pain not logged'}
          data-testid="history-pain"
        >
          {p.painLogged ? p.pain : '–'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{formatLong(p.date)}</span>
          <span className="block truncate text-sm text-stone-600 dark:text-stone-400">
            {p.entries.length ? p.entries.map((e) => e.activityName).join(', ') : 'Rest day'}
            {p.dailyPain === null && p.painLogged && ' · pain from session'}
            {p.swelling && p.swelling !== 'none' && ` · ${p.swelling} swelling`}
          </span>
        </span>
        <span className="text-right">
          <span className="block font-bold tabular-nums" data-testid="history-load">{p.load}</span>
          <span className="block text-xs text-stone-500">load</span>
        </span>
      </Link>
    </li>
  )
}
