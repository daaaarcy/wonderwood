import { expect, test, type Page } from '@playwright/test'
import { freshState, seedJson } from './seed'
import type { GameState } from '../src/domain/types'
import { localDateKey } from '../src/domain/week'

async function seededPage(page: Page, s: GameState) {
  await page.addInitScript((json) => {
    if (!window.localStorage.getItem('wonderwood:v1')) window.localStorage.setItem('wonderwood:v1', json)
  }, seedJson(s))
  await page.goto('/')
}

async function pickExplorer(page: Page, name: 'Theodore' | 'Leonard') {
  await page.getByRole('button', { name }).click()
  await expect(page.locator('[data-scene="town"][data-scene-ready="true"]')).toBeAttached()
}

async function unlockGrownups(page: Page) {
  await page.getByRole('button', { name: 'Grown-ups' }).click()
  await page.waitForSelector('.pin-key')
  for (const d of '1234') await page.getByRole('button', { name: `Digit ${d}` }).click()
  const confirm = page.getByText('Tap the same PIN again')
  if (await confirm.isVisible().catch(() => false)) {
    for (const d of '1234') await page.getByRole('button', { name: `Digit ${d}` }).click()
  }
  await expect(page.getByText('Waiting for you')).toBeVisible()
}

/* ---------------- remembered explorer ---------------- */

test('chosen explorer is remembered across reload; switch clears it', async ({ page }) => {
  await seededPage(page, freshState())
  await pickExplorer(page, 'Leonard')
  await expect(page.locator('.stat-bar')).toContainText('Leonard')
  // reload → straight to Leonard's home, no picker
  await page.reload()
  await expect(page.locator('[data-scene="town"][data-scene-ready="true"]')).toBeAttached()
  await expect(page.locator('.stat-bar')).toContainText('Leonard')
  // grown-ups → back returns to the remembered child's home too
  await page.getByLabel('Explorer menu').click()
  await page.getByRole('menuitem', { name: 'Switch explorer' }).click()
  await page.getByRole('button', { name: 'Grown-ups' }).click()
  await page.getByRole('button', { name: 'Back to explorers' }).click()
  // child was cleared by the switch → picker
  await expect(page.getByRole('button', { name: 'Leonard' })).toBeVisible()
  // pick again, switch to picker, reload → still the picker
  await page.getByRole('button', { name: 'Leonard' }).click()
  await expect(page.locator('.stat-bar')).toContainText('Leonard')
  await page.getByLabel('Explorer menu').click()
  await page.getByRole('menuitem', { name: 'Switch explorer' }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Theodore' })).toBeVisible()
})

/* ---------------- fixed child nav ---------------- */

test('child nav stays visible after scrolling to the bottom', async ({ page }) => {
  await seededPage(page, freshState())
  await pickExplorer(page, 'Theodore')
  const nav = page.locator('.main-nav')
  const box = await nav.boundingBox()
  expect(box).not.toBeNull()
  // scroll the page hard — the fixed nav must still be on-screen
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(150)
  const box2 = await nav.boundingBox()
  const vh = await page.evaluate(() => innerHeight)
  expect(box2!.y + box2!.height).toBeGreaterThan(vh - 120)
  // and tapping it still switches screens
  await nav.getByRole('button', { name: 'My room' }).click()
  await expect(page.locator('.room-screen')).toBeVisible()
})

test('tapping the nav over the town canvas does not open a town sheet', async ({ page }) => {
  await seededPage(page, freshState())
  await pickExplorer(page, 'Theodore')
  // nav sits fixed over the canvas area — its taps must not reach the town
  await page.locator('.main-nav').getByRole('button', { name: 'Shop' }).click()
  await page.waitForTimeout(300)
  await expect(page.locator('.sheet-backdrop')).toHaveCount(0)
  await expect(page.locator('[role="dialog"]')).toHaveCount(0)
  await page.locator('.main-nav').getByRole('button', { name: 'Home' }).click()
  await page.waitForTimeout(300)
  await expect(page.locator('[role="dialog"]')).toHaveCount(0)
})

/* ---------------- grown-ups tabs ---------------- */

function pendingSeed(): GameState {
  const today = localDateKey(new Date(), 'UTC')
  const s = freshState()
  s.claims['v9-p1'] = {
    id: 'v9-p1',
    childId: 'theodore',
    questId: 'spanish',
    activityDate: today,
    role: 'core',
    status: 'pending',
    claimedAt: `${today}T10:00:00Z`,
  }
  s.claims['v9-p2'] = {
    id: 'v9-p2',
    childId: 'leonard',
    questId: 'reading',
    activityDate: today,
    role: 'core',
    status: 'pending',
    claimedAt: `${today}T10:00:00Z`,
    details: { kind: 'reading', unit: 'book', withGrownUp: true, title: 'A Book' },
  }
  return s
}

test('grown-ups: five tabs, pending badge, approve flow, back button', async ({ page }) => {
  await seededPage(page, pendingSeed())
  await unlockGrownups(page)

  // pending claims on top + badge shows 2
  const approveTab = page.locator('.grownups-nav .tab', { hasText: 'Approve' })
  await expect(approveTab.locator('.tab-badge')).toHaveText('2')
  await expect(page.locator('.pending-panel')).toBeVisible()
  await expect(page.locator('.pending-panel .claim-row')).toHaveCount(2)

  // approve one → badge drops to 1
  await page
    .locator('.pending-panel .claim-row')
    .first()
    .getByRole('button', { name: 'Approve' })
    .click()
  await expect(approveTab.locator('.tab-badge')).toHaveText('1')

  // every tab reachable
  await page.getByRole('button', { name: 'Tasks' }).click()
  await expect(page.locator('.tasks-panel')).toBeVisible()
  await page.getByRole('button', { name: 'Schedule' }).click()
  await expect(page.locator('.quest-day-rows')).toBeVisible()
  await page.getByRole('tab', { name: 'Leonard' }).click()
  await expect(page.locator('.quest-day-rows')).toBeVisible()
  await page.getByRole('button', { name: 'Repair' }).click()
  await expect(page.locator('.repairs-panel')).toBeVisible()
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByRole('button', { name: 'Change PIN' })).toBeVisible()

  // header back button always there; old footer button gone
  await page.getByRole('button', { name: 'Back to explorers' }).click()
  await expect(page.getByRole('button', { name: 'Theodore' })).toBeVisible()
})

