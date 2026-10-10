import { expect, test, type Browser, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { citySeed, leagueSeed, promotionSeed, seedJson, v2SeedJson, freshState } from './seed'

const DIR = 'screenshots'
const CAPTURE = ['phone-chromium', 'tablet-chromium']

function captureOnly(projectName: string) {
  test.skip(!CAPTURE.includes(projectName), 'screenshots only on phone + tablet profiles')
}

async function shot(page: Page, project: string, name: string) {
  await page.screenshot({ path: `${DIR}/${project}-${name}.png`, fullPage: true })
}

// overlays/sheets are position:fixed — fullPage stitching renders them oddly,
// so capture the viewport for dialog shots
async function shotOverlay(page: Page, project: string, name: string) {
  await page.screenshot({ path: `${DIR}/${project}-${name}.png`, fullPage: false })
}

async function seededPage(browser: Browser, projectName: string, json: string, reducedMotion = false) {
  const project = test.info().project
  const context = await browser.newContext({
    viewport: project.use.viewport as { width: number; height: number },
    reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
    deviceScaleFactor: 1,
    isMobile: projectName === 'phone-chromium',
    hasTouch: true,
  })
  // seed once: addInitScript re-runs on every navigation, so skip if a save exists
  await context.addInitScript((j) => {
    if (!window.localStorage.getItem('wonderwood:v1')) {
      window.localStorage.setItem('wonderwood:v1', j)
    }
  }, json)
  const page = await context.newPage()
  return { context, page }
}

test('capture the Stage 1 screens', async ({ page }, testInfo) => {
  captureOnly(testInfo.project.name)
  mkdirSync(DIR, { recursive: true })
  const p = testInfo.project.name
  await page.goto('/')
  await shot(page, p, '01-picker')

  await page.getByRole('button', { name: 'Theodore' }).click()
  await expect(page.locator('[data-scene="town"][data-scene-ready="true"]')).toBeAttached()
  await shot(page, p, '02-child-home')

  // claim a quest so the grown-ups screen has a pending row
  await page
    .locator('.quest-card', { hasText: 'Spanish lesson' })
    .getByRole('button', { name: 'I did it!' })
    .click()
  await page.getByLabel('Explorer menu').click()
  await page.getByRole('menuitem', { name: 'Switch explorer' }).click()
  await page.getByRole('button', { name: 'Grown-ups' }).click()
  for (const d of '1234') await page.getByRole('button', { name: `Digit ${d}` }).click()
  for (const d of '1234') await page.getByRole('button', { name: `Digit ${d}` }).click() // confirm
  await expect(page.getByText('Waiting for you')).toBeVisible()
  await shot(page, p, '03-grownups')

  await page.getByRole('button', { name: 'Done — back to explorers' }).click()
  await page.getByRole('button', { name: 'Theodore' }).click()
  await expect(page.locator('[data-scene="town"][data-scene-ready="true"]')).toBeAttached()

  await page.getByRole('button', { name: 'Shop' }).click()
  await page.locator('.shop-card', { hasText: 'Leaf hat' }).click()
  await expect(page.locator('.shop-preview .avatar-hat')).toBeVisible()
  await shot(page, p, '04-shop-preview')

  // buy + wear so the room shot shows the hat
  await page.getByRole('button', { name: 'Buy for 20 coins' }).click()
  await page.getByRole('button', { name: 'Wear it' }).click()
  await page.getByRole('button', { name: 'My room' }).click()
  await expect(page.locator('[data-scene="room"][data-scene-ready="true"]')).toBeAttached()
  await page.getByRole('button', { name: 'Start train' }).click()
  await page.waitForTimeout(600)
  await shot(page, p, '05-room')
})

test('town build stages', async ({ browser }, testInfo) => {
  captureOnly(testInfo.project.name)
  mkdirSync(DIR, { recursive: true })
  const p = testInfo.project.name
  const cases: [string, Parameters<typeof citySeed>[0], Parameters<typeof citySeed>[1]][] = [
    ['road-half', { road: 1 }, {}],
    ['road-open', { road: 2, library: 0 }, { current: 'library' }],
    ['library-foundations', { road: 2, library: 1 }, { current: 'library' }],
    ['library-walls', { road: 2, library: 4 }, { current: 'library' }],
    ['library-roof', { road: 2, library: 5 }, { current: 'library' }],
    ['library-open', { road: 2, library: 6 }, { current: null }],
    ['next-building', { road: 2, library: 6 }, { current: null, suggested: 'hospital' }],
  ]
  for (const [name, kits, opts] of cases) {
    const { context, page } = await seededPage(browser, p, seedJson(citySeed(kits, opts ?? {})))
    await page.goto('/')
    await page.getByRole('button', { name: 'Theodore' }).click()
    await expect(page.locator('[data-scene="town"][data-scene-ready="true"]')).toBeAttached()
    await page.waitForTimeout(700)
    await shot(page, p, `06-town-${name}`)
    if (name === 'next-building') {
      // grown-ups pick: suggestion highlighted + Build this next
      await page.getByLabel('Explorer menu').click()
      await page.getByRole('menuitem', { name: 'Switch explorer' }).click()
      await page.getByRole('button', { name: 'Grown-ups' }).click()
      for (const d of '1234') await page.getByRole('button', { name: `Digit ${d}` }).click()
      for (const d of '1234') await page.getByRole('button', { name: `Digit ${d}` }).click()
      await expect(page.getByText('Next building')).toBeVisible()
      await shot(page, p, '06-town-next-building-grownups')
    }
    await context.close()
  }
})

test('founders bridge + opening celebration', async ({ browser }, testInfo) => {
  captureOnly(testInfo.project.name)
  mkdirSync(DIR, { recursive: true })
  const p = testInfo.project.name

  // v2 save with 7 stars migrates → Founders' Bridge with 7 planks
  {
    const { context, page } = await seededPage(browser, p, v2SeedJson({ theodore: 4, leonard: 3 }))
    await page.goto('/')
    await page.getByRole('button', { name: 'Theodore' }).click()
    await expect(page.locator('[data-scene="town"][data-scene-ready="true"]')).toBeAttached()
    await expect(page.getByTestId('founders-bridge')).toHaveText("Founders' Bridge: 7 planks")
    await page.waitForTimeout(700)
    await shot(page, p, '11-founders-bridge')
    await context.close()
  }

  // live kit buy → road opens → opening-day celebration
  {
    const s = citySeed({ road: 1 })
    s.children.theodore.coins = 30
    const { context, page } = await seededPage(browser, p, seedJson(s))
    await page.goto('/')
    await page.getByRole('button', { name: 'Theodore' }).click()
    await expect(page.locator('[data-scene="town"][data-scene-ready="true"]')).toBeAttached()
    await page.getByRole('button', { name: 'Add a kit' }).click()
    await page.getByRole('button', { name: 'Yes, add it!' }).click()
    await expect(page.getByRole('dialog', { name: 'A building opened!' })).toBeVisible()
    await page.waitForTimeout(800) // let the pop animation settle
    await shot(page, p, '12-opening')
    await context.close()
  }
})

test('league screen at ranks 1 / 7 / 14', async ({ browser }, testInfo) => {
  captureOnly(testInfo.project.name)
  mkdirSync(DIR, { recursive: true })
  const p = testInfo.project.name
  for (const rank of [1, 7, 14]) {
    const { context, page } = await seededPage(browser, p, seedJson(leagueSeed(rank)))
    await page.goto('/')
    await page.getByRole('button', { name: 'Theodore' }).click()
    await expect(page.locator('[data-scene="town"][data-scene-ready="true"]')).toBeAttached()
    await page.getByLabel("Theodore's league").click()
    await shot(page, p, `07-league-r${rank}`)
    await context.close()
  }
})

test('promotion overlay + badge gallery', async ({ browser }, testInfo) => {
  captureOnly(testInfo.project.name)
  mkdirSync(DIR, { recursive: true })
  const p = testInfo.project.name

  // mid-animation promotion overlay
  {
    const { context, page } = await seededPage(browser, p, seedJson(promotionSeed()))
    await page.goto('/')
    await page.getByRole('button', { name: 'Theodore' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.waitForTimeout(1050) // mid-morph: new badge bursting in
    await shot(page, p, '08-promotion')
    await context.close()
  }

  // reduced-motion static variant
  {
    const { context, page } = await seededPage(browser, p, seedJson(promotionSeed()), true)
    await page.goto('/')
    await page.getByRole('button', { name: 'Theodore' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await shot(page, p, '09-promotion-reduced')
    await context.close()
  }

  // all 14 badges in a grid
  {
    const { context, page } = await seededPage(browser, p, seedJson(freshState()))
    await page.goto('/?badges')
    await expect(page.locator('.badge-cell')).toHaveCount(14)
    await shot(page, p, '10-badges')
    await context.close()
  }
})

test('capture the quest v5 screens', async ({ browser }, testInfo) => {
  captureOnly(testInfo.project.name)
  mkdirSync(DIR, { recursive: true })
  const p = testInfo.project.name

  // --- Theodore home: core + bonus cards ---
  const s1 = freshState()
  const t = await seededPage(browser, p, seedJson(s1))
  await t.page.goto('/')
  await t.page.getByRole('button', { name: 'Theodore' }).click()
  await expect(t.page.locator('[data-scene="town"][data-scene-ready="true"]')).toBeAttached()
  await shot(t.page, p, '30-home-theodore-core-bonus')

  // --- challenge with a hint shown ---
  const bonusFold = t.page.locator('.bonus-fold')
  if ((await bonusFold.count()) > 0 && (await bonusFold.getAttribute('open')) === null) {
    await bonusFold.locator('summary').click()
  }
  await t.page
    .locator('.quest-card', { hasText: "Builders' math" })
    .getByRole('button', { name: 'Start' })
    .click()
  await expect(t.page.locator('.challenge-prompt')).toBeVisible()
  await t.page.getByRole('button', { name: 'Hint' }).click()
  await t.page.waitForTimeout(450) // let the sheet-in animation finish
  await shotOverlay(t.page, p, '31-challenge-hint')
  await t.page.getByRole('button', { name: 'Later' }).click()

  // --- housework job picker ---
  await t.page
    .locator('.quest-card', { hasText: 'Helping at home' })
    .getByRole('button', { name: 'I did it!' })
    .click()
  await expect(t.page.getByText('Which job did you do?')).toBeVisible()
  await t.page.waitForTimeout(450)
  await shotOverlay(t.page, p, '32-housework-jobs')
  await t.page.getByRole('button', { name: 'Put away the agreed toys' }).click()
  await t.context.close()

  // --- Leonard home + reading sheet + journal ---
  const s2 = freshState((s) => {
    s.claims['old-read'] = {
      id: 'old-read', childId: 'leonard', questId: 'reading',
      activityDate: '2026-10-08', role: 'core', status: 'approved',
      claimedAt: '2026-10-08T10:00:00Z', reward: { coins: 10, stars: 1 },
      details: { kind: 'reading', unit: 'book', title: 'The Gruffalo', withGrownUp: true },
    }
    s.claims['old-read2'] = {
      id: 'old-read2', childId: 'leonard', questId: 'reading',
      activityDate: '2026-10-09', role: 'core', status: 'approved',
      claimedAt: '2026-10-09T10:00:00Z', reward: { coins: 5, stars: 0 },
      details: { kind: 'reading', unit: 'chapter', title: 'Dragons Love Tacos', withGrownUp: false },
    }
  })
  const l = await seededPage(browser, p, seedJson(s2))
  await l.page.goto('/')
  await l.page.getByRole('button', { name: 'Leonard' }).click()
  await expect(l.page.locator('[data-scene="town"][data-scene-ready="true"]')).toBeAttached()
  await shot(l.page, p, '33-home-leonard')

  await l.page
    .locator('.quest-card', { hasText: 'Reading' })
    .first()
    .getByRole('button', { name: 'I read' })
    .click({ force: true })
  await expect(l.page.locator('.reading-units')).toBeVisible()
  await l.page.waitForTimeout(450)
  await shotOverlay(l.page, p, '34-reading-sheet')
  await l.page.getByRole('button', { name: 'A book' }).click()
  await l.page.locator('.sheet .form-input').fill('The Snail and the Whale')
  await l.page.locator('.sheet').getByRole('button', { name: 'Done' }).click({ force: true })

  // claim something + journal
  await l.page
    .locator('.quest-card', { hasText: 'Violin practice' })
    .getByRole('button', { name: 'I did it!' })
    .click()
  await l.page.getByRole('button', { name: 'My reading journal' }).click({ force: true })
  await expect(l.page.locator('.journal-totals')).toBeVisible()
  await l.page.waitForTimeout(450)
  await shotOverlay(l.page, p, '35-reading-journal')
  await l.page.getByRole('button', { name: 'Close' }).click({ force: true })

  // --- grown-ups: approvals with details + schedule editor ---
  await l.page.getByLabel('Explorer menu').click()
  await l.page.getByRole('menuitem', { name: 'Switch explorer' }).click()
  await l.page.getByRole('button', { name: 'Grown-ups' }).click()
  await l.page.waitForSelector('.pin-key')
  for (const d of '1234') await l.page.getByRole('button', { name: `Digit ${d}` }).click()
  const confirm = l.page.getByText('Tap the same PIN again')
  if (await confirm.isVisible().catch(() => false)) {
    for (const d of '1234') await l.page.getByRole('button', { name: `Digit ${d}` }).click()
  }
  await expect(l.page.locator('.pending-panel .claim-row').first()).toBeVisible()
  await shot(l.page, p, '36-approvals-details')

  const panel = l.page.locator('.panel', { hasText: 'Leonard’s quests' })
  await panel.locator('summary').click()
  await expect(panel.locator('.quest-day-rows')).toBeVisible()
  await shot(l.page, p, '37-schedule-editor')

  // pause today → rest day card
  await panel.locator('label.sched-check', { hasText: 'Today is a rest day' }).click()
  await panel.getByRole('button', { name: 'Save schedule & settings' }).click()
  await l.page.getByRole('button', { name: 'Done — back to explorers' }).click()
  await l.page.getByRole('button', { name: 'Leonard' }).click()
  await expect(l.page.locator('[data-scene="town"][data-scene-ready="true"]')).toBeAttached()
  await l.page.waitForTimeout(600)
  await expect(l.page.getByText('Rest day — enjoy!')).toBeVisible()
  await shot(l.page, p, '38-rest-day')
  await l.context.close()
})

test('capture the v6 screens', async ({ browser }, testInfo) => {
  captureOnly(testInfo.project.name)
  mkdirSync(DIR, { recursive: true })
  const p = testInfo.project.name

  const openTown = freshState((s) => {
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
    ]
    const readClaim = (i: number, childId: 'theodore' | 'leonard', unit: 'book' | 'chapter', date: string) => {
      s.claims[`jr${i}`] = {
        id: `jr${i}`, childId, questId: 'reading', activityDate: date,
        role: i === 1 ? 'core' : 'bonus', status: 'approved', claimedAt: `${date}T10:00:00Z`,
        reward: { coins: i === 1 ? 10 : 5, stars: i === 1 ? 1 : 0 },
        details: { kind: 'reading', unit, withGrownUp: false },
      }
    }
    for (let i = 1; i <= 6; i += 1) readClaim(i, 'leonard', 'book', '2026-10-08')
    for (let i = 7; i <= 9; i += 1) readClaim(i, 'theodore', 'book', '2026-10-09')
    for (let i = 10; i <= 13; i += 1) readClaim(i, 'leonard', 'chapter', '2026-10-10')
    for (let i = 14; i <= 15; i += 1) readClaim(i, 'theodore', 'chapter', '2026-10-11')
    // a repaired incident for the acknowledgment card
    s.repairs['inc-a'] = {
      id: 'inc-a', childId: 'leonard', situation: 'scattering',
      createdAt: '2026-10-10T10:00:00Z', repairedAt: '2026-10-10T12:00:00Z',
    }
  })

  // --- town at every shape ---
  const t = await seededPage(browser, p, seedJson(openTown))
  await t.page.goto('/')
  await t.page.getByRole('button', { name: 'Theodore' }).click()
  await expect(t.page.locator('[data-scene="town"][data-scene-ready="true"]')).toBeAttached()
  await t.page.waitForTimeout(800)
  await shot(t.page, p, '40-town-fit')
  await t.context.close()

  // tablet portrait — a bespoke viewport for the portrait check
  {
    const context = await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true })
    await context.addInitScript((j) => {
      if (!window.localStorage.getItem('wonderwood:v1')) window.localStorage.setItem('wonderwood:v1', j)
    }, seedJson(openTown))
    const page = await context.newPage()
    await page.goto('/')
    await page.getByRole('button', { name: 'Theodore' }).click()
    await expect(page.locator('[data-scene="town"][data-scene-ready="true"]')).toBeAttached()
    await page.waitForTimeout(800)
    await shot(page, `${p}-portrait`, '40-town-fit')
    await context.close()
  }

  // --- each building's play view (opened via the town-tap test hook) ---
  const plays: [string, string][] = [
    ['library', '41-play-library'],
    ['music-school', '42-play-music'],
    ['police-station', '43-play-police'],
    ['hospital', '44-play-hospital'],
  ]
  for (const [name, shotName] of plays) {
    const s = await seededPage(browser, p, seedJson(openTown))
    await s.page.goto('/')
    await s.page.getByRole('button', { name: 'Leonard' }).click()
    await expect(s.page.locator('[data-scene="town"][data-scene-ready="true"]')).toBeAttached()
    await s.page.waitForTimeout(500)
    await s.page.evaluate((id) => {
      ;(window as unknown as { __townTap: (p: string) => void }).__townTap(id)
    }, name)
    await s.page.getByRole('button', { name: 'Play!' }).click()
    await s.page.waitForTimeout(500)
    await shotOverlay(s.page, p, shotName)
    await s.context.close()
  }

  // --- naming picker + customize + postcard album ---
  {
    const s = await seededPage(browser, p, seedJson(openTown))
    await s.page.goto('/')
    await s.page.getByRole('button', { name: 'Theodore' }).click()
    await expect(s.page.locator('[data-scene="town"][data-scene-ready="true"]')).toBeAttached()
    await s.page.getByRole('button', { name: /Sunny Meadow/ }).click()
    await s.page.waitForTimeout(450)
    await shotOverlay(s.page, p, '45-name-picker')
    await s.page.getByRole('button', { name: 'Not now' }).click()
    await s.page.waitForSelector('.sheet-backdrop', { state: 'detached' })
    await s.page.waitForTimeout(200)

    await s.page.evaluate(() => {
      ;(window as unknown as { __townTap: (p: string) => void }).__townTap('library')
    })
    await expect(s.page.getByRole('dialog', { name: /Library|Rainbow/ })).toBeVisible()
    await s.page.getByRole('button', { name: 'Change colors' }).click()
    await s.page.waitForTimeout(450)
    await shotOverlay(s.page, p, '46-customize')
    await s.page.getByRole('button', { name: 'Looks great!' }).click()

    await s.page.getByRole('button', { name: 'My room' }).click()
    await s.page.getByRole('button', { name: /My postcard album/ }).click()
    await s.page.waitForTimeout(450)
    await shotOverlay(s.page, p, '47-postcards')
    await s.context.close()
  }

  // --- Leonard home: weekly card + repair acknowledgment + journal already covered ---
  {
    const s = await seededPage(browser, p, seedJson(openTown))
    await s.page.goto('/')
    await s.page.getByRole('button', { name: 'Leonard' }).click()
    await expect(s.page.locator('[data-scene="town"][data-scene-ready="true"]')).toBeAttached()
    await s.page.waitForTimeout(400)
    await shot(s.page, p, '48-home-weekly-repair')
    await s.context.close()
  }

  // --- grown-ups: schedule editor + reset & repair ---
  {
    const s = await seededPage(browser, p, seedJson(openTown))
    await s.page.goto('/')
    await s.page.getByRole('button', { name: 'Grown-ups' }).click()
    await s.page.waitForSelector('.pin-key')
    for (const d of '1234') await s.page.getByRole('button', { name: `Digit ${d}` }).click()
    const conf = s.page.getByText('Tap the same PIN again')
    if (await conf.isVisible().catch(() => false)) {
      for (const d of '1234') await s.page.getByRole('button', { name: `Digit ${d}` }).click()
    }
    const panel = s.page.locator('.panel', { hasText: 'Leonard’s quests' })
    await panel.locator('summary').click()
    await s.page.locator('.repairs-panel').scrollIntoViewIfNeeded()
    await shot(s.page, p, '49-grownups-schedule-repairs')
    await s.context.close()
  }
})
