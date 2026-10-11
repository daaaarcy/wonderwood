import { addDaysKey, localDateKey, mondayKeyOf, weekdayOf } from './week.ts'
import { scheduleForDate } from './migrate.ts'
import { isValidLook } from './avatar.ts'
import type { AvatarLook } from './avatar.ts'
import type {
  ChildId,
  Claim,
  CityState,
  Command,
  CommandDeps,
  CommandOutcome,
  CustomQuest,
  DaySchedule,
  DomainError,
  FurnitureSpot,
  GameState,
  ItemSpot,
  LedgerEntry,
  ProjectId,
  Purchase,
  RepairIncident,
  Result,
} from './types.ts'
import {
  BONUS_REWARD,
  BONUS_SLOTS_PER_DAY,
  CHILD_IDS,
  CITY_PALETTE,
  CORE_REWARD,
  DECOR_SPOTS,
  FURNITURE_SPOTS,
  MAX_LEAGUE_RANK,
  REPAIR_PRUNE_DAYS,
  WEEKLY_COINS,
} from './types.ts'
import { DEFAULT_WEEKLY, WEEKLY_TEMPLATES, weeklyTemplateById } from '../data/weekly.ts'

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
      c.role !== 'custom' &&
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
  // Custom tasks pay exactly the reward the grown-up configured — never the
  // shared core/bonus rewards, and they don't touch the bonus slots.
  if (claim.role === 'custom') {
    const q = state.customQuests[claim.questId]
    return { coins: q?.coins ?? 0, stars: q?.stars ?? 0 }
  }
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

/** Active custom quests assigned to `childId` that are scheduled on `dateKey`. */
export function customQuestsOn(state: GameState, childId: ChildId, dateKey: string): CustomQuest[] {
  const weekday = (weekdayOf(dateKey) + 6) % 7
  return Object.values(state.customQuests).filter(
    (q) =>
      q.active && q.childIds.includes(childId) && (q.days.length === 0 || q.days.includes(weekday)),
  )
}

/**
 * Eligible days + opportunities in week `weekKey` for a child: days ≥ createdAt,
 * ≤ throughKey, not paused, with ≥1 scheduled core quest or custom task.
 * Each scheduled custom task counts as one opportunity (same as a core quest).
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
    const custom = customQuestsOn(state, childId, d).length
    if (core.length + custom > 0) {
      days += 1
      opportunities += core.length + custom
    }
  }
  return { eligibleDays: days, opportunities }
}

/**
 * Approved claims that carried a star reward: the first core approval per
 * quest/day, plus approved custom tasks that award ≥1★ (same as core).
 */
