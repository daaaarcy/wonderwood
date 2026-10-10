import { addDaysKey, localDateKey, mondayKeyOf, weekdayOf } from './week.ts'
import { scheduleForDate } from './migrate.ts'
import type {
  ChildId,
  Claim,
  CityState,
  Command,
  CommandDeps,
  CommandOutcome,
  DaySchedule,
  DomainError,
  GameState,
  LedgerEntry,
  ProjectId,
  Purchase,
  Result,
} from './types.ts'
import { BONUS_REWARD, BONUS_SLOTS_PER_DAY, CHILD_IDS, CORE_REWARD, MAX_LEAGUE_RANK } from './types.ts'

const ok = <T>(value: T): Result<T> => ({ ok: true, value })
const err = (code: DomainError['code'], message: string): Result<never> => ({
  ok: false,
  error: { code, message },
})

function findActiveClaim(
  state: GameState,
  childId: ChildId,
  questId: string,
  activityDate: string,
): Claim | undefined {
  return Object.values(state.claims).find(
    (c) =>
      c.childId === childId &&
      c.questId === questId &&
      c.activityDate === activityDate &&
      c.status !== 'rejected',
  )
}

function withClaim(state: GameState, claim: Claim): GameState {
  return { ...state, claims: { ...state.claims, [claim.id]: claim } }
}

function withChild(state: GameState, childId: ChildId, child: GameState['children'][ChildId]): GameState {
  return { ...state, children: { ...state.children, [childId]: child } }
}

function addLedger(state: GameState, entry: LedgerEntry): GameState {
  return { ...state, ledger: [...state.ledger, entry] }
}

/** How many bonus-coin rewards this child already got on `dateKey`. */
function bonusRewardsUsed(state: GameState, childId: ChildId, dateKey: string): number {
  return Object.values(state.claims).filter(
    (c) =>
      c.childId === childId &&
      c.activityDate === dateKey &&
      c.status === 'approved' &&
      c.reward?.coins === BONUS_REWARD.coins,
  ).length
}

/** Did this quest already pay its core reward for that child on that day? */
function coreRewardUsed(state: GameState, childId: ChildId, questId: string, dateKey: string): boolean {
  return Object.values(state.claims).some(
    (c) =>
      c.childId === childId &&
      c.questId === questId &&
      c.activityDate === dateKey &&
      c.status === 'approved' &&
      (c.reward?.stars ?? 0) > 0,
  )
}

/**
 * The reward an approval gives. Core = 10+★; repeats of the same core quest
 * (e.g. extra reading units) fall through to a bonus slot; bonus = +5 while
 * the two shared daily bonus slots last, then 0 but still recorded.
 * Exported so the grown-up approvals list can preview the reward.
 */
export function rewardForApproval(state: GameState, claim: Claim): { coins: number; stars: number } {
  const isFirstCoreForQuest =
    claim.role === 'core' && !coreRewardUsed(state, claim.childId, claim.questId, claim.activityDate)
  if (isFirstCoreForQuest) return CORE_REWARD
  const used = bonusRewardsUsed(state, claim.childId, claim.activityDate)
  return used < BONUS_SLOTS_PER_DAY ? BONUS_REWARD : { coins: 0, stars: 0 }
}

function awardQuest(
  state: GameState,
  childId: ChildId,
  claimId: string,
  reward: { coins: number; stars: number },
  at: string,
): GameState {
  const child = state.children[childId]
  const next = withChild(state, childId, {
    ...child,
    coins: child.coins + reward.coins,
    stars: child.stars + reward.stars,
  })
  return addLedger(next, {
    id: `quest-${claimId}`,
    childId,
    coins: reward.coins,
    stars: reward.stars,
    reason: 'quest',
    refId: claimId,
    at,
  })
}

/* ---------------- Explorer League ---------------- */

const PROMOTION_FRACTION = 0.7
const MIN_ACTIVE_DAYS = 3
const MIN_ELIGIBLE_DAYS = 3

function approvedClaimsInWeek(state: GameState, childId: ChildId, weekKey: string): Claim[] {
  const sunday = addDaysKey(weekKey, 6)
  return Object.values(state.claims).filter(
    (c) =>
      c.childId === childId &&
      c.status === 'approved' &&
      c.activityDate >= weekKey &&
      c.activityDate <= sunday,
  )
}

