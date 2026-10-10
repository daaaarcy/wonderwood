/**
 * The save migration chain — shared by the local repository and the edge
 * function so every state doc (on read AND on write) is at the current schema.
 */
import { localDateKey } from './week.ts'
import type {
  ChildConfig,
  ChildId,
  CityState,
  Claim,
  DateKey,
  GameState,
} from './types.ts'
import {
  DEFAULT_HOUSEWORK_JOBS,
  DEFAULT_SCHEDULE,
  LEGACY_SCHEDULE,
} from '../data/quests.ts'

/* ---------------- older shapes ---------------- */

/** v2 shape: v3 minus the city block (v2 still had parentPinHash). */
type GameStateV2 = Omit<
  GameState,
  'schemaVersion' | 'city' | 'timeZone' | 'config' | 'scheduleHistory' | 'pausedDates'
> & {
  schemaVersion: 2
  parentPinHash?: string | null
  claims: Record<string, Omit<Claim, 'role' | 'details' | 'reward'>>
}

type GameStateV3 = Omit<GameStateV2, 'schemaVersion'> & {
  schemaVersion: 3
  city: CityState
}

type GameStateV4 = Omit<GameStateV3, 'schemaVersion'> & {
  schemaVersion: 4
  timeZone: string
}

/* ---------------- validators ---------------- */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function isValidV1(value: Record<string, unknown>): boolean {
  const s = value as {
    children?: Record<string, { coins?: unknown; stars?: unknown; inventory?: unknown; equipped?: unknown }>
    claims?: unknown
    purchases?: unknown
    ledger?: unknown
  }
  if (!isRecord(s.children)) return false
  for (const id of ['theodore', 'leonard'] as const) {
    const c = s.children[id]
    if (!c || typeof c.coins !== 'number' || typeof c.stars !== 'number') return false
    if (!Array.isArray(c.inventory) || !isRecord(c.equipped)) return false
  }
  return isRecord(s.claims) && isRecord(s.purchases) && Array.isArray(s.ledger)
}

function isValidV2(value: Record<string, unknown>): boolean {
  if (!isValidV1(value)) return false
  const s = value as unknown as GameStateV2
  if (typeof s.createdAt !== 'string') return false
  for (const id of ['theodore', 'leonard'] as const) {
    const league = s.children[id].league
    if (!league || typeof league.rank !== 'number' || !isRecord(league.evaluatedWeeks)) return false
  }
  return isRecord(s.settings) && typeof s.settings.sound === 'boolean'
}

function isValidV3(value: Record<string, unknown>): boolean {
  if (!isValidV2(value)) return false
  const s = value as unknown as GameStateV3
  const city = s.city
  if (!isRecord(city) || !isRecord(city.projects)) return false
  for (const id of ['road', 'library', 'music-school', 'police-station', 'hospital'] as const) {
    const p = city.projects[id]
    if (!p || typeof p.kits !== 'number' || typeof p.status !== 'string') return false
  }
  return isRecord(city.kitPurchases)
}

function isValidV4(value: Record<string, unknown>): boolean {
  return isValidV3(value) && typeof (value as { timeZone?: unknown }).timeZone === 'string'
}

function isValidV5(value: Record<string, unknown>): boolean {
  if (!isValidV4(value)) return false
  const s = value as unknown as GameState
  return isRecord(s.config) && Array.isArray(s.scheduleHistory) && isRecord(s.pausedDates)
}

/* ---------------- chain ---------------- */

function initialCity(foundersBridgePlanks: number): CityState {
  return {
    currentProjectId: 'road',
    suggestedProjectId: null,
    projects: {
      road: { kits: 0, status: 'building' },
      library: { kits: 0, status: 'locked' },
      'music-school': { kits: 0, status: 'locked' },
      'police-station': { kits: 0, status: 'locked' },
      hospital: { kits: 0, status: 'locked' },
    },
    kitPurchases: {},
    foundersBridgePlanks,
  }
}

/** v1 → v2: preserve everything; league starts at rank 1, sound on. */
function migrateV1(v1: Record<string, unknown>): GameStateV2 | null {
  if (!isValidV1(v1)) return null
  const s = v1 as unknown as Omit<GameStateV2, 'schemaVersion' | 'createdAt' | 'settings'>
  const createdAt =
    s.ledger.length > 0 ? s.ledger.map((e) => e.at).sort()[0] : new Date().toISOString()
  return {
    schemaVersion: 2,
    createdAt,
    children: {
      theodore: {
        ...s.children.theodore,
        league: { rank: 1, evaluatedWeeks: {}, unseenPromotion: null },
      },
      leonard: {
        ...s.children.leonard,
        league: { rank: 1, evaluatedWeeks: {}, unseenPromotion: null },
      },
    },
    claims: s.claims,
    purchases: s.purchases,
    ledger: s.ledger,
    parentPinHash: typeof s.parentPinHash === 'string' ? s.parentPinHash : null,
    settings: { sound: true },
  }
}