function approvedCoreClaimsInWeek(state: GameState, childId: ChildId, weekKey: string): Claim[] {
  return approvedClaimsInWeek(state, childId, weekKey).filter(
    (c) => (c.role === 'core' || c.role === 'custom') && (c.reward?.stars ?? 1) > 0,
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

/**
 * The schedule role a quest has for a child on a date; null when neither.
 * Custom quests resolve to 'custom' (they never sit in the core/bonus plan).
 */
export function questRoleOn(
  state: GameState,
  childId: ChildId,
  questId: string,
  dateKey: string,
): 'core' | 'bonus' | 'custom' | null {
  const weekday = (weekdayOf(dateKey) + 6) % 7
  const custom = state.customQuests[questId]
  if (custom) {
    return custom.active &&
      custom.childIds.includes(childId) &&
      (custom.days.length === 0 || custom.days.includes(weekday))
      ? 'custom'
      : null
  }
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
  const custom = state.customQuests[cmd.questId]
  const known =
    (quest && !quest.retired && quest.childIds.includes(cmd.childId)) ||
    (custom && custom.childIds.includes(cmd.childId))
  if (!known) {
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
    // Custom claims carry their title so archived tasks still render.
    questTitle: role === 'custom' ? custom?.title : undefined,
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
  next = awardWeeklyIfDone(next, approved, now)
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

/** Does an item with `itemSpot` fit into room `spot`? ('decor' fits both.) */
export function spotFits(itemSpot: ItemSpot | undefined, spot: FurnitureSpot): boolean {
  if (!itemSpot) return false
  if (itemSpot === spot) return true
  return itemSpot === 'decor' && (DECOR_SPOTS as readonly string[]).includes(spot)
}

/** The spots a furniture item can go in (decor → both decor spots). */
export function spotsFor(itemSpot: ItemSpot | undefined): FurnitureSpot[] {
  if (!itemSpot) return []
  if (itemSpot === 'decor') return [...DECOR_SPOTS]
  return [itemSpot]
}

/** First compatible empty spot for a furniture item, if any. */
function firstFreeSpot(
  placed: Partial<Record<FurnitureSpot, string>>,
  itemSpot: ItemSpot | undefined,
): FurnitureSpot | undefined {
  return spotsFor(itemSpot).find((s) => placed[s] == null)
}

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
  // Furniture goes straight into the room when a compatible spot is free —
  // otherwise it waits in the inventory for a manual place/swap.
  const placed = { ...child.placed }
  if (item.slot === 'furniture') {
    const free = firstFreeSpot(placed, item.spot)
    if (free) placed[free] = item.id
  }
  let next: GameState = {
    ...state,
    children: {
      ...state.children,
      [cmd.childId]: {
        ...child,
        coins: child.coins - item.price,
        inventory: [...child.inventory, cmd.itemId],
        placed,
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

/**
 * Put an owned furniture item into a room spot, or clear the spot with
 * itemId:null. One item per spot; placing a different owned item swaps it in.
 * An item can only sit in one spot — placing it somewhere moves it.
 */
export function placeItem(
  state: GameState,
  cmd: { childId: ChildId; spot: FurnitureSpot; itemId: string | null },
  now: Date,
  deps: CommandDeps,
): CommandOutcome<GameState> {
  void now
  if (!(FURNITURE_SPOTS as readonly string[]).includes(cmd.spot)) {
    return { state, result: err('wrong-slot', 'That spot does not exist.') }
  }
  const child = state.children[cmd.childId]
  const placed = { ...child.placed }
  if (cmd.itemId === null) {
    delete placed[cmd.spot]
    const next = withChild(state, cmd.childId, { ...child, placed })
    return { state: next, result: ok(next) }
  }
  const item = deps.getItem(cmd.itemId)
  if (!item) {
    return { state, result: err('unknown-item', 'That item does not exist.') }
  }
  if (item.slot !== 'furniture' || !spotFits(item.spot, cmd.spot)) {
    return { state, result: err('wrong-slot', 'That item does not go there.') }
  }
  if (!child.inventory.includes(cmd.itemId)) {
    return { state, result: err('item-not-owned', 'You do not own that yet.') }
  }
  // One copy in one spot: remove the item from any other spot first.
  for (const s of FURNITURE_SPOTS) {
    if (placed[s] === cmd.itemId) delete placed[s]
  }
  placed[cmd.spot] = cmd.itemId
  const next = withChild(state, cmd.childId, { ...child, placed })
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
    const postcards = [...(city.postcards ?? [])]
    const postcardId = `postcard-${cmd.projectId}`
    if (!postcards.some((p) => p.id === postcardId)) {
      postcards.push({ id: postcardId, projectId: cmd.projectId, openedAt: at })
    }
    city = { ...city, projects, postcards, currentProjectId: nextId, suggestedProjectId: null }
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

/* ---------------- city personalization ---------------- */

export function nameCity(
  state: GameState,
  cmd: { childId: ChildId; name: string },
  now: Date,
  deps: CommandDeps,
): CommandOutcome<GameState> {
  void now
  void deps
  const name = cmd.name.trim().replace(/\s+/g, ' ')
  if (name.length === 0 || name.length > 30) {
    return { state, result: err('invalid-name', 'Town names are 1–30 letters.') }
  }
  const next = withCity(state, { ...state.city, name })
  return { state: next, result: ok(next) }
}

export function customizeBuilding(
  state: GameState,
  cmd: { childId: ChildId; projectId: ProjectId; color?: string; name?: string | null },
  now: Date,
  deps: CommandDeps,
): CommandOutcome<GameState> {
  void now
  void deps
  const project = state.city.projects[cmd.projectId]
  if (!project || project.status !== 'open') {
    return { state, result: err('not-current-project', 'Only open buildings can be personalised.') }
  }
  if (cmd.color !== undefined && !(CITY_PALETTE as readonly string[]).includes(cmd.color)) {
    return { state, result: err('invalid-color', 'Pick one of the palette colours.') }
  }
  let name: string | undefined
  if (cmd.name !== undefined && cmd.name !== null) {
    name = cmd.name.trim().replace(/\s+/g, ' ')
    if (name.length === 0) name = undefined
    if (name && name.length > 30) {
      return { state, result: err('invalid-name', 'Building names are up to 30 letters.') }
    }
  }
  const next = withCity(state, {
    ...state.city,
    projects: {
      ...state.city.projects,
      [cmd.projectId]: {
        ...project,
        ...(cmd.color !== undefined ? { color: cmd.color } : {}),
        ...(cmd.name !== undefined ? { name } : {}),
      },
    },
  })
  return { state: next, result: ok(next) }
}

/* ---------------- weekly challenge ---------------- */

/** Distinct days in `weekKey` with an approved claim for any of the quests. */
export function weeklyDaysCount(
  state: GameState,
  childId: ChildId,
  weekKey: string,
  questIds: string[],
): number {
  const sunday = addDaysKey(weekKey, 6)
  const days = new Set<string>()
  for (const c of Object.values(state.claims)) {
    if (
      c.childId === childId &&
      c.status === 'approved' &&
      questIds.includes(c.questId) &&
      c.activityDate >= weekKey &&
      c.activityDate <= sunday
    ) {
      days.add(c.activityDate)
    }
  }
  return days.size
}

/** The template a child is doing this week (chosen or default). */
export function weeklyTemplateFor(state: GameState, childId: ChildId, weekKey: string): string {
  return state.weekly[childId]?.[weekKey]?.templateId ?? DEFAULT_WEEKLY[childId]
}

/**
 * After an approval, award the weekly challenge for the claim's week if the
 * criterion is now met. Exactly once per child per week.
 */
function awardWeeklyIfDone(state: GameState, claim: Claim, now: Date): GameState {
  const weekKey = mondayKeyOf(claim.activityDate)
  const entry = state.weekly[claim.childId]?.[weekKey]
  if (entry?.completedAt) return state
  const template = weeklyTemplateById(entry?.templateId ?? DEFAULT_WEEKLY[claim.childId])
  if (!template) return state
  if (weeklyDaysCount(state, claim.childId, weekKey, template.questIds) < template.days) return state
  const at = now.toISOString()
  const badgeId = `badge-${claim.childId}-${weekKey}`
  const child = state.children[claim.childId]
  const next = withChild(state, claim.childId, { ...child, coins: child.coins + WEEKLY_COINS })
  return {
    ...next,
    weekly: {
      ...next.weekly,
      [claim.childId]: {
        ...next.weekly[claim.childId],
        [weekKey]: { templateId: template.id, completedAt: at },
      },
    },
    badges: [
      ...next.badges,
      { id: badgeId, childId: claim.childId, weekKey, templateId: template.id, earnedAt: at },
    ],
    ledger: [
      ...next.ledger,
      {
        id: `weekly-${claim.childId}-${weekKey}`,
        childId: claim.childId,
        coins: WEEKLY_COINS,
        stars: 0,
        reason: 'weekly',
        refId: badgeId,
        at,
      },
    ],
  }
}

/** Templates whose quests are in the child's current schedule. */
export function eligibleWeeklyTemplates(state: GameState, childId: ChildId): string[] {
  const today = localDateKey(new Date(), state.timeZone)
  const sched = scheduleForDate(state, today)[childId]
  const scheduled = new Set<string>([...sched.bonus, ...Object.values(sched.core).flat()])
  return WEEKLY_TEMPLATES.filter((t) => t.questIds.some((q) => scheduled.has(q))).map((t) => t.id)
}

export function setWeeklyChallenge(
  state: GameState,
  cmd: { childId: ChildId; weekKey: string; templateId: string },
  now: Date,
  deps: CommandDeps,
): CommandOutcome<GameState> {
  void deps
  const template = weeklyTemplateById(cmd.templateId)
  if (!template) {
    return { state, result: err('invalid-weekly', 'No such weekly challenge.') }
  }
  const currentWeek = mondayKeyOf(localDateKey(now, state.timeZone))
  if (cmd.weekKey < currentWeek) {
    return { state, result: err('invalid-weekly', 'Pick this week or a future one.') }
  }
  const existing = state.weekly[cmd.childId]?.[cmd.weekKey]
  if (existing?.completedAt) {
    return { state, result: err('invalid-weekly', 'That week is already done — leave it be!') }
  }
  if (!eligibleWeeklyTemplates(state, cmd.childId).includes(cmd.templateId)) {
    return { state, result: err('invalid-weekly', 'That challenge needs quests not in the schedule.') }
  }
  const next: GameState = {
    ...state,
    weekly: {
      ...state.weekly,
      [cmd.childId]: {
        ...state.weekly[cmd.childId],
        [cmd.weekKey]: { templateId: cmd.templateId, completedAt: existing?.completedAt },
      },
    },
  }
  return { state: next, result: ok(next) }
}

/* ---------------- grown-up custom tasks ---------------- */

const CUSTOM_TITLE_MAX = 60
const CUSTOM_COINS_MAX = 99
const CUSTOM_STARS_MAX = 5

/** Normalized valid fields, or an error. `questId` is not part of the input. */
function validateCustomQuest(input: {
  title: string
  coins: number
  stars: number
  childIds: ChildId[]
  days: number[]
}): Result<{ title: string; coins: number; stars: number; childIds: ChildId[]; days: number[] }> {
  const title = input.title.trim().replace(/\s+/g, ' ')
  if (title.length < 1 || title.length > CUSTOM_TITLE_MAX) {
    return err('invalid-quest', 'Task names are 1–60 letters.')
  }
  if (!Number.isInteger(input.coins) || input.coins < 0 || input.coins > CUSTOM_COINS_MAX) {
    return err('invalid-quest', `Coins must be 0–${CUSTOM_COINS_MAX}.`)
  }
  if (!Number.isInteger(input.stars) || input.stars < 0 || input.stars > CUSTOM_STARS_MAX) {
    return err('invalid-quest', `Stars must be 0–${CUSTOM_STARS_MAX}.`)
  }
  const childIds = [...new Set(input.childIds)]
  if (childIds.length === 0 || !childIds.every((c) => CHILD_IDS.includes(c))) {
    return err('invalid-quest', 'Pick at least one explorer.')
  }
  const days = [...new Set(input.days)]
  if (!days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
    return err('invalid-quest', 'Days must be weekdays 0–6.')
  }
  return ok({ title, coins: input.coins, stars: input.stars, childIds, days: days.sort((a, b) => a - b) })
}

/** Grown-ups write a task; `questId` is caller-supplied for idempotency. */
export function createCustomQuest(
  state: GameState,
  cmd: {
    questId: string
    title: string
    coins: number
    stars: number
    childIds: ChildId[]
    days: number[]
  },
  now: Date,
  deps: CommandDeps,
): CommandOutcome<CustomQuest> {
  void deps
  const existing = state.customQuests[cmd.questId]
  if (existing) {
    return { state, result: ok(existing) }
  }
  const clean = validateCustomQuest(cmd)
  if (!clean.ok) {
    return { state, result: clean }
  }
  const quest: CustomQuest = {
    id: cmd.questId,
    ...clean.value,
    createdAt: now.toISOString(),
    active: true,
  }
  const next: GameState = {
    ...state,
    customQuests: { ...state.customQuests, [quest.id]: quest },
  }
  return { state: next, result: ok(quest) }
}

/** Patch a custom task — same validation; `active:false` archives it. */
export function updateCustomQuest(
  state: GameState,
  cmd: {
    id: string
    patch: Partial<Pick<CustomQuest, 'title' | 'coins' | 'stars' | 'childIds' | 'days' | 'active'>>
  },
  now: Date,
  deps: CommandDeps,
): CommandOutcome<CustomQuest> {
  void now
  void deps
  const quest = state.customQuests[cmd.id]
  if (!quest) {
    return { state, result: err('unknown-quest', 'That task does not exist.') }
  }
  const p = cmd.patch
  const clean = validateCustomQuest({
    title: p.title ?? quest.title,
    coins: p.coins ?? quest.coins,
    stars: p.stars ?? quest.stars,
    childIds: p.childIds ?? quest.childIds,
    days: p.days ?? quest.days,
  })
  if (!clean.ok) {
    return { state, result: clean }
  }
  const updated: CustomQuest = {
    ...quest,
    ...clean.value,
    active: p.active ?? quest.active,
  }
  const next: GameState = {
    ...state,
    customQuests: { ...state.customQuests, [updated.id]: updated },
  }
  return { state: next, result: ok(updated) }
}

/* ---------------- reset & repair ---------------- */

const INCIDENT_KINDS = new Set(['spitting', 'scattering', 'untrue', 'fighting', 'other'])

/** Drop incidents repaired more than REPAIR_PRUNE_DAYS ago (run inside writes). */
function pruneRepairs(state: GameState, now: Date): GameState {
  const cutoff = now.getTime() - REPAIR_PRUNE_DAYS * 86_400_000
  let changed = false
  const repairs: typeof state.repairs = {}
  for (const [id, r] of Object.entries(state.repairs)) {
    if (r.repairedAt && Date.parse(r.repairedAt) < cutoff) {
      changed = true
      continue
    }
    repairs[id] = r
  }
  return changed ? { ...state, repairs } : state
}

export function logIncident(
  state: GameState,
  cmd: {
    childId: ChildId
    incidentId: string
    situation: RepairIncident['situation']
    otherText?: string
    note?: string
    toyReminder?: { text: string; returnAt?: string }
  },
  now: Date,
  deps: CommandDeps,
): CommandOutcome<GameState> {
  void deps
  const base = pruneRepairs(state, now)
  if (!INCIDENT_KINDS.has(cmd.situation)) {
    return { state: base, result: err('invalid-config', 'Pick a situation.') }
  }
  if (base.repairs[cmd.incidentId]) {
    return { state: base, result: ok(base) } // idempotent
  }
  const incident: RepairIncident = {
    id: cmd.incidentId,
    childId: cmd.childId,
    situation: cmd.situation,
    otherText: cmd.otherText?.slice(0, 200),
    note: cmd.note?.slice(0, 200),
    toyReminder: cmd.toyReminder
      ? { text: cmd.toyReminder.text.slice(0, 120), returnAt: cmd.toyReminder.returnAt }
      : undefined,
    createdAt: now.toISOString(),
  }
  const next: GameState = {
    ...base,
    repairs: { ...base.repairs, [incident.id]: incident },
  }
  return { state: next, result: ok(next) }
}

export function markRepaired(
  state: GameState,
  cmd: { incidentId: string },
  now: Date,
  deps: CommandDeps,
): CommandOutcome<GameState> {
  void deps
  const base = pruneRepairs(state, now)
  const incident = base.repairs[cmd.incidentId]
  if (!incident) {
    return { state: base, result: err('unknown-incident', 'That note does not exist.') }
  }
  if (incident.repairedAt) return { state: base, result: ok(base) }
  const next: GameState = {
    ...base,
    repairs: {
      ...base.repairs,
      [incident.id]: { ...incident, repairedAt: now.toISOString() },
    },
  }
  return { state: next, result: ok(next) }
}

export function deleteIncident(
  state: GameState,
  cmd: { incidentId: string },
  now: Date,
  deps: CommandDeps,
): CommandOutcome<GameState> {
  void deps
  const base = pruneRepairs(state, now)
  if (!base.repairs[cmd.incidentId]) {
    return { state: base, result: err('unknown-incident', 'That note does not exist.') }
  }
  const repairs = { ...base.repairs }
  delete repairs[cmd.incidentId]
  return { state: { ...base, repairs }, result: ok({ ...base, repairs }) }
}

export function acknowledgeRepair(
  state: GameState,
  cmd: { incidentId: string },
  now: Date,
  deps: CommandDeps,
): CommandOutcome<GameState> {
  void deps
  const base = pruneRepairs(state, now)
  const incident = base.repairs[cmd.incidentId]
  if (!incident) {
    return { state: base, result: err('unknown-incident', 'That note does not exist.') }
  }
  if (!incident.repairedAt) {
    return { state: base, result: err('incident-not-repaired', 'It is not repaired yet.') }
  }
  if (incident.acknowledgedAt) return { state: base, result: ok(base) }
  const next: GameState = {
    ...base,
    repairs: {
      ...base.repairs,
      [incident.id]: { ...incident, acknowledgedAt: now.toISOString() },
    },
  }
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
  'setWeeklyChallenge',
  'logIncident',
  'markRepaired',
  'deleteIncident',
  'createCustomQuest',
  'updateCustomQuest',
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

export function setLook(
  state: GameState,
  cmd: { childId: ChildId; look: AvatarLook },
  now: Date,
  deps: CommandDeps,
): CommandOutcome<GameState> {
  void now
  void deps
  if (!isValidLook(cmd.look)) return { state, result: err('invalid-look', 'That look isn’t allowed.') }
  const child = state.children[cmd.childId]
  if (!child) return { state, result: err('invalid-config', 'Unknown explorer.') }
  const next: GameState = {
    ...state,
    children: { ...state.children, [cmd.childId]: { ...child, look: cmd.look } },
  }
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
    case 'placeItem':
      return placeItem(state, cmd, now, deps)
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
    case 'nameCity':
      return nameCity(state, cmd, now, deps)
    case 'customizeBuilding':
      return customizeBuilding(state, cmd, now, deps)
    case 'setWeeklyChallenge':
      return setWeeklyChallenge(state, cmd, now, deps)
    case 'logIncident':
      return logIncident(state, cmd, now, deps)
    case 'markRepaired':
      return markRepaired(state, cmd, now, deps)
    case 'deleteIncident':
      return deleteIncident(state, cmd, now, deps)
    case 'acknowledgeRepair':
      return acknowledgeRepair(state, cmd, now, deps)
    case 'createCustomQuest':
      return createCustomQuest(state, cmd, now, deps)
    case 'updateCustomQuest':
      return updateCustomQuest(state, cmd, now, deps)
    case 'setLook':
      return setLook(state, cmd, now, deps)
    default: {
      const _exhaustive: never = cmd
      void _exhaustive
      return { state, result: err('invalid-config', 'Unknown command.') }
    }
  }
}
