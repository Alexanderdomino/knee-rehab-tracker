import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, getDocs, collection, setDoc, updateDoc } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

const PROJECT_ID = 'demo-knee-tracker'
let env: RulesTestEnvironment

const validEntry = {
  date: '2026-10-04',
  activityTypeId: 'cycling',
  activityName: 'Cycling',
  kind: 'cardio',
  durationMin: 30,
  swelling: 'none',
  painDuring: 2,
  painNextMorning: null,
  distanceKm: 12.5,
  notes: 'easy',
  createdAt: 1,
}

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':')
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'), host, port: Number(port) },
  })
})

afterAll(async () => {
  await env?.cleanup()
})

beforeEach(async () => {
  await env.clearFirestore()
})

const alice = () => env.authenticatedContext('alice').firestore()
const bob = () => env.authenticatedContext('bob').firestore()
const anon = () => env.unauthenticatedContext().firestore()

describe('ownership', () => {
  it('lets a user read and write their own days, entries and settings', async () => {
    const db = alice()
    await assertSucceeds(setDoc(doc(db, 'users/alice/days/2026-10-04'), { date: '2026-10-04', pain: 3 }))
    await assertSucceeds(getDoc(doc(db, 'users/alice/days/2026-10-04')))
    await assertSucceeds(setDoc(doc(db, 'users/alice/entries/e1'), validEntry))
    await assertSucceeds(getDocs(collection(db, 'users/alice/entries')))
    await assertSucceeds(setDoc(doc(db, 'users/alice/settings/main'), { painThreshold: 6, greenMax: 2, amberMax: 5 }))
    await assertSucceeds(getDoc(doc(db, 'users/alice/settings/main')))
    await assertSucceeds(deleteDoc(doc(db, 'users/alice/entries/e1')))
    await assertSucceeds(deleteDoc(doc(db, 'users/alice/days/2026-10-04')))
  })

  it("denies access to another user's data", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/alice/days/2026-10-04'), { date: '2026-10-04', pain: 3 })
      await setDoc(doc(ctx.firestore(), 'users/alice/entries/e1'), validEntry)
    })
    const db = bob()
    await assertFails(getDoc(doc(db, 'users/alice/days/2026-10-04')))
    await assertFails(getDocs(collection(db, 'users/alice/entries')))
    await assertFails(setDoc(doc(db, 'users/alice/days/2026-10-05'), { date: '2026-10-05', pain: 1 }))
    await assertFails(updateDoc(doc(db, 'users/alice/entries/e1'), { rpe: 2 }))
    await assertFails(deleteDoc(doc(db, 'users/alice/entries/e1')))
    await assertFails(getDoc(doc(db, 'users/alice/settings/main')))
  })

  it('denies unauthenticated access', async () => {
    const db = anon()
    await assertFails(getDoc(doc(db, 'users/alice/days/2026-10-04')))
    await assertFails(setDoc(doc(db, 'users/alice/days/2026-10-04'), { date: '2026-10-04', pain: 3 }))
  })

  it('denies collections outside the allowed paths', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice/other/x'), { a: 1 }))
    await assertFails(setDoc(doc(alice(), 'public/x'), { a: 1 }))
    await assertFails(setDoc(doc(alice(), 'users/alice'), { a: 1 }))
  })
})

describe('daily pain validation', () => {
  const put = (pain: unknown, id = '2026-10-04', date: unknown = id) =>
    setDoc(doc(alice(), `users/alice/days/${id}`), { date, pain })

  it('accepts 0 and 10', async () => {
    await assertSucceeds(put(0))
    await assertSucceeds(put(10))
  })

  it('rejects values outside 0–10 and non-numbers', async () => {
    await assertFails(put(-1))
    await assertFails(put(11))
    await assertFails(put('5'))
    await assertFails(put(null))
  })

  it('requires the doc id to be the date and in YYYY-MM-DD format', async () => {
    await assertFails(put(3, '2026-10-04', '2026-10-05'))
    await assertFails(put(3, 'today'))
  })

  it('rejects unknown fields', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice/days/2026-10-04'), { date: '2026-10-04', pain: 2, extra: true }))
  })
})

describe('entry validation', () => {
  const put = (overrides: Record<string, unknown>) =>
    setDoc(doc(alice(), 'users/alice/entries/e1'), { ...validEntry, ...overrides })

  it('accepts entries without RPE, and pain 0 and 10', async () => {
    await assertSucceeds(put({ painDuring: 0, painNextMorning: 10 }))
    await assertSucceeds(put({ painDuring: 10 }))
  })

  it('still accepts legacy RPE 1–10 but rejects out-of-range values', async () => {
    await assertSucceeds(put({ rpe: 1 }))
    await assertSucceeds(put({ rpe: 10 }))
    await assertSucceeds(put({ rpe: null }))
    await assertFails(put({ rpe: 0 }))
    await assertFails(put({ rpe: 11 }))
    await assertFails(put({ rpe: 'hard' }))
  })

  it('requires a duration for cardio but not for strength', async () => {
    const noDuration: Record<string, unknown> = { ...validEntry }
    delete noDuration.durationMin
    await assertFails(setDoc(doc(alice(), 'users/alice/entries/c1'), noDuration))
    await assertFails(put({ durationMin: null }))
    await assertSucceeds(
      setDoc(doc(alice(), 'users/alice/entries/s1'), {
        ...noDuration,
        kind: 'strength',
        activityTypeId: 'rehab',
        durationMin: null,
        distanceKm: null,
        exercises: [{ name: 'Iso leg extension', sets: 4, reps: 0, loadKg: 20, holdSec: 45 }],
      }),
    )
  })

  it('rejects session pain outside 0–10', async () => {
    await assertFails(put({ painDuring: -1 }))
    await assertFails(put({ painDuring: 11 }))
    await assertFails(put({ painNextMorning: 10.5 }))
  })

  it('validates swelling, kind, duration and required fields', async () => {
    await assertFails(put({ swelling: 'severe' }))
    await assertFails(put({ kind: 'yoga' }))
    await assertFails(put({ durationMin: -5 }))
    const missing: Record<string, unknown> = { ...validEntry }
    delete missing.swelling
    await assertFails(setDoc(doc(alice(), 'users/alice/entries/e2'), missing))
  })

  it('accepts strength entries with exercises', async () => {
    await assertSucceeds(
      put({ kind: 'strength', activityTypeId: 'rehab', exercises: [{ name: 'Squat', sets: 3, reps: 10, loadKg: 40 }] }),
    )
  })

  it('validates updates too (next-morning pain added later)', async () => {
    await assertSucceeds(put({}))
    await assertSucceeds(updateDoc(doc(alice(), 'users/alice/entries/e1'), { painNextMorning: 4 }))
    await assertFails(updateDoc(doc(alice(), 'users/alice/entries/e1'), { painNextMorning: 12 }))
  })
})

describe('settings validation', () => {
  it('rejects out-of-range thresholds', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice/settings/main'), { painThreshold: 11 }))
    await assertFails(setDoc(doc(alice(), 'users/alice/settings/main'), { greenDaysRequired: 0 }))
  })
})