/**
 * Eligible days + opportunities in week `weekKey` for a child: days ≥ createdAt,
 * ≤ throughKey, not paused, with ≥1 scheduled core quest.
 */
export function weekEligibility(
  state: GameState,
  childId: ChildId,
  weekKey: string,
  throughKey: string,
): { eligibleDays: number; opportunities: number } {
  const createdKey = localDateKey(new Date(state.createdAt), state.timeZone)
  const sunday = addDaysKey(weekKey, 6)
  const through = throughKey < sunday ? throughKey : sunday
  let days = 0
  let opportunities = 0
  for (let d = weekKey; d <= through; d = addDaysKey(d, 1)) {
    if (d < createdKey) continue
    if (state.pausedDates[childId].includes(d)) continue
    const weekday = (weekdayOf(d) + 6) % 7 // 0=Mon..6=Sun
    const core = scheduleForDate(state, d)[childId].core[weekday] ?? []
    if (core.length > 0) {
      days += 1
      opportunities += core.length
    }
  }
  return { eligibleDays: days, opportunities }
}

/** Approved claims that carried the core reward (the first approval per quest/day). */
function approvedCoreClaimsInWeek(state: GameState, childId: ChildId, weekKey: string): Claim[] {
  return approvedClaimsInWeek(state, childId, weekKey).filter(
    (c) => c.role === 'core' && (c.reward?.stars ?? 1) > 0,
  )
}

/** Does this child qualify for promotion from week `weekKey` right now? */
function weekQualifies(state: GameState, childId: ChildId, weekKey: string): boolean {
  const sunday = addDaysKey(weekKey, 6)
  const { eligibleDays: eligible, opportunities } = weekEligibility(state, childId, weekKey, sunday)
  if (eligible < MIN_ELIGIBLE_DAYS) return false
  const claims = approvedCoreClaimsInWeek(state, childId, weekKey)
  const count = claims.length
  const activeDays = new Set(claims.map((c) => c.activityDate)).size
  return count >= Math.ceil(PROMOTION_FRACTION * opportunities) && activeDays >= MIN_ACTIVE_DAYS
}

/** Apply a one-league promotion to `child` (cap at MAX). */
function promoteChild(state: GameState, childId: ChildId, weekKey: string): GameState {
  const child = state.children[childId]
  const league = {
    ...child.league,
    evaluatedWeeks: { ...child.league.evaluatedWeeks, [weekKey]: { promoted: true } },
  }
  let next = withChild(state, childId, { ...child, league })
  if (child.league.rank < MAX_LEAGUE_RANK) {
    const to = child.league.rank + 1
    const c2 = next.children[childId]
    next = withChild(next, childId, {
      ...c2,
      league: {
        ...c2.league,
        rank: to,
        unseenPromotion: c2.league.unseenPromotion
          ? { from: c2.league.unseenPromotion.from, to }
          : { from: child.league.rank, to },
      },
    })
  }
  return next
}

/**
 * After an approval, re-check the claim's week if it was already evaluated as
 * non-promoted — a delayed approval can still count toward the right week.
 */
function recheckWeekAfterApproval(state: GameState, claim: Claim): GameState {
  const weekKey = mondayKeyOf(claim.activityDate)
  const league = state.children[claim.childId].league
  const record = league.evaluatedWeeks[weekKey]
  if (!record || record.promoted) return state
  if (!weekQualifies(state, claim.childId, weekKey)) return state
  return promoteChild(state, claim.childId, weekKey)
}

