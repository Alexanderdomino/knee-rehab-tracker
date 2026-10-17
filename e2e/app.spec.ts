import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

const PROJECT = 'demo-knee-tracker'
const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080'
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099'

const pad = (n: number) => String(n).padStart(2, '0')
function localDate(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

async function resetEmulators() {
  await fetch(`http://${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' })
  await fetch(`http://${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' })
}

/** Wait until the emulator has `n` documents in a collection group (i.e. local writes reached the server). */
async function waitForDocs(collectionId: string, n: number) {
  await expect
    .poll(async () => {
      const r = await fetch(`http://${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents:runQuery`, {
        method: 'POST',
        headers: { Authorization: 'Bearer owner' },
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId, allDescendants: true }] } }),
      })
      const rows = (await r.json()) as { document?: unknown }[]
      return rows.filter((x) => x.document).length
    })
    .toBe(n)
}

async function signIn(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Sign in as emulator test user' }).click()
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
}

const nav = (page: Page, name: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name }).click()

test.beforeEach(async () => {
  await resetEmulators()
})

test('log pain and sessions, edit, review history & stats, change a threshold, export CSV', async ({ page }) => {
  const today = localDate(0)
  const yesterday = localDate(-1)
  const twoDaysAgo = localDate(-2)
  const threeDaysAgo = localDate(-3)

  await signIn(page)
  const status = page.getByTestId('status-card')
  await expect(status).toHaveAttribute('data-status', 'AMBER')

  // --- Daily pain on Today ---
  const dailyPain = page.getByTestId('daily-pain')
  await dailyPain.getByRole('radio', { name: 'Daily pain 3', exact: true }).click()
  await expect(dailyPain.getByRole('radio', { name: 'Daily pain 3', exact: true })).toHaveAttribute('aria-checked', 'true')
  await expect(status).toHaveAttribute('data-status', 'AMBER')
  await expect(status).toContainText('is in the amber zone')

  // --- Log a session ---
  await page.getByRole('button', { name: 'Cycling', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Log session', exact: true })).toBeVisible()
  await expect(page.getByRole('radiogroup', { name: /RPE/ })).toHaveCount(0)
  await page.getByRole('button', { name: '45', exact: true }).click()
  await page.getByLabel('Distance (km, optional)').fill('15')
  await expect(page.getByTestId('form-load')).toHaveText('45 knee-min')
  await page.getByRole('button', { name: 'Save session' }).click()
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
  const todayList = page.getByTestId('entry-list')
  await expect(todayList.getByTestId('entry-row')).toHaveCount(1)
  await expect(todayList).toContainText('Cycling')
  await expect(todayList).toContainText('45 min · 15 km')

  // --- Edit it ---
  await todayList.getByTestId('entry-row').first().click()
  await expect(page.getByRole('heading', { name: 'Edit session', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '60', exact: true }).click()
  await page.getByRole('radio', { name: 'Pain during 2', exact: true }).click()
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(todayList).toContainText('60 min · 15 km')
  await expect(todayList).toContainText('pain 2')

  // --- Repeat last session ---
  await page.getByTestId('repeat-last').click()
  await expect(page.getByTestId('form-load')).toHaveText('60 knee-min')
  await page.getByRole('button', { name: 'Save session' }).click()
  await expect(todayList.getByTestId('entry-row')).toHaveCount(2)

  // --- A past day's pain + a session yesterday (leaves a gap 2 days ago) ---
  await page.goto(`/day/${threeDaysAgo}`)
  await page.getByTestId('day-pain').getByRole('radio', { name: 'Daily pain 1', exact: true }).click()
  await expect(page.getByTestId('day-pain').getByRole('radio', { name: 'Daily pain 1', exact: true })).toHaveAttribute('aria-checked', 'true')
  await waitForDocs('days', 2)
  await page.goto(`/day/${yesterday}`)
  await page.getByRole('link', { name: 'Add session' }).click()
  await page.getByRole('radio', { name: 'Walking', exact: true }).click()
  await page.getByRole('button', { name: '30', exact: true }).click()
  await page.getByRole('button', { name: 'Save session' }).click()
  await expect(page.getByTestId('entry-list')).toContainText('Walking')

  // Today now asks for yesterday's next-morning pain
  await nav(page, 'Today')
  const prompt = page.getByTestId('next-morning-prompt')
  await expect(prompt).toContainText('Walking')
  await prompt.getByRole('radio', { name: 'Next-morning pain 2', exact: true }).click()
  await expect(prompt).toBeHidden()

  // --- History ---
  await nav(page, 'History')
  const rows = page.getByTestId('history-row')
  await expect(rows).toHaveCount(4)
  const todayRow = page.locator(`[data-testid=history-row][data-date="${today}"]`)
  await expect(todayRow).toHaveAttribute('data-logged', 'true')
  await expect(todayRow.getByTestId('history-pain')).toHaveText('3')
  await expect(todayRow.getByTestId('history-load')).toHaveText('120 knee-min')
  const gapRow = page.locator(`[data-testid=history-row][data-date="${twoDaysAgo}"]`)
  await expect(gapRow).toHaveAttribute('data-logged', 'false')
  await expect(gapRow).toContainText('Not logged')

  // Tap a day to edit, then delete a session from history
  await todayRow.click()
  await expect(page.getByTestId('entry-row')).toHaveCount(2)
  await page.getByTestId('entry-row').nth(1).click()
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Delete session' }).click()
  await expect(page.getByTestId('entry-row')).toHaveCount(1)
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(todayRow.getByTestId('history-load')).toHaveText('60 knee-min')

  // --- Statistics ---
  await nav(page, 'Stats')
  await expect(page.getByTestId('load-pain-chart')).toBeVisible()
  await expect(page.getByTestId('load-pain-chart').locator('.recharts-bar-rectangle').first()).toBeVisible()
  const weekly = page.getByTestId('weekly-table')
  await expect(weekly).toBeVisible()
  // Newest week first; yesterday's 30 min walk (× 0.5 knee factor = 15) is in the same ISO week unless today is Monday.
  const isMonday = new Date().getDay() === 1
  await expect(weekly.getByTestId('week-cardio').first()).toHaveText(isMonday ? '60' : '75')
  await expect(weekly.getByTestId('week-strength').first()).toHaveText('0')
  await expect(page.getByTestId('acwr-chart')).toBeVisible()
  await expect(page.getByTestId('tolerance-summary')).toBeVisible()
  await expect(page.getByTestId('breakdown-cardio')).toBeVisible()
  await expect(page.getByTestId('streak-longest')).toHaveText('1')
  await expect(page.getByTestId('timeline')).toContainText('AMBER')

  // --- Change a threshold and see the status change ---
  await nav(page, 'Settings')
  await page.getByTestId('setting-painThreshold').fill('2')
  await page.getByTestId('save-settings').click()
  await expect(page.getByText('Settings saved')).toBeVisible()
  await nav(page, 'Today')
  await expect(status).toHaveAttribute('data-status', 'RED')
  await expect(page.getByTestId('status-headline')).toHaveText('Reduce load')
  await expect(status).toContainText('above your pain threshold of 2')
  await expect(page.getByTestId('status-target')).toContainText('knee-min')

  // --- CSV export ---
  await nav(page, 'Settings')
  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('export-daily').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe(`knee-tracker-daily-${today}.csv`)
  const csv = readFileSync((await download.path())!, 'utf8').trim().split(/\r?\n/)
  expect(csv[0]).toMatch(/^date,logged,daily_pain/)
  expect(csv).toHaveLength(1 + 4)
  expect(csv[1]).toMatch(new RegExp(`^${threeDaysAgo},yes,1,daily,0,`))
  expect(csv[2]).toMatch(new RegExp(`^${twoDaysAgo},no,0,not_logged,0,0,0,0,0,`))
  expect(csv[3]).toMatch(new RegExp(`^${yesterday},yes,0,not_logged,0,30,15,0,1,Walking,`))
  expect(csv[4]).toMatch(new RegExp(`^${today},yes,3,daily,0,60,60,15,1,Cycling,2,`))
})

test('strength session with an isometric hold, validation and dark mode', async ({ page }) => {
  await signIn(page)
  await page.getByRole('button', { name: 'Knee rehab / strength', exact: true }).click()
  // No duration and no RPE for strength: load comes from the exercises
  await expect(page.locator('#duration')).toHaveCount(0)
  await expect(page.getByTestId('exercise-row')).toHaveCount(1)

  // Validation: a strength session needs an exercise
  await page.getByRole('button', { name: 'Remove exercise 1', exact: true }).click()
  await page.getByRole('button', { name: 'Save session' }).click()
  await expect(page.getByRole('alert')).toContainText('Add at least one exercise')

  // Isometric leg extension: 4 × 45 s @ 20 kg → 4 × (45 / 3) × 20 = 1,200 kg
  await page.getByRole('button', { name: 'Add exercise' }).click()
  await page.getByLabel('Exercise 1 name').fill('Iso leg extension')
  await page.getByRole('radiogroup', { name: 'Exercise 1 type' }).getByRole('radio', { name: 'Hold (seconds)' }).click()
  await expect(page.getByTestId('exercise-row').first().getByTestId('set-row')).toHaveCount(3)
  for (const n of [1, 2, 3]) {
    await page.getByLabel(`Exercise 1 set ${n} seconds`).fill('45')
    await page.getByLabel(`Exercise 1 set ${n} kg`).fill('20')
  }
  // "Add set" copies the last set
  await page.getByRole('button', { name: 'Add set to exercise 1' }).click()
  await expect(page.getByLabel('Exercise 1 set 4 seconds')).toHaveValue('45')
  await expect(page.getByLabel('Exercise 1 set 4 kg')).toHaveValue('20')
  await expect(page.getByTestId('form-load')).toHaveText('1,200 kg')

  // Romanian deadlift with a different weight and reps per set: 10@60 + 8@65 + 6@70 = 1,540 kg
  await page.getByRole('button', { name: 'Add exercise' }).click()
  await page.getByLabel('Exercise 2 name').fill('Romanian deadlift')
  for (const [n, reps, kg] of [[1, '10', '60'], [2, '8', '65'], [3, '6', '70']] as const) {
    await page.getByLabel(`Exercise 2 set ${n} reps`).fill(reps)
    await page.getByLabel(`Exercise 2 set ${n} kg`).fill(kg)
  }
  await expect(page.getByTestId('form-load')).toHaveText('2,740 kg')

  // Move the last-added exercise to the top
  await page.getByRole('button', { name: 'Move exercise 2 to top' }).click()
  await expect(page.getByLabel('Exercise 1 name')).toHaveValue('Romanian deadlift')
  await expect(page.getByLabel('Exercise 1 set 2 kg')).toHaveValue('65')
  await expect(page.getByLabel('Exercise 2 name')).toHaveValue('Iso leg extension')
  await expect(page.getByRole('button', { name: 'Move exercise 1 to top' })).toBeDisabled()
  await page.getByRole('button', { name: 'Save session' }).click()

  const list = page.getByTestId('entry-list')
  await expect(list).toContainText('Romanian deadlift 10 @ 60 kg, 8 @ 65 kg, 6 @ 70 kg, Iso leg extension 4×45 s @ 20 kg')
  await expect(list).toContainText('2,740')

  // Editing keeps every set, the order and the hold
  await list.getByTestId('entry-row').first().click()
  await expect(page.getByLabel('Exercise 1 name')).toHaveValue('Romanian deadlift')
  await expect(page.getByLabel('Exercise 1 set 3 reps')).toHaveValue('6')
  await expect(page.getByLabel('Exercise 1 set 3 kg')).toHaveValue('70')
  await expect(page.getByLabel('Exercise 2 set 4 seconds')).toHaveValue('45')
  // Move it back down and remove a set
  await page.getByRole('button', { name: 'Move exercise 1 down' }).click()
  await expect(page.getByLabel('Exercise 1 name')).toHaveValue('Iso leg extension')
  await page.getByRole('button', { name: 'Remove exercise 1 set 4' }).click()
  await expect(page.getByTestId('form-load')).toHaveText('2,440 kg')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(list).toContainText('Iso leg extension 3×45 s @ 20 kg, Romanian deadlift')

  await nav(page, 'Settings')
  await page.getByRole('radio', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await waitForDocs('entries', 1)
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark/)
})

test('kitesurfing is built in and weighted by its knee-load factor', async ({ page }) => {
  await signIn(page)
  // Built-in activity, no setup needed
  await page.getByRole('button', { name: 'Kitesurfing', exact: true }).click()
  await page.locator('#duration').fill('210')
  await expect(page.getByTestId('form-load')).toHaveText('420 knee-min')
  await expect(page.getByTestId('form-load-detail')).toHaveText('210 min × 2 knee-load factor')
  await page.getByRole('button', { name: 'Save session' }).click()
  const list = page.getByTestId('entry-list')
  await expect(list).toContainText('Kitesurfing')
  await expect(list).toContainText('210 min')
  await expect(list).toContainText('420')

  // Changing the factor in Settings re-weights the existing session
  await nav(page, 'Settings')
  const factor = page.getByLabel('Kitesurfing knee-load factor')
  await expect(factor).toHaveValue('2')
  await expect(page.getByLabel('Walking knee-load factor')).toHaveValue('0.5')
  await factor.fill('9')
  await page.getByTestId('save-settings').click()
  await expect(page.getByRole('alert')).toContainText('Knee-load factor for Kitesurfing must be 0.1–5')
  await factor.fill('2.5')
  await page.getByTestId('save-settings').click()
  await expect(page.getByText('Settings saved')).toBeVisible()
  await nav(page, 'Today')
  await expect(list).toContainText('525')
})

test('bodyweight exercises count body weight, for past sessions too', async ({ page }) => {
  await signIn(page)
  // Log Bulgarian split squats with no extra weight: 0 kg load for now
  await page.getByRole('button', { name: 'Knee rehab / strength', exact: true }).click()
  await page.getByLabel('Exercise 1 name').fill('Bulgarian split squat')
  await expect(page.getByTestId('form-load')).toHaveText('0 kg')
  await page.getByRole('button', { name: 'Save session' }).click()
  const list = page.getByTestId('entry-list')
  await expect(list).toContainText('Bulgarian split squat 3×10')

  // Set body weight
  await nav(page, 'Settings')
  await page.getByTestId('setting-bodyweight').fill('80')
  await page.getByTestId('save-settings').click()
  await expect(page.getByText('Settings saved')).toBeVisible()

  // Mark the exercise as bodyweight from the form: the saved session is re-weighted
  await nav(page, 'Today')
  await list.getByTestId('entry-row').first().click()
  await page.getByLabel('Exercise 1 uses body weight').check()
  await expect(page.getByText('80 kg is added to each set')).toBeVisible()
  await expect(page.getByTestId('form-load')).toHaveText('2,400 kg')
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(list).toContainText('Bulgarian split squat 3×10 @ BW')
  await expect(list).toContainText('2,400')

  // It shows up in Settings and also matches a plural spelling in a new session
  await nav(page, 'Settings')
  await expect(page.getByTestId('bodyweight-exercises')).toContainText('Bulgarian split squat')
  await nav(page, 'Today')
  await page.getByRole('button', { name: 'Knee rehab / strength', exact: true }).click()
  await page.getByLabel('Exercise 1 name').fill('bulgarian split squats')
  await page.getByLabel('Exercise 1 set 1 kg').fill('10')
  await expect(page.getByLabel('Exercise 1 uses body weight')).toBeChecked()
  await expect(page.getByTestId('form-load')).toHaveText('2,500 kg') // 10×90 + 10×80 + 10×80
})
