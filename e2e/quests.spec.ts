import { expect, test, type Page } from '@playwright/test'

async function switchExplorer(page: Page) {
  await page.getByLabel('Explorer menu').click()
  await page.getByRole('menuitem', { name: 'Switch explorer' }).click()
}

async function openBonusFold(page: Page) {
  const fold = page.locator('.bonus-fold')
  if ((await fold.count()) > 0 && (await fold.getAttribute('open')) === null) {
    await fold.locator('summary').click()
  }
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
  const c = page.locator('.celebration')
  if (await c.isVisible().catch(() => false)) await c.click()
}

test('Leonard reading flow: books & chapters → correct rewards + journal', async ({ page }) => {
  await page.goto('/')
  await pickExplorer(page, 'Leonard')
  const reading = page.locator('.quest-card', { hasText: 'Reading' }).first()
  // unit 1: a book; unit 2-3: chapters
  for (const unit of ['A book', 'A chapter', 'A chapter']) {
    await reading.getByRole('button', { name: 'I read' }).dispatchEvent('click')
    await page.locator('.sheet[aria-label="Log reading"]').waitFor()
    await page.getByRole('button', { name: unit }).dispatchEvent('click')
    await page.locator('.sheet[aria-label="Log reading"]').getByRole('button', { name: 'Done' }).dispatchEvent('click')
  }
  // approve all
  await switchExplorer(page)
  await enterGrownups(page)
  for (let i = 0; i < 3; i += 1) {
    await page.locator('.pending-panel .claim-row').first()
      .getByRole('button', { name: 'Approve' }).click()
    await expect(page.locator('.pending-panel .claim-row')).toHaveCount(3 - i - 1)
  }
  await page.getByRole('button', { name: 'Back to explorers' }).click()
  await pickExplorer(page, 'Leonard')
  await dismissCelebration(page)
  await expect(page.getByTestId('coin-count')).toHaveText('40') // 20 + 10 + 5 + 5
  await expect(page.getByTestId('star-count')).toHaveText('1')
  // journal shows separate totals
  await page.getByRole('button', { name: 'My reading journal' }).dispatchEvent('click')
  await expect(page.locator('.journal-totals')).toContainText('1 book')
  await expect(page.locator('.journal-totals')).toContainText('2 chapters')
  // a 4th unit → approved with 0 coins but journaled
  await page.getByRole('button', { name: 'Close' }).dispatchEvent('click')
  await reading.getByRole('button', { name: 'I read' }).dispatchEvent('click')
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'A book' }).click()
  await page.locator('.sheet').getByRole('button', { name: 'Done' }).dispatchEvent('click')
  await switchExplorer(page)
  await enterGrownups(page)
  await page.locator('.pending-panel .claim-row').getByRole('button', { name: 'Approve' }).click()
  await page.getByRole('button', { name: 'Back to explorers' }).click()
  await pickExplorer(page, 'Leonard')
  await expect(page.getByTestId('coin-count')).toHaveText('40')
})

test('external quest: open button never completes the quest', async ({ page }) => {
  await page.goto('/')
  await pickExplorer(page, 'Theodore')
  await openBonusFold(page)
  const card = page.locator('.quest-card', { hasText: 'Spanish lesson' })
  const open = card.getByRole('link', { name: 'Open Duolingo' })
  await expect(open).toBeVisible()
  await expect(open).toHaveAttribute('target', '_blank')
  await expect(open).toHaveAttribute('rel', /noopener/)
  await open.click()
  await expect(card.getByText('Done!')).toBeHidden()
  await expect(card.getByText('Waiting for a grown-up')).toBeHidden()
})