export function evaluateLeagues(
  state: GameState,
  _cmd: Record<string, never>,
  now: Date,
  deps: CommandDeps,
): CommandOutcome<{ childId: ChildId; weekKey: string; promoted: boolean }[]> {
  void deps
  const createdKey = localDateKey(new Date(state.createdAt), state.timeZone)
  const currentWeek = mondayKeyOf(localDateKey(now, state.timeZone))
  let next = state
  const results: { childId: ChildId; weekKey: string; promoted: boolean }[] = []

  // Every fully-ended week from the week of createdAt through last week.
  for (
    let weekKey = mondayKeyOf(createdKey);
    weekKey < currentWeek;
    weekKey = addDaysKey(weekKey, 7)
  ) {
    for (const childId of CHILD_IDS) {
      const league = next.children[childId].league
      if (league.evaluatedWeeks[weekKey]) continue
      const promoted = weekQualifies(next, childId, weekKey)
      if (promoted) {
        next = promoteChild(next, childId, weekKey)
      } else {
        const child = next.children[childId]
        next = withChild(next, childId, {
          ...child,
          league: {
            ...child.league,
            evaluatedWeeks: { ...child.league.evaluatedWeeks, [weekKey]: { promoted: false } },
          },
        })
      }
      results.push({ childId, weekKey, promoted })
    }
  }
  return { state: next, result: ok(results) }
}

export function acknowledgePromotion(
  state: GameState,
  cmd: { childId: ChildId },
  now: Date,
  deps: CommandDeps,
): CommandOutcome<GameState> {
  void now
  void deps
  const child = state.children[cmd.childId]
  const next = withChild(state, cmd.childId, {
    ...child,
    league: { ...child.league, unseenPromotion: null },
  })
  return { state: next, result: ok(next) }
}

/* ---------------- Claims ---------------- */

/** The schedule role a quest has for a child on a date; null when neither. */
export function questRoleOn(
  state: GameState,
  childId: ChildId,
  questId: string,
  dateKey: string,
): 'core' | 'bonus' | null {
  const weekday = (weekdayOf(dateKey) + 6) % 7
  const day = scheduleForDate(state, dateKey)[childId]
  if ((day.core[weekday] ?? []).includes(questId)) return 'core'
  if (day.bonus.includes(questId)) return 'bonus'
  return null
}

function insertClaim(
  state: GameState,
  cmd: { childId: ChildId; questId: string; claimId: string; details?: Claim['details'] },
  now: Date,
  deps: CommandDeps,
): CommandOutcome<Claim> {
  const quest = deps.getQuest(cmd.questId)
  if (!quest || quest.retired || !quest.childIds.includes(cmd.childId)) {
    return { state, result: err('unknown-quest', 'That quest does not exist.') }
  }
  const existing = state.claims[cmd.claimId]
  if (existing) {
    // Idempotent re-send of the same claimId.
    return { state, result: ok(existing) }
  }
  const activityDate = localDateKey(now, state.timeZone)
  if (state.pausedDates[cmd.childId].includes(activityDate)) {
    return { state, result: err('rest-day', 'Today is a rest day — enjoy!') }
  }
  const role = questRoleOn(state, cmd.childId, cmd.questId, activityDate)
  if (!role) {
    return { state, result: err('not-scheduled', 'That is not on the plan today.') }
  }
  // Reading is always loggable — extra books/chapters become bonus or journal
  // entries at approval time.
  const multi = cmd.questId === 'reading'
  const clash = multi ? undefined : findActiveClaim(state, cmd.childId, cmd.questId, activityDate)
  if (clash) {
    return {
      state,
      result: err('already-claimed-today', 'This quest was already claimed today.'),
    }
  }
  const claim: Claim = {
    id: cmd.claimId,
    childId: cmd.childId,
    questId: cmd.questId,
    activityDate,
    role,
    status: 'pending',
    claimedAt: now.toISOString(),
    details: cmd.details,
  }
  return { state: withClaim(state, claim), result: ok(claim) }
}

export function claimQuest(
  state: GameState,
  cmd: { childId: ChildId; questId: string; claimId: string; details?: Claim['details'] },
  now: Date,
  deps: CommandDeps,
): CommandOutcome<Claim> {
  return insertClaim(state, cmd, now, deps)
}

export function approveClaim(
  state: GameState,
  cmd: { claimId: string },
  now: Date,
  deps: CommandDeps,
): CommandOutcome<Claim> {
  void deps
  const claim = state.claims[cmd.claimId]
  if (!claim) {
    return { state, result: err('unknown-claim', 'That claim does not exist.') }
  }
  if (claim.status === 'approved') {
    // Approving twice is a no-op: no second award.
    return { state, result: ok(claim) }
  }
  if (claim.status === 'rejected') {
    return { state, result: err('claim-not-pending', 'This claim was already rejected.') }
  }
  const decidedAt = now.toISOString()
  const reward = rewardForApproval(state, claim)
  const approved: Claim = { ...claim, status: 'approved', decidedAt, reward }
  let next = awardQuest(withClaim(state, approved), claim.childId, claim.id, reward, decidedAt)
  next = recheckWeekAfterApproval(next, approved)
  return { state: next, result: ok(approved) }
}

