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
  await page.getByRole('button', { name: '45', exact: true }).click()
  await page.getByRole('radio', { name: 'RPE 6', exact: true }).click()
  await page.getByLabel('Distance (km, optional)').fill('15')
  await expect(page.getByTestId('form-load')).toHaveText('270')
  await page.getByRole('button', { name: 'Save session' }).click()
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
  const todayList = page.getByTestId('entry-list')
  await expect(todayList.getByTestId('entry-row')).toHaveCount(1)
  await expect(todayList).toContainText('Cycling')
  await expect(todayList).toContainText('270')

  // --- Edit it ---
  await todayList.getByTestId('entry-row').first().click()
  await expect(page.getByRole('heading', { name: 'Edit session', exact: true })).toBeVisible()
  await page.getByRole('radio', { name: 'RPE 7', exact: true }).click()
  await page.getByRole('radio', { name: 'Pain during 2', exact: true }).click()
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(todayList).toContainText('315')
  await expect(todayList).toContainText('pain 2')

  // --- Repeat last session ---
  await page.getByTestId('repeat-last').click()
  await expect(page.getByRole('radio', { name: 'RPE 7', exact: true })).toHaveAttribute('aria-checked', 'true')
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
  await page.getByRole('radio', { name: 'RPE 3', exact: true }).click()
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
  await expect(todayRow.getByTestId('history-load')).toHaveText('630')
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
  await expect(todayRow.getByTestId('history-load')).toHaveText('315')

  // --- Statistics ---
  await nav(page, 'Stats')
  await expect(page.getByTestId('load-pain-chart')).toBeVisible()
  await expect(page.getByTestId('load-pain-chart').locator('.recharts-bar-rectangle').first()).toBeVisible()
  const weekly = page.getByTestId('weekly-table')
  await expect(weekly).toBeVisible()
  // Newest week first; yesterday's walk (90) is in the same ISO week unless today is Monday.
  const isMonday = new Date().getDay() === 1
  await expect(weekly.locator('tbody tr').first().locator('td').nth(1)).toHaveText(isMonday ? '315' : '405')
  await expect(page.getByTestId('acwr-chart')).toBeVisible()
  await expect(page.getByTestId('tolerance-summary')).toBeVisible()
  await expect(page.getByTestId('breakdown-chart')).toBeVisible()
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
  await expect(page.getByTestId('status-target')).toContainText('load units')

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
  expect(csv[3]).toMatch(new RegExp(`^${yesterday},yes,0,not_logged,90,30,`))
  expect(csv[4]).toMatch(new RegExp(`^${today},yes,3,daily,315,45,15,0,1,Cycling,2,`))
})

test('validation and dark mode', async ({ page }) => {
  await signIn(page)
  await page.getByRole('button', { name: 'Knee rehab / strength', exact: true }).click()
  await expect(page.getByTestId('exercise-row')).toHaveCount(1)
  await page.getByLabel('Exercise 1 name').fill('Leg press')
  await page.getByLabel('Exercise 1 kg').fill('60')
  await expect(page.getByTestId('form-load')).toHaveText('225') // default 45 min × RPE 5
  await page.locator('#duration').fill('')
  await page.getByRole('button', { name: 'Save session' }).click()
  await expect(page.getByRole('alert')).toContainText('Duration must be')
  await page.locator('#duration').fill('40')
  await page.getByRole('button', { name: 'Save session' }).click()
  await expect(page.getByTestId('entry-list')).toContainText('1800 kg')

  await nav(page, 'Settings')
  await page.getByRole('radio', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await waitForDocs('entries', 1)
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark/)
})
