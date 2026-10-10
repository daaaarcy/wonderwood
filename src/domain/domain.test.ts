import { describe, expect, it } from 'vitest'
import { applyCommand, claimQuest } from './commands.ts'
import { initialState } from './state.ts'
import { localDateKey } from './week.ts'
import { pendingClaims, readingJournal, todayQuestsFor } from './selectors.ts'
import type { CommandDeps, GameState } from './types.ts'
import { commandDeps } from '../data/registry.ts'
import { DEFAULT_SCHEDULE } from '../data/quests.ts'

const deps: CommandDeps = commandDeps
const NOW = new Date('2026-10-10T10:00:00Z')
const TODAY = localDateKey(NOW, 'UTC')

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
    const claim = run(s, { type: 'claimQuest', childId: 'theodore', questId: 'spanish', claimId: 'c1' })
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
    s = run(s, { type: 'claimQuest', childId: 'theodore', questId: 'spanish', claimId: 'c1' }).state
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
    s = run(s, { type: 'claimQuest', childId: 'theodore', questId: 'spanish', claimId: 'c1' }).state
    const dup = run(s, { type: 'claimQuest', childId: 'theodore', questId: 'spanish', claimId: 'c2' })
    expect(dup.result.ok).toBe(false)
    if (!dup.result.ok) expect(dup.result.error.code).toBe('already-claimed-today')
  })

  it('re-sent claimId returns the same claim instead of duplicating', () => {
    let s = initialState(NOW)
    s = run(s, { type: 'claimQuest', childId: 'theodore', questId: 'spanish', claimId: 'c1' }).state
    const resent = claimQuest(s, { childId: 'theodore', questId: 'spanish', claimId: 'c1' }, NOW, deps)
    expect(resent.result.ok).toBe(true)
    if (resent.result.ok) expect(resent.result.value.id).toBe('c1')
    expect(Object.values(resent.state.claims)).toHaveLength(1)
  })

  it('reject then re-claim the same day is allowed', () => {
    let s = initialState(NOW)
    s = run(s, { type: 'claimQuest', childId: 'theodore', questId: 'spanish', claimId: 'c1' }).state
    s = run(s, { type: 'rejectClaim', claimId: 'c1' }).state
    const reclaim = run(s, { type: 'claimQuest', childId: 'theodore', questId: 'spanish', claimId: 'c2' })
    expect(reclaim.result.ok).toBe(true)
    s = reclaim.state
    expect(s.children.theodore.coins).toBe(20) // rejected claims award nothing
  })

  it('delayed approval keeps the original activityDate', () => {
    let s = initialState(NOW)
    s = run(s, { type: 'claimQuest', childId: 'theodore', questId: 'spanish', claimId: 'c1' }).state
    const later = new Date('2026-10-12T09:00:00Z')
    const approved = run(s, { type: 'approveClaim', claimId: 'c1' }, later)
    expect(approved.result.ok).toBe(true)
    s = approved.state
    expect(s.claims.c1.activityDate).toBe(TODAY)
    const quests = todayQuestsFor(s, 'theodore', later)
    // Approved on a later day → quest is available again that day
    expect(!quests.restDay && quests.core.find((q) => q.questId === 'spanish')?.status).toBe('available')
  })

  it('parentCompleteAndApprove claims and approves atomically', () => {
    const s0 = initialState(NOW)
    const { state: s, result } = run(s0, {
      type: 'parentCompleteAndApprove',
      childId: 'leonard',
      questId: 'violin',
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


describe('selectors', () => {
  it('todayQuestsFor reports available → pending → done', () => {
    let s = initialState(NOW)
    const ids = DEFAULT_SCHEDULE.theodore.core[0]
    let view = todayQuestsFor(s, 'theodore', NOW)
    expect(!view.restDay && view.core.every((q) => q.status === 'available')).toBe(true)
    s = run(s, { type: 'claimQuest', childId: 'theodore', questId: 'spanish', claimId: 'c1' }).state
    view = todayQuestsFor(s, 'theodore', NOW)
    expect(!view.restDay && view.core.find((q) => q.questId === 'spanish')?.status).toBe('pending')
    s = run(s, { type: 'approveClaim', claimId: 'c1' }).state
    view = todayQuestsFor(s, 'theodore', NOW)
    expect(!view.restDay && view.core.find((q) => q.questId === 'spanish')?.status).toBe('done')
    void ids
    expect(pendingClaims(s)).toHaveLength(0)
  })

})

/* ---------------- schema v5: roles, rewards, schedules ---------------- */

const READ = (unit: 'book' | 'chapter', id: string, title?: string) =>
  ({
    type: 'claimQuest' as const,
    childId: 'leonard' as const,
    questId: 'reading',
    claimId: id,
    details: { kind: 'reading' as const, unit, title, withGrownUp: false },
  })

describe('claim roles', () => {
  it('core quests claim as core; bonus quests claim as bonus', () => {
    let s = initialState(NOW)
    const core = run(s, { type: 'claimQuest', childId: 'theodore', questId: 'spanish', claimId: 'c1' })
    if (core.result.ok) expect((core.result.value as { role: string }).role).toBe('core')
    s = core.state
    const bonus = run(s, { type: 'claimQuest', childId: 'theodore', questId: 'math-mission', claimId: 'b1' })
    if (bonus.result.ok) expect((bonus.result.value as { role: string }).role).toBe('bonus')
    const unsched = run(s, { type: 'claimQuest', childId: 'theodore', questId: 'kindness', claimId: 'x1' })
    expect(unsched.result.ok).toBe(false)
    if (!unsched.result.ok) expect(unsched.result.error.code).toBe('not-scheduled')
    const retired = run(s, { type: 'claimQuest', childId: 'theodore', questId: 'theodore-language', claimId: 'x2' })
    expect(retired.result.ok).toBe(false)
  })
})

describe('bonus rewards', () => {
  it('caps at two 5-coin bonus rewards per day; the third is recorded at 0', () => {
    let s = initialState(NOW)
    // claim 3 different bonus quests (housework, math-mission, spanish-extra)
    for (const [i, q] of ['math-mission', 'spanish-extra', 'french-explore'].entries()) {
      s = run(s, { type: 'claimQuest', childId: 'theodore', questId: q, claimId: `b${i}` }).state
    }
    s = run(s, { type: 'approveClaim', claimId: 'b0' }).state
    s = run(s, { type: 'approveClaim', claimId: 'b1' }).state
    s = run(s, { type: 'approveClaim', claimId: 'b2' }).state
    expect(s.claims.b0.reward).toEqual({ coins: 5, stars: 0 })
    expect(s.claims.b1.reward).toEqual({ coins: 5, stars: 0 })
    expect(s.claims.b2.reward).toEqual({ coins: 0, stars: 0 })
    expect(s.children.theodore.coins).toBe(20 + 10) // welcome 20 + 5 + 5 + 0
    expect(s.claims.b2.status).toBe('approved') // still recorded
  })
})

describe('reading rewards', () => {
  it('first unit core 10+★, next two +5 each, fourth 0 but journaled', () => {
    let s = initialState(NOW)
    s = run(s, READ('book', 'r1', 'The Gruffalo')).state
    s = run(s, READ('chapter', 'r2')).state
    s = run(s, READ('chapter', 'r3')).state
    s = run(s, READ('book', 'r4')).state
    for (const id of ['r1', 'r2', 'r3', 'r4']) s = run(s, { type: 'approveClaim', claimId: id }).state
    expect(s.claims.r1.reward).toEqual({ coins: 10, stars: 1 })
    expect(s.claims.r2.reward).toEqual({ coins: 5, stars: 0 })
    expect(s.claims.r3.reward).toEqual({ coins: 5, stars: 0 })
    expect(s.claims.r4.reward).toEqual({ coins: 0, stars: 0 })
    expect(s.children.leonard.coins).toBe(20 + 20)
    expect(s.children.leonard.stars).toBe(1)
    const j = readingJournal(s, 'leonard')
    expect(j.totals).toEqual({ books: 2, chapters: 2 })
    expect(j.entries).toHaveLength(4)
    expect(j.entries[0].title ?? 'x').toBeDefined()
  })

  it('double-tap duplicate claimIds are idempotent', () => {
    let s = initialState(NOW)
    s = run(s, READ('book', 'r1')).state
    const again = run(s, READ('book', 'r1'))
    expect(again.result.ok).toBe(true)
    expect(Object.keys(s.claims)).toHaveLength(1)
  })

  it('reading on a non-core day starts at bonus', () => {
    // schedule with reading NOT core: updateSchedule to a day without reading
    let s = initialState(NOW)
    const noReadingCore = { 0: ['violin', 'math-counting'], 1: ['violin', 'math-counting'], 2: ['violin', 'math-counting'], 3: ['violin', 'math-counting'], 4: ['violin', 'math-counting'], 5: ['violin', 'math-counting'], 6: ['violin', 'math-counting'] }
    s = run(s, { type: 'updateSchedule', childId: 'leonard', core: noReadingCore, bonus: ['reading', 'housework'] }).state
    s = run(s, READ('book', 'r1')).state
    s = run(s, { type: 'approveClaim', claimId: 'r1' }).state
    expect(s.claims.r1.reward).toEqual({ coins: 5, stars: 0 })
  })
})

describe('pause / rest days', () => {
  it('paused day shows restDay and blocks claims', () => {
    let s = initialState(NOW)
    s = run(s, { type: 'setPaused', childId: 'theodore', dates: [TODAY], paused: true }).state
    const view = todayQuestsFor(s, 'theodore', NOW)
    expect(view.restDay).toBe(true)
    const claim = run(s, { type: 'claimQuest', childId: 'theodore', questId: 'spanish', claimId: 'c1' })
    expect(claim.result.ok).toBe(false)
    if (!claim.result.ok) expect(claim.result.error.code).toBe('rest-day')
  })
})

describe('updateSchedule', () => {
  it('appends a history entry effective today', () => {
    let s = initialState(NOW)
    const core = Object.fromEntries(Array.from({ length: 7 }, (_, d) => [d, ['spanish', 'typing']]))
    s = run(s, { type: 'updateSchedule', childId: 'theodore', core, bonus: ['housework'] }).state
    expect(s.scheduleHistory).toHaveLength(2) // initial entry + this
    const view = todayQuestsFor(s, 'theodore', NOW)
    expect(!view.restDay && view.core.map((q) => q.questId)).toEqual(['spanish', 'typing'])
  })

  it('rejects >3 core, ineligible quests, and core∩bonus', () => {
    const s = initialState(NOW)
    const tooMany = run(s, {
      type: 'updateSchedule', childId: 'theodore',
      core: { 0: ['spanish', 'typing', 'zoo-nightkeeper', 'math-mission'] }, bonus: [],
    })
    expect(tooMany.result.ok).toBe(false)
    const wrongChild = run(s, {
      type: 'updateSchedule', childId: 'theodore',
      core: { 0: ['violin'] }, bonus: [],
    })
    expect(wrongChild.result.ok).toBe(false)
    const both = run(s, {
      type: 'updateSchedule', childId: 'theodore',
      core: { 0: ['spanish'] }, bonus: ['spanish'],
    })
    expect(both.result.ok).toBe(false)
  })
})

describe('updateChildConfig', () => {
  it('validates and applies patches', () => {
    let s = initialState(NOW)
    const bad = run(s, { type: 'updateChildConfig', childId: 'leonard', patch: { mathLevel: 5 as never } })
    expect(bad.result.ok).toBe(false)
    s = run(s, { type: 'updateChildConfig', childId: 'leonard', patch: { mathLevel: 2, violinGoal: 'Twinkle twice' } }).state
    expect(s.config.leonard.mathLevel).toBe(2)
    expect(s.config.leonard.violinGoal).toBe('Twinkle twice')
    const badUrl = run(s, { type: 'updateChildConfig', childId: 'theodore', patch: { typingUrl: 'not-a-url' } })
    expect(badUrl.result.ok).toBe(false)
  })
})
