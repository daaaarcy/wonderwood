import { expect, test, type Page } from '@playwright/test'

async function pickExplorer(page: Page, name: 'Theodore' | 'Leonard') {
  await page.getByRole('button', { name }).click()
  await expect(page.locator('[data-scene="island"][data-scene-ready="true"]')).toBeAttached()
}

async function enterGrownups(page: Page, pin = '1234') {
  await page.getByRole('button', { name: 'Grown-ups' }).click()
  // First run sets + confirms the PIN; later runs just enter it.
  await page.getByRole('button', { name: `Digit ${pin[0]}` }).click()
  await page.getByRole('button', { name: `Digit ${pin[1]}` }).click()
  await page.getByRole('button', { name: `Digit ${pin[2]}` }).click()
  await page.getByRole('button', { name: `Digit ${pin[3]}` }).click()
  const confirmPrompt = page.getByText('Tap the same PIN again')
  if (await confirmPrompt.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: `Digit ${pin[0]}` }).click()
    await page.getByRole('button', { name: `Digit ${pin[1]}` }).click()
    await page.getByRole('button', { name: `Digit ${pin[2]}` }).click()
    await page.getByRole('button', { name: `Digit ${pin[3]}` }).click()
  }
  await expect(page.getByRole('heading', { name: 'Grown-ups' })).toBeVisible()
  await expect(page.getByText('Waiting for you')).toBeVisible()
}

async function dismissCelebration(page: Page) {
  const celebration = page.locator('.celebration')
  if (await celebration.isVisible().catch(() => false)) {
    await celebration.click()
  }
}

