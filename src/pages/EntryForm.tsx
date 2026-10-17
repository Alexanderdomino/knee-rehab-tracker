import { useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import {
  exerciseSets,
  formatLoad,
  formatLong,
  isBodyweightExercise,
  isISODate,
  kneeFactorOf,
  normalizeExerciseName,
  tonnage,
  type ActivityType,
  type Entry,
  type Exercise,
  type Settings,
  type Swelling,
} from '../domain'
import { addEntry, deleteEntry, saveSettings, updateEntry, type EntryInput } from '../data/repo'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/Layout'
import { PainScale, Segmented } from '../components/PainScale'
import { latestEntry } from '../lib/entries'
import { useGoBack } from '../lib/useGoBack'
import { useData } from '../state/data'
import { useToast, useWrite } from '../state/toast'

interface SetDraft {
  reps: string
  loadKg: string
  holdSec: string
}

interface ExerciseDraft {
  /** Stable React key so inputs keep focus/state when exercises are reordered. */
  key: string
  name: string
  /** Isometric hold: each set records seconds instead of reps. */
  hold: boolean
  sets: SetDraft[]
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
let keySeq = 0
const nextKey = () => `x${++keySeq}`
const blankSet = (): SetDraft => ({ reps: '10', loadKg: '', holdSec: '30' })
const toExerciseDraft = (x: Exercise): ExerciseDraft => {
  const sets = exerciseSets(x)
  return {
    key: nextKey(),
    name: x.name,
    hold: sets.some((set) => !!set.holdSec),
    sets: sets.length
      ? sets.map((set) => ({
          reps: set.holdSec ? '10' : str(set.reps),
          loadKg: str(set.loadKg),
          holdSec: set.holdSec ? str(set.holdSec) : '30',
        }))
      : [blankSet()],
  }
}
const blankExercise = (): ExerciseDraft => ({ key: nextKey(), name: '', hold: false, sets: [blankSet(), blankSet(), blankSet()] })

/** Move item `from` to index `to` (returns a new array). */
function moveItem<T>(list: T[], from: number, to: number): T[] {
  const out = [...list]
  const [item] = out.splice(from, 1)
  out.splice(Math.max(0, Math.min(to, out.length)), 0, item)
  return out
}

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

  const [localBw, setLocalBw] = useState<string[] | null>(null)
  const bodyweightExercises = localBw ?? settings.bodyweightExercises
  const loadCtx = { ...settings, bodyweightExercises }

  const exercises: Exercise[] = d.exercises
    .filter((x) => x.name.trim() || x.sets.some((set) => set.loadKg.trim()))
    .map((x) => {
      const setDetails = x.sets.map((set) => ({
        reps: x.hold ? 0 : num(set.reps) || 0,
        loadKg: num(set.loadKg) || 0,
        holdSec: x.hold ? num(set.holdSec) || 0 : null,
      }))
      const first = setDetails[0] ?? { reps: 0, loadKg: 0, holdSec: null }
      return { name: x.name.trim() || 'Exercise', setDetails, sets: setDetails.length, reps: first.reps, loadKg: first.loadKg, holdSec: first.holdSec }
    })
  const duration = num(d.durationMin)
  // Load preview: tonnage for strength, minutes for cardio.
  const kneeFactor = type && !strength ? kneeFactorOf(type) : 1
  const minutes = Number.isFinite(duration) ? duration : 0
  const loadLabel = strength ? formatLoad(tonnage(exercises, loadCtx), 'strength') : formatLoad(minutes * kneeFactor, 'cardio')

  const updateExercise = (i: number, patch: Partial<ExerciseDraft>) =>
    set('exercises', d.exercises.map((y, j) => (j === i ? { ...y, ...patch } : y)))
  const moveExercise = (from: number, to: number) => set('exercises', moveItem(d.exercises, from, to))

  // Marking an exercise as bodyweight is a setting (it applies to every session with that name).
  // Shown immediately; the settings write syncs in the background.
  const toggleBodyweight = (name: string, on: boolean) => {
    const key = normalizeExerciseName(name)
    const rest = bodyweightExercises.filter((b) => normalizeExerciseName(b) !== key)
    const next = on ? [...rest, name.trim()] : rest
    setLocalBw(next)
    write(saveSettings(uid, { ...settings, bodyweightExercises: next }))
  }

  const save = () => {
    const errs: string[] = []
    if (!type) errs.push('Choose an activity type.')
    if (!strength && (!Number.isFinite(duration) || duration <= 0 || duration > 1440)) errs.push('Duration must be 1–1440 minutes.')
    if (strength && exercises.length === 0) errs.push('Add at least one exercise.')
    if (strength && exercises.some((x) => (x.setDetails ?? []).length === 0)) errs.push('Each exercise needs at least one set.')
    if (strength && exercises.some((x) => (x.setDetails ?? []).some((set) => set.holdSec != null && !(set.holdSec > 0))))
      errs.push('Hold time must be more than 0 seconds.')
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
            <span className="label">Exercises — load = reps × kg per set (a hold counts its seconds ÷ 3 as reps)</span>
            <div className="space-y-3">
              {d.exercises.map((x, i) => {
                const isBw = !!x.name.trim() && isBodyweightExercise(x.name, bodyweightExercises)
                const unit = x.hold ? 'seconds' : 'reps'
                const updateSet = (j: number, patch: Partial<SetDraft>) =>
                  updateExercise(i, { sets: x.sets.map((y, k) => (k === j ? { ...y, ...patch } : y)) })
                return (
                  <div key={x.key} className="space-y-2 rounded-xl bg-stone-50 p-2 ring-1 ring-stone-200 dark:bg-stone-950 dark:ring-stone-800" data-testid="exercise-row">
                    <div className="flex gap-2">
                      <input
                        className="input flex-1"
                        placeholder="Exercise"
                        aria-label={`Exercise ${i + 1} name`}
                        value={x.name}
                        onChange={(e) => updateExercise(i, { name: e.target.value })}
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

                    <div className="flex items-center gap-1.5">
                      <span className="mr-auto text-xs text-stone-500">Move</span>
                      {(
                        [
                          ['top', 'to top', 0],
                          ['up', 'up', i - 1],
                          ['down', 'down', i + 1],
                        ] as const
                      ).map(([icon, label, to]) => (
                        <button
                          key={icon}
                          type="button"
                          className="h-11 w-11 rounded-lg text-stone-600 ring-1 ring-stone-300 disabled:opacity-30 dark:text-stone-300 dark:ring-stone-700"
                          aria-label={`Move exercise ${i + 1} ${label}`}
                          disabled={icon === 'down' ? i === d.exercises.length - 1 : i === 0}
                          onClick={() => moveExercise(i, to)}
                        >
                          <Icon name={icon} className="mx-auto" />
                        </button>
                      ))}
                    </div>

                    <Segmented
                      label={`Exercise ${i + 1} type`}
                      value={x.hold ? 'hold' : 'reps'}
                      onChange={(v) => updateExercise(i, { hold: v === 'hold' })}
                      options={[
                        { value: 'reps', label: 'Reps' },
                        { value: 'hold', label: 'Hold (seconds)' },
                      ]}
                    />

                    <label className="flex min-h-11 items-center gap-3 text-sm">
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-teal-700"
                        checked={isBw}
                        disabled={!x.name.trim()}
                        aria-label={`Exercise ${i + 1} uses body weight`}
                        onChange={(e) => toggleBodyweight(x.name, e.target.checked)}
                      />
                      <span>
                        Uses body weight
                        {isBw && (
                          <span className="block text-xs text-stone-500">
                            {settings.bodyweightKg
                              ? `${settings.bodyweightKg} kg is added to each set — enter only extra weight below.`
                              : 'Set your body weight in Settings so it counts.'}
                          </span>
                        )}
                      </span>
                    </label>

                    <div className="space-y-1.5" role="group" aria-label={`Exercise ${i + 1} sets`}>
                      <div className="grid grid-cols-[2rem_1fr_1fr_2.75rem] gap-2 px-1 text-xs text-stone-500">
                        <span>Set</span>
                        <span>{unit}</span>
                        <span>{isBw ? '+ kg' : 'kg'}</span>
                        <span />
                      </div>
                      {x.sets.map((setDraft, j) => (
                        <div key={j} className="grid grid-cols-[2rem_1fr_1fr_2.75rem] items-center gap-2" data-testid="set-row">
                          <span className="text-center text-sm font-semibold text-stone-500">{j + 1}</span>
                          <input
                            className="input text-center"
                            inputMode="decimal"
                            aria-label={`Exercise ${i + 1} set ${j + 1} ${unit}`}
                            value={x.hold ? setDraft.holdSec : setDraft.reps}
                            onChange={(e) => updateSet(j, x.hold ? { holdSec: e.target.value } : { reps: e.target.value })}
                          />
                          <input
                            className="input text-center"
                            inputMode="decimal"
                            aria-label={`Exercise ${i + 1} set ${j + 1} kg`}
                            value={setDraft.loadKg}
                            onChange={(e) => updateSet(j, { loadKg: e.target.value })}
                          />
                          <button
                            type="button"
                            className="h-11 w-11 rounded-lg text-stone-500 ring-1 ring-stone-300 disabled:opacity-30 dark:ring-stone-700"
                            aria-label={`Remove exercise ${i + 1} set ${j + 1}`}
                            disabled={x.sets.length === 1}
                            onClick={() => updateExercise(i, { sets: x.sets.filter((_, k) => k !== j) })}
                          >
                            <Icon name="close" className="mx-auto" width={18} height={18} />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="min-h-11 w-full rounded-lg text-sm font-semibold text-teal-700 ring-1 ring-stone-300 dark:text-teal-400 dark:ring-stone-700"
                        aria-label={`Add set to exercise ${i + 1}`}
                        onClick={() => updateExercise(i, { sets: [...x.sets, { ...(x.sets.at(-1) ?? blankSet()) }] })}
                      >
                        + Add set
                      </button>
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
            {!strength && (
              <span className="block text-xs text-stone-500" data-testid="form-load-detail">
                {minutes} min × {kneeFactor} knee-load factor
              </span>
            )}
          </div>
          <button type="submit" className="btn-primary flex-1 text-lg">
            {existing ? 'Save changes' : 'Save session'}
          </button>
        </div>
      </div>
    </form>
  )
}
