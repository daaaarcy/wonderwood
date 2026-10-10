import { expect, test, type Browser, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { bridgeSeed, leagueSeed, promotionSeed, seedJson } from './seed'

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
  await expect(page.locator('[data-scene="island"][data-scene-ready="true"]')).toBeAttached()
  await shot(page, p, '02-child-home')

  // claim a quest so the grown-ups screen has a pending row
  await page
    .locator('.quest-card', { hasText: 'Do your Duolingo lesson' })
    .getByRole('button', { name: 'I did it!' })
    .click()
  await page.getByRole('button', { name: 'Switch explorer' }).click()
  await page.getByRole('button', { name: 'Grown-ups' }).click()
  for (const d of '1234') await page.getByRole('button', { name: `Digit ${d}` }).click()
  for (const d of '1234') await page.getByRole('button', { name: `Digit ${d}` }).click() // confirm
  await expect(page.getByText('Waiting for you')).toBeVisible()
  await shot(page, p, '03-grownups')

  await page.getByRole('button', { name: 'Done — back to explorers' }).click()
  await page.getByRole('button', { name: 'Theodore' }).click()
  await expect(page.locator('[data-scene="island"][data-scene-ready="true"]')).toBeAttached()

  await page.getByRole('button', { name: 'Shop' }).click()
  await page.locator('.shop-card', { hasText: 'Leaf hat' }).click()
  await expect(page.locator('.shop-preview .avatar-hat')).toBeVisible()
  await shot(page, p, '04-shop-preview')

  // buy + wear so the room shot shows the hat
  await page.getByRole('button', { name: 'Buy for 20 coins' }).click()
  await page.getByRole('button', { name: 'Wear it' }).click()
  await page.getByRole('button', { name: 'Back' }).click()
  await page.getByRole('button', { name: 'My room' }).click()
  await expect(page.locator('[data-scene="room"][data-scene-ready="true"]')).toBeAttached()
  await page.getByRole('button', { name: 'Start train' }).click()
  await page.waitForTimeout(600)
  await shot(page, p, '05-room')
})

test('bridge at 0 / 6 / 12 planks', async ({ browser }, testInfo) => {
  captureOnly(testInfo.project.name)
  mkdirSync(DIR, { recursive: true })
  const p = testInfo.project.name
  for (const planks of [0, 6, 12]) {
    const { context, page } = await seededPage(browser, p, seedJson(bridgeSeed(planks)))
    await page.goto('/')
    await page.getByRole('button', { name: 'Theodore' }).click()
    await expect(page.locator('[data-scene="island"][data-scene-ready="true"]')).toBeAttached()
    await page.waitForTimeout(900) // let plank drop-in + explorer walk settle
    await expect(page.getByTestId('bridge-status')).toHaveText(`Bridge: ${planks} of 12 planks`)
    await shot(page, p, `06-bridge-${planks}`)
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
    await expect(page.locator('[data-scene="island"][data-scene-ready="true"]')).toBeAttached()
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
    const { context, page } = await seededPage(browser, p, seedJson(bridgeSeed(0)))
    await page.goto('/?badges')
    await expect(page.locator('.badge-cell')).toHaveCount(14)
    await shot(page, p, '10-badges')
    await context.close()
  }
})
