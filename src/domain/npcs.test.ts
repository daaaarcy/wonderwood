import { describe, expect, it } from 'vitest'
import { NPCS, NPC_BASE_WEEK, npcLeagueRank, npcWeekProgress, type NpcId } from './npcs.ts'
import { childWeekScore, rivalNudge, weeklyLeaderboard } from './selectors.ts'
import { initialState } from './state.ts'
import { approveClaim, claimQuest } from './commands.ts'
import { addDaysKey } from './week.ts'
import type { Claim, CommandDeps, GameState } from './types.ts'
import { commandDeps } from '../data/registry.ts'

const deps: CommandDeps = commandDeps

/** Twelve consecutive Mondays starting at the app's base week. */
const SAMPLE_WEEKS = Array.from({ length: 12 }, (_, i) => addDaysKey(NPC_BASE_WEEK, i * 7))

function approveOn(s: GameState, childId: 'theodore' | 'leonard', questId: string, id: string, day: string): GameState {
  let next = claimQuest(s, { childId, questId, claimId: id }, new Date(`${day}T10:00:00Z`), deps).state
  next = approveClaim(next, { claimId: id }, new Date(`${day}T10:30:00Z`), deps).state
  return next
}

describe('storybook friends — weekly progress', () => {
  it('is deterministic: same inputs always give the same result', () => {
    for (const npc of NPCS) {
      for (const week of ['2026-10-05', '2026-11-16', '2027-02-22']) {
        for (let d = 0; d < 7; d += 1) {
          const day = addDaysKey(week, d)
          expect(npcWeekProgress(npc.id, week, day)).toEqual(npcWeekProgress(npc.id, week, day))
        }
        expect(npcLeagueRank(npc.id, week)).toBe(npcLeagueRank(npc.id, week))
      }
    }
  })

  it('completed is non-decreasing across days and never exceeds opportunities', () => {
    for (const npc of NPCS) {
      for (const week of SAMPLE_WEEKS.slice(0, 6)) {
        let prev = -1
        for (let d = 0; d < 7; d += 1) {
          const p = npcWeekProgress(npc.id, week, addDaysKey(week, d))
          expect(p.completed).toBeGreaterThanOrEqual(prev)
          expect(p.completed).toBeLessThanOrEqual(p.opportunities)
          prev = p.completed
        }
        const sunday = npcWeekProgress(npc.id, week, addDaysKey(week, 6))
        expect(sunday.opportunities).toBe(npc.weeklyOpportunities)
        expect(sunday.pctSoFar).toBeGreaterThan(0)
        expect(sunday.pctSoFar).toBeLessThanOrEqual(1)
      }
    }
  })

  it('starts small on Monday and reaches the week total by Sunday', () => {
    for (const npc of NPCS) {
      const week = '2026-10-12'
      const monday = npcWeekProgress(npc.id, week, week)
      const sunday = npcWeekProgress(npc.id, week, addDaysKey(week, 6))
      expect(monday.opportunities).toBeLessThan(sunday.opportunities)
      expect(monday.completed).toBeLessThanOrEqual(sunday.completed)
      // days after Sunday keep showing the finished week
      expect(npcWeekProgress(npc.id, week, addDaysKey(week, 10))).toEqual(sunday)
      // days before the week starts show nothing
      expect(npcWeekProgress(npc.id, week, addDaysKey(week, -1)).completed).toBe(0)
    }
  })

  it('week percentages stay in character for each temperament', () => {
    const pct = (id: NpcId, week: string) => {
      const p = npcWeekProgress(id, week, addDaysKey(week, 6))
      return p.completed / p.opportunities
    }
    const mean = (id: NpcId) =>
      SAMPLE_WEEKS.reduce((s, w) => s + pct(id, w), 0) / SAMPLE_WEEKS.length

    for (const week of SAMPLE_WEEKS) {
      // Felix keeps busy weeks; Riley middling; Bramble low — none degenerate
      expect(pct('felix', week)).toBeGreaterThanOrEqual(0.6)
      expect(pct('riley', week)).toBeGreaterThanOrEqual(0.4)
      expect(pct('riley', week)).toBeLessThan(0.85)
      // sleepy Bramble never quite reaches the 70% promotion line
      expect(pct('bramble', week)).toBeLessThan(0.7)
      expect(pct('bramble', week)).toBeGreaterThanOrEqual(0.25)
    }
    // and over a season the ordering matches their personalities
    expect(mean('felix')).toBeGreaterThan(mean('riley'))
    expect(mean('riley')).toBeGreaterThan(mean('bramble'))
  })
})

