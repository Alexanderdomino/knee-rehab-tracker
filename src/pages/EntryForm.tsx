import { useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { formatLoad, formatLong, isISODate, tonnage, type ActivityType, type Entry, type Exercise, type Settings, type Swelling } from '../domain'
import { addEntry, deleteEntry, updateEntry, type EntryInput } from '../data/repo'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/Layout'
import { PainScale, Segmented } from '../components/PainScale'
import { latestEntry } from '../lib/entries'
import { useGoBack } from '../lib/useGoBack'
import { useData } from '../state/data'
import { useToast, useWrite } from '../state/toast'

interface ExerciseDraft {
  name: string
  sets: string
  reps: string
  loadKg: string
  /** Isometric hold: `holdSec` replaces reps. */
  hold: boolean
  holdSec: string
}

interface Draft {
  date: string
  activityTypeId: string
  durationMin: string
  distanceKm: string
  exercises: ExerciseDraft[]
  painDuring: number | null
  painNextMorning: number | null
  swelling: Swelling
  notes: string
}

const DURATIONS = [15, 20, 30, 45, 60, 90]
const num = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(',', '.')))
const str = (n: number | null | undefined) => (n === null || n === undefined || Number.isNaN(n) ? '' : String(n))
const toExerciseDraft = (x: Exercise): ExerciseDraft => ({
  name: x.name,
  sets: str(x.sets),
  reps: x.holdSec ? '10' : str(x.reps),
  loadKg: str(x.loadKg),
  hold: !!x.holdSec,
  holdSec: x.holdSec ? str(x.holdSec) : '30',
})
const blankExercise = (): ExerciseDraft => ({ name: '', sets: '3', reps: '10', loadKg: '', hold: false, holdSec: '30' })

function draftFrom(e: Entry, overrides: Partial<Draft> = {}): Draft {
  return {
    date: e.date,
    activityTypeId: e.activityTypeId,
    durationMin: e.kind === 'cardio' ? str(e.durationMin) : '30',
    distanceKm: str(e.distanceKm ?? null),
    exercises: (e.exercises ?? []).map(toExerciseDraft),
    painDuring: e.painDuring ?? null,
    painNextMorning: e.painNextMorning ?? null,
    swelling: e.swelling,
    notes: e.notes ?? '',
    ...overrides,
  }
}

export function EntryForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const { uid, entries, settings, today, loading } = useData()
  const existing = id ? entries.find((e) => e.id === id) ?? null : null

  if (loading) return <p className="py-10 text-center text-stone-500">Loading…</p>
  if (id && !existing) return <NotFound />
  return (
    <EntryFormInner
      key={id ?? 'new'}
      uid={uid}
      existing={existing}
      entries={entries}
      settings={settings}
      today={today}
      params={params}
    />
  )
}

function NotFound() {
  const goBack = useGoBack()
  return (
    <div>
      <PageHeader title="Entry not found" back={() => goBack()} />
      <p className="text-stone-600">This entry may have been deleted.</p>
    </div>
  )
}

function initialDraft(
  existing: Entry | null,
  entries: Entry[],
  types: ActivityType[],
  today: string,
  params: URLSearchParams,
): Draft {
  if (existing) return draftFrom(existing)
  const qDate = params.get('date')
  const date = qDate && isISODate(qDate) && qDate <= today ? qDate : today
  const fresh = { date, painDuring: null, painNextMorning: null, notes: '' }
  if (params.get('repeat')) {
    const last = latestEntry(entries)
    if (last) return draftFrom(last, fresh)
  }
  const typeId = params.get('type') ?? latestEntry(entries)?.activityTypeId ?? types[0]?.id ?? 'other'
  // Smart defaults: copy exercises / duration from the last session of this type.
  const lastOfType = latestEntry(entries, typeId)
  if (lastOfType) return draftFrom(lastOfType, { ...fresh, swelling: 'none' })
  const type = types.find((t) => t.id === typeId)
  const strength = type?.kind === 'strength'
  return {
    ...fresh,
    activityTypeId: typeId,
    durationMin: '30',
    distanceKm: '',
    exercises: strength ? [blankExercise()] : [],
    swelling: 'none',
  }
}

