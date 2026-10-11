import { expect, test, type Page } from '@playwright/test'
import { v2SeedJson } from './seed'

async function switchExplorer(page: Page) {
  await page.getByLabel('Explorer menu').click()
  await page.getByRole('menuitem', { name: 'Switch explorer' }).click()
}

async function pickExplorer(page: Page, name: 'Theodore' | 'Leonard') {
  await page.getByRole('button', { name }).click()
  await expect(page.locator('[data-scene="town"][data-scene-ready="true"]')).toBeAttached()
}

async function enterGrownups(page: Page, pin = '1234') {
  await page.getByRole('button', { name: 'Grown-ups' }).click()
  for (const d of pin) await page.getByRole('button', { name: `Digit ${d}` }).click()
  const confirmPrompt = page.getByText('Tap the same PIN again')
  if (await confirmPrompt.isVisible().catch(() => false)) {
    for (const d of pin) await page.getByRole('button', { name: `Digit ${d}` }).click()
  }
  await expect(page.getByRole('heading', { name: 'Grown-ups' })).toBeVisible()
}

async function dismissCelebration(page: Page) {
  const celebration = page.locator('.celebration')
  if (await celebration.isVisible().catch(() => false)) {
    await celebration.click()
  }
}

test('city loop: two claims → approvals → kits → road opens → library current', async ({ page }) => {
  await page.goto('/')

  // Theodore + Leonard each claim a quest
  await pickExplorer(page, 'Theodore')
  await page
    .locator('.quest-card', { hasText: 'Spanish lesson' })
    .getByRole('button', { name: 'I did it!' })
    .click()
  await switchExplorer(page)
  await pickExplorer(page, 'Leonard')
  await page
    .locator('.quest-card', { hasText: 'Violin practice' })
    .getByRole('button', { name: 'I did it!' })
    .click()

  // grown-up approves both → 30 coins each
  await switchExplorer(page)
  await enterGrownups(page)
  const rows = page.locator('.pending-panel .claim-row')
  await expect(rows).toHaveCount(2)
  await rows.first().getByRole('button', { name: 'Approve' }).click()
  await rows.first().getByRole('button', { name: 'Approve' }).click()
  await page.getByRole('button', { name: 'Back to explorers' }).click()

  // Theodore buys a kit → confirm sheet → Road: 1 of 2
  await pickExplorer(page, 'Theodore')
  await dismissCelebration(page)
  await expect(page.getByTestId('coin-count')).toHaveText('30')
  await page.getByRole('button', { name: 'Add a kit' }).click()
  await page.getByRole('dialog', { name: 'Buy a building kit' }).getByRole('button', { name: 'Yes, add it!' }).click()
  await expect(page.getByTestId('project-road')).toHaveText('Road: 1 of 2 kits')
  await expect(page.getByTestId('coin-count')).toHaveText('20')

  // Leonard buys the second kit → road opens, celebration shows, library current
  await switchExplorer(page)
  await pickExplorer(page, 'Leonard')
  await page.getByRole('button', { name: 'Add a kit' }).click()
  await page.getByRole('button', { name: 'Yes, add it!' }).click()
  await expect(page.getByRole('dialog', { name: 'A building opened!' })).toBeVisible()
  await expect(page.getByText('The Road is open!')).toBeVisible()
  await page.getByRole('button', { name: 'Hooray!' }).click()
  await expect(page.getByTestId('project-road')).toHaveText('Road: open')
  await expect(page.getByTestId('project-library')).toHaveText('Library: 0 of 6 kits')
  await expect(page.getByText('Our Library')).toBeVisible()

  // reload → everything persists, incl. the chosen explorer (Leonard's home)
  await page.reload()
  await expect(page.locator('[data-scene="town"][data-scene-ready="true"]')).toBeAttached()
  await expect(page.getByTestId('project-road')).toHaveText('Road: open')
  await expect(page.getByTestId('project-library')).toHaveText('Library: 0 of 6 kits')
  await expect(page.getByTestId('coin-count')).toHaveText('20')
  await switchExplorer(page)
  await pickExplorer(page, 'Theodore')
  await expect(page.getByTestId('coin-count')).toHaveText('20')
})

test('v2 save with 7 stars migrates to the Founders\u2019 Bridge', async ({ page }) => {
  await page.addInitScript((json) => {
    if (!window.localStorage.getItem('wonderwood:v1')) {
      window.localStorage.setItem('wonderwood:v1', json)
    }
  }, v2SeedJson({ theodore: 4, leonard: 3 }))
  await page.goto('/')
  await pickExplorer(page, 'Theodore')
  await expect(page.getByTestId('founders-bridge')).toHaveText("Founders' Bridge: 7 planks")
})
