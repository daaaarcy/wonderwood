import { expect, test, type Page } from '@playwright/test'
import { freshState, seedJson } from './seed'
import { addDaysKey, localDateKey, mondayKeyOf } from '../src/domain/week'
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

function openTownState(): GameState {
  return freshState((s) => {
    for (const id of ['road', 'library', 'music-school', 'police-station', 'hospital'] as const) {
      s.city.projects[id].status = 'open'
      s.city.projects[id].openedAt = '2026-10-01T10:00:00Z'
    }
    s.city.currentProjectId = null
    s.city.postcards = [{ id: 'postcard-library', projectId: 'library', openedAt: '2026-10-01T10:00:00Z' }]
    // a couple of family reads for the shelves
    s.claims['read-a'] = {
      id: 'read-a', childId: 'leonard', questId: 'reading', activityDate: '2026-10-08',
      role: 'core', status: 'approved', claimedAt: '2026-10-08T10:00:00Z',
      reward: { coins: 10, stars: 1 },
      details: { kind: 'reading', unit: 'book', title: 'Dragons Love Tacos', withGrownUp: false },
    }
    s.claims['read-b'] = {
      id: 'read-b', childId: 'theodore', questId: 'reading', activityDate: '2026-10-09',
      role: 'bonus', status: 'approved', claimedAt: '2026-10-09T10:00:00Z',
      reward: { coins: 5, stars: 0 },
      details: { kind: 'reading', unit: 'chapter', withGrownUp: false },
    }
  })
}

test('library: shelves show family reads + word game plays a round', async ({ page }) => {
  await seededPage(page, openTownState())
  await pickExplorer(page, 'Leonard')
  // tap the library plot via a real canvas tap is flaky — open via JS? Use the plot sheet path:
  // plots are inside the canvas; simulate via EventBus? The play view opens from the plot sheet.
  // Easier: dispatch the sheet through the town-tap path by clicking the canvas at the library pos.
  const box = await page.locator('.island-wrap canvas').boundingBox()
  // library pos (225,545) in a 1000x700 world — canvas is contain-fit; world maps to the canvas box
  const scale = Math.min(box!.width / 1000, box!.height / 700)
  const offX = box!.x + (box!.width - 1000 * scale) / 2
  const offY = box!.y + (box!.height - 700 * scale) / 2
  await page.mouse.click(offX + 225 * scale, offY + 545 * scale)
  await expect(page.getByRole('dialog', { name: 'Library' })).toBeVisible()
  await page.getByRole('button', { name: 'Play!' }).click()
  await expect(page.getByTestId('book-shelf')).toBeVisible()
  // 1 book + 1 chapter → 1 spine + 1 ribbon
  await expect(page.locator('.book-spine')).toHaveCount(1)
  await expect(page.locator('.chapter-ribbon')).toHaveCount(1)
  await page.getByRole('button', { name: 'Word & picture game' }).click()
  await expect(page.getByTestId('word-game')).toBeVisible()
  await expect(page.locator('.word-choices .btn')).toHaveCount(3)
})

test('music school: xylophone + start the show', async ({ page }) => {
  await seededPage(page, openTownState())
  await pickExplorer(page, 'Theodore')
  const box = await page.locator('.island-wrap canvas').boundingBox()
  const scale = Math.min(box!.width / 1000, box!.height / 700)
  const offX = box!.x + (box!.width - 1000 * scale) / 2
  const offY = box!.y + (box!.height - 700 * scale) / 2
  await page.mouse.click(offX + 760 * scale, offY + 560 * scale)
  await expect(page.getByRole('dialog', { name: 'Music school' })).toBeVisible()
  await page.getByRole('button', { name: 'Play!' }).click()
  await expect(page.getByTestId('xylo')).toBeVisible()
  await expect(page.locator('.xylo-bar')).toHaveCount(8)
  await page.locator('.xylo-bar').first().click()
  await page.getByRole('button', { name: 'Start the show' }).click()
  await expect(page.getByTestId('music-stage')).toHaveClass(/showing/)
})

