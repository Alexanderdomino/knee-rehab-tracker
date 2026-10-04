import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  buildDailySeries,
  evaluateGuidance,
  todayISO,
  withDefaults,
  type DailyPoint,
  type DayLog,
  type Entry,
  type Guidance,
  type ISODate,
  type Settings,
} from '../domain'
import { subscribeDays, subscribeEntries, subscribeSettings } from '../data/repo'
import { useAuth } from './auth'

interface DataState {
  uid: string
  loading: boolean
  error: string | null
  today: ISODate
  days: DayLog[]
  entries: Entry[]
  settings: Settings
  /** Gap-filled daily series from first log to today. */
  series: DailyPoint[]
  guidance: Guidance
}

const DataContext = createContext<DataState | null>(null)

/** Current local date, refreshed every minute and when the app regains focus. */
function useToday(): ISODate {
  const [today, setToday] = useState(todayISO())
  useEffect(() => {
    const tick = () => setToday(todayISO())
    const id = window.setInterval(tick, 60_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])
  return today
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const uid = user!.uid
  const today = useToday()
  const [days, setDays] = useState<DayLog[] | null>(null)
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [rawSettings, setRawSettings] = useState<Partial<Settings> | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onError = (e: Error) => setError(e.message)
    const unsubs = [
      subscribeDays(uid, setDays, onError),
      subscribeEntries(uid, setEntries, onError),
      subscribeSettings(uid, setRawSettings, onError),
    ]
    return () => unsubs.forEach((u) => u())
  }, [uid])

  const settings = useMemo(() => withDefaults(rawSettings), [rawSettings])
  const series = useMemo(() => buildDailySeries(days ?? [], entries ?? [], today), [days, entries, today])
  const guidance = useMemo(() => evaluateGuidance(series, settings), [series, settings])

  const value: DataState = {
    uid,
    loading: days === null || entries === null || rawSettings === undefined,
    error,
    today,
    days: days ?? [],
    entries: entries ?? [],
    settings,
    series,
    guidance,
  }
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): DataState {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used inside DataProvider')
  return ctx
}
