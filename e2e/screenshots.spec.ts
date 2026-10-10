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
    .locator('.quest-card', { hasText: 'Do your Duolingo lesson' })
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
    await page.getByRole('button', { name: 'Buy & add one kit' }).click()
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
