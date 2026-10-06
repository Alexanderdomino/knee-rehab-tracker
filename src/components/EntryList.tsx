import { Link } from 'react-router'
import { STREAM_UNIT, type Entry } from '../domain'
import { entryLoad, entrySummary } from '../lib/entries'
import { useData } from '../state/data'
import { Icon } from './Icon'

export function EntryList({ entries }: { entries: Entry[] }) {
  const { settings } = useData()
  if (!entries.length) return null
  return (
    <ul className="divide-y divide-stone-200 dark:divide-stone-800" data-testid="entry-list">
      {entries.map((e) => (
        <li key={e.id}>
          <Link to={`/entry/${e.id}`} className="flex min-h-14 items-center gap-3 py-2" data-testid="entry-row">
            <div className="flex-1">
              <p className="font-semibold">{e.activityName}</p>
              <p className="text-sm text-stone-600 dark:text-stone-400">
                {entrySummary(e)}
                {e.painDuring != null && ` · pain ${e.painDuring}`}
                {e.painNextMorning != null && ` · next AM ${e.painNextMorning}`}
                {e.swelling !== 'none' && ` · ${e.swelling} swelling`}
              </p>
            </div>
            <span className="text-right">
              <span className="block text-lg font-bold tabular-nums">
                {Math.round(entryLoad(e, settings.activityTypes).value).toLocaleString('en-US')}
              </span>
              <span className="block text-xs text-stone-500">{STREAM_UNIT[entryLoad(e).stream]}</span>
            </span>
            <Icon name="chevron" className="text-stone-400" />
          </Link>
        </li>
      ))}
    </ul>
  )
}
