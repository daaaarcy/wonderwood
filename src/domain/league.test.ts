import { describe, expect, it } from 'vitest'
import { applyCommand, approveClaim, claimQuest } from './commands.ts'
import { initialState } from './state.ts'
import { leagueWeekStatus } from './selectors.ts'
import type { CommandDeps, GameState } from './types.ts'
import { commandDeps } from '../data/registry.ts'
import { questsFor } from '../data/quests.ts'

const deps: CommandDeps = commandDeps

const MONDAY_W0 = '2026-09-07' // week containing Mon Sep 7 → Sun Sep 13
const MONDAY_W1 = '2026-09-14'
const NOW_W1 = new Date('2026-09-14T10:00:00Z') // Monday of W1
const NOW_W2 = new Date('2026-09-21T10:00:00Z')

function claimAndApprove(s: GameState, day: Date, n: number, questOffset = 0): GameState {
  let next = s
  const quests = questsFor('theodore')
  for (let i = 0; i < n; i += 1) {
    const quest = quests[(i + questOffset) % quests.length]
    const id = `${day.toISOString().slice(0, 10)}-${quest.id}-${questOffset}`
    next = claimQuest(next, { childId: 'theodore', questId: quest.id, claimId: id }, day, deps).state
    next = approveClaim(next, { claimId: id }, day, deps).state
  }
  return next
}

/** state with `days` distinct days of `perDay` approved quests from `dayOffset` after `monday` */
function weekOfApprovals(
  s: GameState,
  mondayIso: string,
  days: number,
  perDay: number,
  dayOffset = 0,
  questOffset = 0,
): GameState {
  let next = s
  const [y, m, d] = mondayIso.split('-').map(Number)
  for (let i = 0; i < days; i += 1) {
    next = claimAndApprove(next, new Date(Date.UTC(y, m - 1, d + dayOffset + i, 10)), perDay, questOffset)
  }
  return next
}

function eval_(s: GameState, now: Date) {
  return applyCommand(s, { type: 'evaluateLeagues' }, now, deps).state
}

