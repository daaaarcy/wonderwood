import { addDaysKey, localDateKey, mondayKeyOf, weekdayOf } from './week.ts'
import { scheduleForDate } from './migrate.ts'
import { projectById } from '../data/city.ts'
import { CHILD_LIST } from '../data/children.ts'
import { customQuestsOn, weekEligibility, weeklyDaysCount } from './commands.ts'
import { NPCS, npcLeagueRank, npcWeekProgress } from './npcs.ts'
import { DEFAULT_WEEKLY, weeklyTemplateById } from '../data/weekly.ts'
import type { ChildId, Claim, GameState, ProjectId, RepairIncident, WeeklyBadge } from './types.ts'
import { BONUS_SLOTS_PER_DAY } from './types.ts'

export type QuestStatus = 'available' | 'pending' | 'done'

export interface TodayQuest {
  questId: string
  status: QuestStatus
  claimId: string | null
}

export type TodayView =
  | { restDay: true }
  | {
      restDay: false
      core: TodayQuest[]
      bonus: TodayQuest[]
      /** grown-up-written custom tasks offered today */
      custom: TodayQuest[]
      /** rewarded bonus activities still open today (pending+approved count down) */
      bonusSlotsLeft: number
      /** reading claims already logged today (journal or pending) */
      readingClaims: TodayQuest[]
    }

/**
 * Today's quests for a child from their schedule: core cards, bonus offers,
 * remaining bonus-coin slots, and every reading claim already logged.
 */
export function todayQuestsFor(state: GameState, childId: ChildId, now: Date): TodayView {
  const day = localDateKey(now, state.timeZone)
  if (state.pausedDates[childId].includes(day)) return { restDay: true }
  const schedule = scheduleForDate(state, day)[childId]
  const weekday = (weekdayOf(day) + 6) % 7
  const coreIds = schedule.core[weekday] ?? []
  const bonusIds = schedule.bonus

  const todaysClaims = (questId?: string) =>
    Object.values(state.claims).filter(
      (c) =>
        c.childId === childId &&
        c.activityDate === day &&
        c.status !== 'rejected' &&
        (questId === undefined || c.questId === questId),
    )

  const statusOf = (questId: string): TodayQuest => {
    const claim = todaysClaims(questId)[0]
    if (!claim) return { questId, status: 'available', claimId: null }
    return {
      questId,
      status: claim.status === 'approved' ? 'done' : 'pending',
      claimId: claim.id,
    }
  }

  const bonusUsed = todaysClaims().filter((c) => c.role === 'bonus').length
  const coreDoneOrPending = todaysClaims()
    .filter((c) => c.role === 'core')
    .map((c) => c.questId)
  // Custom tasks scheduled today, plus any that were claimed before a
  // mid-day archive — a pending/done claim must stay visible.
  const customIds = [
    ...new Set([
      ...customQuestsOn(state, childId, day).map((q) => q.id),
      ...todaysClaims()
        .filter((c) => c.role === 'custom')
        .map((c) => c.questId),
    ]),
  ]
  // Reading is only offered again via the journal flow once its card is used —
  // extra units are logged from the card itself.
  return {
    restDay: false,
    core: coreIds.map((id) => statusOf(id)),
    bonus: bonusIds.filter((id) => !coreDoneOrPending.includes(id)).map((id) => statusOf(id)),
    custom: customIds.map((id) => statusOf(id)),
    bonusSlotsLeft: Math.max(0, BONUS_SLOTS_PER_DAY - bonusUsed),
    readingClaims: todaysClaims('reading').map((c) => ({
      questId: c.questId,
      status: c.status === 'approved' ? ('done' as const) : ('pending' as const),
      claimId: c.id,
    })),
  }
}

/* ---------------- Town projects ---------------- */

export type ProjectStage = 'site' | 'foundations' | 'walls' | 'roof' | 'open'

export interface ProjectView {
  kits: number
  required: number
  stage: ProjectStage
  percent: number
  status: 'locked' | 'building' | 'open'
}

/**
 * Visual stage of a building project.
 * 0 → site, <40% → foundations, <75% → walls, <100% → roof, 100% → open.
 */
