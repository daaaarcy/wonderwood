import { applyCommand } from '../src/domain/commands'
import { initialState } from '../src/domain/state'
import { addDays, mondayKey, parseDateKey } from '../src/domain/week'
import type { GameState } from '../src/domain/types'
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

/** State with a given bridge-plank count (stars split across both children). */
export function bridgeSeed(planks: number): GameState {
  return freshState((s) => {
    const t = Math.ceil(planks / 2)
    s.children.theodore.stars = t
    s.children.leonard.stars = planks - t
  })
}

/** State with Theodore at a given league rank; createdAt last week so the
 *  in-progress week is fully eligible (progress UI, not a rest week). */
export function leagueSeed(rank: number): GameState {
  return freshState((s) => {
    s.children.theodore.league.rank = rank
    const lastMonday = addDays(parseDateKey(mondayKey(new Date())), -7)
    s.createdAt = lastMonday.toISOString()
  })
}
