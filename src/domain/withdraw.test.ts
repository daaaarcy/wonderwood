import { describe, expect, it } from 'vitest'
import {
  applyCommand,
  approveClaim,
  claimQuest,
  GROWN_UP_COMMANDS,
  rejectClaim,
  withdrawClaim,
} from './commands.ts'
import { initialState } from './state.ts'
import { todayQuestsFor } from './selectors.ts'
import { commandDeps } from '../data/registry.ts'
import type { CommandDeps, GameState } from './types.ts'

const deps: CommandDeps = commandDeps
const NOW = new Date('2026-10-12T10:00:00Z') // a Monday

function claim(s: GameState, childId: 'theodore' | 'leonard', questId: string, claimId: string) {
  const r = claimQuest(s, { childId, questId, claimId }, NOW, deps)
  expect(r.result.ok).toBe(true)
  return r.state
}

describe('withdrawClaim', () => {
  it('withdraws a pending core claim — the quest is available again', () => {
    let s = initialState(NOW)
    s = claim(s, 'theodore', 'spanish', 'w1')
    expect(s.claims['w1']?.status).toBe('pending')
    const r = withdrawClaim(s, { claimId: 'w1', childId: 'theodore' }, NOW, deps)
    expect(r.result.ok).toBe(true)
    expect(r.state.claims['w1']).toBeUndefined()
    const today = todayQuestsFor(r.state, 'theodore', NOW)
    const card = !today.restDay && today.core.find((t) => t.questId === 'spanish')
    expect(card && card.status).toBe('available')
  })

  it('a withdrawn bonus claim frees the bonus-coin slot', () => {
    let s = initialState(NOW)
    s = claim(s, 'theodore', 'math-mission', 'b1')
    s = claim(s, 'theodore', 'spanish-extra', 'b2')
    let today = todayQuestsFor(s, 'theodore', NOW)
    expect(!today.restDay && today.bonusSlotsLeft).toBe(0)
    const r = withdrawClaim(s, { claimId: 'b1', childId: 'theodore' }, NOW, deps)
    expect(r.result.ok).toBe(true)
    today = todayQuestsFor(r.state, 'theodore', NOW)
    expect(!today.restDay && today.bonusSlotsLeft).toBe(1)
  })

  it('withdraws a pending custom-task claim', () => {
    const base = initialState(NOW)
    const s: GameState = {
      ...base,
      customQuests: {
        'cq-1': {
          id: 'cq-1',
          title: 'Water the plants',
          coins: 10,
          stars: 1,
          childIds: ['theodore'],
          days: [],
          active: true,
          createdAt: NOW.toISOString(),
        },
      },
    }
    const c = claim(s, 'theodore', 'cq-1', 'cu1')
    expect(c.claims['cu1']?.role).toBe('custom')
    const r = withdrawClaim(c, { claimId: 'cu1', childId: 'theodore' }, NOW, deps)
    expect(r.result.ok).toBe(true)
    expect(r.state.claims['cu1']).toBeUndefined()
  })

  it('withdraws a pending reading claim — journal entry and sequence reset', () => {
    let s = initialState(NOW)
    s = claim(s, 'leonard', 'reading', 'r1')
    let today = todayQuestsFor(s, 'leonard', NOW)
    expect(!today.restDay && today.readingClaims.length).toBe(1)
    const r = withdrawClaim(s, { claimId: 'r1', childId: 'leonard' }, NOW, deps)
    expect(r.result.ok).toBe(true)
    today = todayQuestsFor(r.state, 'leonard', NOW)
    expect(!today.restDay && today.readingClaims.length).toBe(0)
  })

  it('rejects withdrawing approved or rejected claims', () => {
    let s = initialState(NOW)
    s = claim(s, 'theodore', 'spanish', 'a1')
    s = claim(s, 'theodore', 'typing', 'a2')
    s = approveClaim(s, { claimId: 'a1' }, NOW, deps).state
    s = rejectClaim(s, { claimId: 'a2' }, NOW, deps).state
    const approved = withdrawClaim(s, { claimId: 'a1', childId: 'theodore' }, NOW, deps)
    expect(approved.result.ok).toBe(false)
    if (!approved.result.ok) expect(approved.result.error.code).toBe('claim-not-pending')
    expect(approved.state.claims['a1']?.status).toBe('approved')
    const rejected = withdrawClaim(s, { claimId: 'a2', childId: 'theodore' }, NOW, deps)
    expect(rejected.result.ok).toBe(false)
    if (!rejected.result.ok) expect(rejected.result.error.code).toBe('claim-not-pending')
  })

  it("rejects another child's claim and unknown ids", () => {
    let s = initialState(NOW)
    s = claim(s, 'theodore', 'spanish', 't1')
    const wrong = withdrawClaim(s, { claimId: 't1', childId: 'leonard' }, NOW, deps)
    expect(wrong.result.ok).toBe(false)
    if (!wrong.result.ok) expect(wrong.result.error.code).toBe('invalid-claim')
    expect(wrong.state.claims['t1']?.status).toBe('pending')
    const missing = withdrawClaim(s, { claimId: 'nope', childId: 'theodore' }, NOW, deps)
    expect(missing.result.ok).toBe(false)
    if (!missing.result.ok) expect(missing.result.error.code).toBe('unknown-claim')
    // and a second withdraw of the same id is the same unknown-claim no-op
    const gone = withdrawClaim(s, { claimId: 't1', childId: 'theodore' }, NOW, deps)
    expect(gone.result.ok).toBe(true)
    const again = withdrawClaim(gone.state, { claimId: 't1', childId: 'theodore' }, NOW, deps)
    expect(again.result.ok).toBe(false)
    if (!again.result.ok) expect(again.result.error.code).toBe('unknown-claim')
  })

  it('re-claim after withdraw approves normally — reward exactly once', () => {
    let s = initialState(NOW)
    s = claim(s, 'theodore', 'spanish', 'first')
    s = withdrawClaim(s, { claimId: 'first', childId: 'theodore' }, NOW, deps).state
    s = claim(s, 'theodore', 'spanish', 'second')
    const before = s.children.theodore.coins
    const a = approveClaim(s, { claimId: 'second' }, NOW, deps)
    expect(a.result.ok).toBe(true)
    expect(a.state.children.theodore.coins).toBe(before + 10)
    expect(Object.keys(a.state.claims)).toEqual(['second'])
  })

  it('is child-allowed — not a grown-up command', () => {
    expect(GROWN_UP_COMMANDS.has('withdrawClaim')).toBe(false)
    // and applyCommand routes it
    let s = initialState(NOW)
    s = claim(s, 'theodore', 'spanish', 'ac1')
    const r = applyCommand(
      s,
      { type: 'withdrawClaim', claimId: 'ac1', childId: 'theodore' },
      NOW,
      deps,
    )
    expect(r.result.ok).toBe(true)
    expect(r.state.claims['ac1']).toBeUndefined()
  })
})
