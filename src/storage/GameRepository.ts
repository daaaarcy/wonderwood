import type { Command, GameState, Result } from '../domain/types'

/**
 * Persistence boundary for the whole app. Stage 1 ships a
 * LocalStorageRepository; swap this interface for a backend later
 * without touching domain, scenes, or UI.
 */
export interface GameRepository {
  /** Current in-memory state (always loaded eagerly). */
  load(): GameState
  /** Apply a domain command; persists + notifies on success. Async so a
   *  server-backed repository can share the interface. */
  dispatch(cmd: Command): Promise<Result<unknown>>
  /** Connectivity/load hint for server-backed repositories. */
  status?: 'loading' | 'ready' | 'offline'
  /** Called after every state change, including cross-tab updates. */
  subscribe(listener: () => void): () => void
}
