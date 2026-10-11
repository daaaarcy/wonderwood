import { expect, test, type Browser, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import {
  boardSeed,
  citySeed,
  freshState,
  leagueSeed,
  promotionSeed,
  seedJson,
  v2SeedJson,
} from './seed'
import { applyCommand } from '../src/domain/commands'
import { commandDeps } from '../src/data/registry'
import { localDateKey, mondayKeyOf } from '../src/domain/week'
import type { ChildId, GameState } from '../src/domain/types'

/**
 * Full-app visual QA sweep. Every screen & state, on four device profiles:
 * phone 412×839, tablet landscape 1138×712, tablet portrait 820×1180,
 * desktop 1440×900. Saved to screenshots/QA-{device}-{name}.png.
 *
 * Runs once (on the phone-chromium project) and drives its own contexts so
 * all four profiles are captured in a single pass. Console errors and page
 * errors are collected into screenshots/QA-console.log.
 */
test.describe.configure({ timeout: 300_000 })

const DIR = 'screenshots'

const DEVICES = {
  phone: { width: 412, height: 839, isMobile: true, hasTouch: true },
  tablet: { width: 1138, height: 712, isMobile: false, hasTouch: true },
  portrait: { width: 820, height: 1180, isMobile: false, hasTouch: true },
  desktop: { width: 1440, height: 900, isMobile: false, hasTouch: false },
} as const
type Device = keyof typeof DEVICES
const DEVICE_NAMES = Object.keys(DEVICES) as Device[]

const consoleLog: string[] = []

function onlyOnce(name: string) {
  test.skip(name !== 'phone-chromium', 'QA sweep drives its own viewports')
}

async function shot(page: Page, device: Device, name: string) {
  await page.screenshot({ path: `${DIR}/QA-${device}-${name}.png`, fullPage: true })
}
async function shotOverlay(page: Page, device: Device, name: string) {
  // sheets/overlays animate in (sheet-up 0.25s from opacity 0) — let it settle
  await page.waitForTimeout(320)
  await page.screenshot({ path: `${DIR}/QA-${device}-${name}.png`, fullPage: false })
}

interface QaPage {
  context: Awaited<ReturnType<Browser['newContext']>>
  page: Page
}

async function qaPage(
  browser: Browser,
  device: Device,
  json: string | null,
  opts: { reducedMotion?: boolean; pin?: string } = {},
): Promise<QaPage> {
  const vp = DEVICES[device]
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    reducedMotion: opts.reducedMotion ? 'reduce' : 'no-preference',
    deviceScaleFactor: 1,
    isMobile: vp.isMobile,
    hasTouch: vp.hasTouch,
  })
  await context.addInitScript(
    ({ j, pin }) => {
      if (j && !window.localStorage.getItem('wonderwood:v1')) {
        window.localStorage.setItem('wonderwood:v1', j)
      }
      if (pin && !window.localStorage.getItem('wonderwood:local-pin')) {
        window.localStorage.setItem('wonderwood:local-pin', pin)
      }
    },
    { j: json, pin: opts.pin ?? null },
  )
  context.setDefaultTimeout(10_000)
  const page = await context.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      consoleLog.push(`[${device}] console.${m.type()}: ${m.text()}`)
    }
  })
  page.on('pageerror', (e) => consoleLog.push(`[${device}] PAGEERROR: ${e.message}`))
  return { context, page }
}

const PIN1234 = createHash('sha256').update('1234').digest('hex')

const todayKey = () => localDateKey(new Date(), 'UTC')
const weekKey = () => mondayKeyOf(todayKey())

async function openHome(page: Page, child = 'Theodore') {
  await page.goto('/')
  await page.getByRole('button', { name: child }).click()
  await expect(page.locator('[data-scene="town"][data-scene-ready="true"]')).toBeAttached()
}

async function unlockGrownups(page: Page, pin = '1234') {
  await page.getByRole('button', { name: 'Grown-ups' }).click()
  await page.waitForSelector('.pin-key')
  for (const d of pin) await page.getByRole('button', { name: `Digit ${d}` }).click()
  if (await page.getByText('Tap the same PIN again').isVisible().catch(() => false)) {
    for (const d of pin) await page.getByRole('button', { name: `Digit ${d}` }).click()
  }
}

async function expandBonus(page: Page) {
  const fold = page.locator('.bonus-fold')
  if ((await fold.count()) > 0 && (await fold.getAttribute('open')) === null) {
    await fold.locator('summary').click()
    await page.waitForTimeout(150)
  }
}

/** Claims covering every approval variant (core/bonus/custom/reading/challenge/housework). */
function pendingSeed(): GameState {
  const today = todayKey()
  return freshState((s) => {
    s.customQuests['cq-water'] = {
      id: 'cq-water',
      title: 'Water the plants',
      coins: 12,
      stars: 2,
      childIds: ['theodore', 'leonard'],
      days: [],
      createdAt: new Date().toISOString(),
      active: true,
    }
    const claims: [string, ChildId, string, GameState['claims'][string]['role'], GameState['claims'][string]['details']][] = [
      ['p-spanish', 'theodore', 'spanish', 'core', undefined],
      ['p-typing', 'theodore', 'typing', 'core', undefined],
      ['p-french', 'theodore', 'french-explore', 'bonus', undefined],
      ['p-math', 'theodore', 'math-mission', 'bonus', { kind: 'challenge', hintsUsed: 2, correctFirstTry: 1 }],
      ['p-read', 'leonard', 'reading', 'core', { kind: 'reading', unit: 'book', title: 'The Snail and the Whale', withGrownUp: true }],
      ['p-violin', 'leonard', 'violin', 'core', undefined],
      ['p-jobs', 'leonard', 'housework', 'bonus', { kind: 'housework', job: 'Sort the socks' }],
      ['p-custom', 'leonard', 'cq-water', 'custom', undefined],
    ]
    for (const [id, childId, questId, role, details] of claims) {
      s.claims[id] = {
        id,
        childId,
        questId,
        activityDate: today,
        role,
        status: 'pending',
        claimedAt: `${today}T10:00:00Z`,
        details,
        questTitle: role === 'custom' ? 'Water the plants' : undefined,
      }
    }
  })
}

function doneSeed(): GameState {
  let s = freshState()
  const now = new Date()
  for (const questId of ['spanish', 'typing']) {
    s = applyCommand(s, { type: 'claimQuest', childId: 'theodore', questId, claimId: `d-${questId}` }, now, commandDeps).state
    s = applyCommand(s, { type: 'approveClaim', claimId: `d-${questId}` }, now, commandDeps).state
  }
  return s
}

function restSeed(): GameState {
  return freshState((s) => {
    s.pausedDates.leonard = [todayKey()]
  })
}

