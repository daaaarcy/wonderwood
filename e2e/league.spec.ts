import { expect, test } from '@playwright/test'
import { promotionSeed, seedJson } from './seed'

test('promotion overlay → Hooray → Wood badge persists; no overlay on reload', async ({ page }) => {
  // addInitScript re-runs on reload — seed only when the slot is empty so the
  // reload below keeps the acknowledged state.
  await page.addInitScript((json) => {
    if (!window.localStorage.getItem('wonderwood:v1')) {
      window.localStorage.setItem('wonderwood:v1', json)
    }
  }, seedJson(promotionSeed()))
  await page.goto('/')
  await page.getByRole('button', { name: 'Theodore' }).click()

  // promotion overlay (rank 1 → 2 = Wood League)
  const dialog = page.getByRole('dialog', { name: 'League promotion!' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Theodore is now in the')).toBeVisible()
  await expect(dialog.getByText('Wood League!')).toBeVisible()

  await dialog.getByRole('button', { name: 'Hooray!' }).click()
  await expect(dialog).toBeHidden()

  // header shows the Wood badge
  await expect(page.getByLabel("Theodore's league")).toBeVisible()
  await expect(page.locator(".badge-btn svg title", { hasText: 'Wood League' })).toHaveCount(1)

  // reload → no overlay again
  await page.reload()
  await page.getByRole('button', { name: 'Theodore' }).click()
  await expect(page.locator('[data-scene="town"][data-scene-ready="true"]')).toBeAttached()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('promotion overlay: reduced-motion shows the static variant', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript((json) => {
    if (!window.localStorage.getItem('wonderwood:v1')) {
      window.localStorage.setItem('wonderwood:v1', json)
    }
  }, seedJson(promotionSeed()))
  await page.goto('/')
  await page.getByRole('button', { name: 'Theodore' }).click()

  const dialog = page.getByRole('dialog', { name: 'League promotion!' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Wood League!')).toBeVisible()
  // static variant: both badges + arrow, no confetti, no morph container
  await expect(page.locator('.promo-badges-static')).toBeVisible()
  await expect(page.locator('.confetti')).toHaveCount(0)
  await expect(page.locator('.promo-morph')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Hooray!' }).click()
  await expect(dialog).toBeHidden()
})