export function rejectClaim(
  state: GameState,
  cmd: { claimId: string },
  now: Date,
  deps: CommandDeps,
): CommandOutcome<Claim> {
  void deps
  const claim = state.claims[cmd.claimId]
  if (!claim) {
    return { state, result: err('unknown-claim', 'That claim does not exist.') }
  }
  if (claim.status === 'rejected') {
    return { state, result: ok(claim) }
  }
  if (claim.status === 'approved') {
    return { state, result: err('claim-not-pending', 'This claim was already approved.') }
  }
  const rejected: Claim = { ...claim, status: 'rejected', decidedAt: now.toISOString() }
  return { state: withClaim(state, rejected), result: ok(rejected) }
}

export function parentCompleteAndApprove(
  state: GameState,
  cmd: { childId: ChildId; questId: string; claimId: string; details?: Claim['details'] },
  now: Date,
  deps: CommandDeps,
): CommandOutcome<Claim> {
  // If the child (or a previous press) already created a claim, approve that
  // one instead of erroring on the same-day rule.
  const byId = state.claims[cmd.claimId]
  if (byId) {
    if (byId.status === 'pending') {
      return approveClaim(state, { claimId: byId.id }, now, deps)
    }
    return { state, result: ok(byId) }
  }
  const today = localDateKey(now, state.timeZone)
  const active = findActiveClaim(state, cmd.childId, cmd.questId, today)
  if (active) {
    if (active.status === 'pending') {
      return approveClaim(state, { claimId: active.id }, now, deps)
    }
    // Already approved today → no-op, no second award.
    return { state, result: ok(active) }
  }
  const claimed = insertClaim(state, cmd, now, deps)
  if (!claimed.result.ok) {
    return claimed
  }
  return approveClaim(claimed.state, { claimId: claimed.result.value.id }, now, deps)
}

/* ---------------- Shop ---------------- */

export function purchase(
  state: GameState,
  cmd: { childId: ChildId; itemId: string; purchaseId: string },
  now: Date,
  deps: CommandDeps,
): CommandOutcome<Purchase> {
  // Re-sending the same purchaseId returns the original purchase — no double charge.
  const existing = state.purchases[cmd.purchaseId]
  if (existing) {
    return { state, result: ok(existing) }
  }
  const item = deps.getItem(cmd.itemId)
  if (!item) {
    return { state, result: err('unknown-item', 'That item does not exist.') }
  }
  const child = state.children[cmd.childId]
  if (child.inventory.includes(cmd.itemId)) {
    return { state, result: err('already-owned', 'Already owned.') }
  }
  if (child.coins < item.price) {
    const needed = item.price - child.coins
    return {
      state,
      result: err('insufficient-coins', `Need ${needed} more coin${needed === 1 ? '' : 's'}.`),
    }
  }
  const at = now.toISOString()
  const purchaseRecord: Purchase = {
    id: cmd.purchaseId,
    childId: cmd.childId,
    itemId: cmd.itemId,
    price: item.price,
    at,
  }
  const clearedWish = child.wishItem === cmd.itemId ? null : child.wishItem
  let next: GameState = {
    ...state,
    children: {
      ...state.children,
      [cmd.childId]: {
        ...child,
        coins: child.coins - item.price,
        inventory: [...child.inventory, cmd.itemId],
        wishItem: clearedWish,
      },
    },
    purchases: { ...state.purchases, [cmd.purchaseId]: purchaseRecord },
  }
  next = addLedger(next, {
    id: `purchase-${cmd.purchaseId}`,
    childId: cmd.childId,
    coins: -item.price,
    stars: 0,
    reason: 'purchase',
    refId: cmd.purchaseId,
    at,
  })
  return { state: next, result: ok(purchaseRecord) }
}

