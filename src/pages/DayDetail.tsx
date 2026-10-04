import { Link, useParams } from 'react-router'
import { formatLong, isISODate, pointAt } from '../domain'
import { clearDayPain, setDayPain } from '../data/repo'
import { EntryList } from '../components/EntryList'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/Layout'
import { PainScale } from '../components/PainScale'
import { useGoBack } from '../lib/useGoBack'
import { useData } from '../state/data'
import { useWrite } from '../state/toast'

export function DayDetail() {
  const { date = '' } = useParams()
  const goBack = useGoBack()
  const { uid, days, series, settings, today } = useData()
  const write = useWrite()
  if (!isISODate(date) || date > today) {
    return (
      <div>
        <PageHeader title="Invalid date" back={() => goBack('/history')} />
      </div>
    )
  }
  const pain = days.find((d) => d.date === date)?.pain ?? null
  const point = pointAt(series, date)
  const entries = point?.entries ?? []
  return (
    <div className="space-y-4">
      <PageHeader title={formatLong(date)} back={() => goBack('/history')} />
      {!point?.logged && (
        <p className="rounded-xl border-2 border-dashed border-stone-300 p-3 text-sm text-stone-600 dark:border-stone-700 dark:text-stone-400">
          Not logged — this day counts as pain 0 and load 0 in statistics, but never as a green day for progression.
        </p>
      )}
      <section className="card">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Daily knee pain</h2>
          <span className="text-sm text-stone-500">{pain === null ? 'Not logged' : 'Tap again to clear'}</span>
        </div>
        <PainScale
          value={pain}
          settings={settings}
          label="Daily pain"
          allowClear
          testId="day-pain"
          onChange={(v) => write(v === null ? clearDayPain(uid, date) : setDayPain(uid, date, v))}
        />
      </section>
      <section className="card">
        <h2 className="text-lg font-semibold">Sessions</h2>
        {entries.length === 0 && <p className="py-2 text-sm text-stone-500">No sessions.</p>}
        <EntryList entries={entries} />
        <Link to={`/entry/new?date=${date}`} className="btn-secondary mt-2 w-full">
          <Icon name="plus" /> Add session
        </Link>
      </section>
    </div>
  )
}
