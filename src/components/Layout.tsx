import { NavLink, Outlet } from 'react-router'
import { Icon, type IconName } from './Icon'

const tabs: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Today', icon: 'today' },
  { to: '/history', label: 'History', icon: 'history' },
  { to: '/stats', label: 'Stats', icon: 'stats' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
]

export function Layout() {
  return (
    <div className="mx-auto min-h-dvh max-w-xl pb-[calc(5rem+env(safe-area-inset-bottom))]">
      <main className="px-4 pt-[calc(1rem+env(safe-area-inset-top))]">
        <Outlet />
      </main>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-stone-800 dark:bg-stone-900/95"
      >
        <ul className="mx-auto flex max-w-xl">
          {tabs.map((t) => (
            <li key={t.to} className="flex-1">
              <NavLink
                to={t.to}
                end={t.to === '/'}
                className={({ isActive }) =>
                  `flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${
                    isActive ? 'text-teal-700 dark:text-teal-400' : 'text-stone-500 dark:text-stone-400'
                  }`
                }
              >
                <Icon name={t.icon} />
                {t.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

export function PageHeader({ title, back, action }: { title: string; back?: () => void; action?: React.ReactNode }) {
  return (
    <header className="mb-4 flex min-h-12 items-center gap-2">
      {back && (
        <button type="button" onClick={back} className="-ml-2 flex h-12 w-12 items-center justify-center rounded-full" aria-label="Back">
          <Icon name="back" />
        </button>
      )}
      <h1 className="flex-1 text-2xl font-bold">{title}</h1>
      {action}
    </header>
  )
}