describe('league promotion rule', () => {
  it('15 of 21 (exactly 70% threshold, ≥3 days) promotes one league', () => {
    // createdAt before the week → full 7 eligible days → target ceil(0.7*21)=15
    let s = initialState(new Date('2026-09-01T08:00:00Z'))
    s = weekOfApprovals(s, MONDAY_W0, 5, 3) // 15 over 5 days
    s = eval_(s, NOW_W1)
    const league = s.children.theodore.league
    expect(league.rank).toBe(2)
    expect(league.evaluatedWeeks[MONDAY_W0]).toEqual({ promoted: true })
    expect(league.unseenPromotion).toEqual({ from: 1, to: 2 })
    // Leonard didn't play — stays rank 1, week recorded as not promoted
    expect(s.children.leonard.league.rank).toBe(1)
    expect(s.children.leonard.league.evaluatedWeeks[MONDAY_W0]).toEqual({ promoted: false })
  })

  it('14 of 21 does not promote', () => {
    let s = initialState(new Date('2026-09-01T08:00:00Z'))
    s = weekOfApprovals(s, MONDAY_W0, 5, 2) // 10 over Mon–Fri
    s = weekOfApprovals(s, MONDAY_W0, 2, 2, 5, 2) // +4 on Sat/Sun (quests[2],[0]) = 14 over 7 days
    s = eval_(s, NOW_W1)
    expect(s.children.theodore.league.rank).toBe(1)
    expect(s.children.theodore.league.evaluatedWeeks[MONDAY_W0]).toEqual({ promoted: false })
    expect(s.children.theodore.league.unseenPromotion).toBeNull()
  })

  it('createdAt Saturday → 2 eligible days → rest week, no promotion', () => {
    let s = initialState(new Date('2026-09-12T08:00:00Z')) // Saturday of W0
    // even 6 approvals in 2 days can't promote
    s = claimAndApprove(s, new Date('2026-09-12T10:00:00Z'), 3)
    s = claimAndApprove(s, new Date('2026-09-13T10:00:00Z'), 3)
    s = eval_(s, NOW_W1)
    expect(s.children.theodore.league.rank).toBe(1)
    expect(s.children.theodore.league.evaluatedWeeks[MONDAY_W0]).toEqual({ promoted: false })
  })

  it('createdAt Wednesday → 5 eligible days, target 11 of 15 over ≥3 days', () => {
    let s = initialState(new Date('2026-09-09T08:00:00Z')) // Wednesday of W0
    // 10 approvals → below 11 → no promotion
    s = weekOfApprovals(s, '2026-09-09', 4, 2) // 8 over Wed–Sat
    s = weekOfApprovals(s, '2026-09-09', 1, 2, 4) // Sun +2 → 10 total
    s = eval_(s, NOW_W1)
    expect(s.children.theodore.league.rank).toBe(1)

    // Now 11 approvals over ≥3 days
    let s2 = initialState(new Date('2026-09-09T08:00:00Z'))
    s2 = weekOfApprovals(s2, '2026-09-09', 3, 3) // 9 over Wed–Fri
    s2 = claimAndApprove(s2, new Date('2026-09-12T10:00:00Z'), 2, 2) // Sat +2 (quests[2],[0]) → 11
    s2 = eval_(s2, NOW_W1)
    expect(s2.children.theodore.league.rank).toBe(2)
  })

  it('is idempotent — evaluating twice changes nothing', () => {
    let s = initialState(new Date('2026-09-01T08:00:00Z'))
    s = weekOfApprovals(s, MONDAY_W0, 5, 3)
    const once = eval_(s, NOW_W1)
    const twice = eval_(once, NOW_W1)
    expect(twice).toEqual(once)
  })

  it('multi-week catch-up promotes once per qualifying week, keeps original from', () => {
    let s = initialState(new Date('2026-09-01T08:00:00Z'))
    s = weekOfApprovals(s, MONDAY_W0, 5, 3) // W0 qualifies
    s = weekOfApprovals(s, MONDAY_W1, 5, 3) // W1 qualifies
    s = eval_(s, NOW_W2)
    const league = s.children.theodore.league
    expect(league.rank).toBe(3)
    expect(league.evaluatedWeeks[MONDAY_W0]).toEqual({ promoted: true })
    expect(league.evaluatedWeeks[MONDAY_W1]).toEqual({ promoted: true })
    expect(league.unseenPromotion).toEqual({ from: 1, to: 3 })
  })

  it('caps at rank 14', () => {
    let s = initialState(new Date('2026-09-01T08:00:00Z'))
    s = {
      ...s,
      children: {
        ...s.children,
        theodore: { ...s.children.theodore, league: { ...s.children.theodore.league, rank: 14 } },
      },
    }
    s = weekOfApprovals(s, MONDAY_W0, 5, 3)
    s = eval_(s, NOW_W1)
    expect(s.children.theodore.league.rank).toBe(14)
    expect(s.children.theodore.league.unseenPromotion).toBeNull()
    expect(s.children.theodore.league.evaluatedWeeks[MONDAY_W0]).toEqual({ promoted: true })
  })

  it('late approval of a prior-week claim promotes after re-check', () => {
    let s = initialState(new Date('2026-09-01T08:00:00Z'))
    s = weekOfApprovals(s, MONDAY_W0, 4, 3) // 12 over Mon–Thu
    s = claimAndApprove(s, new Date('2026-09-12T10:00:00Z'), 2) // 14 (Fri was skipped, Sat ×2)
    // wait: Sat uses default offset quests[0],[1] — distinct day so fine
    // one more claim left PENDING in W0
    const pending = claimQuest(
      s,
      { childId: 'theodore', questId: 'theodore-kindness', claimId: 'late-1' },
      new Date('2026-09-12T11:00:00Z'),
      deps,
    )
    s = pending.state
    s = eval_(s, NOW_W1) // W0 evaluated as not promoted (14 < 15)
    expect(s.children.theodore.league.evaluatedWeeks[MONDAY_W0]).toEqual({ promoted: false })
    // parent approves it a week late
    s = approveClaim(s, { claimId: 'late-1' }, NOW_W1, deps).state
    expect(s.children.theodore.league.rank).toBe(2)
    expect(s.children.theodore.league.evaluatedWeeks[MONDAY_W0]).toEqual({ promoted: true })
    expect(s.children.theodore.league.unseenPromotion).toEqual({ from: 1, to: 2 })
  })

  it('purchases never change league rank', () => {
    let s = initialState(new Date('2026-09-01T08:00:00Z'))
    s = applyCommand(s, { type: 'purchase', childId: 'theodore', itemId: 'hat-leaf', purchaseId: 'p1' }, NOW_W1, deps).state
    expect(s.children.theodore.league.rank).toBe(1)
  })

  it('pending and rejected claims do not count', () => {
    let s = initialState(new Date('2026-09-01T08:00:00Z'))
    // 12 approved + 3 pending + 3 rejected in W0
    s = weekOfApprovals(s, MONDAY_W0, 4, 3)
    const q = questsFor('theodore')
    for (let i = 0; i < 3; i += 1) {
      s = claimQuest(s, { childId: 'theodore', questId: q[i].id, claimId: `pend-${i}` }, new Date('2026-09-12T10:00:00Z'), deps).state
    }
    // rejected: claim then reject
    for (let i = 0; i < 3; i += 1) {
      s = claimQuest(s, { childId: 'theodore', questId: q[i].id, claimId: `rej-${i}` }, new Date('2026-09-13T10:00:00Z'), deps).state
      s = applyCommand(s, { type: 'rejectClaim', claimId: `rej-${i}` }, new Date('2026-09-13T11:00:00Z'), deps).state
    }
    s = eval_(s, NOW_W1)
    expect(s.children.theodore.league.rank).toBe(1) // 12 < 15
  })
})

