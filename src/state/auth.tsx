import {
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { shouldUseRedirect } from '../lib/authMode'
import { auth, firebaseConfig, useEmulators } from '../lib/firebase'

interface AuthState {
  user: User | null
  loading: boolean
}

const AuthContext = createContext<AuthState>({ user: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true })
  useEffect(() => onAuthStateChanged(auth, (user) => setState({ user, loading: false })), [])
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  if (shouldUseRedirect(firebaseConfig.authDomain, window.location.host)) {
    await signInWithRedirect(auth, provider)
  } else {
    await signInWithPopup(auth, provider)
  }
}

/** Completes a redirect sign-in; rejects with the error if it failed. */
export async function completeRedirectSignIn() {
  await getRedirectResult(auth)
}

/**
 * Emulator-only: sign in with a fake Google credential. The Auth emulator
 * accepts unsigned ID tokens, which lets e2e tests skip the popup.
 */
export async function signInEmulatorTestUser(email = 'test.user@example.com') {
  if (!useEmulators) throw new Error('Only available with emulators')
  const credential = GoogleAuthProvider.credential(
    JSON.stringify({ sub: `test-${email}`, email, email_verified: true, name: 'Test User' }),
  )
  await signInWithCredential(auth, credential)
}

export function signOutUser() {
  return signOut(auth)
}
