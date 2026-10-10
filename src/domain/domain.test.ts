import { describe, expect, it } from 'vitest'
import { applyCommand, claimQuest } from './commands'
import { initialState, localDateKey } from './state'
import { islandProgress, pendingClaims, todayQuestsFor } from './selectors'
import type { CommandDeps, GameState } from './types'
import { commandDeps } from '../data/registry'
import { CHAPTER_ONE } from '../data/island'
import { questsFor } from '../data/quests'

const deps: CommandDeps = commandDeps
const NOW = new Date('2026-10-10T10:00:00')
const TODAY = localDateKey(NOW)

function run(state: GameState, cmd: Parameters<typeof applyCommand>[1], now: Date = NOW) {
  return applyCommand(state, cmd, now, deps)
}

describe('initial state', () => {
  it('gives each child 20 welcome coins and the starter toy', () => {
    const s = initialState(NOW)
    for (const id of ['theodore', 'leonard'] as const) {
      expect(s.children[id].coins).toBe(20)
      expect(s.children[id].stars).toBe(0)
      expect(s.children[id].inventory).toContain('toy-train')
      expect(s.children[id].equipped.toy).toBe('toy-train')
      expect(s.children[id].equipped.hat).toBeNull()
    }
    const welcomes = s.ledger.filter((e) => e.reason === 'welcome')
    expect(welcomes).toHaveLength(2)
    expect(welcomes.every((e) => e.coins === 20)).toBe(true)
  })
})

describe('claim → approve', () => {
  it('awards 10 coins + 1 star exactly once', () => {
    let s = initialState(NOW)
    const claim = run(s, { type: 'claimQuest', childId: 'theodore', questId: 'theodore-language', claimId: 'c1' })
    expect(claim.result.ok).toBe(true)
    s = claim.state
    const approved = run(s, { type: 'approveClaim', claimId: 'c1' })
    expect(approved.result.ok).toBe(true)
    s = approved.state
    expect(s.children.theodore.coins).toBe(30)
    expect(s.children.theodore.stars).toBe(1)
    expect(s.ledger.filter((e) => e.reason === 'quest')).toHaveLength(1)
  })

  it('double approve does not award twice', () => {
    let s = initialState(NOW)
    s = run(s, { type: 'claimQuest', childId: 'theodore', questId: 'theodore-language', claimId: 'c1' }).state
    s = run(s, { type: 'approveClaim', claimId: 'c1' }).state
    const again = run(s, { type: 'approveClaim', claimId: 'c1' })
    expect(again.result.ok).toBe(true)
    s = again.state
    expect(s.children.theodore.coins).toBe(30)
    expect(s.children.theodore.stars).toBe(1)
    expect(s.ledger.filter((e) => e.reason === 'quest')).toHaveLength(1)
  })

  it('rejects a second claim for the same quest on the same day', () => {
    let s = initialState(NOW)
    s = run(s, { type: 'claimQuest', childId: 'theodore', questId: 'theodore-language', claimId: 'c1' }).state
    const dup = run(s, { type: 'claimQuest', childId: 'theodore', questId: 'theodore-language', claimId: 'c2' })
    expect(dup.result.ok).toBe(false)
    if (!dup.result.ok) expect(dup.result.error.code).toBe('already-claimed-today')
  })

  it('re-sent claimId returns the same claim instead of duplicating', () => {
    let s = initialState(NOW)
    s = run(s, { type: 'claimQuest', childId: 'theodore', questId: 'theodore-language', claimId: 'c1' }).state
    const resent = claimQuest(s, { childId: 'theodore', questId: 'theodore-language', claimId: 'c1' }, NOW, deps)
    expect(resent.result.ok).toBe(true)
    if (resent.result.ok) expect(resent.result.value.id).toBe('c1')
    expect(Object.values(resent.state.claims)).toHaveLength(1)
  })

  it('reject then re-claim the same day is allowed', () => {
    let s = initialState(NOW)
    s = run(s, { type: 'claimQuest', childId: 'theodore', questId: 'theodore-language', claimId: 'c1' }).state
    s = run(s, { type: 'rejectClaim', claimId: 'c1' }).state
    const reclaim = run(s, { type: 'claimQuest', childId: 'theodore', questId: 'theodore-language', claimId: 'c2' })
    expect(reclaim.result.ok).toBe(true)
    s = reclaim.state
    expect(s.children.theodore.coins).toBe(20) // rejected claims award nothing
  })

  it('delayed approval keeps the original activityDate', () => {
    let s = initialState(NOW)
    s = run(s, { type: 'claimQuest', childId: 'theodore', questId: 'theodore-language', claimId: 'c1' }).state
    const later = new Date('2026-10-12T09:00:00')
    const approved = run(s, { type: 'approveClaim', claimId: 'c1' }, later)
    expect(approved.result.ok).toBe(true)
    s = approved.state
    expect(s.claims.c1.activityDate).toBe(TODAY)
    const quests = todayQuestsFor(s, 'theodore', questsFor('theodore').map((q) => q.id), later)
    // Approved on a later day → quest is available again that day
    expect(quests.find((q) => q.questId === 'theodore-language')?.status).toBe('available')
  })

  it('parentCompleteAndApprove claims and approves atomically', () => {
    const s0 = initialState(NOW)
    const { state: s, result } = run(s0, {
      type: 'parentCompleteAndApprove',
      childId: 'leonard',
      questId: 'leonard-letters',
      claimId: 'pc1',
    })
    expect(result.ok).toBe(true)
    expect(s.claims.pc1.status).toBe('approved')
    expect(s.children.leonard.coins).toBe(30)
    expect(s.children.leonard.stars).toBe(1)
  })
})