export function equip(
  state: GameState,
  cmd: { childId: ChildId; slot: 'hat' | 'toy'; itemId: string | null },
  now: Date,
  deps: CommandDeps,
): CommandOutcome<GameState> {
  void now
  const child = state.children[cmd.childId]
  if (cmd.itemId === null) {
    const next = withChild(state, cmd.childId, {
      ...child,
      equipped: { ...child.equipped, [cmd.slot]: null },
    })
    return { state: next, result: ok(next) }
  }
  const item = deps.getItem(cmd.itemId)
  if (!item) {
    return { state, result: err('unknown-item', 'That item does not exist.') }
  }
  if (!child.inventory.includes(cmd.itemId)) {
    return { state, result: err('item-not-owned', 'You do not own that yet.') }
  }
  if (item.slot !== cmd.slot) {
    return { state, result: err('wrong-slot', 'That item does not go there.') }
  }
  const next = withChild(state, cmd.childId, {
    ...child,
    equipped: { ...child.equipped, [cmd.slot]: cmd.itemId },
  })
  return { state: next, result: ok(next) }
}

export function setWish(
  state: GameState,
  cmd: { childId: ChildId; itemId: string | null },
  now: Date,
  deps: CommandDeps,
): CommandOutcome<GameState> {
  void now
  if (cmd.itemId !== null && !deps.getItem(cmd.itemId)) {
    return { state, result: err('unknown-item', 'That item does not exist.') }
  }
  const child = state.children[cmd.childId]
  const next = withChild(state, cmd.childId, { ...child, wishItem: cmd.itemId })
  return { state: next, result: ok(next) }
}

/* ---------------- Grown-up schedule & config ---------------- */

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

export function updateSchedule(
  state: GameState,
  cmd: { childId: ChildId; core: Record<number, string[]>; bonus: string[]; effectiveFrom?: string },
  now: Date,
  deps: CommandDeps,
): CommandOutcome<GameState> {
  const childId = cmd.childId
  const bonusSet = new Set(cmd.bonus)
  for (const [day, list] of Object.entries(cmd.core)) {
    const d = Number(day)
    if (!Number.isInteger(d) || d < 0 || d > 6 || !Array.isArray(list)) {
      return { state, result: err('invalid-schedule', 'Days must be 0–6 lists.') }
    }
    if (list.length > 3) {
      return { state, result: err('invalid-schedule', 'At most 3 core quests per day.') }
    }
    for (const q of list) {
      const def = deps.getQuest(q)
      if (!def || def.retired || !def.childIds.includes(childId)) {
        return { state, result: err('invalid-schedule', `"${q}" is not available for this child.`) }
      }
      if (bonusSet.has(q)) {
        return { state, result: err('invalid-schedule', 'A quest cannot be both core and bonus.') }
      }
    }
  }
  for (const q of cmd.bonus) {
    const def = deps.getQuest(q)
    if (!def || def.retired || !def.childIds.includes(childId)) {
      return { state, result: err('invalid-schedule', `"${q}" is not available for this child.`) }
    }
  }
  const effectiveFrom = cmd.effectiveFrom ?? localDateKey(now, state.timeZone)
  if (!DATE_KEY_RE.test(effectiveFrom)) {
    return { state, result: err('invalid-schedule', 'effectiveFrom must be a date.') }
  }
  const latest = state.scheduleHistory[state.scheduleHistory.length - 1].schedule
  const next: GameState = {
    ...state,
    scheduleHistory: [
      ...state.scheduleHistory,
      {
        effectiveFrom,
        schedule: {
          ...latest,
          [childId]: { core: { ...cmd.core }, bonus: [...cmd.bonus] } satisfies DaySchedule,
        },
      },
    ],
  }
  return { state: next, result: ok(next) }
}

export function setPaused(
  state: GameState,
  cmd: { childId: ChildId; dates: string[]; paused: boolean },
  now: Date,
  deps: CommandDeps,
): CommandOutcome<GameState> {
  void now
  void deps
  if (!cmd.dates.every((d) => DATE_KEY_RE.test(d))) {
    return { state, result: err('invalid-schedule', 'Dates must be YYYY-MM-DD.') }
  }
  const current = new Set(state.pausedDates[cmd.childId])
  for (const d of cmd.dates) {
    if (cmd.paused) current.add(d)
    else current.delete(d)
  }
  const next: GameState = {
    ...state,
    pausedDates: { ...state.pausedDates, [cmd.childId]: [...current].sort() },
  }
  return { state: next, result: ok(next) }
}