function weeklyDoneSeed(): GameState {
  const s = boardSeed()
  s.weekly.leonard[weekKey()] = { templateId: 'read-4', completedAt: new Date().toISOString() }
  s.badges.push(
    { id: 'badge-read-4', childId: 'leonard', weekKey: weekKey(), templateId: 'read-4', earnedAt: new Date().toISOString() },
    { id: 'badge-older', childId: 'leonard', weekKey: '2026-09-28', templateId: 'housework-3', earnedAt: '2026-10-04T10:00:00Z' },
  )
  return s
}

function poorSeed(): GameState {
  return freshState((s) => {
    s.children.theodore.coins = 3
    s.children.theodore.wishItem = 'bed-cosy'
  })
}

function furnishedSeed(): GameState {
  return freshState((s) => {
    s.children.theodore.coins = 60
    s.children.theodore.inventory.push(
      'hat-leaf',
      'bed-cosy',
      'rug-round',
      'desk-explorer',
      'computer-laptop',
      'chair-beanbag',
      'decor-rocket',
      'decor-garland',
    )
    s.children.theodore.equipped.hat = 'hat-leaf'
    s.children.theodore.placed = {
      bed: 'bed-cosy',
      rug: 'rug-round',
      desk: 'desk-explorer',
      computer: 'computer-laptop',
      'decor-a': 'decor-rocket',
      'decor-b': 'decor-garland',
    }
    s.children.leonard.inventory.push('bed-house', 'rug-cloud', 'shelf-books', 'lamp-floor', 'decor-plant', 'chair-wood', 'desk-corner', 'computer-desktop')
    s.children.leonard.placed = {
      bed: 'bed-house',
      rug: 'rug-cloud',
      shelf: 'shelf-books',
      lamp: 'lamp-floor',
      desk: 'desk-corner',
      chair: 'chair-wood',
      computer: 'computer-desktop',
      'decor-a': 'decor-plant',
    }
    s.customQuests['cq-water'] = {
      id: 'cq-water',
      title: 'Water the plants',
      coins: 12,
      stars: 2,
      childIds: ['theodore', 'leonard'],
      days: [],
      createdAt: new Date().toISOString(),
      active: true,
    }
    s.customQuests['cq-recycle'] = {
      id: 'cq-recycle',
      title: 'Help sort the recycling',
      coins: 8,
      stars: 1,
      childIds: ['leonard'],
      days: [0, 2, 4],
      createdAt: new Date().toISOString(),
      active: true,
    }
    s.customQuests['cq-paused'] = {
      id: 'cq-paused',
      title: 'Feed the neighbour’s cat',
      coins: 6,
      stars: 0,
      childIds: ['theodore'],
      days: [5, 6],
      createdAt: new Date().toISOString(),
      active: false,
    }
  })
}

function openTownSeed(): GameState {
  return freshState((s) => {
    for (const id of ['road', 'library', 'music-school', 'police-station', 'hospital'] as const) {
      s.city.projects[id].status = 'open'
      s.city.projects[id].openedAt = '2026-10-01T10:00:00Z'
    }
    s.city.currentProjectId = null
    s.city.name = 'Sunny Meadow'
    s.city.projects.library.color = '#9a6fe0'
    s.city.projects.library.name = 'Rainbow Hall'
    s.city.postcards = [
      { id: 'postcard-road', projectId: 'road', openedAt: '2026-09-28T10:00:00Z' },
      { id: 'postcard-library', projectId: 'library', openedAt: '2026-10-01T10:00:00Z' },
      { id: 'postcard-music', projectId: 'music-school', openedAt: '2026-10-03T10:00:00Z' },
      { id: 'postcard-police', projectId: 'police-station', openedAt: '2026-10-05T10:00:00Z' },
    ]
    const readClaim = (i: number, childId: 'theodore' | 'leonard', unit: 'book' | 'chapter', date: string) => {
      s.claims[`jr${i}`] = {
        id: `jr${i}`,
        childId,
        questId: 'reading',
        activityDate: date,
        role: i === 1 ? 'core' : 'bonus',
        status: 'approved',
        claimedAt: `${date}T10:00:00Z`,
        reward: { coins: i === 1 ? 10 : 5, stars: i === 1 ? 1 : 0 },
        details: { kind: 'reading', unit, withGrownUp: false },
      }
    }
    for (let i = 1; i <= 6; i += 1) readClaim(i, 'leonard', 'book', '2026-10-08')
    for (let i = 7; i <= 9; i += 1) readClaim(i, 'theodore', 'book', '2026-10-09')
    for (let i = 10; i <= 13; i += 1) readClaim(i, 'leonard', 'chapter', '2026-10-10')
    for (let i = 14; i <= 15; i += 1) readClaim(i, 'theodore', 'chapter', '2026-10-11')
    s.repairs['inc-a'] = {
      id: 'inc-a',
      childId: 'leonard',
      situation: 'scattering',
      createdAt: '2026-10-10T10:00:00Z',
      repairedAt: '2026-10-10T12:00:00Z',
    }
  })
}

/* ================================ tests ================================ */

test.beforeAll(() => mkdirSync(DIR, { recursive: true }))

test('QA: onboarding, picker and PIN gate', async ({ browser }, testInfo) => {
  onlyOnce(testInfo.project.name)
  for (const dev of DEVICE_NAMES) {
    // onboarding (stub supabase via ?onboard)
    const o = await qaPage(browser, dev, null)
    await o.page.goto('/?onboard')
    await o.page.waitForSelector('.onboarding')
    await shot(o.page, dev, 'onboard-pick')
    await o.page.getByRole('button', { name: "I'm a grown-up" }).click()
    await o.page.getByLabel('Email').fill('parent@example.com')
    await o.page.getByLabel('Password').fill('supersecret')
    await shot(o.page, dev, 'onboard-grownup')
    await o.page.getByRole('button', { name: 'Create account' }).click()
    await expect(o.page.getByText('Check your email')).toBeVisible()
    await shot(o.page, dev, 'onboard-email')
    await o.page.getByRole('button', { name: 'Back to sign in' }).click()
    await o.page.getByRole('button', { name: 'Sign in' }).click()
    await expect(o.page.getByText('Start your town')).toBeVisible()
    await shot(o.page, dev, 'onboard-create')
    await o.context.close()
    // kids' pairing entry + paired confirmation
    const k = await qaPage(browser, dev, null)
    await k.page.goto('/?onboard')
    await k.page.getByRole('button', { name: "This is a kids' device" }).click()
    await k.page.locator('.code-input').fill('482913')
    await shot(k.page, dev, 'onboard-kid-code')
    await k.page.getByRole('button', { name: 'Join my town' }).click()
    await expect(k.page.locator('.picker-card').first()).toBeVisible()
    await shot(k.page, dev, 'onboard-paired')
    await k.context.close()

    // profile picker
    const p = await qaPage(browser, dev, seedJson(freshState()))
    await p.page.goto('/')
    await shot(p.page, dev, 'picker')

    // PIN set (no pin stored)
    await p.page.getByRole('button', { name: 'Grown-ups' }).click()
    await p.page.waitForSelector('.pin-key')
    await expect(p.page.getByText('Choose a 4-digit PIN')).toBeVisible()
    await shot(p.page, dev, 'pin-set')
    for (const d of '12') await p.page.getByRole('button', { name: `Digit ${d}` }).click()
    await shot(p.page, dev, 'pin-typing')
    for (const d of '34') await p.page.getByRole('button', { name: `Digit ${d}` }).click()
    await expect(p.page.getByText('Tap the same PIN again')).toBeVisible()
    await shot(p.page, dev, 'pin-confirm')
    await p.context.close()

    // PIN enter + wrong PIN error
    const w = await qaPage(browser, dev, seedJson(freshState()), { pin: PIN1234 })
    await w.page.goto('/')
    await w.page.getByRole('button', { name: 'Grown-ups' }).click()
    await w.page.waitForSelector('.pin-key')
    await expect(w.page.getByText('Enter your PIN')).toBeVisible()
    await shot(w.page, dev, 'pin-gate')
    for (const d of '9999') await w.page.getByRole('button', { name: `Digit ${d}` }).click()
    await expect(w.page.getByText('Not quite — try again.')).toBeVisible()
    await shot(w.page, dev, 'pin-wrong')
    for (const d of '1234') await w.page.getByRole('button', { name: `Digit ${d}` }).click()
    await expect(w.page.getByText('Waiting for you')).toBeVisible()
    await shot(w.page, dev, 'pin-enter')
    await w.context.close()
  }
})