describe('purchase', () => {
  it('buys an item: deducts price, adds to inventory, ledger entry', () => {
    const s0 = initialState(NOW)
    const { state: s, result } = run(s0, { type: 'purchase', childId: 'theodore', itemId: 'hat-leaf', purchaseId: 'p1' })
    expect(result.ok).toBe(true)
    expect(s.children.theodore.coins).toBe(0)
    expect(s.children.theodore.inventory).toContain('hat-leaf')
    expect(s.ledger.find((e) => e.reason === 'purchase')?.coins).toBe(-20)
  })

  it('rejects insufficient coins with a friendly message', () => {
    let s = initialState(NOW)
    s = run(s, { type: 'purchase', childId: 'theodore', itemId: 'hat-leaf', purchaseId: 'p1' }).state
    // 0 coins left, toy-train is owned; try buying hat again → already-owned.
    // For insufficient: make a fresh cheap check — set coins artificially:
    const poor: GameState = {
      ...initialState(NOW),
      children: {
        ...initialState(NOW).children,
        theodore: { ...initialState(NOW).children.theodore, coins: 14 },
      },
    }
    const r = run(poor, { type: 'purchase', childId: 'theodore', itemId: 'hat-leaf', purchaseId: 'p2' })
    expect(r.result.ok).toBe(false)
    if (!r.result.ok) {
      expect(r.result.error.code).toBe('insufficient-coins')
      expect(r.result.error.message).toBe('Need 6 more coins.')
    }
    expect(s.children.theodore.coins).toBe(0)
  })

  it('re-sent purchaseId is a no-op (no double charge)', () => {
    let s = initialState(NOW)
    s = run(s, { type: 'purchase', childId: 'theodore', itemId: 'hat-leaf', purchaseId: 'p1' }).state
    const again = run(s, { type: 'purchase', childId: 'theodore', itemId: 'hat-leaf', purchaseId: 'p1' })
    expect(again.result.ok).toBe(true)
    expect(again.state.children.theodore.coins).toBe(0)
    expect(again.state.ledger.filter((e) => e.reason === 'purchase')).toHaveLength(1)
  })

  it('rejects already-owned and unknown items', () => {
    const s = initialState(NOW)
    const owned = run(s, { type: 'purchase', childId: 'theodore', itemId: 'toy-train', purchaseId: 'p1' })
    expect(owned.result.ok).toBe(false)
    if (!owned.result.ok) expect(owned.result.error.code).toBe('already-owned')
    const unknown = run(s, { type: 'purchase', childId: 'theodore', itemId: 'hat-moon', purchaseId: 'p2' })
    expect(unknown.result.ok).toBe(false)
    if (!unknown.result.ok) expect(unknown.result.error.code).toBe('unknown-item')
  })
})

