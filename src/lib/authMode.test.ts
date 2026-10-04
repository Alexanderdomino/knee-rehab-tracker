import { describe, expect, it } from 'vitest'
import { authErrorMessage, shouldUseRedirect } from './authMode'

describe('shouldUseRedirect', () => {
  it('uses redirect only when auth pages are served from this host', () => {
    expect(shouldUseRedirect('knee-rehab-tracker-zeta.vercel.app', 'knee-rehab-tracker-zeta.vercel.app')).toBe(true)
    expect(shouldUseRedirect('Knee-Rehab-Tracker-Zeta.vercel.app', 'knee-rehab-tracker-zeta.vercel.app')).toBe(true)
    expect(shouldUseRedirect('my-project.firebaseapp.com', 'knee-rehab-tracker-zeta.vercel.app')).toBe(false)
    expect(shouldUseRedirect('my-project.firebaseapp.com', 'localhost:5173')).toBe(false)
    expect(shouldUseRedirect(undefined, 'localhost')).toBe(false)
  })
})

describe('authErrorMessage', () => {
  it('explains known Firebase auth codes and falls back to the message', () => {
    expect(authErrorMessage({ code: 'auth/popup-closed-by-user' })).toMatch(/auth domain/)
    expect(authErrorMessage(new Error('boom'))).toBe('boom')
  })
})
