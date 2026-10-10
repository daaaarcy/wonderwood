// Rasterizes public/icons/icon.svg into the PNG sizes the PWA manifest needs.
// Run after `npx playwright install chromium`. Usage: npm run icons
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'

const svg = readFileSync('public/icons/icon.svg', 'utf8')
const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`

const browser = await chromium.launch()
const page = await browser.newPage()

async function render(size, out, { background = null, scale = 1 } = {}) {
  const img = Math.round(size * scale)
  const pad = Math.round((size - img) / 2)
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<!doctype html><body style="margin:0;width:${size}px;height:${size}px;${
    background ? `background:${background};` : ''
  }"><img src="${dataUri}" width="${img}" height="${img}" style="margin:${pad}px"></body>`)
  await page.screenshot({ path: out, omitBackground: !background })
  console.log('wrote', out)
}

await render(192, 'public/icons/icon-192.png')
await render(512, 'public/icons/icon-512.png')
// maskable: full-bleed sky background with the art inside the safe zone
await render(512, 'public/icons/icon-maskable-512.png', {
  background: 'linear-gradient(#7ed6f2,#eafbff)',
  scale: 0.82,
})

await browser.close()