test('police station: patrol car returns a lost toy', async ({ page }) => {
  await seededPage(page, openTownState())
  await pickExplorer(page, 'Leonard')
  const box = await page.locator('.island-wrap canvas').boundingBox()
  const scale = Math.min(box!.width / 1000, box!.height / 700)
  const offX = box!.x + (box!.width - 1000 * scale) / 2
  const offY = box!.y + (box!.height - 700 * scale) / 2
  await page.mouse.click(offX + 340 * scale, offY + 190 * scale)
  await expect(page.getByRole('dialog', { name: 'Police station' })).toBeVisible()
  await page.getByRole('button', { name: 'Play!' }).click()
  await expect(page.getByTestId('patrol-map')).toBeVisible()
  await page.getByRole('button', { name: 'Pick up the teddy' }).click()
  await expect(page.locator('.lost-toy')).toHaveCount(2, { timeout: 5000 })
})

test('hospital: teddy care memory completes', async ({ page }) => {
  await seededPage(page, openTownState())
  await pickExplorer(page, 'Theodore')
  const box = await page.locator('.island-wrap canvas').boundingBox()
  const scale = Math.min(box!.width / 1000, box!.height / 700)
  const offX = box!.x + (box!.width - 1000 * scale) / 2
  const offY = box!.y + (box!.height - 700 * scale) / 2
  await page.mouse.click(offX + 660 * scale, offY + 185 * scale)
  await expect(page.getByRole('dialog', { name: 'Hospital' })).toBeVisible()
  await page.getByRole('button', { name: 'Play!' }).click()
  await expect(page.getByTestId('memory-grid')).toBeVisible()
  // reveal each card once to learn its picture, waiting out the flip-back
  const cards = page.locator('.memory-card')
  const pics = new Map<string, number[]>()
  for (let i = 0; i < 6; i += 1) {
    await cards.nth(i).click()
    const pic = (await cards.nth(i).getAttribute('aria-label')) ?? 'face down'
    const list = pics.get(pic) ?? []
    list.push(i)
    pics.set(pic, list)
    await page.waitForTimeout(900) // mismatches flip back down
  }
  // now click each known pair
  for (const [, idx] of pics) {
    if (idx.length === 2) {
      await cards.nth(idx[0]!).click()
      await cards.nth(idx[1]!).click()
      await page.waitForTimeout(300)
    }
  }
  await expect(page.getByTestId('teddy-done')).toBeVisible()
})

test('name the city → shows on the town tag', async ({ page }) => {
  await seededPage(page, freshState())
  await pickExplorer(page, 'Theodore')
  await page.getByRole('button', { name: /Name our town/ }).click()
  // wheel to 'Sunny Town' is the default preview already
  await expect(page.getByTestId('town-name-preview')).toBeVisible()
  const name = await page.getByTestId('town-name-preview').textContent()
  await page.getByRole('button', { name: /That’s our town/ }).click()
  await expect(page.getByRole('button', { name: new RegExp(name ?? '') })).toBeVisible()
})

test('opening a building → customize → postcard appears in the album', async ({ page }) => {
  const s = freshState((st) => {
    st.children.theodore.coins = 30
  })
  await seededPage(page, s)
  await pickExplorer(page, 'Theodore')
  // buy 2 kits → road opens → celebration → Make it yours
  for (let i = 0; i < 2; i += 1) {
    await page.getByRole('button', { name: 'Add a kit' }).click()
    await page.getByRole('button', { name: 'Yes, add it!' }).click()
    await page.waitForTimeout(600)
  }
  await expect(page.getByRole('dialog', { name: 'A building opened!' })).toBeVisible()
  await page.getByRole('button', { name: 'Make it yours' }).click()
  await expect(page.getByRole('dialog', { name: 'Make it yours' })).toBeVisible()
  await page.locator('.swatch').nth(3).click()
  await page.getByRole('button', { name: 'Looks great!' }).click()
  // open a second project → another postcard? just verify album shows the road card
  await page.getByLabel('Explorer menu').click()
  await page.getByRole('menuitem', { name: 'Switch explorer' }).click()
  await page.getByRole('button', { name: 'Leonard' }).click()
  await page.getByRole('button', { name: 'My room' }).click()
  await page.getByRole('button', { name: /My postcard album/ }).click()
  await expect(page.getByTestId('postcard-road')).toBeVisible()
})