test('math challenge: wrong → try again → right, then send for bonus coins', async ({ page }) => {
  await page.goto('/')
  await pickExplorer(page, 'Theodore')
  await openBonusFold(page)
  // math-mission is bonus for Theodore
  const card = page.locator('.quest-card', { hasText: "Builders' math" })
  await card.getByRole('button', { name: 'Start' }).click()
  // answer wrong first: click an option that isn't right — pick a wrong one by
  // tapping the LAST option if it's wrong, else first wrong one
  for (let qi = 0; qi < 3; qi += 1) {
    const step = page.locator('.challenge-step')
    const prompt = await page.locator('.challenge-prompt').textContent()
    if (prompt?.includes('smallest to biggest')) {
      // ordering question — tap numbers in ascending order
      const texts = await page.locator('.challenge-opt').allTextContents()
      for (const n of texts.map(Number).sort((a, b) => a - b)) {
        await page.locator('.challenge-opt', { hasText: new RegExp(`^${n}$`) }).click()
      }
    } else if (prompt?.includes('MORE')) {
      // the piles themselves are the answers — tap the bigger one
      const piles = page.locator('.pile-btn')
      const pileA = await piles.first().locator('.token').count()
      const pileB = await piles.nth(1).locator('.token').count()
      await piles.nth(pileA > pileB ? 0 : 1).click()
    } else {
      const n = await page.locator('.challenge-opt').count()
      const before = await step.textContent()
      // first deliberately tap every option until the right one advances
      for (let i = 0; i < n; i += 1) {
        await page.locator('.challenge-opt').nth(i).click()
        await page.waitForTimeout(200)
        if ((await step.textContent()) !== before) break
      }
    }
    await expect(step).toContainText(`Question ${qi + 2}`, { timeout: 3000 }).catch(async () => {
      if (qi === 2) return // last question → finish screen
      throw new Error('question did not advance')
    })
  }
  await page.getByRole('button', { name: 'Send to a grown-up' }).click()
  await expect(page.getByText('Sent to a grown-up!')).toBeVisible()
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(card.getByText('Waiting for a grown-up')).toBeVisible()
  await switchExplorer(page)
  await enterGrownups(page)
  const row = page.locator('.pending-panel .claim-row', { hasText: "Builders' math" })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: 'Approve' }).click()
  await page.getByRole('button', { name: 'Back to explorers' }).click()
  await pickExplorer(page, 'Theodore')
  await dismissCelebration(page)
  await expect(page.getByTestId('coin-count')).toHaveText('25') // 20 + 5 bonus
})

test('bonus slots cap: third bonus claim approved → 0 coins + full message', async ({ page }) => {
  await page.goto('/')
  await pickExplorer(page, 'Theodore')
  await openBonusFold(page)
  for (const label of ["Builders' math", 'Extra Spanish', 'Try some French']) {
    const card = page.locator('.quest-card', { hasText: label })
    if (label === "Builders' math") {
      // challenge card — skip the mini-game, claim directly? It requires playing.
      // Use grown-up "Done & approve" instead below.
      continue
    }
    await card.getByRole('button', { name: 'I did it!' }).click()
  }
  await switchExplorer(page)
  await enterGrownups(page)
  // parent-complete the challenge so we have 3 bonus claims
  await page.locator('.claim-row', { hasText: "Builders' math" }).getByRole('button', { name: 'Done & approve' }).click()
  // approve the two pending bonus claims → +5, +5; challenge already approved → check totals
  for (let i = 0; i < 2; i += 1) {
    await page.locator('.pending-panel .claim-row').first()
      .getByRole('button', { name: 'Approve' }).click()
  }
  await page.getByRole('button', { name: 'Back to explorers' }).click()
  await pickExplorer(page, 'Theodore')
  await dismissCelebration(page)
  await expect(page.getByTestId('coin-count')).toHaveText('30') // 20 + 5 + 5 + 0
  await expect(page.getByText('Bonus coins are full today')).toBeVisible()
})

test('grown-up pauses today → child sees a rest day', async ({ page }) => {
  await page.goto('/')
  await pickExplorer(page, 'Theodore')
  await switchExplorer(page)
  await enterGrownups(page)
  await page.getByRole('button', { name: 'Schedule' }).click()
  const panel = page.locator('.panel[aria-label="Schedule"]')
  await panel.locator('label.sched-check', { hasText: 'Today is a rest day' }).click()
  await panel.getByRole('button', { name: 'Save schedule & settings' }).click()
  await expect(panel.getByRole('button', { name: 'Saved ✓' })).toBeVisible()
  await page.getByRole('button', { name: 'Back to explorers' }).click()
  await pickExplorer(page, 'Theodore')
  await expect(page.getByText('Rest day — enjoy!')).toBeVisible()
})