export function updateChildConfig(
  state: GameState,
  cmd: { childId: ChildId; patch: Partial<GameState['config'][ChildId]> },
  now: Date,
  deps: CommandDeps,
): CommandOutcome<GameState> {
  void now
  void deps
  const p = cmd.patch
  if (p.mathLevel !== undefined && ![1, 2, 3].includes(p.mathLevel)) {
    return { state, result: err('invalid-config', 'Math level must be 1, 2, or 3.') }
  }
  if (p.violinGoal !== undefined && typeof p.violinGoal !== 'string') {
    return { state, result: err('invalid-config', 'The violin goal must be text.') }
  }
  if (p.typingUrl !== undefined && p.typingUrl !== null && !/^https?:\/\//.test(p.typingUrl)) {
    return { state, result: err('invalid-config', 'The typing link must be a URL.') }
  }
  if (p.houseworkJobs !== undefined && !Array.isArray(p.houseworkJobs)) {
    return { state, result: err('invalid-config', 'Housework jobs must be a list.') }
  }
  const next: GameState = {
    ...state,
    config: {
      ...state.config,
      [cmd.childId]: { ...state.config[cmd.childId], ...cmd.patch },
    },
  }
  return { state: next, result: ok(next) }
}

/* ---------------- Town building kits ---------------- */

/** Kits cost this many coins — mirrors src/data/city.ts KIT_PRICE. */
const KIT_PRICE = 10
/** The road opening automatically starts the library. */
const NEXT_AFTER_ROAD: ProjectId = 'library'

function withCity(state: GameState, city: CityState): GameState {
  return { ...state, city }
}

/**
 * Buy one Building Kit and add it straight into the current shared project.
 * Idempotent by kitPurchaseId: a re-send returns the original purchase.
 */
export function buyKit(
  state: GameState,
  cmd: { childId: ChildId; projectId: ProjectId; kitPurchaseId: string },
  now: Date,
  deps: CommandDeps,
): CommandOutcome<CityState['kitPurchases'][string]> {
  const existing = state.city.kitPurchases[cmd.kitPurchaseId]
  if (existing) {
    return { state, result: ok(existing) }
  }
  const project = state.city.projects[cmd.projectId]
  const def = deps.getProject(cmd.projectId)
  if (!project || !def) {
    return { state, result: err('not-current-project', 'No such building project.') }
  }
  if (project.status === 'open') {
    return { state, result: err('project-complete', 'That building is already open!') }
  }
  if (cmd.projectId !== state.city.currentProjectId || project.status !== 'building') {
    return {
      state,
      result: err('not-current-project', 'That is not the building we are working on.'),
    }
  }
  const child = state.children[cmd.childId]
  if (child.coins < KIT_PRICE) {
    const needed = KIT_PRICE - child.coins
    return {
      state,
      result: err('insufficient-coins', `Need ${needed} more coin${needed === 1 ? '' : 's'}.`),
    }
  }

  const at = now.toISOString()
  const kits = project.kits + 1
  const opensNow = kits >= def.kits

  let city: CityState = {
    ...state.city,
    kitPurchases: {
      ...state.city.kitPurchases,
      [cmd.kitPurchaseId]: { id: cmd.kitPurchaseId, childId: cmd.childId, projectId: cmd.projectId, at },
    },
  }
  if (opensNow) {
    const nextId = cmd.projectId === 'road' ? NEXT_AFTER_ROAD : null
    const projects = {
      ...city.projects,
      [cmd.projectId]: { ...project, kits, status: 'open' as const, openedAt: at },
    }
    if (nextId) {
      projects[nextId] = { ...projects[nextId], status: 'building' }
    }
    city = { ...city, projects, currentProjectId: nextId, suggestedProjectId: null }
  } else {
    city = {
      ...city,
      projects: { ...city.projects, [cmd.projectId]: { ...project, kits } },
    }
  }

  let next = withCity(withChild(state, cmd.childId, { ...child, coins: child.coins - KIT_PRICE }), city)
  next = addLedger(next, {
    id: `kit-${cmd.kitPurchaseId}`,
    childId: cmd.childId,
    coins: -KIT_PRICE,
    stars: 0,
    reason: 'kit',
    refId: cmd.projectId,
    at,
  })
  return { state: next, result: ok(next.city.kitPurchases[cmd.kitPurchaseId]) }
}

