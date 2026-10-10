import { localDateKey } from './state'
import { addDays, eligibleDays, mondayKey, parseDateKey } from './week'
import type { ChildId, GameState } from './types'

export type QuestStatus = 'available' | 'pending' | 'done'

export interface TodayQuest {
  questId: string
  status: QuestStatus
  claimId: string | null
}

/**
 * Status of each of a child's daily quests for the local day containing `now`.
 * `questIds` comes from src/data (the child's three quests for the day).
 */
export function todayQuestsFor(
  state: GameState,
  childId: ChildId,
  questIds: string[],
  now: Date,
): TodayQuest[] {
  const day = localDateKey(now)
  return questIds.map((questId) => {
    const claim = Object.values(state.claims).find(
      (c) =>
        c.childId === childId &&
        c.questId === questId &&
        c.activityDate === day &&
        c.status !== 'rejected',
    )
    if (!claim) return { questId, status: 'available', claimId: null }
    return {
      questId,
      status: claim.status === 'approved' ? 'done' : 'pending',
      claimId: claim.id,
    }
  })
}

export interface IslandProgress {
  placed: number
  total: number
  complete: boolean
}

/**
 * Stars earned by BOTH children become planks on the shared bridge —
 * never framed as one child vs the other.
 */
export function islandProgress(state: GameState, totalPlanks: number): IslandProgress {
  const stars = state.children.theodore.stars + state.children.leonard.stars
  const placed = Math.min(stars, totalPlanks)
  return { placed, total: totalPlanks, complete: placed >= totalPlanks }
}

export function bridgeComplete(state: GameState, totalPlanks: number): boolean {
  return islandProgress(state, totalPlanks).complete
}

/** Claims awaiting a grown-up decision, oldest first. */
export function pendingClaims(state: GameState) {
  return Object.values(state.claims)
    .filter((c) => c.status === 'pending')
    .sort((a, b) => a.claimedAt.localeCompare(b.claimedAt))
}

/* ---------------- League selectors ---------------- */

export interface LeagueWeekStatus {
  /** approved claims by this child so far this week */
  count: number
  /** distinct days with approved claims this week */
  activeDays: number
  /** days of this week on/after createdAt and ≤ Sunday (as judged at week's end) */
  eligibleDays: number
  /** quests needed for promotion this week (null on a rest week) */
  target: number | null
  /** fewer than 3 eligible days → neutral rest week */
  restWeek: boolean
}

/** Live status for the in-progress week shown on the League screen. */
export function leagueWeekStatus(state: GameState, childId: ChildId, now: Date): LeagueWeekStatus {
  const week = mondayKey(now)
  const createdKey = localDateKey(new Date(state.createdAt))
  const sunday = localDateKey(addDays(parseDateKey(week), 6))
  // Eligibility as it will stand at week's end (days ≥ createdAt, ≤ Sunday).
  const days = eligibleDays(week, createdKey, sunday)
  const claims = Object.values(state.claims).filter(
    (c) =>
      c.childId === childId &&
      c.status === 'approved' &&
      c.activityDate >= week &&
      c.activityDate <= sunday,
  )
  const count = claims.length
  const activeDays = new Set(claims.map((c) => c.activityDate)).size
  const restWeek = days < 3
  const target = restWeek ? null : Math.ceil(0.7 * 3 * days)
  return { count, activeDays, eligibleDays: days, target, restWeek }
}
