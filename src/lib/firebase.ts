import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import {
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'

const env = import.meta.env

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID,
}

export const useEmulators = env.VITE_USE_EMULATORS === 'true'
const emulatorHost = env.VITE_EMULATOR_HOST || '127.0.0.1'

export const app = initializeApp(
  useEmulators ? { ...firebaseConfig, apiKey: firebaseConfig.apiKey || 'demo-api-key' } : firebaseConfig,
)
export const auth = getAuth(app)

// Persistent cache makes the PWA usable offline; writes sync when back online.
export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  localCache: useEmulators
    ? memoryLocalCache()
    : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})

if (useEmulators) {
  connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true })
  connectFirestoreEmulator(db, emulatorHost, 8080)
}