test('grown-ups: change PIN returns to the PIN-set stage', async ({ page }) => {
  await seededPage(page, freshState())
  await unlockGrownups(page)
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Change PIN' }).click()
  await expect(page.getByText('Choose a 4-digit PIN')).toBeVisible()
  await page.waitForSelector('.pin-key')
})

/* ---------------- avatar editor ---------------- */

test('avatar editor: change look → save → persists across reload', async ({ page }) => {
  await seededPage(page, freshState())
  await pickExplorer(page, 'Theodore')
  const before = await page.locator('.explorer-menu-btn .avatar-body, .avatar-crop .avatar-body').first().getAttribute('src')

  await page.getByLabel('Explorer menu').click()
  await page.getByRole('menuitem', { name: 'Change my look' }).click()
  await expect(page.getByTestId('avatar-editor')).toBeVisible()

  await page.getByRole('tab', { name: 'Hair', exact: true }).click()
  await page.getByRole('button', { name: /Hair: Mohawk/ }).click()
  await page.getByRole('tab', { name: 'Eyes' }).click()
  await page.getByRole('button', { name: /Eyes: Sparkly/ }).click()
  await page.getByRole('tab', { name: 'Skin' }).click()
  await page.getByRole('button', { name: /Skin: #d39a6a/ }).click()
  await page.getByTestId('save-look').click()

  // back on home — header avatar uses the new look
  const after = await page.locator('.avatar-crop .avatar-body').first().getAttribute('src')
  expect(after).not.toBe(before)

  // reload → explorer remembered (straight to home) and look persists
  await page.reload()
  await expect(page.locator('[data-scene="town"][data-scene-ready="true"]')).toBeAttached()
  const reloaded = await page.locator('.avatar-crop .avatar-body').first().getAttribute('src')
  expect(reloaded).toBe(after)
})

test('avatar editor from My room: cancel changes nothing', async ({ page }) => {
  await seededPage(page, freshState())
  await pickExplorer(page, 'Theodore')
  const before = await page.locator('.avatar-crop .avatar-body').first().getAttribute('src')
  await page.locator('.main-nav').getByRole('button', { name: 'My room' }).click()
  await page.getByRole('button', { name: 'Change my look' }).click()
  await expect(page.getByTestId('avatar-editor')).toBeVisible()
  await page.getByRole('button', { name: 'Surprise me' }).click()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.locator('.room-screen')).toBeVisible()
  const after = await page.locator('.avatar-crop .avatar-body').first().getAttribute('src')
  expect(after).toBe(before)
})
