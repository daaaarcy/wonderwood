import { describe, expect, it } from 'vitest'
import { applyCommand } from './commands.ts'
import { initialState } from './state.ts'
import { migrateState } from './migrate.ts'
import { unacknowledgedRepairs, weeklyView } from './selectors.ts'
import { addDaysKey, localDateKey, mondayKeyOf } from './week.ts'
import { commandDeps } from '../data/registry.ts'
import type { GameState } from './types.ts'

const NOW = new Date('2026-10-12T12:00:00Z') // a Monday
const TZ = 'UTC'
const today = () => localDateKey(NOW, TZ)

function cmd(s: GameState, c: Parameters<typeof applyCommand>[1], now: Date = NOW) {
  const r = applyCommand(s, c, now, commandDeps)
  if (!r.result.ok) throw new Error(JSON.stringify(r.result))
  return r.state
}
function cmdResult(s: GameState, c: Parameters<typeof applyCommand>[1], now: Date = NOW) {
  return applyCommand(s, c, now, commandDeps)
}

function readingClaim(s: GameState, date: string, i: number): GameState {
  // approved reading claim on a specific activityDate
  const s2 = cmd(s, {
    type: 'claimQuest', childId: 'leonard', questId: 'reading', claimId: `r-${date}-${i}`,
    details: { kind: 'reading', unit: 'book', withGrownUp: false },
  }, new Date(`${date}T09:00:00Z`))
  return cmd(s2, { type: 'approveClaim', claimId: `r-${date}-${i}` }, new Date(`${date}T20:00:00Z`))
}

function spanishClaim(s: GameState, date: string): GameState {
  const s2 = cmd(s, {
    type: 'claimQuest', childId: 'theodore', questId: 'spanish', claimId: `s-${date}`,
  }, new Date(`${date}T09:00:00Z`))
  return cmd(s2, { type: 'approveClaim', claimId: `s-${date}` }, new Date(`${date}T20:00:00Z`))
}

describe('v5 → v6 migration', () => {
  it('adds city name/postcards, weekly, badges, repairs', () => {
    const v5 = initialState(NOW, TZ) as unknown as Record<string, unknown>
    v5.schemaVersion = 5
    delete v5.weekly
    delete v5.badges
    delete v5.repairs
    const s = migrateState(v5, { now: NOW, timeZone: TZ })
    expect(s?.schemaVersion).toBe(6)
    expect(s?.city.name).toBeNull()
    expect(s?.city.postcards).toEqual([])
    expect(s?.weekly).toEqual({ theodore: {}, leonard: {} })
    expect(s?.repairs).toEqual({})
  })
})

describe('nameCity + customizeBuilding', () => {
  it('trims, validates ≤30 chars', () => {
    let s = initialState(NOW, TZ)
    s = cmd(s, { type: 'nameCity', childId: 'theodore', name: '  Sunny   Town ' })
    expect(s.city.name).toBe('Sunny Town')
    expect(cmdResult(s, { type: 'nameCity', childId: 'theodore', name: 'x'.repeat(31) }).result.ok).toBe(false)
    expect(cmdResult(s, { type: 'nameCity', childId: 'theodore', name: '   ' }).result.ok).toBe(false)
  })
  it('customizeBuilding only on open buildings, palette colors', () => {
    let s = initialState(NOW, TZ)
    // road not open yet → reject
    expect(
      cmdResult(s, { type: 'customizeBuilding', childId: 'theodore', projectId: 'road', color: '#58b368' }).result.ok,
    ).toBe(false)
    s.city.projects.road = { kits: 2, status: 'open', openedAt: NOW.toISOString() }
    s = cmd(s, { type: 'customizeBuilding', childId: 'theodore', projectId: 'road', color: '#58b368', name: 'Rainbow Way' })
    expect(s.city.projects.road.color).toBe('#58b368')
    expect(s.city.projects.road.name).toBe('Rainbow Way')
    expect(
      cmdResult(s, { type: 'customizeBuilding', childId: 'theodore', projectId: 'road', color: '#000000' }).result.ok,
    ).toBe(false)
  })
})

describe('postcards', () => {
  it('created once when a project opens (idempotent kit re-send)', () => {
    let s = initialState(NOW, TZ)
    s.children.theodore.coins = 40
    s = cmd(s, { type: 'buyKit', childId: 'theodore', projectId: 'road', kitPurchaseId: 'k1' })
    s = cmd(s, { type: 'buyKit', childId: 'theodore', projectId: 'road', kitPurchaseId: 'k2' })
    expect(s.city.projects.road.status).toBe('open')
    expect(s.city.postcards).toHaveLength(1)
    expect(s.city.postcards?.[0]?.projectId).toBe('road')
    // re-send both kit ids — no new postcards
    s = cmd(s, { type: 'buyKit', childId: 'theodore', projectId: 'road', kitPurchaseId: 'k2' })
    expect(s.city.postcards).toHaveLength(1)
  })
})

