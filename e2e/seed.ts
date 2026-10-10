import { applyCommand } from '../src/domain/commands'
import { initialState } from '../src/domain/state'
import { addDays, mondayKey, parseDateKey } from '../src/domain/week'
import type { GameState, ProjectId } from '../src/domain/types'
import { commandDeps } from '../src/data/registry'
import { questsFor } from '../src/data/quests'

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
  const thisMonday = parseDateKey(mondayKey(now))
  const lastMonday = addDays(thisMonday, -7)
  const created = addDays(thisMonday, -14)
  let s = initialState(created)
  const quests = questsFor('theodore')
  for (let d = 0; d < 5; d += 1) {
    const day = addDays(lastMonday, d)
    day.setHours(10, 0, 0, 0)
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
    const lastMonday = addDays(parseDateKey(mondayKey(new Date())), -7)
    s.createdAt = lastMonday.toISOString()
  })
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
