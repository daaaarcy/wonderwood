/**
 * Storybook friends — the town's animal residents who "play along" in the
 * Explorer League so the ladder feels alive.
 *
 * Everything about a friend is PURELY DERIVED: one seeded random stream per
 * `${id}:${weekKey}` produces the identical week on every device, forever.
 * Nothing is stored in GameState, there is no migration, and friends never
 * appear in approvals, claims, or grown-up screens — they are make-believe
 * story characters, not real children.
 */
import { addDaysKey, diffDays } from './week.ts'
import { MAX_LEAGUE_RANK } from './types.ts'

export type NpcId =
  | 'felix' | 'riley' | 'bramble'
  | 'olive' | 'pip' | 'hazel' | 'sunny' | 'tilly' | 'poppy' | 'dot'
export type NpcTemperament = 'keen' | 'steady' | 'sleepy' | 'eager' | 'bouncy' | 'easygoing'

export interface NpcDef {
  id: NpcId
  /** Display name, always species-labelled ("Felix the Fox"). */
  name: string
  /** Animal portrait in public/assets (resident-*.svg). */
  assetKey: string
  /** Quest chances offered across a full Mon–Sun week (evenly spread). */
  weeklyOpportunities: number
  temperament: NpcTemperament
  /** League rank at NPC_BASE_WEEK — friends only go up, same as the kids. */
  baseRank: number
}

/**
 * Monday of the week the game shipped (Sat 2026-10-10 → week of Oct 5).
 * Each friend's rank simulates forward from here; earlier weeks clamp to base.
 */
export const NPC_BASE_WEEK = '2026-10-05'

export const NPCS: NpcDef[] = [
  {
    id: 'felix',
    name: 'Felix the Fox',
    assetKey: 'resident-fox',
    weeklyOpportunities: 21,
    temperament: 'keen',
    baseRank: 4,
  },
  {
    id: 'riley',
    name: 'Riley the Rabbit',
    assetKey: 'resident-rabbit',
    weeklyOpportunities: 21,
    temperament: 'steady',
    baseRank: 3,
  },
  {
    id: 'bramble',
    name: 'Bramble the Bear',
    assetKey: 'resident-bear',
    weeklyOpportunities: 14,
    temperament: 'sleepy',
    baseRank: 2,
  },
  {
    id: 'olive',
    name: 'Olive the Owl',
    assetKey: 'resident-owl',
    weeklyOpportunities: 21,
    temperament: 'keen',
    baseRank: 5,
  },
  {
    id: 'pip',
    name: 'Pip the Penguin',
    assetKey: 'resident-penguin',
    weeklyOpportunities: 21,
    temperament: 'eager',
    baseRank: 3,
  },
  {
    id: 'hazel',
    name: 'Hazel the Hedgehog',
    assetKey: 'resident-hedgehog',
    weeklyOpportunities: 21,
    temperament: 'steady',
    baseRank: 2,
  },
  {
    id: 'sunny',
    name: 'Sunny the Squirrel',
    assetKey: 'resident-squirrel',
    weeklyOpportunities: 21,
    temperament: 'bouncy',
    baseRank: 1,
  },
  {
    id: 'tilly',
    name: 'Tilly the Turtle',
    assetKey: 'resident-turtle',
    weeklyOpportunities: 21,
    temperament: 'easygoing',
    baseRank: 1,
  },
  {
    id: 'poppy',
    name: 'Poppy the Panda',
    assetKey: 'resident-panda',
    weeklyOpportunities: 21,
    temperament: 'sleepy',
    baseRank: 1,
  },
  {
    id: 'dot',
    name: 'Dot the Duck',
    assetKey: 'resident-duck',
    weeklyOpportunities: 21,
    temperament: 'steady',
    baseRank: 2,
  },
]

export function npcById(id: string): NpcDef | undefined {
  return NPCS.find((n) => n.id === id)
}

/* ---------------- deterministic seeded RNG ---------------- */

