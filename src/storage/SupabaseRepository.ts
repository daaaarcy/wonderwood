import type { SupabaseClient } from '@supabase/supabase-js'
import { migrateState } from '../domain/migrate'
import type { Command, GameState, Result } from '../domain/types'
import { GROWN_UP_COMMANDS } from '../domain/commands'
import type { GameRepository } from './GameRepository'
import type { GrownUpGate } from './gate'

type Status = 'loading' | 'ready' | 'offline'

interface FnError {
  error?: string
  message?: string
}

/**
 * Server-backed repository: the household's versioned JSON state lives in
 * Postgres; every command round-trips the `game` edge function which runs the
 * same domain code transactionally. Realtime keeps devices in sync.
 */
export class SupabaseRepository implements GameRepository {
  private state: GameState
  private version = 0
  private readonly listeners = new Set<(s: GameState) => void>()
  private readonly statusListeners = new Set<(s: Status) => void>()
  private _status: Status = 'loading'
  private pollTimer: ReturnType<typeof setInterval> | null = null
  readonly gate: GrownUpGate
  readonly devices: NonNullable<GameRepository['devices']>

  constructor(
    private readonly sb: SupabaseClient,
    private readonly householdId: string,
    initial: { state: GameState; version: number },
  ) {
    this.state = initial.state
    this.version = initial.version
    this._status = 'ready'

    const invoke = <T>(body: Record<string, unknown>) => this.invoke<T>(body)
    this.gate = {
      hasPin: async () => (await invoke<{ hasPin: boolean }>({ action: 'hasPin', householdId })).hasPin,
      verify: async (pin) =>
        (await invoke<{ result: 'ok' | 'wrong' | 'locked' }>({
          action: 'verifyPin',
          householdId,
          pin,
        })).result,
      setPin: async (pin) => {
        await invoke({ action: 'setPin', householdId, pin })
      },
    }
    this.devices = {
      list: async () =>
        (await invoke<{ members: { userId: string; role: string; label: string | null }[] }>({
          action: 'listMembers',
          householdId,
        })).members,
      createPairingCode: async () =>
        invoke<{ code: string; expiresAt: string }>({ action: 'createPairingCode', householdId }),
      remove: async (userId) => {
        await invoke({ action: 'removeMember', householdId, userId })
      },
    }

    // realtime sync — the edge function broadcasts 'update' after every write
    this.sb
      .channel(`household:${householdId}`)
      .on('broadcast', { event: 'update' }, () => void this.refresh())
      .subscribe()
    // belt & braces: a light poll so devices sync even if a broadcast is missed
    this.pollTimer = setInterval(() => void this.refresh(), 20_000)

    const refresh = () => void this.refresh()
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') refresh()
      })
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('online', refresh)
    }
  }

  /** stop listening/polling (App owns the lifecycle) */
  dispose() {
    if (this.pollTimer) clearInterval(this.pollTimer)
    void this.sb.channel(`household:${this.householdId}`).unsubscribe()
  }

  get status(): Status {
    return this._status
  }

  subscribeStatus(listener: (s: Status) => void): () => void {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  private setStatus(s: Status) {
    if (this._status !== s) {
      this._status = s
      for (const l of this.statusListeners) l(s)
    }
  }

  private adopt(row: { state: GameState; version: number }) {
    if (row.version <= this.version) return
    this.state =
      migrateState(row.state, { now: new Date(), timeZone: this.state.timeZone }) ?? row.state
    this.version = row.version
    for (const l of this.listeners) l(this.state)
  }

  private async refresh() {
    const { data, error } = await this.sb
      .from('households')
      .select('state, version')
      .eq('id', this.householdId)
      .single()
    if (error || !data) return
    this.setStatus('ready')
    this.adopt(data as { state: GameState; version: number })
  }

  private async invoke<T>(body: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.sb.functions.invoke<T>('game', { body })
    if (error) {
      // network-level failures look offline; API errors carry our codes
      const ctx = (error as { context?: { json?: () => Promise<FnError> } }).context
      let detail: FnError | null
      try {
        detail = (await ctx?.json?.()) ?? null
      } catch {
        detail = null
      }
      if (!detail) {
        this.setStatus('offline')
        throw new Error('offline')
      }
      throw Object.assign(new Error(detail.error ?? 'error'), { code: detail.error })
    }
    this.setStatus('ready')
    return data as T
  }

  async dispatch(cmd: Command, opts?: { pin?: string }): Promise<Result<unknown>> {
    try {
      const pin = GROWN_UP_COMMANDS.has(cmd.type) ? opts?.pin : undefined
      const out = await this.invoke<{
        result: Result<unknown>
        state: GameState
        version: number
      }>({ action: 'command', householdId: this.householdId, command: cmd, pin })
      if (out.state && out.version > this.version) this.adopt(out)
      return out.result
    } catch (e) {
      const code = (e as { code?: string }).code
      if (code === 'offline' || (e as Error).message === 'offline') throw e
      // pin/auth failures surface as domain-shaped errors so the UI can react
      return { ok: false, error: (code ?? 'unknown') as never }
    }
  }

  load(): GameState {
    return this.state
  }

  subscribe(listener: (s: GameState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}
