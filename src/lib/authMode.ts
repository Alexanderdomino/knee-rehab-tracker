/**
 * Use the redirect flow when Firebase's auth helper pages are served from the
 * app's own origin (authDomain = this host, proxied via vercel.json). Safari
 * blocks the cross-site storage the popup flow needs, so a popup to
 * *.firebaseapp.com fails on iOS with auth/popup-closed-by-user.
 */
export function shouldUseRedirect(authDomain: string | undefined, host: string): boolean {
  return !!authDomain && authDomain.toLowerCase() === host.toLowerCase()
}

const MESSAGES: Record<string, string> = {
  'auth/popup-closed-by-user':
    'The sign-in window closed before finishing. On iPhone this usually means the app’s auth domain isn’t set up for this site yet (see README → “Sign-in on iPhone”).',
  'auth/popup-blocked': 'Your browser blocked the sign-in popup. Allow popups for this site and try again.',
  'auth/unauthorized-domain': 'This domain isn’t authorized in Firebase Authentication → Settings → Authorized domains.',
  'auth/network-request-failed': 'Network error — check your connection and try again.',
  'auth/cancelled-popup-request': 'Sign-in was cancelled. Try again.',
}

export function authErrorMessage(e: unknown): string {
  const code = typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : ''
  if (code && MESSAGES[code]) return MESSAGES[code]
  return e instanceof Error ? e.message : String(e)
}
