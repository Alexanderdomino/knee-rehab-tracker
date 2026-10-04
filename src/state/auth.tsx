import { GoogleAuthProvider, onAuthStateChanged, signInWithCredential, signInWithPopup, signOut, type User } from 'firebase/auth'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { auth, useEmulators } from '../lib/firebase'

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

// Same flow as session-calendar: a plain Google popup against the default
// <project>.firebaseapp.com auth domain. Call it directly from the click
// handler so iOS Safari treats the popup as user-initiated.
export function signInWithGoogle() {
  return signInWithPopup(auth, new GoogleAuthProvider())
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