/** A child taps a locked plot to suggest the next building. */
export function suggestProject(
  state: GameState,
  cmd: { childId: ChildId; projectId: ProjectId },
  now: Date,
  deps: CommandDeps,
): CommandOutcome<GameState> {
  void now
  if (state.city.currentProjectId !== null) {
    return { state, result: err('not-current-project', 'We are already building something.') }
  }
  const project = state.city.projects[cmd.projectId]
  if (!project || !deps.getProject(cmd.projectId) || project.status !== 'locked') {
    return { state, result: err('not-current-project', 'That plot cannot be suggested.') }
  }
  const next = withCity(state, { ...state.city, suggestedProjectId: cmd.projectId })
  return { state: next, result: ok(next) }
}

/** Grown-up confirms the next building (after the current project opens). */
export function chooseNextProject(
  state: GameState,
  cmd: { projectId: ProjectId },
  now: Date,
  deps: CommandDeps,
): CommandOutcome<GameState> {
  void now
  if (state.city.currentProjectId !== null) {
    return { state, result: err('not-current-project', 'A project is already in progress.') }
  }
  const project = state.city.projects[cmd.projectId]
  if (!project || !deps.getProject(cmd.projectId) || project.status !== 'locked') {
    return { state, result: err('not-current-project', 'That building cannot be started.') }
  }
  const next = withCity(state, {
    ...state.city,
    currentProjectId: cmd.projectId,
    suggestedProjectId: null,
    projects: { ...state.city.projects, [cmd.projectId]: { ...project, status: 'building' } },
  })
  return { state: next, result: ok(next) }
}

/** Command types that must run with grown-up authority (server enforces later). */
export const GROWN_UP_COMMANDS: ReadonlySet<Command['type']> = new Set([
  'approveClaim',
  'rejectClaim',
  'parentCompleteAndApprove',
  'chooseNextProject',
  'updateSchedule',
  'setPaused',
  'updateChildConfig',
])

export function setSound(
  state: GameState,
  cmd: { enabled: boolean },
  now: Date,
  deps: CommandDeps,
): CommandOutcome<GameState> {
  void now
  void deps
  const next: GameState = { ...state, settings: { ...state.settings, sound: cmd.enabled } }
  return { state: next, result: ok(next) }
}

export function applyCommand(
  state: GameState,
  cmd: Command,
  now: Date,
  deps: CommandDeps,
): CommandOutcome<unknown> {
  switch (cmd.type) {
    case 'claimQuest':
      return claimQuest(state, cmd, now, deps)
    case 'approveClaim':
      return approveClaim(state, cmd, now, deps)
    case 'rejectClaim':
      return rejectClaim(state, cmd, now, deps)
    case 'parentCompleteAndApprove':
      return parentCompleteAndApprove(state, cmd, now, deps)
    case 'purchase':
      return purchase(state, cmd, now, deps)
    case 'equip':
      return equip(state, cmd, now, deps)
    case 'setWish':
      return setWish(state, cmd, now, deps)
    case 'evaluateLeagues':
      return evaluateLeagues(state, {}, now, deps)
    case 'acknowledgePromotion':
      return acknowledgePromotion(state, cmd, now, deps)
    case 'setSound':
      return setSound(state, cmd, now, deps)
    case 'buyKit':
      return buyKit(state, cmd, now, deps)
    case 'suggestProject':
      return suggestProject(state, cmd, now, deps)
    case 'chooseNextProject':
      return chooseNextProject(state, cmd, now, deps)
    case 'updateSchedule':
      return updateSchedule(state, cmd, now, deps)
    case 'setPaused':
      return setPaused(state, cmd, now, deps)
    case 'updateChildConfig':
      return updateChildConfig(state, cmd, now, deps)
  }
}
