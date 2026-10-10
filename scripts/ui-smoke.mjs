#!/usr/bin/env node
/**
 * Real end-to-end UI smoke against the Supabase build + screenshots of the
 * onboarding flow. Requires a preview server serving a supabase build:
 *   VITE_BACKEND=supabase npm run build && npm run preview -- --port 4174 --strictPort
 * then: node scripts/ui-smoke.mjs
 * Creates one throwaway user+household and cleans them up.
 */
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)
const URL_ = env.VITE_SUPABASE_URL
const BASE = process.env.PREVIEW_URL ?? 'http://localhost:4174'
const OUT = 'screenshots'

const admin = createClient(URL_, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })
const email = `ui-smoke-${Date.now()}@wonderwood.test`
const password = `Ui!${Date.now()}x`
let userId = null
let householdId = null

const sizes = { phone: { width: 390, height: 844 }, tablet: { width: 1180, height: 820 } }

async function run() {
  const { data: u, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  userId = u.user.id

  const browser = await chromium.launch()
  for (const [name, size] of Object.entries(sizes)) {
    const ctx = await browser.newContext({ viewport: size, reducedMotion: 'reduce' })
    const page = await ctx.newPage()
    page.on('console', (m) => m.type() === 'error' && console.log(`[${name} console]`, m.text()))
    page.on('response', async (r) => {
      if (r.url().includes('supabase.co')) {
        console.log(`[${name}]`, r.status(), r.url().replace(URL_, '…'))
      }
    })
    page.on('pageerror', (e) => console.log(`[${name} pageerror]`, e.message))
    await page.goto(BASE)
    await page.waitForSelector('.onboarding', { timeout: 15000 })
    await page.screenshot({ path: `${OUT}/${name}-chromium-20-onboard-pick.png` })

    if (name === 'phone') {
      // walk the grown-up flow for real on one device
      await page.getByRole('button', { name: "I'm a grown-up" }).click()
      await page.getByLabel('Email').fill(email)
      await page.getByLabel('Password').fill(password)
      await page.screenshot({ path: `${OUT}/${name}-chromium-21-onboard-grownup.png` })
      await page.getByRole('button', { name: 'Sign in' }).click()
      await page.waitForSelector('text=Start your town', { timeout: 15000 })
      await page.screenshot({ path: `${OUT}/${name}-chromium-22-onboard-create.png` })
      await page.getByRole('button', { name: 'Build the town!' }).click()
      try {
        await page.waitForSelector('.picker-card, [data-scene]', { timeout: 20000 })
      } catch (e) {
        console.log('page error text:', await page.locator('.form-error').textContent().catch(() => 'none'))
        console.log('body html:', (await page.content()).slice(0, 800))
        throw e
      }

      // household id for cleanup + devices screenshot
      const m = await admin
        .from('household_members')
        .select('household_id')
        .eq('user_id', userId)
        .single()
      householdId = m.data.household_id

      // Grown-ups → set PIN → devices
      // the grown-ups button sits in the picker's corner; click via DOM to be safe
      await page.locator('.grownups-btn').click()
      await page.waitForSelector('.grownups-screen', { timeout: 10000 })
      try {
        await page.waitForSelector('text=Choose a 4-digit PIN', { timeout: 15000 })
      } catch (e) {
        await page.screenshot({ path: `${OUT}/debug-grownups.png` })
        console.log('debug screenshot saved; html:', (await page.locator('body').innerText()).slice(0, 500))
        throw e
      }
      await page.screenshot({ path: `${OUT}/${name}-chromium-23-pin-setup.png` })
      for (const d of '1234') await page.getByRole('button', { name: `Digit ${d}` }).click()
      await page.waitForSelector('text=Tap the same PIN again')
      for (const d of '1234') await page.getByRole('button', { name: `Digit ${d}` }).click()
      await page.waitForSelector('text=Devices', { timeout: 15000 })
      await page.getByRole('button', { name: 'Add a device' }).click()
      await page.waitForSelector('.pairing-digits', { timeout: 15000 })
      await page.screenshot({ path: `${OUT}/${name}-chromium-24-devices-code.png` })

      // kids' pairing screen (fresh context → anonymous session)
      const kidCtx = await browser.newContext({ viewport: size, reducedMotion: 'reduce' })
      const kidPage = await kidCtx.newPage()
      await kidPage.goto(BASE)
      await kidPage.waitForSelector('.onboarding')
      await kidPage.getByRole('button', { name: "This is a kids' device" }).click()
      await kidPage.waitForSelector('.code-input')
      const code = await page.locator('.pairing-digits').textContent()
      await kidPage.fill('.code-input', code ?? '')
      await kidPage.screenshot({ path: `${OUT}/${name}-chromium-25-kid-pairing.png` })
      await kidPage.getByRole('button', { name: 'Join my town' }).click()
      await kidPage.waitForSelector('.picker-card', { timeout: 20000 })
      await kidPage.screenshot({ path: `${OUT}/${name}-chromium-26-kid-paired.png` })
      await kidCtx.close()
    } else {
      // tablet: just the static onboarding screens (reuse the signed-in session
      // is per-context, so a fresh context re-lands on onboarding)
      await page.getByRole('button', { name: "I'm a grown-up" }).click()
      await page.screenshot({ path: `${OUT}/${name}-chromium-21-onboard-grownup.png` })
      const kidPage2 = await ctx.newPage()
      await kidPage2.goto(BASE)
      await kidPage2.waitForSelector('.onboarding')
      await kidPage2.getByRole('button', { name: "This is a kids' device" }).click()
      await kidPage2.waitForSelector('.code-input')
      await kidPage2.screenshot({ path: `${OUT}/${name}-chromium-25-kid-pairing.png` })
    }
    await ctx.close()
  }
  await browser.close()
}

try {
  await run()
  console.log('ui smoke done')
} finally {
  if (householdId) await admin.from('households').delete().eq('id', householdId)
  if (userId) await admin.auth.admin.deleteUser(userId)
  console.log('cleaned up')
}