describe('storybook friends — league rank simulation', () => {
  it('rank at NPC_BASE_WEEK equals each base rank', () => {
    expect(npcLeagueRank('felix', NPC_BASE_WEEK)).toBe(4)
    expect(npcLeagueRank('riley', NPC_BASE_WEEK)).toBe(3)
    expect(npcLeagueRank('bramble', NPC_BASE_WEEK)).toBe(2)
  })

  it('weeks before the base week clamp to base rank', () => {
    for (const npc of NPCS) {
      expect(npcLeagueRank(npc.id, '2026-09-28')).toBe(npc.baseRank)
      expect(npcLeagueRank(npc.id, '2026-01-05')).toBe(npc.baseRank)
    }
  })

  it('rank only ever grows and caps at 14', () => {
    for (const npc of NPCS) {
      let prev = npc.baseRank
      for (let i = 1; i <= 52; i += 1) {
        const rank = npcLeagueRank(npc.id, addDaysKey(NPC_BASE_WEEK, i * 7))
        expect(rank).toBeGreaterThanOrEqual(prev)
        expect(rank).toBeLessThanOrEqual(14)
        prev = rank
      }
    }
  })

  it('keen Felix climbs while sleepy Bramble stays put', () => {
    const later = addDaysKey(NPC_BASE_WEEK, 20 * 7)
    expect(npcLeagueRank('felix', later)).toBeGreaterThan(npcLeagueRank('bramble', later))
    // Bramble's weeks never reach 70% → no promotions at all
    expect(npcLeagueRank('bramble', addDaysKey(NPC_BASE_WEEK, 52 * 7))).toBe(2)
  })

  it('52 seeded weeks: median finishing pct lands mid-table, ranks never drop ≤14', () => {
    const pcts: number[] = []
    for (let i = 0; i < 52; i += 1) {
      const week = addDaysKey(NPC_BASE_WEEK, i * 7)
      for (const npc of NPCS) {
        const p = npcWeekProgress(npc.id, week, addDaysKey(week, 6))
        pcts.push(p.completed / p.opportunities)
        const rank = npcLeagueRank(npc.id, week)
        expect(rank).toBeGreaterThanOrEqual(npc.baseRank)
        expect(rank).toBeLessThanOrEqual(14)
      }
      // ranks must be non-decreasing week over week per friend
      for (const npc of NPCS) {
        if (i > 0) {
          expect(npcLeagueRank(npc.id, week)).toBeGreaterThanOrEqual(
            npcLeagueRank(npc.id, addDaysKey(week, -7)),
          )
        }
      }
    }
    pcts.sort((a, b) => a - b)
    const median = pcts[Math.floor(pcts.length / 2)]
    expect(median).toBeGreaterThanOrEqual(0.55)
    expect(median).toBeLessThanOrEqual(0.8)
  })
})