describe('parentCompleteAndApprove with an existing claim', () => {
  it('approves the child’s pending claim instead of erroring', () => {
    let s = initialState(new Date('2026-09-14T09:00:00Z'))
    s = claimQuest(s, { childId: 'theodore', questId: 'theodore-language', claimId: 'kid-1' }, NOW_W1, deps).state
    const out = applyCommand(
      s,
      { type: 'parentCompleteAndApprove', childId: 'theodore', questId: 'theodore-language', claimId: 'parent-1' },
      NOW_W1,
      deps,
    )
    expect(out.result.ok).toBe(true)
    s = out.state
    expect(s.claims['kid-1'].status).toBe('approved')
    expect(s.claims['parent-1']).toBeUndefined() // no second claim created
    expect(s.children.theodore.coins).toBe(30)
    expect(s.ledger.filter((e) => e.reason === 'quest')).toHaveLength(1)
  })

  it('is a no-op when the quest was already approved today', () => {
    let s = initialState(new Date('2026-09-14T09:00:00Z'))
    s = applyCommand(
      s,
      { type: 'parentCompleteAndApprove', childId: 'theodore', questId: 'theodore-language', claimId: 'parent-1' },
      NOW_W1,
      deps,
    ).state
    const again = applyCommand(
      s,
      { type: 'parentCompleteAndApprove', childId: 'theodore', questId: 'theodore-language', claimId: 'parent-2' },
      NOW_W1,
      deps,
    )
    expect(again.result.ok).toBe(true)
    expect(again.state.children.theodore.coins).toBe(30)
    expect(again.state.ledger.filter((e) => e.reason === 'quest')).toHaveLength(1)
  })
})

describe('acknowledgePromotion + leagueWeekStatus', () => {
  it('clears unseenPromotion', () => {
    let s = initialState(new Date('2026-09-01T08:00:00Z'))
    s = weekOfApprovals(s, MONDAY_W0, 5, 3)
    s = eval_(s, NOW_W1)
    s = applyCommand(s, { type: 'acknowledgePromotion', childId: 'theodore' }, NOW_W1, deps).state
    expect(s.children.theodore.league.unseenPromotion).toBeNull()
    expect(s.children.theodore.league.rank).toBe(2)
  })

  it('reports live week progress and rest weeks', () => {
    let s = initialState(new Date('2026-09-14T08:00:00Z')) // Monday W1
    // approve 2 quests on Monday
    s = claimAndApprove(s, NOW_W1, 2)
    const w = leagueWeekStatus(s, 'theodore', NOW_W1)
    expect(w.restWeek).toBe(false)
    expect(w.eligibleDays).toBe(7) // full week is eligible (created Monday)
    expect(w.count).toBe(2)
    expect(w.target).toBe(15) // ceil(0.7 * 21)
    // Saturday-created state → rest week
    const s2 = initialState(new Date('2026-09-19T08:00:00Z')) // Sat of W1
    expect(leagueWeekStatus(s2, 'theodore', new Date('2026-09-19T09:00:00Z')).restWeek).toBe(true)
  })
})