describe('weekly challenge', () => {
  it('Leonard reads on 4 distinct days → +20 coins, badge, no stars', () => {
    let s = initialState(NOW, TZ)
    const mon = mondayKeyOf(today())
    for (let d = 0; d < 4; d += 1) s = readingClaim(s, addDaysKey(mon, d), 0)
    expect(s.children.leonard.coins).toBe(20 + 40 + 20) // welcome + 4 core quest rewards + weekly
    expect(s.children.leonard.stars).toBe(4)
    expect(s.badges).toHaveLength(1)
    expect(s.badges[0]?.templateId).toBe('read-4')
    expect(s.weekly.leonard[mon]?.completedAt).toBeTruthy()
    // a 5th day's approval doesn't award again
    s = readingClaim(s, addDaysKey(mon, 4), 0)
    expect(s.badges).toHaveLength(1)
    expect(s.ledger.filter((l) => l.reason === 'weekly')).toHaveLength(1)
  })
  it('4 claims on the same day do not count', () => {
    let s = initialState(NOW, TZ)
    const mon = mondayKeyOf(today())
    for (let i = 0; i < 4; i += 1) s = readingClaim(s, mon, i)
    expect(s.badges).toHaveLength(0)
    expect(weeklyView(s, 'leonard', mon)?.done).toBe(1)
  })
  it('late approval counts toward the claim week', () => {
    let s = initialState(NOW, TZ)
    const mon = mondayKeyOf(today())
    for (let d = 0; d < 3; d += 1) s = readingClaim(s, addDaysKey(mon, d), 0)
    // 4th claim in that week approved a week later
    const s2 = cmd(s, {
      type: 'claimQuest', childId: 'leonard', questId: 'reading', claimId: 'r-late',
      details: { kind: 'reading', unit: 'book', withGrownUp: false },
    }, new Date(`${addDaysKey(mon, 3)}T09:00:00Z`))
    s = cmd(s2, { type: 'approveClaim', claimId: 'r-late' }, new Date(`${addDaysKey(mon, 10)}T09:00:00Z`))
    expect(s.weekly.leonard[mon]?.completedAt).toBeTruthy()
    expect(s.badges).toHaveLength(1)
  })
  it('Theodore default is spanish-4', () => {
    let s = initialState(NOW, TZ)
    const mon = mondayKeyOf(today())
    for (let d = 0; d < 4; d += 1) s = spanishClaim(s, addDaysKey(mon, d))
    expect(s.badges).toHaveLength(1)
    expect(s.weekly.theodore[mon]?.completedAt).toBeTruthy()
  })
  it('setWeeklyChallenge: current/future only, blocked after completion', () => {
    let s = initialState(NOW, TZ)
    const mon = mondayKeyOf(today())
    s = cmd(s, { type: 'setWeeklyChallenge', childId: 'leonard', weekKey: mon, templateId: 'housework-3' })
    expect(s.weekly.leonard[mon]?.templateId).toBe('housework-3')
    expect(
      cmdResult(s, { type: 'setWeeklyChallenge', childId: 'leonard', weekKey: addDaysKey(mon, -7), templateId: 'read-4' }).result.ok,
    ).toBe(false)
    // after completion can't change
    const s2 = { ...s, weekly: { ...s.weekly, leonard: { ...s.weekly.leonard, [mon]: { templateId: 'read-4', completedAt: 'x' } } } }
    expect(
      cmdResult(s2, { type: 'setWeeklyChallenge', childId: 'leonard', weekKey: mon, templateId: 'housework-3' }).result.ok,
    ).toBe(false)
    // invalid template for child's schedule? housework-3 is scheduled for leonard (bonus) ✓
    expect(
      cmdResult(s, { type: 'setWeeklyChallenge', childId: 'leonard', weekKey: mon, templateId: 'spanish-4' }).result.ok,
    ).toBe(false) // spanish not in leonard's schedule
  })
})

describe('reset & repair', () => {
  const inc = {
    type: 'logIncident' as const,
    childId: 'theodore' as const,
    incidentId: 'inc-1',
    situation: 'spitting' as const,
  }
  it('log → repaired → only that child sees the acknowledgment, once', () => {
    let s = initialState(NOW, TZ)
    s = cmd(s, inc)
    expect(s.repairs['inc-1']).toBeTruthy()
    expect(unacknowledgedRepairs(s, 'theodore')).toHaveLength(0) // not repaired yet
    s = cmd(s, { type: 'markRepaired', incidentId: 'inc-1' })
    expect(unacknowledgedRepairs(s, 'theodore')).toHaveLength(1)
    expect(unacknowledgedRepairs(s, 'leonard')).toHaveLength(0)
    // ack before repaired is impossible; now ack → hidden again
    s = cmd(s, { type: 'acknowledgeRepair', incidentId: 'inc-1' })
    expect(unacknowledgedRepairs(s, 'theodore')).toHaveLength(0)
  })
  it('repairs never change coins, stars, league, items or city', () => {
    let s = initialState(NOW, TZ)
    const before = JSON.stringify({
      children: s.children, city: s.city, claims: s.claims, ledger: s.ledger, badges: s.badges,
    })
    s = cmd(s, inc)
    s = cmd(s, { type: 'markRepaired', incidentId: 'inc-1' })
    s = cmd(s, { type: 'acknowledgeRepair', incidentId: 'inc-1' })
    s = cmd(s, { type: 'logIncident', childId: 'leonard', incidentId: 'inc-2', situation: 'other', otherText: 'x' })
    s = cmd(s, { type: 'deleteIncident', incidentId: 'inc-2' })
    const after = JSON.stringify({
      children: s.children, city: s.city, claims: s.claims, ledger: s.ledger, badges: s.badges,
    })
    expect(after).toBe(before)
  })
  it('prunes repaired incidents older than 30 days', () => {
    let s = initialState(NOW, TZ)
    s = cmd(s, inc)
    s = cmd(s, { type: 'markRepaired', incidentId: 'inc-1' })
    const later = new Date(NOW.getTime() + 31 * 86_400_000)
    s = cmd(s, { type: 'logIncident', childId: 'leonard', incidentId: 'inc-2', situation: 'fighting' }, later)
    expect(s.repairs['inc-1']).toBeUndefined()
    expect(s.repairs['inc-2']).toBeTruthy()
  })
})
