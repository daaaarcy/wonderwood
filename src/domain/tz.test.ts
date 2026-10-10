import { describe, expect, it } from 'vitest'
import { applyCommand, claimQuest } from './commands.ts'
import { initialState } from './state.ts'
import { localDateKey, mondayKeyOf, sundayKeyOf } from './week.ts'
import { commandDeps } from '../data/registry.ts'

const deps = commandDeps

describe('time-zone-aware dates', () => {
  it('a claim at 23:30 in Los Angeles gets the LA date even though it is the next day in UTC', () => {
    const s = initialState(new Date('2026-10-09T12:00:00Z'), 'America/Los_Angeles')
    // Oct 9 23:30 PDT = Oct 10 06:30 UTC
    const late = new Date('2026-10-10T06:30:00Z')
    const r = claimQuest(
      s,
      { childId: 'theodore', questId: 'theodore-language', claimId: 'c-late' },
      late,
      deps,
    )
    expect(r.result.ok).toBe(true)
    expect(r.state.claims['c-late'].activityDate).toBe('2026-10-09')
  })

  it('the same instant lands on different dates in different zones', () => {
    const t = new Date('2026-10-10T23:30:00Z')
    expect(localDateKey(t, 'UTC')).toBe('2026-10-10')
    expect(localDateKey(t, 'Asia/Tokyo')).toBe('2026-10-11')
    expect(localDateKey(t, 'America/Los_Angeles')).toBe('2026-10-10')
  })

  it('league week boundaries follow the family zone, not UTC', () => {
    // Sunday 23:30 UTC is already Monday morning in Tokyo.
    const t = new Date('2026-10-04T23:30:00Z')
    const utc = localDateKey(t, 'UTC') // 2026-10-04 (Sunday)
    const tokyo = localDateKey(t, 'Asia/Tokyo') // 2026-10-05 (Monday)
    expect(mondayKeyOf(utc)).toBe('2026-09-28')
    expect(mondayKeyOf(tokyo)).toBe('2026-10-05')
    expect(sundayKeyOf(tokyo)).toBe('2026-10-11')
  })

  it('evaluateLeagues sees a week as ended only after ITS Sunday in the family zone', () => {
    // Tokyo save; now = Sunday 23:30 UTC (still Sunday night in UTC, already
    // Monday in Tokyo) → Tokyo evaluates the week, UTC does not.
    const tokyo = initialState(new Date('2026-09-28T09:00:00Z'), 'Asia/Tokyo')
    const utc = initialState(new Date('2026-09-28T09:00:00Z'), 'UTC')
    const now = new Date('2026-10-04T23:30:00Z')
    const tOut = applyCommand(tokyo, { type: 'evaluateLeagues' }, now, deps)
    const uOut = applyCommand(utc, { type: 'evaluateLeagues' }, now, deps)
    expect(tOut.state.children.theodore.league.evaluatedWeeks['2026-09-28']).toBeDefined()
    expect(uOut.state.children.theodore.league.evaluatedWeeks['2026-09-28']).toBeUndefined()
  })

  it('migration/fresh state carries the zone through claims and weeks', () => {
    const s = initialState(new Date('2026-10-09T12:00:00Z'), 'Asia/Tokyo')
    expect(s.timeZone).toBe('Asia/Tokyo')
  })
})
