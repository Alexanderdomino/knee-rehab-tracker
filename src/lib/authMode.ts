const MESSAGES: Record<string, string> = {
  'auth/popup-closed-by-user':
    'The Google sign-in window closed before sign-in finished. If it showed an error, check that Google is enabled under Firebase Authentication → Sign-in method.',
  'auth/popup-blocked': 'Your browser blocked the sign-in popup. Allow popups for this site and try again.',
  'auth/unauthorized-domain': 'This domain isn’t authorized in Firebase Authentication → Settings → Authorized domains.',
  'auth/operation-not-allowed': 'Google sign-in isn’t enabled. Turn it on in Firebase Authentication → Sign-in method.',
  'auth/network-request-failed': 'Network error — check your connection and try again.',
  'auth/cancelled-popup-request': 'Sign-in was cancelled. Try again.',
}

/** Plain-language message for a Firebase auth error, keeping the code for troubleshooting. */
export function authErrorMessage(e: unknown): string {
  const code = typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : ''
  if (code && MESSAGES[code]) return `${MESSAGES[code]} (${code})`
  return e instanceof Error ? e.message : String(e)
}