test('full loop: claim → approve → buy → room → persistence', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Wonderwood' })).toBeVisible()

  // --- pick Theodore, claim the language quest ---
  await pickExplorer(page, 'Theodore')
  await expect(page.getByTestId('coin-count')).toHaveText('20')
  await expect(page.getByTestId('bridge-status')).toHaveText('Bridge: 0 of 12 planks')

  const langCard = page.locator('.quest-card', { hasText: 'Do your Duolingo lesson' })
  await langCard.getByRole('button', { name: 'I did it!' }).click()
  await expect(langCard.getByText('Waiting for a grown-up')).toBeVisible()

  // --- grown-ups: set PIN + approve ---
  await page.getByRole('button', { name: 'Switch explorer' }).click()
  await enterGrownups(page)
  const claimRow = page.locator('.pending-panel .claim-row', { hasText: 'Do your Duolingo lesson' })
  await expect(claimRow).toBeVisible()
  await claimRow.getByRole('button', { name: 'Approve' }).click()
  await expect(claimRow).toBeHidden()

  // --- back to Theodore: coins + plank ---
  await page.getByRole('button', { name: 'Done — back to explorers' }).click()
  await pickExplorer(page, 'Theodore')
  await dismissCelebration(page)
  await expect(page.getByTestId('coin-count')).toHaveText('30')
  await expect(page.getByTestId('bridge-status')).toHaveText('Bridge: 1 of 12 planks')
  await expect(
    page.locator('.quest-card', { hasText: 'Do your Duolingo lesson' }).getByText('Done!'),
  ).toBeVisible()

  // --- shop: preview + buy the Leaf hat ---
  await page.getByRole('button', { name: 'Shop' }).click()
  await page.locator('.shop-card', { hasText: 'Leaf hat' }).click()
  await expect(page.locator('.shop-preview .avatar-hat')).toBeVisible()
  await page.getByRole('button', { name: 'Buy for 20 coins' }).click()
  await expect(page.getByTestId('coin-count')).toHaveText('10')
  await expect(page.getByText('Owned', { exact: false }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Back' }).click()

  // --- room: wear hat + run the train ---
  await page.getByRole('button', { name: 'My room' }).click()
  await expect(page.locator('[data-scene="room"][data-scene-ready="true"]')).toBeAttached()
  await page.getByRole('button', { name: 'Wear hat' }).click()
  await expect(page.getByTestId('equipped-hat')).toHaveText('hat-leaf')
  await page.getByRole('button', { name: 'Start train' }).click()
  await expect(page.getByTestId('train-state')).toHaveText('running')
  await page.getByRole('button', { name: 'Stop train' }).click()
  await expect(page.getByTestId('train-state')).toHaveText('stopped')

  // --- reload: everything persists ---
  await page.reload()
  await pickExplorer(page, 'Theodore')
  await expect(page.getByTestId('coin-count')).toHaveText('10')
  await expect(page.getByTestId('bridge-status')).toHaveText('Bridge: 1 of 12 planks')
  await page.getByRole('button', { name: 'My room' }).click()
  await expect(page.locator('[data-scene="room"][data-scene-ready="true"]')).toBeAttached()
  await expect(page.getByTestId('equipped-hat')).toHaveText('hat-leaf')
  await expect(page.getByRole('button', { name: 'Take off hat' })).toBeVisible()
})

test('double-clicking Approve awards the quest only once', async ({ page }) => {
  await page.goto('/')
  await pickExplorer(page, 'Theodore')
  const card = page.locator('.quest-card', { hasText: 'Typing practice' })
  await card.getByRole('button', { name: 'I did it!' }).click()
  await page.getByRole('button', { name: 'Switch explorer' }).click()
  await enterGrownups(page)
  const row = page.locator('.pending-panel .claim-row', { hasText: 'Typing practice' })
  await row.getByRole('button', { name: 'Approve' }).dblclick()
  await page.getByRole('button', { name: 'Done — back to explorers' }).click()
  await pickExplorer(page, 'Theodore')
  await dismissCelebration(page)
  await expect(page.getByTestId('coin-count')).toHaveText('30')
  await expect(page.getByTestId('bridge-status')).toHaveText('Bridge: 1 of 12 planks')
})

test('claim → reject → re-claim → approve awards +10 once', async ({ page }) => {
  await page.goto('/')
  await pickExplorer(page, 'Theodore')
  const card = page.locator('.quest-card', { hasText: 'Help' }).or(
    page.locator('.quest-card', { hasText: 'kind or helpful' }),
  )
  await card.getByRole('button', { name: 'I did it!' }).click()
  await expect(card.getByText('Waiting for a grown-up')).toBeVisible()

  // grown-up rejects
  await page.getByRole('button', { name: 'Switch explorer' }).click()
  await enterGrownups(page)
  await page
    .locator('.pending-panel .claim-row')
    .getByRole('button', { name: 'Not yet' })
    .click()

  // child can claim again the same day
  await page.getByRole('button', { name: 'Done — back to explorers' }).click()
  await pickExplorer(page, 'Theodore')
  await card.getByRole('button', { name: 'I did it!' }).click()
  await expect(card.getByText('Waiting for a grown-up')).toBeVisible()

  // approve → exactly +10 coins once
  await page.getByRole('button', { name: 'Switch explorer' }).click()
  await enterGrownups(page)
  await page
    .locator('.pending-panel .claim-row')
    .getByRole('button', { name: 'Approve' })
    .click()
  await page.getByRole('button', { name: 'Done — back to explorers' }).click()
  await pickExplorer(page, 'Theodore')
  await dismissCelebration(page)
  await expect(page.getByTestId('coin-count')).toHaveText('30')
  await expect(page.getByTestId('bridge-status')).toHaveText('Bridge: 1 of 12 planks')
})

test("Leonard's quests differ from Theodore's", async ({ page }) => {
  await page.goto('/')
  await pickExplorer(page, 'Leonard')
  await expect(page.getByText('Play the word picture game')).toBeVisible()
  await expect(page.getByText('Trace three letters')).toBeVisible()
  await expect(page.getByText('Help tidy up')).toBeVisible()
  await expect(page.getByText('Do your Duolingo lesson')).toBeHidden()
})