describe('equip', () => {
  it('equips owned items of the matching slot only', () => {
    let s = initialState(NOW)
    const notOwned = run(s, { type: 'equip', childId: 'theodore', slot: 'hat', itemId: 'hat-leaf' })
    expect(notOwned.result.ok).toBe(false)
    if (!notOwned.result.ok) expect(notOwned.result.error.code).toBe('item-not-owned')
    s = run(s, { type: 'purchase', childId: 'theodore', itemId: 'hat-leaf', purchaseId: 'p1' }).state
    const wrong = run(s, { type: 'equip', childId: 'theodore', slot: 'toy', itemId: 'hat-leaf' })
    expect(wrong.result.ok).toBe(false)
    if (!wrong.result.ok) expect(wrong.result.error.code).toBe('wrong-slot')
    s = run(s, { type: 'equip', childId: 'theodore', slot: 'hat', itemId: 'hat-leaf' }).state
    expect(s.children.theodore.equipped.hat).toBe('hat-leaf')
    s = run(s, { type: 'equip', childId: 'theodore', slot: 'hat', itemId: null }).state
    expect(s.children.theodore.equipped.hat).toBeNull()
  })
})

describe('islandProgress', () => {
  it('sums approved stars of BOTH children and caps at chapter size', () => {
    let s = initialState(NOW)
    s = run(s, { type: 'parentCompleteAndApprove', childId: 'theodore', questId: 'theodore-language', claimId: 'a1' }).state
    s = run(s, { type: 'parentCompleteAndApprove', childId: 'leonard', questId: 'leonard-kindness', claimId: 'a2' }).state
    let p = islandProgress(s, CHAPTER_ONE.planks)
    expect(p.placed).toBe(2)
    expect(p.complete).toBe(false)
    // Force stars above cap:
    s = {
      ...s,
      children: {
        theodore: { ...s.children.theodore, stars: 10 },
        leonard: { ...s.children.leonard, stars: 5 },
      },
    }
    p = islandProgress(s, CHAPTER_ONE.planks)
    expect(p.placed).toBe(12)
    expect(p.complete).toBe(true)
  })
})

describe('selectors', () => {
  it('todayQuestsFor reports available → pending → done', () => {
    let s = initialState(NOW)
    const ids = questsFor('theodore').map((q) => q.id)
    expect(todayQuestsFor(s, 'theodore', ids, NOW).every((q) => q.status === 'available')).toBe(true)
    s = run(s, { type: 'claimQuest', childId: 'theodore', questId: 'theodore-language', claimId: 'c1' }).state
    expect(todayQuestsFor(s, 'theodore', ids, NOW).find((q) => q.questId === 'theodore-language')?.status).toBe('pending')
    s = run(s, { type: 'approveClaim', claimId: 'c1' }).state
    expect(todayQuestsFor(s, 'theodore', ids, NOW).find((q) => q.questId === 'theodore-language')?.status).toBe('done')
    expect(pendingClaims(s)).toHaveLength(0)
  })

  it('setParentPin stores a hash, never the pin', () => {
    const s0 = initialState(NOW)
    const { state: s, result } = run(s0, { type: 'setParentPin', pin: '1234', pinHash: 'sha256-deadbeef' })
    expect(result.ok).toBe(true)
    expect(s.parentPinHash).toBe('sha256-deadbeef')
    const bad = run(s, { type: 'setParentPin', pin: '12' })
    expect(bad.result.ok).toBe(false)
  })
})
