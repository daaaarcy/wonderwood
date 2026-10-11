import { expect, test, type Page } from '@playwright/test'
import { boardSeed, seedJson } from './seed'

async function openLeague(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Theodore' }).click()
  await expect(page.locator('[data-scene="town"][data-scene-ready="true"]')).toBeAttached()
  await page.getByRole('button', { name: 'League', exact: true }).click()
}

const thisWeek = (page: Page) => page.locator('section[aria-label="This week\'s leaderboard"]')

test.beforeEach(async ({ page }) => {
  await page.addInitScript((json) => {
    if (!window.localStorage.getItem('wonderwood:v1')) {
      window.localStorage.setItem('wonderwood:v1', json)
    }
  }, seedJson(boardSeed()))
})

test('leaderboard: one sorted list of 5 rows mixing family + storybook friends', async ({
  page,
}) => {
  await openLeague(page)
  const board = thisWeek(page)
  await expect(board.locator('.board-row')).toHaveCount(5)
  await expect(board.locator('.board-friend')).toHaveCount(3)
  await expect(board.getByText('Keep going, explorers!')).toBeVisible()
  await expect(board.getByText(/pretend friends/)).toBeVisible()

  // each friend: animal avatar + paw "Storybook friend" label + league badge
  for (const [name, asset] of [
    ['Felix the Fox', 'resident-fox'],
    ['Riley the Rabbit', 'resident-rabbit'],
    ['Bramble the Bear', 'resident-bear'],
  ] as const) {
    const row = board.locator('.board-row', { hasText: name })
    await expect(row.locator('.tag-friend')).toContainText('Storybook friend')
    await expect(row.locator('img.board-avatar')).toHaveAttribute(
      'src',
      new RegExp(`${asset}\\.svg`),
    )
    await expect(row.locator('svg.league-badge')).toHaveCount(1)
    await expect(row.locator('.board-score')).toContainText(/of \d+ quests/)
  }

  // both boys are in the same list, with badges
  for (const name of ['Theodore', 'Leonard']) {
    const row = board.locator('.board-row', { hasText: name })
    await expect(row.locator('svg.league-badge')).toHaveCount(1)
    await expect(row.locator('.board-score')).toContainText(/of \d+ quests/)
  }

  // last week's final standings persist as a small card
  const last = page.locator('section[aria-label="Last week\'s leaderboard"]')
  await expect(last.locator('.board-row')).toHaveCount(5)
  await expect(last.locator('.board-friend')).toHaveCount(3)
})

test('how leagues work explainer is expandable; no demotion language anywhere', async ({
  page,
}) => {
  await openLeague(page)
  const how = page.locator('.league-how')
  await expect(how.locator('summary')).toContainText('How leagues work')
  await how.locator('summary').click()
  await expect(how).toContainText('at least 70%')
  await expect(how).toContainText('3 or more days')
  await expect(how).toContainText('UP one league')
  await expect(how).toContainText('you can never drop down')
  // the boys' quest icons illustrate the rule
  await expect(how.locator('.league-how-icons img').first()).toBeVisible()
  // nothing anywhere suggests moving down
  await expect(page.locator('.league-screen')).not.toContainText(/demot|relegat/i)
})

test('storybook friend numbers are identical after a reload', async ({ page }) => {
  await openLeague(page)
  const before = await thisWeek(page).locator('.board-friend .board-score').allInnerTexts()
  expect(before).toHaveLength(3)
  await page.reload()
  // Theodore is remembered — reload lands straight on his home, no picker
  await expect(page.locator('[data-scene="town"][data-scene-ready="true"]')).toBeAttached()
  await page.getByRole('button', { name: 'League', exact: true }).click()
  const after = await thisWeek(page).locator('.board-friend .board-score').allInnerTexts()
  expect(after).toEqual(before)
})

test('friends never appear on the grown-ups screen; grown-up rule line shows', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Grown-ups' }).click()
  for (const d of '1234') await page.getByRole('button', { name: `Digit ${d}` }).click()
  // first run sets the PIN → confirm it
  if (await page.getByText('Tap the same PIN again').isVisible().catch(() => false)) {
    for (const d of '1234') await page.getByRole('button', { name: `Digit ${d}` }).click()
  }
  await expect(page.getByText('Waiting for you')).toBeVisible()
  await expect(page.locator('.grownups-screen')).not.toContainText(/Felix|Riley|Bramble/)
  await expect(page.locator('.league-rule-note').first()).toContainText('Never moves down')
})
