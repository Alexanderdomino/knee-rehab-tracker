import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router'

/**
 * Go back within the app, or to `fallback` when the page was opened directly.
 * A history step out of the app would reload the page and could drop a write
 * that was queued but not yet sent.
 */
export function useGoBack() {
  const navigate = useNavigate()
  const location = useLocation()
  return useCallback(
    (fallback = '/') => {
      if (location.key === 'default') navigate(fallback, { replace: true })
      else navigate(-1)
    },
    [navigate, location.key],
  )
}