describe('weeklyLeaderboard', () => {
  const MONDAY = '2026-10-12'
  const WEDNESDAY = '2026-10-14'

  it('lists both explorers and all ten friends, sorted by pct', () => {
    const s = initialState(new Date(`${MONDAY}T09:00:00Z`))
    const board = weeklyLeaderboard(s, MONDAY, WEDNESDAY)
    expect(board).toHaveLength(12)
    expect(board.map((r) => r.name)).toEqual(
      expect.arrayContaining([
        'Theodore',
        'Leonard',
        'Felix the Fox',
        'Riley the Rabbit',
        'Bramble the Bear',
        'Olive the Owl',
        'Pip the Penguin',
        'Hazel the Hedgehog',
        'Sunny the Squirrel',
        'Tilly the Turtle',
        'Poppy the Panda',
        'Dot the Duck',
      ]),
    )
    expect(board.filter((r) => r.kind === 'npc')).toHaveLength(10)
    for (let i = 1; i < board.length; i += 1) {
      expect(board[i].pct).toBeLessThanOrEqual(board[i - 1].pct)
      // positions are non-decreasing down the sorted list
      expect(board[i].position).toBeGreaterThanOrEqual(board[i - 1].position)
    }
  })

  it('equal pcts share the same position ("1=" ties)', () => {
    // fresh state — both kids at 0% must tie
    const s = initialState(new Date(`${MONDAY}T09:00:00Z`))
    const board = weeklyLeaderboard(s, MONDAY, MONDAY)
    const kids = board.filter((r) => r.kind === 'child')
    expect(kids).toHaveLength(2)
    expect(kids[0].pct).toBe(0)
    expect(kids[0].position).toBe(kids[1].position)
    expect(kids[0].tied).toBe(true)
    // and tied rows genuinely share the number, not just the flag
    const firstAtPct = new Map<number, number>()
    for (const row of board) {
      const key = Math.round(row.pct * 100)
      const pos = firstAtPct.get(key) ?? row.position
      expect(row.position).toBe(pos)
      firstAtPct.set(key, pos)
    }
  })

  it('childWeekScore counts approved starred claims over chances so far', () => {
    let s = initialState(new Date(`${MONDAY}T09:00:00Z`)) // created Monday
    s = approveOn(s, 'theodore', 'spanish', 'c1', MONDAY)
    s = approveOn(s, 'theodore', 'typing', 'c2', MONDAY)

    // through Monday: 2 of 3 offered
    expect(childWeekScore(s, 'theodore', MONDAY, MONDAY)).toEqual({
      completed: 2,
      opportunities: 3,
      pct: 2 / 3,
    })
    // through Wednesday the denominator grows, the count stays
    const wed = childWeekScore(s, 'theodore', MONDAY, WEDNESDAY)
    expect(wed.completed).toBe(2)
    expect(wed.opportunities).toBe(9)

    // a pending claim and a bonus approval must not move the number
    s = claimQuest(
      s,
      { childId: 'theodore', questId: 'zoo-nightkeeper', claimId: 'pend' },
      new Date(`${MONDAY}T11:00:00Z`),
      deps,
    ).state
    s = approveOn(s, 'theodore', 'math-mission', 'bonus-1', MONDAY)
    const after = childWeekScore(s, 'theodore', MONDAY, MONDAY)
    expect(after.completed).toBe(2)

    // claims next week don't leak into this week
    const s2 = approveOn(s, 'theodore', 'spanish', 'nw', addDaysKey(MONDAY, 7))
    expect(childWeekScore(s2, 'theodore', MONDAY, addDaysKey(MONDAY, 6)).completed).toBe(2)

    // nothing scheduled → 0% rather than NaN
    const empty = initialState(new Date(`${MONDAY}T09:00:00Z`))
    expect(childWeekScore(empty, 'leonard', addDaysKey(MONDAY, -7), MONDAY).pct).toBe(0)
  })

  it('rival nudge names the nearest storybook friend — never the brother', () => {
    // both boys at 0% on Wednesday: sort falls to name order, so Leonard's
    // row sits directly above Theodore's at the bottom of the board
    const s = initialState(new Date(`${MONDAY}T09:00:00Z`))
    const board = weeklyLeaderboard(s, MONDAY, WEDNESDAY)
    const me = board.find((r) => r.id === 'theodore')!
    const above = board[board.indexOf(me) - 1]
    expect(above.id).toBe('leonard') // sanity: sibling is directly above

    const nudge = rivalNudge(board, 'theodore')
    expect(nudge).not.toContain('Leonard')
    expect(nudge).not.toContain('leading')
    expect(nudge).toMatch(/pass|catch up/)
    // the named friend is the nearest NPC above Theodore
    const friendAbove = board
      .slice(0, board.indexOf(me))
      .reverse()
      .find((r) => r.kind === 'npc')!
    expect(nudge).toContain(friendAbove.name)
    // a child in first place gets the leading copy
    const top = board[0]
    if (top.kind === 'child') {
      expect(rivalNudge(board, top.id as 'theodore' | 'leonard')).toMatch(/leading/)
    }
  })

  it('claims only count on eligible days where the quest was scheduled', () => {
    // inject claims directly — the UI can't make these, but synced/imported
    // data can (and the QA seed did: 8 identical claims → 8/3 = 267%)
    const base = initialState(new Date(`${MONDAY}T09:00:00Z`))
    const claim = (id: string, questId: string, day: string, role: 'core' | 'custom' = 'core'): Claim => ({
      id,
      childId: 'theodore',
      questId,
      role,
      status: 'approved',
      claimedAt: `${day}T10:00:00Z`,
      decidedAt: `${day}T10:30:00Z`,
      activityDate: day,
      reward: { coins: 10, stars: 1 },
    })

    // duplicate approvals of the same quest+day count once
    let s: GameState = {
      ...base,
      claims: {
        a: claim('a', 'spanish', MONDAY),
        b: claim('b', 'spanish', MONDAY),
        c: claim('c', 'spanish', MONDAY),
      },
    }
    const once = childWeekScore(s, 'theodore', MONDAY, MONDAY)
    expect(once.completed).toBe(1)
    expect(once.completed).toBeLessThanOrEqual(once.opportunities)

    // a claim on a paused day doesn't count
    s = {
      ...base,
      pausedDates: { ...base.pausedDates, theodore: [WEDNESDAY] },
      claims: {
        a: claim('a', 'spanish', MONDAY),
        b: claim('b', 'typing', WEDNESDAY),
      },
    }
    const paused = childWeekScore(s, 'theodore', MONDAY, WEDNESDAY)
    expect(paused.completed).toBe(1)
    expect(paused.pct).toBeLessThanOrEqual(1)

    // a claim for a quest not on that day's schedule doesn't count
    s = {
      ...base,
      claims: {
        a: claim('a', 'spanish', MONDAY),
        b: claim('b', 'violin', MONDAY), // violin isn't on Theodore's Monday core
      },
    }
    const unscheduled = childWeekScore(s, 'theodore', MONDAY, MONDAY)
    expect(unscheduled.completed).toBe(1)

    // an archived custom quest's approval doesn't count
    const customQuest = {
      id: 'cq-x',
      title: 'Chore',
      iconKey: 'icon-kindness',
      coins: 5,
      stars: 1,
      childIds: ['theodore' as const],
      days: [],
      active: false,
      createdAt: `${MONDAY}T08:00:00Z`,
    }
    s = {
      ...base,
      customQuests: { 'cq-x': customQuest },
      claims: { a: claim('a', 'cq-x', MONDAY, 'custom') },
    }
    expect(childWeekScore(s, 'theodore', MONDAY, MONDAY).completed).toBe(0)
  })

  it('last week standings use the finished week', () => {
    let s = initialState(new Date(`${MONDAY}T09:00:00Z`))
    const lastMonday = addDaysKey(MONDAY, -7)
    s.createdAt = `${lastMonday}T09:00:00Z`
    s = approveOn(s, 'leonard', 'violin', 'lw-1', lastMonday)
    s = approveOn(s, 'leonard', 'reading', 'lw-2', lastMonday)
    const board = weeklyLeaderboard(s, lastMonday, addDaysKey(lastMonday, 6))
    const leonard = board.find((r) => r.id === 'leonard')!
    expect(leonard.completed).toBe(2)
    expect(leonard.opportunities).toBe(21)
    // friends still have full-week numbers in a finished week
    for (const row of board.filter((r) => r.kind === 'npc')) {
      expect(row.opportunities).toBeGreaterThan(0)
      expect(row.completed).toBeGreaterThan(0)
    }
  })
})