test('weekly challenge card: progress + completion awards +20', async ({ page }) => {
  // seed 3 approved reading days this week; the 4th happens live
  const s = freshState((st) => {
    const mon = mondayKeyOf(localDateKey(new Date(), 'UTC'))
    for (let d = 0; d < 3; d += 1) {
      const date = addDaysKey(mon, d)
      st.claims[`w-${d}`] = {
        id: `w-${d}`, childId: 'leonard', questId: 'reading', activityDate: date,
        role: 'core', status: 'approved', claimedAt: `${date}T10:00:00Z`,
        reward: { coins: 10, stars: 1 },
        details: { kind: 'reading', unit: 'book', withGrownUp: false },
      }
    }
  })
  await seededPage(page, s)
  await pickExplorer(page, 'Leonard')
  await expect(page.getByTestId('weekly-card')).toContainText('Read on 4 different days')
  await expect(page.getByTestId('weekly-card')).toContainText('3 of 4 days')
  // do today's reading → approve → +10 (core) +20 (weekly)
  const reading = page.locator('.quest-card', { hasText: 'Reading' }).first()
  await reading.getByRole('button', { name: 'I read' }).dispatchEvent('click')
  await page.locator('.sheet[aria-label="Log reading"]').waitFor()
  await page.getByRole('button', { name: 'A book' }).dispatchEvent('click')
  await page.locator('.sheet[aria-label="Log reading"]').getByRole('button', { name: 'Done' }).dispatchEvent('click')
  await page.getByLabel('Explorer menu').click()
  await page.getByRole('menuitem', { name: 'Switch explorer' }).click()
  await page.getByRole('button', { name: 'Grown-ups' }).click()
  await page.waitForSelector('.pin-key')
  for (const d of '1234') await page.getByRole('button', { name: `Digit ${d}` }).click()
  const confirm = page.getByText('Tap the same PIN again')
  if (await confirm.isVisible().catch(() => false)) {
    for (const d of '1234') await page.getByRole('button', { name: `Digit ${d}` }).click()
  }
  await page.locator('.pending-panel .claim-row').first().getByRole('button', { name: 'Approve' }).click()
  await page.getByRole('button', { name: 'Done — back to explorers' }).click()
  await page.getByRole('button', { name: 'Leonard' }).click()
  await expect(page.getByTestId('coin-count')).toHaveText('50') // 20 + 10 + 20 weekly
})

test('reset & repair: grown-up logs → repaired → only that child sees thanks', async ({ page }) => {
  await seededPage(page, freshState())
  await page.getByRole('button', { name: 'Grown-ups' }).click()
  await page.waitForSelector('.pin-key')
  for (const d of '1234') await page.getByRole('button', { name: `Digit ${d}` }).click()
  const confirm = page.getByText('Tap the same PIN again')
  if (await confirm.isVisible().catch(() => false)) {
    for (const d of '1234') await page.getByRole('button', { name: `Digit ${d}` }).click()
  }
  const panel = page.locator('.repairs-panel')
  await panel.getByRole('button', { name: 'Leonard' }).click()
  await panel.getByLabel('Situation').selectOption('spitting')
  await expect(page.getByTestId('repair-suggestion')).toContainText('clean the spot')
  await panel.getByRole('button', { name: 'Write it down' }).click()
  await panel.getByRole('button', { name: 'Repaired' }).click()
  await page.getByRole('button', { name: 'Done — back to explorers' }).click()
  // Leonard sees the thank-you card
  await pickExplorer(page, 'Leonard')
  await expect(page.getByTestId('repair-ack')).toContainText('Thanks for making it right, Leonard!')
  // coins unchanged
  await expect(page.getByTestId('coin-count')).toHaveText('20')
  await page.getByTestId('repair-ack').getByRole('button', { name: 'Okay!' }).click()
  await expect(page.getByTestId('repair-ack')).toBeHidden()
  // Theodore sees nothing
  await page.getByLabel('Explorer menu').click()
  await page.getByRole('menuitem', { name: 'Switch explorer' }).click()
  await pickExplorer(page, 'Theodore')
  await expect(page.getByTestId('repair-ack')).toHaveCount(0)
})
