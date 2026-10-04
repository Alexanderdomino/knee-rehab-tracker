import { useNavigate } from 'react-router'
import { addDays, formatLong, pointAt } from '../domain'
import { entrySummary, latestEntry } from '../lib/entries'
import { clearDayPain, setDayPain, setNextMorningPain } from '../data/repo'
import { EntryList } from '../components/EntryList'
import { Icon } from '../components/Icon'
import { PainScale } from '../components/PainScale'
import { StatusCard } from '../components/StatusCard'
import { useData } from '../state/data'
import { useWrite } from '../state/toast'

export function Today() {
  const { uid, today, days, entries, settings, series, guidance, loading } = useData()
  const navigate = useNavigate()
  const write = useWrite()
  const todayPain = days.find((d) => d.date === today)?.pain ?? null
  const todays = pointAt(series, today)?.entries ?? []
  const yesterday = addDays(today, -1)
  const missingNextMorning = entries.filter((e) => e.date === yesterday && e.painNextMorning == null)
  const last = latestEntry(entries)

  if (loading) return <p className="py-10 text-center text-stone-500">Loading…</p>

  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm text-stone-500 dark:text-stone-400">{formatLong(today)}</p>
        <h1 className="text-2xl font-bold">Today</h1>
      </header>

      <StatusCard guidance={guidance} />

      {missingNextMorning.length > 0 && (
        <section className="card ring-2 ring-teal-600/40" data-testid="next-morning-prompt">
          <h2 className="font-semibold">How does your knee feel this morning?</h2>
          <p className="mb-3 text-sm text-stone-600 dark:text-stone-400">
            Next-morning pain after yesterday’s {missingNextMorning.map((e) => e.activityName).join(' & ')}.
          </p>
          <PainScale
            value={null}
            settings={settings}
            label="Next-morning pain"
            size="md"
            onChange={(v) => {
              if (v === null) return
              for (const e of missingNextMorning) write(setNextMorningPain(uid, e.id, v))
            }}
          />
        </section>
      )}

      <section className="card">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Knee pain today</h2>
          <span className="text-sm text-stone-500">{todayPain === null ? 'Not logged' : 'Tap again to clear'}</span>
        </div>
        <PainScale
          value={todayPain}
          settings={settings}
          label="Daily pain"
          allowClear
          testId="daily-pain"
          onChange={(v) => write(v === null ? clearDayPain(uid, today) : setDayPain(uid, today, v))}
        />
      </section>

      <section className="card">
        <h2 className="mb-3 text-lg font-semibold">Log a session</h2>
        <div className="grid grid-cols-2 gap-2">
          {settings.activityTypes.map((t) => (
            <button
              key={t.id}
              type="button"
              className="btn-secondary min-h-14 justify-start text-left leading-tight"
              onClick={() => navigate(`/entry/new?type=${encodeURIComponent(t.id)}`)}
            >
              <Icon name="plus" className="shrink-0" />
              {t.name}
            </button>
          ))}
        </div>
        {last && (
          <button
            type="button"
            className="btn-primary mt-3 w-full min-h-14 flex-col gap-0"
            onClick={() => navigate('/entry/new?repeat=1')}
            data-testid="repeat-last"
          >
            <span className="flex items-center gap-2">
              <Icon name="repeat" /> Repeat last session
            </span>
            <span className="text-xs font-normal opacity-90">
              {last.activityName} · {entrySummary(last)}
            </span>
          </button>
        )}
      </section>

      {todays.length > 0 && (
        <section className="card">
          <h2 className="text-lg font-semibold">Today’s sessions</h2>
          <EntryList entries={todays} />
        </section>
      )}
    </div>
  )
}
