import type { Command, GameState, Result } from '../domain/types'
import type { GrownUpGate } from './gate'

/**
 * Persistence boundary for the whole app. Stage 1 ships a
 * LocalStorageRepository; swap this interface for a backend later
 * without touching domain, scenes, or UI.
 */
export interface GameRepository {
  /** Current in-memory state (always loaded eagerly). */
  load(): GameState
  /** Apply a domain command; persists + notifies on success. Async so a
   *  server-backed repository can share the interface. Grown-up commands
   *  must carry the PIN the grown-up just entered. */
  dispatch(cmd: Command, opts?: { pin?: string }): Promise<Result<unknown>>
  /** Connectivity/load hint for server-backed repositories. */
  status?: 'loading' | 'ready' | 'offline'
  subscribeStatus?(listener: (s: 'loading' | 'ready' | 'offline') => void): () => void
  /** The grown-up PIN gate for this household. */
  gate: GrownUpGate
  /** Device management — Supabase mode only. */
  devices?: {
    list(): Promise<{ userId: string; role: string; label: string | null }[]>
    createPairingCode(): Promise<{ code: string; expiresAt: string }>
    remove(userId: string): Promise<void>
  }
  /** Called after every state change, including cross-tab updates. */
  subscribe(listener: () => void): () => void
}
