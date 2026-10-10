import { applyCommand } from '../domain/commands'
import { migrateState } from '../domain/migrate'
import { initialState } from '../domain/state'
import type { Command, CommandDeps, GameState, Result } from '../domain/types'
import { localGrownUpGate, type GrownUpGate } from './gate'
import type { GameRepository } from './GameRepository'

export const STORAGE_KEY = 'wonderwood:v1'
const CORRUPT_PREFIX = 'wonderwood:v1:corrupt-'

/** Parse raw JSON → current-schema GameState (migrating older saves), or null. */
export function parseStoredState(raw: string, timeZone = 'UTC'): GameState | null {
  return migrateState(raw, { now: new Date(), timeZone })
}

export class LocalStorageRepository implements GameRepository {
  readonly gate: GrownUpGate = localGrownUpGate()
  private state: GameState
  private listeners = new Set<() => void>()
  private readonly storage: Storage
  private readonly deps: CommandDeps
  private readonly key: string
  private readonly timeZone: string
  private readonly onStorage: ((e: StorageEvent) => void) | null = null

  constructor(storage: Storage, deps: CommandDeps, key: string = STORAGE_KEY) {
    this.storage = storage
    this.deps = deps
    this.key = key
    try {
      this.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    } catch {
      this.timeZone = 'UTC'
    }
    this.state = this.read()

    // Cross-tab sync: a parent approving in another tab updates this tab live.
    if (typeof window !== 'undefined' && storage === window.localStorage) {
      this.onStorage = (e: StorageEvent) => {
        if (e.key !== this.key || e.newValue === null) return
        const parsed = parseStoredState(e.newValue, this.timeZone)
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
      const fresh = initialState(new Date(), this.timeZone)
      this.storage.setItem(this.key, JSON.stringify(fresh))
      return fresh
    }
    const parsed = parseStoredState(raw, this.timeZone)
    if (parsed) return parsed
    // Unknown schema or corrupt data: keep a backup copy, then start fresh.
    try {
      this.storage.setItem(`${CORRUPT_PREFIX}${Date.now()}`, raw)
    } catch {
      // Backup is best-effort; never block a fresh start.
    }
    const fresh = initialState(new Date(), this.timeZone)
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

  dispatch(cmd: Command): Promise<Result<unknown>> {
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
    return Promise.resolve(result)
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
