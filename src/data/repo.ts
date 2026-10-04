/**
 * Firestore access. All data lives under users/{uid}/:
 *   days/{YYYY-MM-DD}  { date, pain }
 *   entries/{id}       activity entry
 *   settings/main      thresholds + activity types
 *
 * Writes are not awaited by the UI for feedback: onSnapshot reflects local
 * writes immediately (also offline), errors surface through the returned promise.
 */
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { DayLog, Entry, ISODate, Settings } from '../domain'

const daysCol = (uid: string) => collection(db, 'users', uid, 'days')
const entriesCol = (uid: string) => collection(db, 'users', uid, 'entries')
const settingsDoc = (uid: string) => doc(db, 'users', uid, 'settings', 'main')

export function subscribeDays(uid: string, cb: (days: DayLog[]) => void, onError: (e: Error) => void) {
  return onSnapshot(
    daysCol(uid),
    (snap) => cb(snap.docs.map((d) => ({ date: d.id, pain: Number(d.data().pain) }))),
    onError,
  )
}

export function subscribeEntries(uid: string, cb: (entries: Entry[]) => void, onError: (e: Error) => void) {
  return onSnapshot(
    entriesCol(uid),
    (snap) =>
      cb(
        snap.docs.map((d) => {
          const data = d.data()
          return {
            ...data,
            id: d.id,
            createdAt: typeof data.createdAt === 'number' ? data.createdAt : 0,
          } as Entry
        }),
      ),
    onError,
  )
}

export function subscribeSettings(
  uid: string,
  cb: (s: Partial<Settings> | null) => void,
  onError: (e: Error) => void,
) {
  return onSnapshot(settingsDoc(uid), (snap) => cb(snap.exists() ? (snap.data() as Partial<Settings>) : null), onError)
}

export function setDayPain(uid: string, date: ISODate, pain: number) {
  return setDoc(doc(daysCol(uid), date), { date, pain, updatedAt: serverTimestamp() })
}

export function clearDayPain(uid: string, date: ISODate) {
  return deleteDoc(doc(daysCol(uid), date))
}

export type EntryInput = Omit<Entry, 'id' | 'createdAt'>

function cleanEntry(e: EntryInput) {
  return {
    date: e.date,
    activityTypeId: e.activityTypeId,
    activityName: e.activityName,
    kind: e.kind,
    durationMin: e.durationMin,
    distanceKm: e.distanceKm ?? null,
    exercises: e.kind === 'strength' ? (e.exercises ?? []) : [],
    rpe: e.rpe,
    painDuring: e.painDuring ?? null,
    painNextMorning: e.painNextMorning ?? null,
    swelling: e.swelling,
    notes: e.notes ?? '',
  }
}

/** Returns the new id synchronously; the write itself resolves in the background. */
export function addEntry(uid: string, e: EntryInput): { id: string; done: Promise<unknown> } {
  const ref = doc(entriesCol(uid))
  const done = setDoc(ref, { ...cleanEntry(e), createdAt: Date.now(), updatedAt: serverTimestamp() })
  return { id: ref.id, done }
}

export function updateEntry(uid: string, id: string, e: EntryInput) {
  return updateDoc(doc(entriesCol(uid), id), { ...cleanEntry(e), updatedAt: serverTimestamp() })
}

export function setNextMorningPain(uid: string, id: string, pain: number | null) {
  return updateDoc(doc(entriesCol(uid), id), { painNextMorning: pain, updatedAt: serverTimestamp() })
}

export function deleteEntry(uid: string, id: string) {
  return deleteDoc(doc(entriesCol(uid), id))
}

export function saveSettings(uid: string, s: Settings) {
  return setDoc(settingsDoc(uid), { ...s })
}