test('QA: child home states', async ({ browser }, testInfo) => {
  onlyOnce(testInfo.project.name)
  for (const dev of DEVICE_NAMES) {
    // fresh day — core + weekly card + project card
    {
      const { context, page } = await qaPage(browser, dev, seedJson(freshState()))
      await openHome(page)
      await page.waitForTimeout(600)
      await shot(page, dev, 'home-fresh')
      const fold = page.locator('.bonus-fold')
      if ((await fold.count()) > 0 && (await fold.getAttribute('open')) === null) {
        await shot(page, dev, 'home-bonus-collapsed')
        await fold.locator('summary').click()
        await page.waitForTimeout(150)
      }
      await shot(page, dev, 'home-bonus-open')
      // nav must stay pinned even scrolled to the bottom
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      await page.waitForTimeout(200)
      await shot(page, dev, 'home-scrolled-nav')
      await context.close()
    }
    // pending claims — waiting cards
    {
      const { context, page } = await qaPage(browser, dev, seedJson(pendingSeed()))
      await openHome(page)
      await shot(page, dev, 'home-pending')
      await expandBonus(page)
      await expect(page.getByText('Waiting for a grown-up…').first()).toBeVisible()
      await shot(page, dev, 'home-pending-bonus')
      await context.close()
    }
    // done quests
    {
      const { context, page } = await qaPage(browser, dev, seedJson(doneSeed()))
      await openHome(page)
      await expect(page.getByText('Done!').first()).toBeVisible()
      await shot(page, dev, 'home-done')
      await context.close()
    }
    // rest day
    {
      const { context, page } = await qaPage(browser, dev, seedJson(restSeed()))
      await openHome(page, 'Leonard')
      await expect(page.getByText('Rest day — enjoy!')).toBeVisible()
      await shot(page, dev, 'home-rest')
      await context.close()
    }
    // weekly challenge completed + repair ack + custom task
    {
      const s = weeklyDoneSeed()
      s.repairs['inc-ack'] = {
        id: 'inc-ack',
        childId: 'leonard',
        situation: 'untrue',
        createdAt: '2026-10-10T10:00:00Z',
        repairedAt: '2026-10-10T12:00:00Z',
      }
      s.customQuests['cq-water'] = {
        id: 'cq-water',
        title: 'Water the plants',
        coins: 12,
        stars: 2,
        childIds: ['leonard'],
        days: [],
        createdAt: new Date().toISOString(),
        active: true,
      }
      const { context, page } = await qaPage(browser, dev, seedJson(s))
      await openHome(page, 'Leonard')
      await expect(page.getByText('badge earned!')).toBeVisible()
      await expect(page.getByTestId('repair-ack')).toBeVisible()
      await shot(page, dev, 'home-weekly-done')
      await context.close()
    }
    // insufficient coins + wish bar
    {
      const { context, page } = await qaPage(browser, dev, seedJson(poorSeed()))
      await openHome(page)
      await expect(page.getByText('more coins')).toBeVisible()
      await shot(page, dev, 'home-poor')
      await context.close()
    }
    // "pick next building" card (all open, suggestion pending)
    {
      const s = openTownSeed()
      s.city.suggestedProjectId = 'hospital'
      const { context, page } = await qaPage(browser, dev, seedJson(s))
      await openHome(page)
      await expect(page.getByText('Pick the next building')).toBeVisible()
      await shot(page, dev, 'home-pick-next')
      await context.close()
    }
    // custom "From grown-ups" cards
    {
      const { context, page } = await qaPage(browser, dev, seedJson(furnishedSeed()))
      await openHome(page, 'Leonard')
      await expect(page.getByText('From grown-ups')).toBeVisible()
      await shot(page, dev, 'home-custom')
      await context.close()
    }
  }
})

