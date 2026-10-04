import { useState } from 'react'
import { DEFAULT_SETTINGS as DEFAULTS, dailyCsv, entriesCsv, validateSettings, type ActivityKind, type ActivityType, type Settings as SettingsT } from '../domain'
import { saveSettings } from '../data/repo'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/Layout'
import { Segmented } from '../components/PainScale'
import { downloadText } from '../lib/download'
import { getThemePref, setThemePref, type ThemePref } from '../lib/theme'
import { signOutUser, useAuth } from '../state/auth'
import { useData } from '../state/data'
import { useToast } from '../state/toast'

type NumKey = Exclude<keyof SettingsT, 'activityTypes'>

const FIELDS: { key: NumKey; label: string; hint?: string; step?: string }[] = [
  { key: 'greenMax', label: 'Green zone: pain up to', hint: 'Pain 0 to this value is green' },
  { key: 'amberMax', label: 'Amber zone: pain up to', hint: 'Above this is red' },
  { key: 'painThreshold', label: 'Pain threshold', hint: 'Daily or session pain above this → reduce load' },
  { key: 'maxWeeklyIncreasePct', label: 'Max week-over-week load increase (%)' },
  { key: 'acwrLower', label: 'ACWR lower limit', step: '0.05' },
  { key: 'acwrUpper', label: 'ACWR upper limit', step: '0.05' },
  { key: 'reductionMinPct', label: 'Suggested reduction, min (%)' },
  { key: 'reductionMaxPct', label: 'Suggested reduction, max (%)' },
  { key: 'progressionPct', label: 'Suggested progression (%)' },
  { key: 'greenDaysRequired', label: 'Logged green days before progressing' },
  { key: 'defaultStrengthDurationMin', label: 'Default strength session duration (min)' },
]

function slug(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'activity'
  return `${base}-${Math.random().toString(36).slice(2, 7)}`
}

export function Settings() {
  const { settings, uid, series, entries, today, loading } = useData()
  if (loading) return <p className="py-10 text-center text-stone-500">Loading…</p>
  return <SettingsForm key={JSON.stringify(settings)} initial={settings} uid={uid} onExport={(kind) => {
    if (kind === 'daily') downloadText(`knee-tracker-daily-${today}.csv`, dailyCsv(series))
    else downloadText(`knee-tracker-entries-${today}.csv`, entriesCsv(entries))
  }} />
}

function SettingsForm({ initial, uid, onExport }: { initial: SettingsT; uid: string; onExport: (k: 'daily' | 'entries') => void }) {
  const { user } = useAuth()
  const toast = useToast()
  const [values, setValues] = useState<Record<NumKey, string>>(
    () => Object.fromEntries(FIELDS.map((f) => [f.key, String(initial[f.key])])) as Record<NumKey, string>,
  )
  const [types, setTypes] = useState<ActivityType[]>(initial.activityTypes)
  const [errors, setErrors] = useState<string[]>([])
  const [theme, setTheme] = useState<ThemePref>(getThemePref())

  const build = (): SettingsT => ({
    ...initial,
    ...(Object.fromEntries(FIELDS.map((f) => [f.key, Number(values[f.key].replace(',', '.'))])) as Record<NumKey, number>),
    activityTypes: types.map((t) => ({ ...t, name: t.name.trim() })).filter((t) => t.name),
  })

  const save = async () => {
    const next = build()
    const errs = validateSettings(next)
    setErrors(errs)
    if (errs.length) return
    try {
      await Promise.race([saveSettings(uid, next), new Promise((r) => setTimeout(r, 1500))])
      toast('Settings saved')
    } catch (e) {
      toast(`Couldn't save: ${e instanceof Error ? e.message : e}`, 'error')
    }
  }

  return (
    <div className="space-y-4 pb-6">
      <PageHeader title="Settings" />

      <section className="card space-y-3">
        <h2 className="section-title">Guidance thresholds</h2>
        {FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="label">{f.label}</span>
            <input
              className="input"
              type="number"
              inputMode="decimal"
              step={f.step ?? '1'}
              name={f.key}
              data-testid={`setting-${f.key}`}
              value={values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            />
            {f.hint && <span className="mt-1 block text-xs text-stone-500">{f.hint}</span>}
          </label>
        ))}
      </section>

      <section className="card space-y-2">
        <h2 className="section-title">Activity types</h2>
        {types.map((t, i) => (
          <div key={t.id} className="flex gap-2">
            <input
              className="input flex-1"
              aria-label={`Activity ${i + 1} name`}
              value={t.name}
              onChange={(e) => setTypes(types.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
            />
            <select
              className="input w-32"
              aria-label={`Activity ${i + 1} kind`}
              value={t.kind}
              onChange={(e) => setTypes(types.map((x, j) => (j === i ? { ...x, kind: e.target.value as ActivityKind } : x)))}
            >
              <option value="cardio">Cardio</option>
              <option value="strength">Strength</option>
            </select>
            <button
              type="button"
              className="h-12 w-12 shrink-0 rounded-xl text-stone-500 ring-1 ring-stone-300 dark:ring-stone-700"
              aria-label={`Remove ${t.name}`}
              onClick={() => setTypes(types.filter((_, j) => j !== i))}
            >
              <Icon name="trash" className="mx-auto" />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn-secondary w-full"
          onClick={() => setTypes([...types, { id: slug('activity'), name: '', kind: 'cardio' }])}
        >
          <Icon name="plus" /> Add activity type
        </button>
        <p className="text-xs text-stone-500">Past entries keep the name they were logged with.</p>
      </section>

      {errors.length > 0 && (
        <ul role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <button type="button" className="btn-primary flex-1" onClick={save} data-testid="save-settings">
          Save settings
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            if (window.confirm('Reset all thresholds to defaults? Activity types are kept.')) {
              setValues(Object.fromEntries(FIELDS.map((f) => [f.key, String(DEFAULTS[f.key])])) as Record<NumKey, string>)
            }
          }}
        >
          Defaults
        </button>
      </div>

      <section className="card space-y-2">
        <h2 className="section-title">Appearance</h2>
        <Segmented
          label="Theme"
          value={theme}
          onChange={(v) => {
            setTheme(v)
            setThemePref(v)
          }}
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
      </section>

      <section className="card space-y-2">
        <h2 className="section-title">Export</h2>
        <p className="text-sm text-stone-600 dark:text-stone-400">
          Daily CSV has one row per calendar day from your first log to today; days you didn’t log are included as pain 0 / load 0 with
          <code className="mx-1">logged = no</code>.
        </p>
        <button type="button" className="btn-secondary w-full" onClick={() => onExport('daily')} data-testid="export-daily">
          Export daily CSV
        </button>
        <button type="button" className="btn-secondary w-full" onClick={() => onExport('entries')} data-testid="export-entries">
          Export all sessions CSV
        </button>
      </section>

      <section className="card space-y-2">
        <h2 className="section-title">Account</h2>
        <p className="text-sm text-stone-600 dark:text-stone-400">Signed in as {user?.email ?? user?.displayName}</p>
        <button type="button" className="btn-danger w-full" onClick={() => signOutUser()}>
          Sign out
        </button>
      </section>
    </div>
  )
}

