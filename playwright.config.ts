import { defineConfig, devices } from '@playwright/test'

// Run via `npm run test:e2e`, which starts the Auth + Firestore emulators first.
const PORT = 5174
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'iphone-chromium',
      use: {
        ...devices['iPhone 13'],
        // iPhone viewport/touch/UA, rendered with Chromium (WebKit isn't installed here).
        browserName: 'chromium',
        launchOptions: { executablePath },
      },
    },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      VITE_USE_EMULATORS: 'true',
      VITE_FIREBASE_PROJECT_ID: 'demo-knee-tracker',
      VITE_FIREBASE_API_KEY: 'demo-api-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'demo-knee-tracker.firebaseapp.com',
    },
  },
})
