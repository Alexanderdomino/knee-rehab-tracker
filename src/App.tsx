import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { Layout } from './components/Layout'
import { DayDetail } from './pages/DayDetail'
import { EntryForm } from './pages/EntryForm'
import { History } from './pages/History'
import { Login } from './pages/Login'
import { Settings } from './pages/Settings'
import { Today } from './pages/Today'
import { AuthProvider, useAuth } from './state/auth'
import { DataProvider, useData } from './state/data'
import { ToastProvider } from './state/toast'

// Charts (Recharts) are the heaviest dependency: load them only on the Stats tab.
const Stats = lazy(() => import('./pages/Stats').then((m) => ({ default: m.Stats })))

function ErrorBanner() {
  const { error } = useData()
  if (!error) return null
  return (
    <p role="alert" className="mx-4 mt-2 rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
      Sync error: {error}
    </p>
  )
}

function Gate() {
  const { user, loading } = useAuth()
  if (loading) return <p className="py-20 text-center text-stone-500">Loading…</p>
  if (!user) return <Login />
  return (
    <DataProvider key={user.uid}>
      <ErrorBanner />
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Today />} />
          <Route path="history" element={<History />} />
          <Route path="day/:date" element={<DayDetail />} />
          <Route path="entry/new" element={<EntryForm />} />
          <Route path="entry/:id" element={<EntryForm />} />
          <Route
            path="stats"
            element={
              <Suspense fallback={<p className="py-10 text-center text-stone-500">Loading charts…</p>}>
                <Stats />
              </Suspense>
            }
          />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </DataProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Gate />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
