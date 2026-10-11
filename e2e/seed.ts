import { applyCommand } from '../src/domain/commands'
import { initialState } from '../src/domain/state'
import { addDaysKey, localDateKey, mondayKeyOf } from '../src/domain/week'
import type { ChildId, GameState, ProjectId } from '../src/domain/types'
import { commandDeps } from '../src/data/registry'
import { DEFAULT_SCHEDULE } from '../src/data/quests'

/** JSON for localStorage['wonderwood:v1'] built through the real domain. */
export function seedJson(state: GameState): string {
  return JSON.stringify(state)
}

export function freshState(mutate?: (s: GameState) => void): GameState {
  const s = initialState()
  mutate?.(s)
  return s
}

/**
 * A save where Theodore earned 15 approved quests over 5 days LAST week
 * and the save was created two weeks ago → next app open evaluates last
 * week and promotes Plastic → Wood (rank 1 → 2).
 */
export function promotionSeed(): GameState {
  const now = new Date()
  const thisMonday = mondayKeyOf(localDateKey(now, 'UTC'))
  const lastMondayKey = addDaysKey(thisMonday, -7)
  const created = new Date(`${addDaysKey(thisMonday, -14)}T09:00:00Z`)
  let s = initialState(created, 'UTC')
  const quests = (DEFAULT_SCHEDULE.theodore.core[0] ?? []).map((id) => ({ id }))
  for (let d = 0; d < 5; d += 1) {
    const day = new Date(`${addDaysKey(lastMondayKey, d)}T10:00:00Z`)
    for (const q of quests) {
      const claimId = `seed-${d}-${q.id}`
      s = applyCommand(s, { type: 'claimQuest', childId: 'theodore', questId: q.id, claimId }, day, commandDeps).state
      s = applyCommand(s, { type: 'approveClaim', claimId }, day, commandDeps).state
    }
  }
  return s
}

/** State with a given league rank; createdAt last week so the in-progress
 *  week is fully eligible (progress UI, not a rest week). */
export function leagueSeed(rank: number): GameState {
  return freshState((s) => {
    s.children.theodore.league.rank = rank
    const lastMonday = addDaysKey(mondayKeyOf(localDateKey(new Date(), 'UTC')), -7)
    s.createdAt = `${lastMonday}T09:00:00Z`
  })
}

/**
 * A save with a few approved quests this week AND last week, so the weekly
 * leaderboard has kid numbers on both cards (createdAt = last Monday, so
 * this week is fully eligible; last week never qualifies for promotion).
 */
export function boardSeed(): GameState {
  const now = new Date()
  const monday = mondayKeyOf(localDateKey(now, 'UTC'))
  const lastMonday = addDaysKey(monday, -7)
  let s = initialState(new Date(`${lastMonday}T09:00:00Z`), 'UTC')
  const weeks: [string, [ChildId, string, string][]][] = [
    [
      lastMonday,
      [
        ['theodore', 'spanish', 'lw-t1'],
        ['theodore', 'typing', 'lw-t2'],
        ['leonard', 'reading', 'lw-l1'],
      ],
    ],
    [
      monday,
      [
        ['theodore', 'spanish', 'bw-t1'],
        ['theodore', 'typing', 'bw-t2'],
        ['leonard', 'violin', 'bw-l1'],
      ],
    ],
  ]
  for (const [weekMonday, claims] of weeks) {
    const day = new Date(`${weekMonday}T10:00:00Z`)
    for (const [childId, questId, claimId] of claims) {
      s = applyCommand(s, { type: 'claimQuest', childId, questId, claimId }, day, commandDeps).state
      s = applyCommand(s, { type: 'approveClaim', claimId }, day, commandDeps).state
    }
  }
  return s
}

/** State with a project at a given kit count (status derived). */
export function citySeed(
  kits: Partial<Record<ProjectId, number>>,
  opts: { current?: ProjectId | null; suggested?: ProjectId | null } = {},
): GameState {
  return freshState((s) => {
    for (const [id, k] of Object.entries(kits) as [ProjectId, number][]) {
      const required = { road: 2, library: 6, 'music-school': 8, 'police-station': 10, hospital: 12 }[id]
      const open = k >= required
      s.city.projects[id] = {
        kits: k,
        status: open ? 'open' : 'building',
        openedAt: open ? new Date().toISOString() : undefined,
      }
    }
    s.city.currentProjectId = opts.current !== undefined ? opts.current : 'road'
    s.city.suggestedProjectId = opts.suggested ?? null
  })
}

/** A raw v2 save JSON (pre-city schema) to exercise the migration path. */
export function v2SeedJson(stars: { theodore: number; leonard: number }): string {
  const child = (coins: number, stars: number) => ({
    coins,
    stars,
    inventory: ['toy-train'],
    equipped: { hat: null, toy: 'toy-train' },
    wishItem: null,
    league: { rank: 1, evaluatedWeeks: {}, unseenPromotion: null },
  })
  return JSON.stringify({
    schemaVersion: 2,
    createdAt: new Date(Date.now() - 14 * 86400_000).toISOString(),
    children: {
      theodore: child(40, stars.theodore),
      leonard: child(30, stars.leonard),
    },
    claims: {},
    purchases: {},
    ledger: [],
    parentPinHash: null,
    settings: { sound: true },
  })
}