export function projectView(state: GameState, projectId: ProjectId): ProjectView {
  const def = projectById(projectId)
  const proj = state.city.projects[projectId]
  const kits = proj?.kits ?? 0
  const required = def?.kits ?? 1
  const percent = Math.min(1, kits / required)
  const status = proj?.status ?? 'locked'
  let stage: ProjectStage
  if (status === 'open') stage = 'open'
  else if (percent <= 0) stage = 'site'
  else if (percent < 0.4) stage = 'foundations'
  else if (percent < 0.75) stage = 'walls'
  else stage = 'roof'
  return { kits, required, stage, percent, status }
}

/** Claims awaiting a grown-up decision, oldest first. */
export function pendingClaims(state: GameState) {
  return Object.values(state.claims)
    .filter((c) => c.status === 'pending')
    .sort((a, b) => a.claimedAt.localeCompare(b.claimedAt))
}

/* ---------------- Reading journal ---------------- */

export interface ReadingEntry {
  claimId: string
  date: string
  unit: 'book' | 'chapter'
  title?: string
  withGrownUp: boolean
  status: 'pending' | 'approved'
}

export interface ReadingJournal {
  entries: ReadingEntry[] // newest first
  totals: { books: number; chapters: number } // approved only
}

/** A child's reading log — entries and separate book/chapter totals. */
export function readingJournal(state: GameState, childId: ChildId): ReadingJournal {
  const reading = Object.values(state.claims).filter(
    (c: Claim) => c.childId === childId && c.questId === 'reading' && c.status !== 'rejected',
  )
  const entries = reading
    .map((c) => ({
      claimId: c.id,
      date: c.activityDate,
      unit: c.details?.kind === 'reading' ? c.details.unit : ('book' as const),
      title: c.details?.kind === 'reading' ? c.details.title : undefined,
      withGrownUp: c.details?.kind === 'reading' ? c.details.withGrownUp : false,
      status: c.status as 'pending' | 'approved',
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
  const approved = entries.filter((e) => e.status === 'approved')
  return {
    entries,
    totals: {
      books: approved.filter((e) => e.unit === 'book').length,
      chapters: approved.filter((e) => e.unit === 'chapter').length,
    },
  }
}

/* ---------------- League selectors ---------------- */

export interface LeagueWeekStatus {
  /** approved core claims by this child so far this week */
  count: number
  /** distinct days with approved core claims this week */
  activeDays: number
  /** non-paused days with a core schedule, ≥ createdAt, ≤ Sunday */
  eligibleDays: number
  /** scheduled core quests on eligible days */
  opportunities: number
  /** quests needed for promotion this week (null on a rest week) */
  target: number | null
  /** fewer than 3 eligible days → neutral rest week */
  restWeek: boolean
}

/** Live status for the in-progress week shown on the League screen. */
export function leagueWeekStatus(state: GameState, childId: ChildId, now: Date): LeagueWeekStatus {
  const week = mondayKeyOf(localDateKey(now, state.timeZone))
  const sunday = addDaysKey(week, 6)
  const createdKey = localDateKey(new Date(state.createdAt), state.timeZone)
  let days = 0
  let opportunities = 0
  for (let d = week; d <= sunday; d = addDaysKey(d, 1)) {
    if (d < createdKey) continue
    if (state.pausedDates[childId].includes(d)) continue
    const weekday = (weekdayOf(d) + 6) % 7
    const core = scheduleForDate(state, d)[childId].core[weekday] ?? []
    const custom = customQuestsOn(state, childId, d).length
    if (core.length + custom > 0) {
      days += 1
      opportunities += core.length + custom
    }
  }
  const claims = Object.values(state.claims).filter(
    (c) =>
      c.childId === childId &&
      c.status === 'approved' &&
      c.activityDate >= week &&
      c.activityDate <= sunday &&
      (c.role === 'core' || c.role === 'custom') &&
      (c.reward?.stars ?? 0) > 0,
  )
  const count = claims.length
  const activeDays = new Set(claims.map((c) => c.activityDate)).size
  const restWeek = days < 3
  const target = restWeek ? null : Math.ceil(0.7 * opportunities)
  return { count, activeDays, eligibleDays: days, opportunities, target, restWeek }
}

/* ---------------- weekly leaderboard (storybook friends) ---------------- */

export interface WeekScore {
  /** approved core+custom claims (starred) in the week through `throughKey` */
  completed: number
  /** scheduled core+custom opportunities in the week through `throughKey` */
  opportunities: number
  /** completed ÷ opportunities — 0 when nothing was offered */
  pct: number
}

/**
 * A child's score in week `weekKey`, counting only days through `throughKey`
 * (today for the live week, the week's Sunday for a finished one). Uses the
 * same accounting as the promotion rule: approved core/custom claims that
 * carried a star, over scheduled opportunities (paused/pre-creation days
 * excluded).
 */
export function childWeekScore(
  state: GameState,
  childId: ChildId,
  weekKey: string,
  throughKey: string,
): WeekScore {
  const sunday = addDaysKey(weekKey, 6)
  const through = throughKey < sunday ? throughKey : sunday
  const { opportunities } = weekEligibility(state, childId, weekKey, through)
  const completed = Object.values(state.claims).filter(
    (c) =>
      c.childId === childId &&
      c.status === 'approved' &&
      c.activityDate >= weekKey &&
      c.activityDate <= through &&
      (c.role === 'core' || c.role === 'custom') &&
      (c.reward?.stars ?? 1) > 0,
  ).length
  return { completed, opportunities, pct: opportunities > 0 ? completed / opportunities : 0 }
}

export interface LeaderboardEntry {
  /** ChildId or NpcId. */
  id: string
  kind: 'child' | 'npc'
  name: string
  /** Animal portrait asset key (friends only). */
  assetKey?: string
  completed: number
  opportunities: number
  pct: number
  /** Shared competition position (1-based); equal pcts share it ("1="). */
  position: number
  /** True when another row shares the same position. */
  tied: boolean
  /** Explorer League rank for the badge (friends: simulated for that week). */
  leagueRank: number
}

/**
 * One sorted standings table mixing the two explorers and their storybook
 * friends for week `weekKey` through `throughKey`. Sorted by pct descending
 * (name as a stable tie-break); equal displayed percents share a position.
 */
export function weeklyLeaderboard(
  state: GameState,
  weekKey: string,
  throughKey: string,
): LeaderboardEntry[] {
  const rows: Omit<LeaderboardEntry, 'position' | 'tied'>[] = [
    ...CHILD_LIST.map((def) => ({
      id: def.id as string,
      kind: 'child' as const,
      name: def.name,
      ...childWeekScore(state, def.id, weekKey, throughKey),
      leagueRank: state.children[def.id].league.rank,
    })),
    ...NPCS.map((npc) => {
      const p = npcWeekProgress(npc.id, weekKey, throughKey)
      return {
        id: npc.id as string,
        kind: 'npc' as const,
        name: npc.name,
        assetKey: npc.assetKey,
        completed: p.completed,
        opportunities: p.opportunities,
        pct: p.pctSoFar,
        leagueRank: npcLeagueRank(npc.id, weekKey),
      }
    }),
  ]
  rows.sort((a, b) => b.pct - a.pct || (a.name < b.name ? -1 : 1))
  const pctKey = (pct: number) => Math.round(pct * 100)
  return rows.map((row, i) => {
    const first = rows.findIndex((r) => pctKey(r.pct) === pctKey(row.pct))
    const tied = rows.some((r, j) => j !== i && pctKey(r.pct) === pctKey(row.pct))
    return { ...row, position: first + 1, tied }
  })
}

/* ---------------- weekly challenge + repairs (v6) ---------------- */

export interface WeeklyView {
  templateId: string
  title: string
  days: number
  done: number
  completedAt?: string
}

/** This week's challenge card for a child (default template if unchosen). */
export function weeklyView(
  state: GameState,
  childId: ChildId,
  weekKey: string,
): WeeklyView | null {
  const entry = state.weekly[childId]?.[weekKey]
  const templateId = entry?.templateId ?? DEFAULT_WEEKLY[childId]
  const template = weeklyTemplateById(templateId)
  if (!template) return null
  return {
    templateId,
    title: template.title,
    days: template.days,
    done: Math.min(template.days, weeklyDaysCount(state, childId, weekKey, template.questIds)),
    completedAt: entry?.completedAt,
  }
}

/** Badges earned by a child, newest first. */
export function badgesFor(state: GameState, childId: ChildId): WeeklyBadge[] {
  return state.badges.filter((b) => b.childId === childId).sort((a, b) => b.earnedAt.localeCompare(a.earnedAt))
}

/** Repaired incidents this child hasn't acknowledged yet (shown once). */
export function unacknowledgedRepairs(state: GameState, childId: ChildId): RepairIncident[] {
  return Object.values(state.repairs).filter(
    (r) => r.childId === childId && r.repairedAt && !r.acknowledgedAt,
  )
}
