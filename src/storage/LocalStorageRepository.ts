import { applyCommand } from '../domain/commands'
import { initialState } from '../domain/state'
import type { Command, CommandDeps, GameState, Result } from '../domain/types'
import type { GameRepository } from './GameRepository'

export const STORAGE_KEY = 'wonderwood:v1'
const CORRUPT_PREFIX = 'wonderwood:v1:corrupt-'

function isValidV1(value: Record<string, unknown>): boolean {
  const s = value as { children?: Record<string, { coins?: unknown; stars?: unknown; inventory?: unknown; equipped?: unknown }>; claims?: unknown; purchases?: unknown; ledger?: unknown }
  if (typeof s.children !== 'object' || s.children === null) return false
  for (const id of ['theodore', 'leonard'] as const) {
    const c = s.children[id]
    if (!c || typeof c.coins !== 'number' || typeof c.stars !== 'number') return false
    if (!Array.isArray(c.inventory) || typeof c.equipped !== 'object' || c.equipped === null) {
      return false
    }
  }
  if (typeof s.claims !== 'object' || s.claims === null) return false
  if (typeof s.purchases !== 'object' || s.purchases === null) return false
  if (!Array.isArray(s.ledger)) return false
  return true
}

function isValidV2(value: Record<string, unknown>): boolean {
  if (!isValidV1(value)) return false
  const s = value as unknown as GameState
  if (typeof s.createdAt !== 'string') return false
  for (const id of ['theodore', 'leonard'] as const) {
    const league = s.children[id].league
    if (!league || typeof league.rank !== 'number' || typeof league.evaluatedWeeks !== 'object') {
      return false
    }
  }
  if (typeof s.settings !== 'object' || s.settings === null || typeof s.settings.sound !== 'boolean') {
    return false
  }
  return true
}

/** v1 → v2: preserve everything; league starts at rank 1, sound on. */
function migrateV1(v1: Record<string, unknown>): GameState | null {
  if (!isValidV1(v1)) return null
  const s = v1 as unknown as Omit<GameState, 'schemaVersion' | 'createdAt' | 'settings'>
  const createdAt =
    s.ledger.length > 0
      ? s.ledger.map((e: { at: string }) => e.at).sort()[0]
      : new Date().toISOString()
  return {
    schemaVersion: 2,
    createdAt,
    children: {
      theodore: { ...s.children.theodore, league: { rank: 1, evaluatedWeeks: {}, unseenPromotion: null } },
      leonard: { ...s.children.leonard, league: { rank: 1, evaluatedWeeks: {}, unseenPromotion: null } },
    },
    claims: s.claims,
    purchases: s.purchases,
    ledger: s.ledger,
    parentPinHash: typeof s.parentPinHash === 'string' ? s.parentPinHash : null,
    settings: { sound: true },
  }
}

/** Parse raw JSON → current-schema GameState (migrating v1), or null. */
export function parseStoredState(raw: string): GameState | null {
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return null
    const version = (value as { schemaVersion?: unknown }).schemaVersion
    if (version === 2) return isValidV2(value as Record<string, unknown>) ? (value as GameState) : null
    if (version === 1) return migrateV1(value as Record<string, unknown>)
    return null
  } catch {
    return null
  }
}

export class LocalStorageRepository implements GameRepository {
  private state: GameState
  private listeners = new Set<() => void>()
  private readonly storage: Storage
  private readonly deps: CommandDeps
  private readonly key: string
  private readonly onStorage: ((e: StorageEvent) => void) | null = null

  constructor(storage: Storage, deps: CommandDeps, key: string = STORAGE_KEY) {
    this.storage = storage
    this.deps = deps
    this.key = key
    this.state = this.read()

    // Cross-tab sync: a parent approving in another tab updates this tab live.
    if (typeof window !== 'undefined' && storage === window.localStorage) {
      this.onStorage = (e: StorageEvent) => {
        if (e.key !== this.key || e.newValue === null) return
        const parsed = parseStoredState(e.newValue)
        if (parsed && parsed !== this.state) {
          this.state = parsed
          this.emit()
        }
      }
      window.addEventListener('storage', this.onStorage)
    }
  }

  private read(): GameState {
    const raw = this.storage.getItem(this.key)
    if (raw === null) {
      const fresh = initialState()
      this.storage.setItem(this.key, JSON.stringify(fresh))
      return fresh
    }
    const parsed = parseStoredState(raw)
    if (parsed) return parsed
    // Unknown schema or corrupt data: keep a backup copy, then start fresh.
    try {
      this.storage.setItem(`${CORRUPT_PREFIX}${Date.now()}`, raw)
    } catch {
      // Backup is best-effort; never block a fresh start.
    }
    const fresh = initialState()
    this.storage.setItem(this.key, JSON.stringify(fresh))
    return fresh
  }

  /** Fresh state straight from storage (another tab may have written). */
  private readCurrent(): GameState | null {
    const raw = this.storage.getItem(this.key)
    if (raw === null) return null
    return parseStoredState(raw)
  }

  private persist(): void {
    this.storage.setItem(this.key, JSON.stringify(this.state))
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }

  load(): GameState {
    return this.state
  }

  dispatch(cmd: Command): Result<unknown> {
    // Re-read first: another tab may have written since our last storage event
    // (events are async). Applying to stale state could drop an approval or
    // double-spend coins. Missing/invalid → fall back to in-memory.
    const base = this.readCurrent() ?? this.state
    const { state, result } = applyCommand(base, cmd, new Date(), this.deps)
    if (result.ok) {
      this.state = state
      this.persist()
      this.emit()
    }
    return result
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  destroy(): void {
    if (this.onStorage && typeof window !== 'undefined') {
      window.removeEventListener('storage', this.onStorage)
    }
    this.listeners.clear()
  }
}
