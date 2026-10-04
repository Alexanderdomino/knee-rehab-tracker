import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

type Kind = 'info' | 'error'
interface Toast {
  id: number
  text: string
  kind: Kind
}

const ToastContext = createContext<(text: string, kind?: Kind) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const seq = useRef(0)
  const show = useCallback((text: string, kind: Kind = 'info') => {
    const id = ++seq.current
    setToasts((t) => [...t, { id, text, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 2500)
  }, [])
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={`rounded-xl px-4 py-3 text-sm font-semibold shadow-lg ${
              t.kind === 'error' ? 'bg-red-700 text-white' : 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)

/** Attach an error toast to a background write. */
export function useWrite() {
  const toast = useToast()
  return useCallback(
    (p: Promise<unknown>) => {
      p.catch((e: unknown) => {
        console.error('Write failed', e)
        toast(`Couldn't save: ${e instanceof Error ? e.message : String(e)}`, 'error')
      })
    },
    [toast],
  )
}
