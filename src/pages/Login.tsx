import { useState } from 'react'
import { useEmulators } from '../lib/firebase'
import { signInEmulatorTestUser, signInWithGoogle } from '../state/auth'

export function Login() {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const run = (fn: () => Promise<void>) => async () => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <img src="/favicon.svg" alt="" className="mb-4 h-16 w-16" />
        <h1 className="text-3xl font-bold">Knee Rehab Tracker</h1>
        <p className="mt-2 text-stone-600 dark:text-stone-400">
          Log knee pain and training load, and get daily guidance based on your own thresholds.
        </p>
      </div>
      <button className="btn-primary text-lg" onClick={run(signInWithGoogle)} disabled={busy}>
        Sign in with Google
      </button>
      {useEmulators && (
        <button className="btn-secondary" onClick={run(() => signInEmulatorTestUser())} disabled={busy}>
          Sign in as emulator test user
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
