import { expect, test, type Page } from '@playwright/test'
import { freshState, seedJson } from './seed'
import type { GameState } from '../src/domain/types'

async function seededPage(page: Page, s: GameState) {
  await page.addInitScript((json) => {
    window.localStorage.setItem('wonderwood:v1', json)
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

async function switchToExplorer(page: Page, name: 'Theodore' | 'Leonard') {
  await page.getByLabel('Explorer menu').click()
  await page.getByRole('menuitem', { name: 'Switch explorer' }).click()
  await pickExplorer(page, name)
}

/** Bottom-nav tab — the Shop screen also has a "My room" tab button. */
function navTab(page: Page, name: string) {
  return page.locator('.main-nav').getByRole('button', { name })
}

test('furniture: buy → auto-places → room picker remove → shop re-place', async ({ page }) => {
  await seededPage(
    page,
    freshState((s) => {
      s.children.theodore.coins = 500
    }),
  )
  await pickExplorer(page, 'Theodore')

  // Shop → My room tab → buy the Explorer desk (auto-places in the desk spot)
  await page.getByRole('button', { name: 'Shop' }).click()
  await page.getByTestId('tab-room').click()
  await expect(page.getByTestId('room-preview')).toBeVisible()
  await page.locator('.shop-card', { hasText: 'Explorer desk' }).click()
  await page.getByRole('button', { name: 'Buy for 120 coins' }).click()
  await expect(page.getByTestId('coin-count')).toHaveText('380')
  await expect(page.getByText('In my room', { exact: true })).toBeVisible()

  // the room shows it in the desk spot
  await navTab(page, 'My room').click()
  await expect(page.locator('[data-scene="room"][data-scene-ready="true"]')).toBeAttached()
  await expect(page.getByTestId('spot-desk')).toHaveText('desk-explorer')
  // starter bed is the fallback, not an owned item
  await expect(page.getByTestId('spot-bed')).toHaveText('none')

  // tap the desk in the scene → picker → Remove (item stays owned, out of the room)
  await page.evaluate(() => {
    ;(window as unknown as { __roomTap: (s: string) => void }).__roomTap('desk')
  })
  await expect(page.getByRole('dialog', { name: 'Desk spot' })).toBeVisible()
  await expect(page.getByTestId('pick-desk-explorer')).toContainText('In the room')
  await page.getByTestId('spot-remove').click()
  await expect(page.getByTestId('spot-desk')).toHaveText('none')

  // back in the shop it offers "Place it in my room" again
  await page.getByRole('button', { name: 'Shop' }).click()
  await page.getByTestId('tab-room').click()
  await page.locator('.shop-card', { hasText: 'Explorer desk' }).click()
  await page.getByTestId('place-it').click()
  await navTab(page, 'My room').click()
  await expect(page.getByTestId('spot-desk')).toHaveText('desk-explorer')
})

test('furniture: second desk waits in inventory; placing swaps the spot', async ({ page }) => {
  await seededPage(
    page,
    freshState((s) => {
      s.children.theodore.coins = 500
      s.children.theodore.inventory.push('desk-explorer')
      s.children.theodore.placed.desk = 'desk-explorer'
    }),
  )
  await pickExplorer(page, 'Theodore')
  await page.getByRole('button', { name: 'Shop' }).click()
  await page.getByTestId('tab-room').click()
  await page.locator('.shop-card', { hasText: 'Corner desk' }).click()
  await page.getByRole('button', { name: 'Buy for 160 coins' }).click()
  await expect(page.getByTestId('coin-count')).toHaveText('340')
  // desk spot is taken → the new desk waits in the bag
  await expect(page.getByTestId('place-it')).toBeVisible()
  await page.getByTestId('place-it').click()
  // placing it swaps the old desk out
  await navTab(page, 'My room').click()
  await expect(page.getByTestId('spot-desk')).toHaveText('desk-corner')
})

test('custom task: grown-up creates → only assigned child sees → claim → approve pays configured reward', async ({
  page,
}) => {
  await seededPage(page, freshState())
  await unlockGrownups(page)

  // Tasks panel → add a task just for Theodore
  const panel = page.locator('.tasks-panel')
  await panel.getByTestId('add-task').click()
  await panel.getByPlaceholder('e.g. Water the plants').fill('Water the plants')
  await panel.getByTestId('task-child-leonard').click() // uncheck → only Theodore
  await panel.getByRole('button', { name: 'More stars' }).click() // 1 → 2 stars
  await panel.getByTestId('task-save').click()
  await expect(panel.locator('.task-row').first()).toContainText('Water the plants')
  await expect(panel.locator('.task-row').first()).toContainText('Every day')

  // back to the picker → Theodore sees the card under "From grown-ups"
  await page.getByRole('button', { name: 'Done — back to explorers' }).click()
  await pickExplorer(page, 'Theodore')
  await expect(page.getByText('From grown-ups')).toBeVisible()
  const card = page.getByTestId('custom-card')
  await expect(card).toContainText('Water the plants')
  await expect(card.getByTestId('custom-reward')).toContainText('2 stars')
  await card.getByRole('button', { name: 'I did it!' }).click()
  await expect(card.getByText('Waiting for a grown-up…')).toBeVisible()

  // sibling does not see it
  await switchToExplorer(page, 'Leonard')
  await expect(page.getByText('From grown-ups')).toHaveCount(0)
  await expect(page.getByTestId('custom-card')).toHaveCount(0)

  // grown-up approves → configured reward paid
  await switchToExplorer(page, 'Theodore')
  await page.getByLabel('Explorer menu').click()
  await page.getByRole('menuitem', { name: 'Switch explorer' }).click()
  await page.getByRole('button', { name: 'Grown-ups' }).click()
  await page.waitForSelector('.pin-key')
  for (const d of '1234') await page.getByRole('button', { name: `Digit ${d}` }).click()
  const row = page.locator('.pending-panel .claim-row', { hasText: 'Water the plants' })
  await expect(row.locator('.role-custom')).toContainText('Grown-up task')
  await row.getByRole('button', { name: 'Approve' }).click()

  // back to Theodore: coins 20 + 10 stars 0 + 2, card shows done
  await page.getByRole('button', { name: 'Done — back to explorers' }).click()
  await pickExplorer(page, 'Theodore')
  await expect(page.getByTestId('coin-count')).toHaveText('30')
  await expect(page.getByTestId('star-count')).toHaveText('2')
  await expect(page.getByTestId('custom-card')).toContainText('Done!')
})

test('custom task: pause hides it; archived claim keeps its title', async ({ page }) => {
  await seededPage(
    page,
    freshState((s) => {
      s.customQuests['cq-p'] = {
        id: 'cq-p',
        title: 'Feed the fish',
        coins: 5,
        stars: 0,
        childIds: ['leonard'],
        days: [],
        createdAt: new Date().toISOString(),
        active: false, // paused → not claimable, not listed today
      }
      s.claims['cq-claim-old'] = {
        id: 'cq-claim-old',
        childId: 'leonard',
        questId: 'cq-p',
        activityDate: '2026-10-08',
        role: 'custom',
        status: 'approved',
        claimedAt: '2026-10-08T10:00:00Z',
        reward: { coins: 5, stars: 0 },
        questTitle: 'Feed the fish',
      }
    }),
  )
  await pickExplorer(page, 'Leonard')
  await expect(page.getByText('From grown-ups')).toHaveCount(0)

  // grown-ups see it under "Paused tasks" and can resume it
  await page.getByLabel('Explorer menu').click()
  await page.getByRole('menuitem', { name: 'Switch explorer' }).click()
  await unlockGrownups(page)
  const panel = page.locator('.tasks-panel')
  await panel.locator('.paused-tasks summary').click()
  await expect(panel.locator('.task-row').first()).toContainText('Feed the fish')
  await panel.getByRole('button', { name: 'Resume' }).click()
  await expect(panel.locator('.task-list .task-row').first()).toContainText('Feed the fish')
})