test('QA: sheets and celebrations', async ({ browser }, testInfo) => {
  onlyOnce(testInfo.project.name)
  for (const dev of DEVICE_NAMES) {
    // plot sheets: building, open (road ride-along), locked (suggest), bridge
    {
      const s = openTownSeed()
      s.city.projects.hospital = { kits: 3, status: 'building' }
      s.city.projects['police-station'] = { kits: 0, status: 'locked' }
      const { context, page } = await qaPage(browser, dev, seedJson(s))
      await openHome(page)
      await page.evaluate(() => (window as never as { __townTap: (p: string) => void }).__townTap('hospital'))
      await expect(page.getByRole('dialog', { name: 'Hospital' })).toBeVisible()
      await shotOverlay(page, dev, 'sheet-plot')
      await page.getByRole('button', { name: 'Close' }).click()
      await page.waitForSelector('.sheet-backdrop', { state: 'detached' })

      await page.evaluate(() => (window as never as { __townTap: (p: string) => void }).__townTap('police-station'))
      await expect(page.getByRole('dialog', { name: 'Police station' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Suggest this' })).toBeVisible()
      await shotOverlay(page, dev, 'sheet-plot-locked')
      await page.getByRole('button', { name: 'Close' }).click()
      await page.waitForSelector('.sheet-backdrop', { state: 'detached' })

      await page.evaluate(() => (window as never as { __townTap: (p: string) => void }).__townTap('road'))
      await expect(page.getByRole('dialog', { name: 'Road extension' })).toBeVisible()
      await shotOverlay(page, dev, 'sheet-plot-open')
      await page.getByRole('button', { name: 'Ride along!' }).click()
      await page.waitForTimeout(1900)
      await shotOverlay(page, dev, 'town-ride')
      await page.waitForTimeout(3400)

      await page.evaluate(() => (window as never as { __townTap: (p: string) => void }).__townTap('bridge'))
      await expect(page.getByRole('dialog', { name: "Founders' Bridge" })).toBeVisible()
      await shotOverlay(page, dev, 'sheet-bridge')
      await page.getByRole('button', { name: 'Close' }).click()
      await page.waitForSelector('.sheet-backdrop', { state: 'detached' })

      // naming picker
      await page.locator('.town-name-tag').click()
      await expect(page.getByRole('dialog', { name: 'Name our town' })).toBeVisible()
      await shotOverlay(page, dev, 'sheet-name-city')
      await page.getByRole('button', { name: 'Not now' }).click()
      await page.waitForSelector('.sheet-backdrop', { state: 'detached' })

      // customize sheet
      await page.evaluate(() => (window as never as { __townTap: (p: string) => void }).__townTap('library'))
      await expect(page.getByRole('dialog', { name: 'Library' })).toBeVisible()
      await page.getByRole('button', { name: 'Change colors' }).click()
      await expect(page.getByRole('dialog', { name: 'Make it yours' })).toBeVisible()
      await shotOverlay(page, dev, 'sheet-customize')
      await context.close()
    }
    // kit confirm sheet + opening-day celebration
    {
      const { context, page } = await qaPage(browser, dev, seedJson(freshState()))
      await openHome(page)
      await page.getByRole('button', { name: 'Add a kit' }).click()
      await expect(page.getByRole('dialog', { name: 'Buy a building kit' })).toBeVisible()
      await shotOverlay(page, dev, 'sheet-kit')
      await page.getByRole('button', { name: 'Yes, add it!' }).click()
      await page.getByRole('button', { name: 'Add a kit' }).click()
      await page.getByRole('button', { name: 'Yes, add it!' }).click()
      await expect(page.getByRole('dialog', { name: 'A building opened!' })).toBeVisible()
      await page.waitForTimeout(850)
      await shotOverlay(page, dev, 'opening')
      await context.close()
    }
    // housework jobs + reading sheet + journal
    {
      const { context, page } = await qaPage(browser, dev, seedJson(weeklyDoneSeed()))
      await openHome(page, 'Leonard')
      await expandBonus(page)
      await page.locator('.quest-card', { hasText: 'Helping at home' }).getByRole('button', { name: 'I did it!' }).click()
      await expect(page.getByRole('dialog', { name: 'Choose the job' })).toBeVisible()
      await shotOverlay(page, dev, 'sheet-jobs')
      await page.getByRole('button', { name: 'Not now' }).click()
      await page.waitForSelector('.sheet-backdrop', { state: 'detached' })

      await page.locator('.quest-card', { hasText: 'Reading' }).first().getByRole('button', { name: 'I read!' }).click({ force: true })
      await expect(page.locator('.reading-units')).toBeVisible()
      await page.waitForTimeout(350)
      await shotOverlay(page, dev, 'sheet-reading')
      await page.getByRole('button', { name: 'A chapter' }).click()
      await shotOverlay(page, dev, 'sheet-reading-picked')
      await page.getByRole('button', { name: 'Done', exact: true }).click()
      await page.waitForSelector('.sheet-backdrop', { state: 'detached' })

      await page.getByRole('button', { name: 'My reading journal' }).click({ force: true })
      await expect(page.locator('.journal-totals')).toBeVisible()
      await page.waitForTimeout(350)
      await shotOverlay(page, dev, 'sheet-journal')
      await context.close()
    }
    // founders bridge (v2 migration)
    {
      const { context, page } = await qaPage(browser, dev, v2SeedJson({ theodore: 4, leonard: 3 }))
      await openHome(page)
      await page.waitForTimeout(700)
      await shot(page, dev, 'founders-bridge')
      await context.close()
    }
  }
})

test('QA: shop', async ({ browser }, testInfo) => {
  onlyOnce(testInfo.project.name)
  for (const dev of DEVICE_NAMES) {
    const { context, page } = await qaPage(browser, dev, seedJson(furnishedSeed()))
    await openHome(page)
    await page.getByRole('button', { name: 'Shop', exact: true }).click()
    await shot(page, dev, 'shop-wear')
    await page.locator('.shop-card', { hasText: 'Leaf hat' }).click()
    await expect(page.locator('.shop-preview .avatar-hat')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Take it off' })).toBeVisible()
    await shot(page, dev, 'shop-hat-owned')
    await page.getByTestId('tab-play').click()
    await shot(page, dev, 'shop-play')
    await page.getByTestId('tab-room').click()
    await shot(page, dev, 'shop-room')
    // owned + placed furniture
    await page.locator('.shop-card', { hasText: 'Cosy wooden bed' }).click()
    await expect(page.getByTestId('room-preview')).toBeVisible()
    await expect(page.getByText('In my room')).toBeVisible()
    await shot(page, dev, 'shop-furniture-owned')
    // can't afford + save-for-this
    await page.locator('.shop-card', { hasText: 'Corner desk' }).click()
    await expect(page.getByRole('button', { name: /Need \d+ more coins/ })).toBeVisible()
    await shot(page, dev, 'shop-furniture-preview')
    await page.getByRole('button', { name: 'Save for this' }).click()
    await expect(page.getByRole('button', { name: 'Saving for this!' })).toBeVisible()
    await shot(page, dev, 'shop-cant-afford')
    await context.close()
  }
})

test('QA: room', async ({ browser }, testInfo) => {
  onlyOnce(testInfo.project.name)
  for (const dev of DEVICE_NAMES) {
    // default room (train running)
    {
      const { context, page } = await qaPage(browser, dev, seedJson(freshState()))
      await openHome(page)
      await page.getByRole('button', { name: 'My room' }).click()
      await expect(page.locator('[data-scene="room"][data-scene-ready="true"]')).toBeAttached()
      await page.getByRole('button', { name: 'Start train' }).click()
      await page.waitForTimeout(700)
      await shot(page, dev, 'room-default')
      // empty postcard album
      await page.getByRole('button', { name: /My postcard album/ }).click()
      await expect(page.getByRole('dialog', { name: 'Postcard album' })).toBeVisible()
      await shotOverlay(page, dev, 'room-album-empty')
      await context.close()
    }
    // furnished room + picker sheet + album with postcards
    {
      const s = furnishedSeed()
      s.city.postcards = [
        { id: 'postcard-road', projectId: 'road', openedAt: '2026-09-28T10:00:00Z' },
        { id: 'postcard-library', projectId: 'library', openedAt: '2026-10-01T10:00:00Z' },
      ]
      const { context, page } = await qaPage(browser, dev, seedJson(s))
      await openHome(page, 'Leonard')
      await page.getByRole('button', { name: 'My room' }).click()
      await expect(page.locator('[data-scene="room"][data-scene-ready="true"]')).toBeAttached()
      await page.waitForTimeout(800)
      await shot(page, dev, 'room-furnished')
      await page.evaluate(() => (window as never as { __roomTap: (s: string) => void }).__roomTap('desk'))
      await expect(page.getByRole('dialog', { name: 'Desk spot' })).toBeVisible()
      await page.waitForTimeout(300)
      await shotOverlay(page, dev, 'room-picker')
      await page.getByRole('button', { name: 'Close' }).click()
      await page.getByRole('button', { name: /My postcard album/ }).click()
      await expect(page.getByRole('dialog', { name: 'Postcard album' })).toBeVisible()
      await page.waitForTimeout(350)
      await shotOverlay(page, dev, 'room-album')
      await page.locator('.postcard-button').first().click()
      await page.waitForTimeout(250)
      await shotOverlay(page, dev, 'room-postcard-big')
      await context.close()
    }
  }
})

test('QA: league', async ({ browser }, testInfo) => {
  onlyOnce(testInfo.project.name)
  for (const dev of DEVICE_NAMES) {
    // explainer open + weekly leaderboard + last week
    {
      const { context, page } = await qaPage(browser, dev, seedJson(boardSeed()))
      await openHome(page)
      await page.getByRole('button', { name: 'League', exact: true }).click()
      await expect(page.locator('.board-row').first()).toBeVisible()
      await page.locator('.league-how summary').click()
      await shot(page, dev, 'league-explainer')
      await context.close()
    }
    // full board: 12 rows, movement arrows, move-up line, nudge, news strip
    {
      const { context, page } = await qaPage(browser, dev, seedJson(boardSeed()))
      await openHome(page)
      await page.getByRole('button', { name: 'League', exact: true }).click()
      const week = page.locator('section[aria-label="This week\'s leaderboard"]')
      await expect(week.locator('.board-row')).toHaveCount(12)
      await expect(week.locator('.board-friend')).toHaveCount(10)
      await shot(page, dev, 'league-board')
      // last week: collapsed podium + me → expanded
      await page.getByRole('button', { name: /Show all/ }).click()
      await shot(page, dev, 'league-last-expanded')
      await context.close()
    }
    // the truck: deterministic captures at each route leg
    {
      const { context, page } = await qaPage(
        browser,
        dev,
        seedJson(citySeed({ road: 2, library: 0 }, { current: 'library' })),
      )
      await openHome(page)
      await page.waitForSelector('[data-scene-ready="true"]')
      await page.waitForTimeout(400)
      for (const [leg, frac, name] of [
        [0, 0.55, 'up'],
        [1, 0.5, 'turn'],
        [2, 0.4, 'right'],
        [4, 0.3, 'left'],
        [5, 0.45, 'down'],
      ] as const) {
        await page.evaluate(
          ([l, f]) =>
            (window as unknown as { __townTruckPos?: (a: number, b: number) => void }).__townTruckPos?.(l, f),
          [leg, frac],
        )
        await page.waitForTimeout(400)
        await shot(page, dev, `truck-${name}`)
      }
      await context.close()
    }
    // ladder low + high
    for (const [rank, name] of [[1, 'low'], [14, 'high']] as const) {
      const { context, page } = await qaPage(browser, dev, seedJson(leagueSeed(rank)))
      await openHome(page)
      await page.getByRole('button', { name: 'League', exact: true }).click()
      await page.waitForTimeout(400)
      await shot(page, dev, `league-ladder-${name}`)
      await context.close()
    }
    // earned badges
    {
      const { context, page } = await qaPage(browser, dev, seedJson(weeklyDoneSeed()))
      await openHome(page, 'Leonard')
      await page.getByRole('button', { name: 'League', exact: true }).click()
      await expect(page.locator('.badge-row').first()).toBeVisible()
      await shot(page, dev, 'league-badges')
      await context.close()
    }
    // badge gallery
    {
      const { context, page } = await qaPage(browser, dev, seedJson(freshState()))
      await page.goto('/?badges')
      await expect(page.locator('.badge-cell')).toHaveCount(14)
      await shot(page, dev, 'badge-gallery')
      await context.close()
    }
  }
})

test('QA: grown-ups', async ({ browser }, testInfo) => {
  onlyOnce(testInfo.project.name)
  for (const dev of DEVICE_NAMES) {
    // approvals list with every variant + devices + repair form + task form
    {
      const { context, page } = await qaPage(browser, dev, seedJson(pendingSeed()), { pin: PIN1234 })
      await page.goto('/?devices')
      await unlockGrownups(page)
      await expect(page.locator('.pending-panel .claim-row').first()).toBeVisible()
      await shot(page, dev, 'grownups-approvals')

      await page.getByRole('button', { name: 'Settings' }).click()
      const devicesPanel = page.locator('.panel[aria-label="Devices"]')
      await expect(devicesPanel.locator('.claim-row').first()).toBeVisible()
      await devicesPanel.getByRole('button', { name: 'Add a device' }).click()
      await expect(page.locator('.pairing-digits')).toBeVisible()
      await shot(page, dev, 'grownups-devices')

      await page.getByRole('button', { name: 'Repair' }).click()
      const repairs = page.locator('.repairs-panel')
      await repairs.locator('select.form-input').selectOption('other')
      await expect(repairs.getByTestId('repair-suggestion')).toBeVisible()
      await repairs.getByPlaceholder('A few words…').fill('grabbed the toy')
      await shot(page, dev, 'grownups-repair')

      await page.getByRole('button', { name: 'Tasks' }).click()
      const tasks = page.locator('.tasks-panel')
      await tasks.getByTestId('add-task').click()
      await expect(tasks.getByTestId('task-save')).toBeVisible()
      await shot(page, dev, 'grownups-task-form')
      await context.close()
    }
    // schedule editor — segmented child picker (both children)
    {
      const { context, page } = await qaPage(browser, dev, seedJson(furnishedSeed()), { pin: PIN1234 })
      await page.goto('/')
      await unlockGrownups(page)
      await page.getByRole('button', { name: 'Schedule' }).click()
      const panel = page.locator('.panel[aria-label="Schedule"]')
      await expect(panel.locator('.quest-day-rows')).toBeVisible()
      await shot(page, dev, 'grownups-schedule-theodore')
      await page.getByRole('tab', { name: 'Leonard' }).click()
      await expect(panel.locator('.quest-day-rows')).toBeVisible()
      await shot(page, dev, 'grownups-schedule-leonard')
      await context.close()
    }
    // next-building chooser
    {
      const s = citySeed({ road: 2, library: 6 }, { current: null, suggested: 'hospital' })
      const { context, page } = await qaPage(browser, dev, seedJson(s), { pin: PIN1234 })
      await page.goto('/')
      await unlockGrownups(page)
      const nb = page.locator('.next-building')
      await expect(nb.locator('.claim-row').first()).toBeVisible()
      await shot(page, dev, 'grownups-next-building')
      await context.close()
    }
    // done quest rows — the little star tag must stay small
    {
      const { context, page } = await qaPage(browser, dev, seedJson(doneSeed()), { pin: PIN1234 })
      await page.goto('/')
      await unlockGrownups(page)
      await expect(page.locator('.tag-done').first()).toBeVisible()
      await shot(page, dev, 'grownups-done-star')
      await context.close()
    }
  }
})

test('QA: play views', async ({ browser }, testInfo) => {
  onlyOnce(testInfo.project.name)
  const openPlay = async (page: Page, child: string, projectId: string) => {
    await openHome(page, child)
    await page.evaluate((id) => (window as never as { __townTap: (p: string) => void }).__townTap(id), projectId)
    await page.getByRole('button', { name: 'Play!' }).click()
    await expect(page.locator('.play-view')).toBeVisible()
  }
  for (const dev of DEVICE_NAMES) {
    // library — filled shelves + word game mid-round + result
    {
      const { context, page } = await qaPage(browser, dev, seedJson(openTownSeed()))
      await openPlay(page, 'Leonard', 'library')
      await page.waitForTimeout(400)
      await shotOverlay(page, dev, 'play-library')
      await page.getByRole('button', { name: 'Word & picture game' }).click()
      await expect(page.getByTestId('word-game')).toBeVisible()
      await shotOverlay(page, dev, 'play-word-game')
      // wrong pick, then the correct pick → cheer note each round (3 rounds → back to library)
      const choices = page.locator('.word-choices .btn')
      for (let round = 0; round < 3; round += 1) {
        const label = await page.locator('.word-pic').getAttribute('aria-label')
        const correctWord = label?.split(': ')[1] ?? ''
        if (round === 0) await choices.filter({ hasNotText: correctWord }).first().click()
        await choices.filter({ hasText: new RegExp(`^${correctWord}$`, 'i') }).first().click()
        await expect(page.locator('.cheer-note')).toBeVisible()
        if (round === 2) await shotOverlay(page, dev, 'play-word-result')
        else await page.waitForTimeout(1000)
      }
      await context.close()
    }
    // library — empty shelves
    {
      const s = freshState((st) => {
        st.city.projects.library.status = 'open'
        st.city.projects.library.openedAt = '2026-10-01T10:00:00Z'
        st.city.currentProjectId = null
      })
      const { context, page } = await qaPage(browser, dev, seedJson(s))
      await openPlay(page, 'Leonard', 'library')
      await expect(page.locator('.shelf-message')).toBeVisible()
      await shotOverlay(page, dev, 'play-library-empty')
      await context.close()
    }
    // music — idle + show playing
    {
      const { context, page } = await qaPage(browser, dev, seedJson(openTownSeed()))
      await openPlay(page, 'Theodore', 'music-school')
      await page.waitForTimeout(300)
      await shotOverlay(page, dev, 'play-music')
      await page.getByRole('button', { name: 'Start the show' }).click()
      await page.waitForTimeout(1500)
      await shotOverlay(page, dev, 'play-music-show')
      await context.close()
    }
    // police — initial + after a return
    {
      const { context, page } = await qaPage(browser, dev, seedJson(openTownSeed()))
      await openPlay(page, 'Theodore', 'police-station')
      await page.waitForTimeout(300)
      await shotOverlay(page, dev, 'play-police')
      await page.getByRole('button', { name: 'Pick up the teddy' }).click()
      await page.waitForTimeout(2500)
      await shotOverlay(page, dev, 'play-police-returned')
      await context.close()
    }
    // hospital — mid-game + complete
    {
      const { context, page } = await qaPage(browser, dev, seedJson(openTownSeed()))
      await openPlay(page, 'Theodore', 'hospital')
      await expect(page.getByTestId('memory-grid')).toBeVisible()
      const cards = page.locator('.memory-card')
      await cards.nth(0).click()
      await cards.nth(1).click()
      await page.waitForTimeout(250)
      await shotOverlay(page, dev, 'play-hospital')
      // The shuffle is deterministic (j=(i*7+3)%(i+1) on [b,t,h,b,t,h]) giving
      // order [thermo,bandage,heart,bandage,thermo,heart] → pairs (0,4) (1,3) (2,5).
      await page.waitForTimeout(900) // let the exploratory mismatch flip back
      for (const [a, b] of [[0, 4], [1, 3], [2, 5]] as const) {
        await cards.nth(a).click()
        await cards.nth(b).click()
        await page.waitForTimeout(150)
      }
      await expect(page.getByTestId('teddy-done')).toBeVisible()
      await shotOverlay(page, dev, 'play-hospital-done')
      await context.close()
    }
  }
})

test('QA: challenge modal', async ({ browser }, testInfo) => {
  onlyOnce(testInfo.project.name)
  for (const dev of DEVICE_NAMES) {
    const { context, page } = await qaPage(browser, dev, seedJson(freshState()))
    await openHome(page)
    await expandBonus(page)
    await page.locator('.quest-card', { hasText: "Builders' math" }).getByRole('button', { name: 'Start' }).click()
    await expect(page.locator('.challenge-prompt')).toBeVisible()
    await page.waitForTimeout(350)
    await shotOverlay(page, dev, 'challenge-q')
    await page.getByRole('button', { name: 'Hint' }).click()
    await page.waitForTimeout(300)
    await shotOverlay(page, dev, 'challenge-hint')
    // guaranteed wrong answer → "Try again!" feedback shot
    {
      const prompt = (await page.locator('.challenge-prompt').textContent()) ?? ''
      const opts = page.locator('.challenge-opt')
      const texts = await opts.allTextContents()
      const piles = page.locator('.pile-btn')
      const pileA = (await piles.count()) > 0 ? await piles.first().locator('.token').count() : 0
      const pileB = (await piles.count()) > 1 ? await piles.nth(1).locator('.token').count() : 0
      const m = prompt.match(/(\d+)\s*([+−-])\s*(\d+)\s*=\s*\?/)
      const miss = prompt.match(/(\d+)\s*\+\s*\?\s*=\s*(\d+)/)
      let answer: number | null = null
      if (m) {
        const a = Number(m[1])
        const b = Number(m[3])
        answer = m[2] === '+' ? a + b : a - b
      } else if (miss) {
        answer = Number(miss[2]) - Number(miss[1])
      } else if (prompt.includes('How many')) {
        answer = await page.locator('.challenge-pile').first().locator('.token').count()
      } else if (prompt.includes('boxes of')) {
        const gm = prompt.match(/(\d+) boxes of (\d+)/)
        answer = gm ? Number(gm[1]) * Number(gm[2]) : null
      }
      if (answer !== null) {
        // a wrong option is guaranteed among the three
        const wrongIdx = texts.findIndex((t) => Number(t) !== answer)
        if (wrongIdx >= 0) await opts.nth(wrongIdx).click()
      } else if (prompt.includes('MORE')) {
        // tap the SMALLER pile (the piles themselves are the answers)
        await piles.nth(pileA > pileB ? 1 : 0).click()
      } else {
        // ordering question — pick the biggest first (wrong)
        const nums = texts.map(Number)
        await opts.nth(nums.indexOf(Math.max(...nums))).click()
      }
      await expect(page.getByText('Try again!')).toBeVisible()
      await shotOverlay(page, dev, 'challenge-wrong')
    }
    // finish the run deterministically — compute each answer from the prompt
    for (let guard = 0; guard < 60; guard += 1) {
      if (await page.getByText('All done').isVisible().catch(() => false)) break
      const prompt = (await page.locator('.challenge-prompt').textContent().catch(() => '')) ?? ''
      const opts = page.locator('.challenge-opt:not(:disabled)')
      if ((await opts.count()) === 0) break
      const texts = await opts.allTextContents()
      const m = prompt.match(/(\d+)\s*([+−-])\s*(\d+)/)
      const piles = page.locator('.challenge-pile')
      const pileA = (await piles.count()) > 0 ? await piles.first().locator('.token').count() : 0
      const pileB = (await piles.count()) > 1 ? await piles.nth(1).locator('.token').count() : 0
      const miss = prompt.match(/(\d+)\s*\+\s*\?\s*=\s*(\d+)/)
      if (prompt.includes('smallest to biggest')) {
        const nums = texts.map(Number)
        await opts.nth(nums.indexOf(Math.min(...nums))).click()
      } else if (prompt.includes('MORE')) {
        await page.locator('.pile-btn').nth(pileA > pileB ? 0 : 1).click()
      } else if (miss) {
        const answer = Number(miss[2]) - Number(miss[1])
        await opts.filter({ hasText: new RegExp(`^${answer}$`) }).first().click()
      } else if (m) {
        const a = Number(m[1])
        const b = Number(m[3])
        const answer = m[2] === '+' ? a + b : a - b
        await opts.filter({ hasText: new RegExp(`^${answer}$`) }).first().click()
      } else if (prompt.includes('How many')) {
        await opts.filter({ hasText: new RegExp(`^${pileA}$`) }).first().click()
      } else if (prompt.includes('boxes of')) {
        const gm = prompt.match(/(\d+) boxes of (\d+)/)
        const answer = gm ? Number(gm[1]) * Number(gm[2]) : 0
        await opts.filter({ hasText: new RegExp(`^${answer}$`) }).first().click()
      } else {
        await opts.first().click()
      }
      await page.waitForTimeout(820)
    }
    await expect(page.getByText('All done')).toBeVisible()
    await shotOverlay(page, dev, 'challenge-done')
    await page.getByRole('button', { name: 'Send to a grown-up' }).click()
    await expect(page.getByText('Sent to a grown-up!')).toBeVisible()
    await shotOverlay(page, dev, 'challenge-sent')
    await context.close()
  }
})

test('QA: challenge levels + send error', async ({ browser }, testInfo) => {
  onlyOnce(testInfo.project.name)
  const capDevs: Device[] = ['phone', 'tablet']
  for (const dev of capDevs) {
    for (const level of [1, 2, 3] as const) {
      // try a few runIndex seeds to find a subtraction question for the picture
      let capturedSub = false
      for (let runIndex = 0; runIndex < 7; runIndex += 1) {
        const state = freshState((s) => {
          s.config.theodore.mathLevel = level
          // fake claims raise the run index → different question seeds
          const today = new Date().toLocaleDateString('sv')
          for (let i = 0; i < runIndex; i += 1) {
            s.claims[`seed-${i}`] = {
              id: `seed-${i}`,
              childId: 'theodore',
              questId: 'math-mission',
              role: 'bonus',
              status: 'rejected', // rejected claims bump runIndex but keep the quest claimable
              claimedAt: `${today}T08:00:00`,
              decidedAt: `${today}T08:30:00`,
              activityDate: today,
            }
          }
        })
        const { context, page } = await qaPage(browser, dev, seedJson(state))
        await openHome(page)
        await expandBonus(page)
        await page
          .locator('.quest-card', { hasText: "Builders' math" })
          .getByRole('button', { name: /Start|Play/ })
          .first()
          .click()
        await expect(page.locator('.challenge-prompt')).toBeVisible()
        await page.waitForTimeout(600)
        const prompts: string[] = []
        for (let i = 0; i < 3; i += 1) {
          const prompt = (await page.locator('.challenge-prompt').textContent()) ?? ''
          prompts.push(prompt)
          if (runIndex === 0) {
            // every question type at this level, once
            const slug = prompt.includes('MORE')
              ? 'more'
              : prompt.includes('smallest')
                ? 'order'
                : prompt.includes('boxes')
                  ? 'groups'
                  : prompt.includes('+ ?')
                    ? 'missing'
                    : prompt.includes('How many')
                      ? 'count'
                      : prompt.includes('−')
                        ? 'sub'
                        : 'add'
            await shotOverlay(page, dev, `challenge-L${level}-${slug}`)
            if (slug === 'sub') capturedSub = true
          } else if (prompt.includes('−') && !capturedSub) {
            capturedSub = true
            await shotOverlay(page, dev, `challenge-L${level}-sub`)
          }
          // answer it (single step) then move on
          const piles = page.locator('.pile-btn')
          const opts = page.locator('.challenge-opt:not(:disabled)')
          if ((await piles.count()) > 0) {
            const a = await piles.first().locator('.token').count()
            const bb = await piles.nth(1).locator('.token').count()
            await piles.nth(a > bb ? 0 : 1).click()
          } else {
            const texts = await opts.allTextContents()
            const m = prompt.match(/(\d+)\s*([+−-])\s*(\d+)\s*=\s*\?/)
            const miss = prompt.match(/(\d+)\s*\+\s*\?\s*=\s*(\d+)/)
            const gm = prompt.match(/(\d+) boxes of (\d+)/)
            if (prompt.includes('smallest')) {
              for (const n of texts.map(Number).sort((x, y) => x - y)) {
                await page.locator('.challenge-opt', { hasText: new RegExp(`^${n}$`) }).click()
              }
            } else {
              let ans: number | null = null
              if (m) ans = m[2] === '+' ? Number(m[1]) + Number(m[3]) : Number(m[1]) - Number(m[3])
              else if (miss) ans = Number(miss[2]) - Number(miss[1])
              else if (gm) ans = Number(gm[1]) * Number(gm[2])
              else if (prompt.includes('How many'))
                ans = await page.locator('.challenge-pile').first().locator('.token').count()
              if (ans !== null)
                await opts.filter({ hasText: new RegExp(`^${ans}$`) }).first().click()
            }
          }
          await page.waitForTimeout(950)
        }
        const reachedEnd = await page
          .getByText(/All done|already/)
          .isVisible()
          .catch(() => false)
        await context.close()
        // found a subtraction at this level (or the run was exhausted)
        const sawSub = capturedSub || prompts.some((pr) => pr.includes('−'))
        if (sawSub && runIndex > 0) break
        if (runIndex === 0 && level === 3) {
          // level-3 send-error capture: fresh run, inject a pending claim before send
          const { context: c2, page: p2 } = await qaPage(browser, dev, seedJson(state))
          await openHome(p2)
          await expandBonus(p2)
          await p2
            .locator('.quest-card', { hasText: "Builders' math" })
            .getByRole('button', { name: /Start|Play/ })
            .first()
            .click()
          await expect(p2.locator('.challenge-prompt')).toBeVisible()
          // inject a same-day claim behind the open sheet → send must fail
          await p2.evaluate(() => {
            const st = JSON.parse(localStorage.getItem('wonderwood:v1') ?? '{}')
            const today = new Date().toLocaleDateString('sv')
            st.claims['behind'] = {
              id: 'behind',
              childId: 'theodore',
              questId: 'math-mission',
              role: 'bonus',
              status: 'pending',
              claimedAt: `${today}T09:00:00`,
              activityDate: today,
            }
            localStorage.setItem('wonderwood:v1', JSON.stringify(st))
          })
          for (let i = 0; i < 3; i += 1) {
            const prompt = (await p2.locator('.challenge-prompt').textContent().catch(() => '')) ?? ''
            if (!prompt) break
            const piles = p2.locator('.pile-btn')
            const opts = p2.locator('.challenge-opt:not(:disabled)')
            if ((await piles.count()) > 0) {
              const a = await piles.first().locator('.token').count()
              const bb = await piles.nth(1).locator('.token').count()
              await piles.nth(a > bb ? 0 : 1).click()
            } else {
              const texts = await opts.allTextContents()
              const m = prompt.match(/(\d+)\s*([+−-])\s*(\d+)\s*=\s*\?/)
              const miss = prompt.match(/(\d+)\s*\+\s*\?\s*=\s*(\d+)/)
              const gm = prompt.match(/(\d+) boxes of (\d+)/)
              if (prompt.includes('smallest')) {
                for (const n of texts.map(Number).sort((x, y) => x - y)) {
                  await p2.locator('.challenge-opt', { hasText: new RegExp(`^${n}$`) }).click()
                }
              } else {
                let ans: number | null = null
                if (m) ans = m[2] === '+' ? Number(m[1]) + Number(m[3]) : Number(m[1]) - Number(m[3])
                else if (miss) ans = Number(miss[2]) - Number(miss[1])
                else if (gm) ans = Number(gm[1]) * Number(gm[2])
                else if (prompt.includes('How many'))
                  ans = await p2.locator('.challenge-pile').first().locator('.token').count()
                if (ans !== null)
                  await opts.filter({ hasText: new RegExp(`^${ans}$`) }).first().click()
              }
            }
            await p2.waitForTimeout(950)
          }
          // send is only offered when the quest isn't already claimed (replay)
          const send = p2.getByRole('button', { name: 'Send to a grown-up' })
          if (await send.isVisible().catch(() => false)) {
            await send.click()
            await expect(p2.getByText('already waiting for a grown-up')).toBeVisible()
            await shotOverlay(p2, dev, 'challenge-send-error')
          }
          await c2.close()
          void reachedEnd
        }
        break
      }
    }
  }
})

test('QA: promotion overlay', async ({ browser }, testInfo) => {
  onlyOnce(testInfo.project.name)
  for (const dev of DEVICE_NAMES) {
    {
      const { context, page } = await qaPage(browser, dev, seedJson(promotionSeed()))
      await page.goto('/')
      await page.getByRole('button', { name: 'Theodore' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await page.waitForTimeout(1050)
      await shotOverlay(page, dev, 'promotion')
      await context.close()
    }
    {
      const { context, page } = await qaPage(browser, dev, seedJson(promotionSeed()), { reducedMotion: true })
      await page.goto('/')
      await page.getByRole('button', { name: 'Theodore' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await shotOverlay(page, dev, 'promotion-reduced')
      await context.close()
    }
  }
})

test('QA: avatar editor + custom look scenes', async ({ browser }, testInfo) => {
  onlyOnce(testInfo.project.name)
  const custom = () =>
    freshState((s) => {
      s.children.theodore.look = {
        skin: '#d39a6a',
        hair: 'mohawk',
        hairColor: '#8e6fd1',
        eyes: 'sparkle',
        mouth: 'grin',
        glasses: 'round',
        shirt: '#58cc02',
        scarf: '#ffc800',
      }
      s.children.leonard.look = {
        skin: '#ffe0c4',
        hair: 'long',
        hairColor: '#e8b64c',
        eyes: 'happy',
        mouth: 'smile',
        glasses: 'shades',
        shirt: '#ff4b4b',
        scarf: '#2b70c9',
      }
    })
  for (const dev of DEVICE_NAMES) {
    // editor — skin + hair categories
    {
      const { context, page } = await qaPage(browser, dev, seedJson(freshState()))
      await openHome(page)
      await page.getByLabel('Explorer menu').click()
      await page.getByRole('menuitem', { name: 'Change my look' }).click()
      await expect(page.getByTestId('avatar-editor')).toBeVisible()
      await shot(page, dev, 'avatar-skin')
      await page.getByRole('tab', { name: 'Hair', exact: true }).click()
      await shot(page, dev, 'avatar-hair')
      await page.getByRole('tab', { name: 'Glasses' }).click()
      await shot(page, dev, 'avatar-glasses')
      await context.close()
    }
    // customized explorers in the world: town, room, celebration
    {
      const { context, page } = await qaPage(browser, dev, seedJson(custom()))
      await openHome(page)
      await page.waitForTimeout(800) // let generated textures land
      await shot(page, dev, 'avatar-town')
      await page.locator('.main-nav').getByRole('button', { name: 'My room' }).click()
      await expect(page.locator('[data-scene="room"][data-scene-ready="true"]')).toBeAttached()
      await page.waitForTimeout(600)
      await shot(page, dev, 'avatar-room')
      await context.close()
    }
    // opening-day celebration — both explorers cheering with custom looks
    {
      const s = custom()
      s.city.projects.road = { kits: 1, status: 'building' }
      s.city.currentProjectId = 'road'
      s.city.suggestedProjectId = 'library'
      s.city.name = 'Sunny Town'
      const { context, page } = await qaPage(browser, dev, seedJson(s))
      await openHome(page)
      await page.getByRole('button', { name: 'Add a kit' }).click()
      await page.getByRole('button', { name: 'Yes, add it!' }).click()
      await expect(page.getByRole('dialog', { name: 'A building opened!' })).toBeVisible()
      await page.waitForTimeout(500)
      await shotOverlay(page, dev, 'avatar-celebration')
      await context.close()
    }
  }
})

test.afterAll(() => {
  writeFileSync(`${DIR}/QA-console.log`, consoleLog.join('\n') || 'no console errors\n')
})
