import { describe, expect, it } from 'vitest'
import { authErrorMessage } from './authMode'

describe('authErrorMessage', () => {
  it('explains known Firebase auth codes and keeps the code', () => {
    const msg = authErrorMessage({ code: 'auth/popup-closed-by-user' })
    expect(msg).toMatch(/Sign-in method/)
    expect(msg).toContain('(auth/popup-closed-by-user)')
  })
  it('falls back to the error message', () => {
    expect(authErrorMessage(new Error('boom'))).toBe('boom')
  })
})
