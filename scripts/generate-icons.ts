// Renders public/favicon.svg to the PNG icons used by the PWA manifest.
// Usage: npx tsx scripts/generate-icons.ts  (or node --experimental-strip-types)
import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const svg = readFileSync('public/favicon.svg', 'utf8')
const targets: [string, number, boolean][] = [
  ['public/pwa-192x192.png', 192, false],
  ['public/pwa-512x512.png', 512, false],
  ['public/apple-touch-icon.png', 180, true],
]

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
const page = await browser.newPage()
for (const [file, size, square] of targets) {
  await page.setViewportSize({ width: size, height: size })
  // Apple adds its own rounded mask, so give it a full-bleed square background.
  const bg = square ? 'background:#0f766e;' : ''
  await page.setContent(
    `<html><body style="margin:0;${bg}"><div style="width:${size}px;height:${size}px">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</div></body></html>`,
  )
  await page.screenshot({ path: file, omitBackground: !square })
  console.log('wrote', file)
}
await browser.close()