/** FNV-1a 32-bit hash — pure integer math, identical on every engine. */
function hashSeed(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32 — a tiny seeded PRNG returning values in [0, 1). */
function rngFor(seed: string): () => number {
  let a = hashSeed(seed) | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ---------------- the friend's week ---------------- */

interface Traits {
  /** Centre of the week's completed fraction. */
  frac: number
  /** ± jitter on the weekly fraction. */
  jitter: number
  /** Centre of the fraction of the 7 days the friend plays. */
  dayFrac: number
  /** ± jitter on the active-day fraction. */
  dayJitter: number
}

const TRAITS: Record<NpcTemperament, Traits> = {
  // keen Felix: out nearly every day, finishes most quests (a rare off week)
  keen: { frac: 0.85, jitter: 0.16, dayFrac: 0.9, dayJitter: 0.07 },
  // steady Riley: about two-thirds of quests across about two-thirds of days
  steady: { frac: 0.64, jitter: 0.14, dayFrac: 0.67, dayJitter: 0.08 },
  // sleepy Bramble: about two-fifths of quests on a few slow days
  sleepy: { frac: 0.44, jitter: 0.12, dayFrac: 0.43, dayJitter: 0.08 },
  // eager Pip: nearly everything, nearly every day — the pipsqueak try-hard
  eager: { frac: 0.93, jitter: 0.08, dayFrac: 0.95, dayJitter: 0.05 },
  // bouncy Sunny: great weeks and quiet weeks — hard to predict
  bouncy: { frac: 0.66, jitter: 0.3, dayFrac: 0.7, dayJitter: 0.2 },
  // easygoing Tilly: a little every day, slow and steady
  easygoing: { frac: 0.55, jitter: 0.06, dayFrac: 0.86, dayJitter: 0.05 },
}

/** Scheduled quests per day — the weekly total spread evenly over 7 days. */
function dailyCap(npc: NpcDef): number {
  return Math.ceil(npc.weeklyOpportunities / 7)
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * The friend's week as 7 per-day quest counts (Mon–Sun), all drawn from one
 * seeded stream. Day counts never exceed that day's schedule, and the weekly
 * sum lands in the temperament's range: Felix most, Riley ~2/3, Bramble ~2/5.
 */
function npcWeekPlan(npc: NpcDef, weekKey: string): number[] {
  const rand = rngFor(`${npc.id}:${weekKey}`)
  const traits = TRAITS[npc.temperament]
  const cap = dailyCap(npc)

  // 1. this week's total — a jittered temperament fraction of the chances
  const total = clamp(
    Math.round(npc.weeklyOpportunities * (traits.frac + (rand() * 2 - 1) * traits.jitter)),
    1,
    npc.weeklyOpportunities,
  )

  // 2. how many days they play — enough to hold the total within the cap
  const activeDays = Math.min(
    clamp(
      Math.round(7 * (traits.dayFrac + (rand() * 2 - 1) * traits.dayJitter)),
      Math.ceil(total / cap),
      7,
    ),
    total,
  )

  // 3. which days, picked in seeded order (irregular is in character)
  const order = [0, 1, 2, 3, 4, 5, 6]
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1))
    const tmp = order[i]
    order[i] = order[j]
    order[j] = tmp
  }
  const active = order.slice(0, activeDays).sort((a, b) => a - b)

  // 4. spread the total over the active days — weighted, 1..cap each
  const weights = active.map(() => 0.6 + rand() * 0.8)
  const weightSum = weights.reduce((s, w) => s + w, 0)
  const counts = new Map<number, number>()
  active.forEach((day, i) => {
    counts.set(day, clamp(Math.round((total * weights[i]) / weightSum), 1, cap))
  })
  // nudge the sum to exactly `total`, staying inside [1, cap] — the walk is
  // deterministic because it follows the seeded day order
  let sum = [...counts.values()].reduce((s, c) => s + c, 0)
  for (let guard = 0; sum !== total && guard < 200; guard += 1) {
    for (const day of active) {
      if (sum === total) break
      const c = counts.get(day) ?? 0
      if (sum < total && c < cap) {
        counts.set(day, c + 1)
        sum += 1
      } else if (sum > total && c > 1) {
        counts.set(day, c - 1)
        sum -= 1
      }
    }
  }

  return [0, 1, 2, 3, 4, 5, 6].map((d) => counts.get(d) ?? 0)
}

/** Quests a friend finished on one day of `weekKey` (0 = a quiet day). */
export function npcDayCount(id: NpcId, weekKey: string, dateKey: string): number {
  const npc = npcById(id)
  if (!npc) return 0
  const d = diffDays(weekKey, dateKey)
  if (d < 0 || d > 6) return 0
  return npcWeekPlan(npc, weekKey)[d]
}

/**
 * Consecutive days (ending `dateKey`) on which the friend finished at least
 * one quest — can reach back into the previous week's plan.
 */
export function npcDayStreak(id: NpcId, weekKey: string, dateKey: string): number {
  let streak = 0
  let day = dateKey
  let week = weekKey
  for (let guard = 0; guard < 14; guard += 1) {
    if (npcDayCount(id, week, day) <= 0) break
    streak += 1
    day = addDaysKey(day, -1)
    if (day < week) week = addDaysKey(week, -7)
  }
  return streak
}

export interface NpcWeekProgress {
  /** Quests finished in the week through `todayKey` (capped at Sunday). */
  completed: number
  /** Chances offered through the same day. */
  opportunities: number
  /** completed ÷ opportunities — 0 before the week starts. */
  pctSoFar: number
}

/**
 * A friend's progress in week `weekKey` as of `todayKey`: small on Monday,
 * reaching the week's total by Sunday. Same inputs → same numbers on any
 * device, forever.
 */
export function npcWeekProgress(id: NpcId, weekKey: string, todayKey: string): NpcWeekProgress {
  const npc = npcById(id)
  if (!npc) return { completed: 0, opportunities: 0, pctSoFar: 0 }
  const sunday = addDaysKey(weekKey, 6)
  const through = todayKey > sunday ? sunday : todayKey
  const elapsed = clamp(diffDays(weekKey, through) + 1, 0, 7)
  const plan = npcWeekPlan(npc, weekKey)
  const completed = plan.slice(0, elapsed).reduce((s, n) => s + n, 0)
  const opportunities = dailyCap(npc) * elapsed
  return { completed, opportunities, pctSoFar: opportunities > 0 ? completed / opportunities : 0 }
}

/**
 * A friend's league rank during week `weekKey`: base rank at NPC_BASE_WEEK,
 * then +1 for every fully-finished week since where the seeded week hit
 * ≥70% — the same promotion rule as the explorers, and the same promise:
 * friends can never move down either (cap 14).
 */
export function npcLeagueRank(id: NpcId, weekKey: string): number {
  const npc = npcById(id)
  if (!npc) return 1
  if (weekKey <= NPC_BASE_WEEK) return npc.baseRank
  let rank = npc.baseRank
  for (let w = NPC_BASE_WEEK; w < weekKey; w = addDaysKey(w, 7)) {
    const sunday = addDaysKey(w, 6)
    const p = npcWeekProgress(id, w, sunday)
    if (p.opportunities > 0 && p.completed / p.opportunities >= 0.7) {
      rank = Math.min(MAX_LEAGUE_RANK, rank + 1)
    }
  }
  return rank
}