/** v2 → v3: preserve everything; the old star-bridge becomes a keepsake. */
function migrateV2(v2: GameStateV2): GameStateV3 {
  const planks = Math.min(12, v2.children.theodore.stars + v2.children.leonard.stars)
  return { ...v2, schemaVersion: 3, city: initialCity(planks) }
}

/** v3 → v4: the PIN moves to server-side secrets; stamp the family's time zone. */
function migrateV3(v3: GameStateV3, timeZone: string): GameStateV4 {
  const rest = { ...v3 } as Record<string, unknown>
  delete rest.parentPinHash
  return { ...(rest as Omit<GameStateV4, 'schemaVersion' | 'timeZone'>), schemaVersion: 4, timeZone }
}

export const DEFAULT_CHILD_CONFIG: Record<ChildId, ChildConfig> = {
  theodore: {
    mathLevel: 2,
    violinGoal: '',
    typingUrl: null,
    houseworkJobs: [...DEFAULT_HOUSEWORK_JOBS],
  },
  leonard: {
    mathLevel: 1,
    violinGoal: 'Practise the goal your teacher set',
    typingUrl: null,
    houseworkJobs: [...DEFAULT_HOUSEWORK_JOBS],
  },
}

/** v4 → v5: schedules, per-child config, rest days; claims get role/reward stamps. */
function migrateV4(v4: GameStateV4, ctx: { now: Date; timeZone: string }): GameState {
  const createdKey = localDateKey(new Date(v4.createdAt), v4.timeZone)
  const todayKey = localDateKey(ctx.now, ctx.timeZone)
  const claims: Record<string, Claim> = {}
  for (const [id, c] of Object.entries(v4.claims)) {
    claims[id] = {
      ...(c as Claim),
      role: 'core',
      reward: c.status === 'approved' ? { coins: 10, stars: 1 } : undefined,
    }
  }
  return {
    ...v4,
    schemaVersion: 5,
    claims,
    config: structuredClone(DEFAULT_CHILD_CONFIG),
    scheduleHistory: [
      { effectiveFrom: createdKey, schedule: structuredClone(LEGACY_SCHEDULE) },
      { effectiveFrom: todayKey, schedule: structuredClone(DEFAULT_SCHEDULE) },
    ],
    pausedDates: { theodore: [], leonard: [] },
  }
}

export interface MigrateCtx {
  now: Date
  timeZone: string
}

/**
 * Migrate any older save shape to the current schema. `raw` may be a parsed
 * object or a JSON string. Returns null for unusable data.
 */
export function migrateState(raw: unknown, ctx: MigrateCtx): GameState | null {
  try {
    const value: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!isRecord(value)) return null
    const version = (value as { schemaVersion?: unknown }).schemaVersion
    let v2: GameStateV2 | null = null
    if (version === 1) {
      v2 = migrateV1(value)
    } else if (version === 2) {
      v2 = isValidV2(value) ? (value as unknown as GameStateV2) : null
    }
    if (v2) return migrateV4(migrateV3(migrateV2(v2), ctx.timeZone), ctx)
    if (version === 3) {
      const v3 = isValidV3(value) ? (value as unknown as GameStateV3) : null
      return v3 ? migrateV4(migrateV3(v3, ctx.timeZone), ctx) : null
    }
    if (version === 4) {
      const v4 = isValidV4(value) ? (value as unknown as GameStateV4) : null
      return v4 ? migrateV4(v4, ctx) : null
    }
    if (version === 5) return isValidV5(value) ? (value as unknown as GameState) : null
    return null
  } catch {
    return null
  }
}

/** Which schedule applies on a given day (latest entry with effectiveFrom ≤ day). */
export function scheduleForDate(
  state: GameState,
  dateKey: DateKey,
): Record<ChildId, { core: Record<number, string[]>; bonus: string[] }> {
  let best = state.scheduleHistory[0]
  for (const entry of state.scheduleHistory) {
    if (entry.effectiveFrom <= dateKey && entry.effectiveFrom >= best.effectiveFrom) best = entry
  }
  return best.schedule
}