function EntryFormInner({
  uid,
  existing,
  entries,
  settings,
  today,
  params,
}: {
  uid: string
  existing: Entry | null
  entries: Entry[]
  settings: Settings
  today: string
  params: URLSearchParams
}) {
  const goBack = useGoBack()
  const toast = useToast()
  const write = useWrite()
  const types = settings.activityTypes
  const [d, setD] = useState<Draft>(() => initialDraft(existing, entries, types, today, params))
  const [errors, setErrors] = useState<string[]>([])
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((prev) => ({ ...prev, [k]: v }))

  // A deleted/renamed type still shows on old entries.
  const allTypes = useMemo(() => {
    if (types.some((t) => t.id === d.activityTypeId) || !existing) return types
    return [...types, { id: existing.activityTypeId, name: existing.activityName, kind: existing.kind }]
  }, [types, d.activityTypeId, existing])
  const type = allTypes.find((t) => t.id === d.activityTypeId) ?? allTypes[0]
  const strength = type?.kind === 'strength'

  const chooseType = (t: ActivityType) => {
    setD((prev) => {
      const next = { ...prev, activityTypeId: t.id }
      const lastOfType = latestEntry(entries, t.id)
      if (t.kind === 'strength') {
        if (prev.exercises.length === 0) {
          next.exercises = lastOfType?.exercises?.length ? lastOfType.exercises.map(toExerciseDraft) : [blankExercise()]
        }
      } else {
        // Don't carry one activity's distance over to another (e.g. a ride's km to a walk).
        next.distanceKm = lastOfType?.kind === 'cardio' ? str(lastOfType.distanceKm ?? null) : ''
        if (lastOfType?.kind === 'cardio' && lastOfType.durationMin) next.durationMin = str(lastOfType.durationMin)
      }
      return next
    })
  }

  const exercises: Exercise[] = d.exercises
    .filter((x) => x.name.trim() || x.loadKg.trim())
    .map((x) => ({
      name: x.name.trim() || 'Exercise',
      sets: num(x.sets) || 0,
      reps: x.hold ? 0 : num(x.reps) || 0,
      loadKg: num(x.loadKg) || 0,
      holdSec: x.hold ? num(x.holdSec) || 0 : null,
    }))
  const duration = num(d.durationMin)
  // Load preview: tonnage for strength, minutes for cardio.
  const loadLabel = strength
    ? formatLoad(tonnage(exercises), 'strength')
    : formatLoad(Number.isFinite(duration) ? duration : 0, 'cardio')

  const save = () => {
    const errs: string[] = []
    if (!type) errs.push('Choose an activity type.')
    if (!strength && (!Number.isFinite(duration) || duration <= 0 || duration > 1440)) errs.push('Duration must be 1–1440 minutes.')
    if (strength && exercises.length === 0) errs.push('Add at least one exercise.')
    if (strength && exercises.some((x) => x.holdSec != null && !(x.holdSec > 0))) errs.push('Hold time must be more than 0 seconds.')
    const dist = num(d.distanceKm)
    if (d.distanceKm.trim() && (!Number.isFinite(dist) || dist < 0 || dist > 1000)) errs.push('Distance must be 0–1000 km.')
    if (!isISODate(d.date)) errs.push('Pick a valid date.')
    else if (d.date > today) errs.push('Date can’t be in the future.')
    setErrors(errs)
    if (errs.length) return

    const input: EntryInput = {
      date: d.date,
      activityTypeId: type.id,
      activityName: type.name,
      kind: type.kind,
      durationMin: strength ? null : duration,
      distanceKm: strength || !d.distanceKm.trim() ? null : dist,
      exercises: strength ? exercises : [],
      painDuring: d.painDuring,
      painNextMorning: d.painNextMorning,
      swelling: d.swelling,
      notes: d.notes.trim(),
    }
    if (existing) {
      write(updateEntry(uid, existing.id, input))
      toast('Session updated')
    } else {
      write(addEntry(uid, input).done)
      toast(`${type.name} logged · ${loadLabel}`)
    }
    goBack(d.date === today ? '/' : `/day/${d.date}`)
  }

  const remove = () => {
    if (!existing || !window.confirm('Delete this session?')) return
    write(deleteEntry(uid, existing.id))
    toast('Session deleted')
    goBack(`/day/${existing.date}`)
  }

  return (
    <form
      className="space-y-4 pb-24"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <PageHeader title={existing ? 'Edit session' : 'Log session'} back={() => goBack()} />

      <section className="card space-y-2">
        <span className="label">Activity</span>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Activity">
          {allTypes.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={t.id === type?.id}
              onClick={() => chooseType(t)}
              className={`min-h-12 rounded-xl px-3 text-left text-sm font-semibold ring-1 ${
                t.id === type?.id
                  ? 'bg-teal-700 text-white ring-2 ring-stone-900 dark:bg-teal-600 dark:ring-white'
                  : 'bg-stone-100 ring-stone-300 dark:bg-stone-800 dark:ring-stone-700'
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
        <label className="block pt-1">
          <span className="label">Date</span>
          <input
            type="date"
            className="input"
            value={d.date}
            max={today}
            onChange={(e) => set('date', e.target.value)}
          />
        </label>
        {d.date !== today && isISODate(d.date) && <p className="text-sm text-stone-500">{formatLong(d.date)}</p>}
      </section>

      <section className="card space-y-3">
        {!strength && (
        <div>
          <label className="label" htmlFor="duration">
            Duration (min)
          </label>
          <div className="mb-2 grid grid-cols-6 gap-1.5">
            {DURATIONS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => set('durationMin', String(m))}
                className={`h-11 rounded-lg text-sm font-semibold ring-1 ${
                  d.durationMin === String(m)
                    ? 'bg-teal-700 text-white ring-teal-700 dark:bg-teal-600'
                    : 'bg-stone-100 ring-stone-300 dark:bg-stone-800 dark:ring-stone-700'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <input
            id="duration"
            className="input"
            inputMode="decimal"
            value={d.durationMin}
            onChange={(e) => set('durationMin', e.target.value)}
          />
        </div>
        )}

        {!strength && (
          <label className="block">
            <span className="label">Distance (km, optional)</span>
            <input
              className="input"
              inputMode="decimal"
              value={d.distanceKm}
              onChange={(e) => set('distanceKm', e.target.value)}
              placeholder="e.g. 12.5"
            />
          </label>
        )}

        {strength && (
          <div>
            <span className="label">Exercises — load = sets × reps × kg (a hold counts its seconds ÷ 3 as reps)</span>
            <div className="space-y-2">
              {d.exercises.map((x, i) => {
                const upd = <K extends keyof ExerciseDraft>(k: K, v: ExerciseDraft[K]) =>
                  set(
                    'exercises',
                    d.exercises.map((y, j) => (j === i ? { ...y, [k]: v } : y)),
                  )
                return (
                  <div key={i} className="rounded-xl bg-stone-50 p-2 ring-1 ring-stone-200 dark:bg-stone-950 dark:ring-stone-800" data-testid="exercise-row">
                    <div className="flex gap-2">
                      <input
                        className="input flex-1"
                        placeholder="Exercise"
                        aria-label={`Exercise ${i + 1} name`}
                        value={x.name}
                        onChange={(e) => upd('name', e.target.value)}
                      />
                      <button
                        type="button"
                        className="h-12 w-12 shrink-0 rounded-xl text-stone-500 ring-1 ring-stone-300 dark:ring-stone-700"
                        aria-label={`Remove exercise ${i + 1}`}
                        onClick={() => set('exercises', d.exercises.filter((_, j) => j !== i))}
                      >
                        <Icon name="trash" className="mx-auto" />
                      </button>
                    </div>
                    <div className="mt-2">
                      <Segmented
                        label={`Exercise ${i + 1} type`}
                        value={x.hold ? 'hold' : 'reps'}
                        onChange={(v) => upd('hold', v === 'hold')}
                        options={[
                          { value: 'reps', label: 'Reps' },
                          { value: 'hold', label: 'Hold (seconds)' },
                        ]}
                      />
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {(['sets', x.hold ? 'holdSec' : 'reps', 'loadKg'] as const).map((k) => {
                        const label = k === 'loadKg' ? 'kg' : k === 'holdSec' ? 'seconds' : k
                        return (
                          <label key={k} className="block">
                            <span className="text-xs text-stone-500">{label}</span>
                            <input
                              className="input text-center"
                              inputMode="decimal"
                              aria-label={`Exercise ${i + 1} ${label}`}
                              value={x[k]}
                              onChange={(e) => upd(k, e.target.value)}
                            />
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
              <button type="button" className="btn-secondary w-full" onClick={() => set('exercises', [...d.exercises, blankExercise()])}>
                <Icon name="plus" /> Add exercise
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="card space-y-4">
        <div>
          <span className="label">Knee pain during (optional, tap again to clear)</span>
          <PainScale value={d.painDuring} onChange={(v) => set('painDuring', v)} label="Pain during" allowClear size="md" settings={settings} />
        </div>
        <div>
          <span className="label">Knee pain next morning (optional — add it tomorrow)</span>
          <PainScale value={d.painNextMorning} onChange={(v) => set('painNextMorning', v)} label="Pain next morning" allowClear size="md" settings={settings} />
        </div>
        <div>
          <span className="label">Swelling</span>
          <Segmented
            label="Swelling"
            value={d.swelling}
            onChange={(v) => set('swelling', v)}
            options={[
              { value: 'none', label: 'None' },
              { value: 'mild', label: 'Mild' },
              { value: 'moderate', label: 'Moderate' },
            ]}
          />
        </div>
        <label className="block">
          <span className="label">Notes</span>
          <textarea className="input min-h-20 py-2" value={d.notes} onChange={(e) => set('notes', e.target.value)} rows={2} />
        </label>
      </section>

      {existing && (
        <button type="button" className="btn-danger w-full" onClick={remove}>
          <Icon name="trash" /> Delete session
        </button>
      )}

      {errors.length > 0 && (
        <ul role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 border-t border-stone-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-stone-800 dark:bg-stone-900/95">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="text-sm leading-tight">
            <span className="block text-xs text-stone-500">{strength ? 'Strength load' : 'Cardio load'}</span>
            <span className="text-lg font-bold tabular-nums" data-testid="form-load">{loadLabel}</span>
          </div>
          <button type="submit" className="btn-primary flex-1 text-lg">
            {existing ? 'Save changes' : 'Save session'}
          </button>
        </div>
      </div>
    </form>
  )
}
