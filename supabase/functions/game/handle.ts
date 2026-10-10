/**
 * Pure-ish request logic for the `game` edge function — no Deno/Supabase
 * imports, so vitest can exercise it against an in-memory Store.
 */
import { applyCommand, GROWN_UP_COMMANDS } from '../_shared/commands.ts'
import { migrateState } from '../_shared/migrate.ts'
import { initialState } from '../_shared/state.ts'
import type { Command, GameState } from '../_shared/types.ts'
import { commandDeps } from '../_shared/deps.ts'

export interface AuthContext {
  userId: string
  isAnonymous: boolean
}

export interface MemberRow {
  user_id: string
  role: 'grown_up' | 'device'
  label: string | null
}

export interface Store {
  /** the household id this user belongs to, or null */
  householdIdFor(userId: string): Promise<string | null>
  getMembership(householdId: string, userId: string): Promise<{ role: string } | null>
  createHouseholdRow(state: GameState): Promise<{ id: string }>
  loadHousehold(householdId: string): Promise<{ state: GameState; version: number } | null>
  conditionalUpdate(householdId: string, expectedVersion: number, state: GameState): Promise<boolean>
  addMember(householdId: string, userId: string, role: 'grown_up' | 'device', label: string | null): Promise<void>
  listMembers(householdId: string): Promise<MemberRow[]>
  removeMember(householdId: string, userId: string): Promise<void>
  setPin(householdId: string, pin: string): Promise<void>
  /** 'ok' | 'wrong' | 'locked' */
  checkPin(householdId: string, pin: string): Promise<'ok' | 'wrong' | 'locked'>
  hasPin(householdId: string): Promise<boolean>
  createPairingCodeRow(householdId: string, code: string, expiresAt: string): Promise<void>
  /** claim a valid, unexpired, unused code → household id */
  consumePairingCode(code: string, now: Date): Promise<string | 'expired' | 'used' | 'missing'>
  pairingFailures(userId: string, since: Date): Promise<number>
  recordPairingAttempt(userId: string): Promise<void>
}

export interface Reply {
  status: number
  json: unknown
}

const ok200 = (json: unknown): Reply => ({ status: 200, json })
const bad = (code: string, message: string, status = 403): Reply => ({
  status,
  json: { error: code, message },
})

const PIN_RE = /^\d{4}$/
const CODE_RE = /^\d{6}$/


async function requireMembership(
  store: Store,
  auth: AuthContext,
  householdId: string,
): Promise<{ role: string } | Reply> {
  const m = await store.getMembership(householdId, auth.userId)
  if (!m) return bad('not-a-member', 'You are not part of this household.', 403)
  return m
}

export async function handle(
  action: string,
  body: Record<string, unknown>,
  auth: AuthContext | null,
  store: Store,
  now: Date,
): Promise<Reply> {
  if (!auth) return bad('unauthorized', 'Sign in first.', 401)

  switch (action) {
    case 'createHousehold': {
      if (auth.isAnonymous) return bad('anonymous-not-allowed', 'A grown-up account is needed to create a household.')
      if (await store.householdIdFor(auth.userId)) {
        return bad('already-in-household', 'This account already has a household.')
      }
      let state: GameState
      const tz = typeof body.timeZone === 'string' ? body.timeZone : 'UTC'
      const imported = migrateState(body.initialState, { now, timeZone: tz })
      if (body.initialState != null && imported) {
        state = imported
      } else {
        state = initialState(now, tz)
      }
      const row = await store.createHouseholdRow(state)
      await store.addMember(row.id, auth.userId, 'grown_up', 'grown-up')
      return ok200({ householdId: row.id, state, version: 1 })
    }

    case 'setPin': {
      const pin = String(body.pin ?? '')
      if (!PIN_RE.test(pin)) return bad('invalid-pin', 'The PIN must be exactly 4 digits.', 400)
      const m = await requireMembership(store, auth, String(body.householdId))
      if ('status' in m) return m
      if (m.role !== 'grown_up') return bad('grown-up-only', 'Only a grown-up can set the PIN.')
      await store.setPin(String(body.householdId), pin)
      return ok200({ ok: true })
    }

    case 'verifyPin': {
      const hid = String(body.householdId)
      const m = await requireMembership(store, auth, hid)
      if ('status' in m) return m
      const pin = String(body.pin ?? '')
      const r = await store.checkPin(hid, pin)
      if (r === 'ok') return ok200({ result: 'ok' })
      if (r === 'locked') return ok200({ result: 'locked' })
      return ok200({ result: 'wrong' })
    }

    case 'hasPin': {
      const hid = String(body.householdId)
      const m = await requireMembership(store, auth, hid)
      if ('status' in m) return m
      return ok200({ hasPin: await store.hasPin(hid) })
    }

    case 'createPairingCode': {
      const hid = String(body.householdId)
      const m = await requireMembership(store, auth, hid)
      if ('status' in m) return m
      if (m.role !== 'grown_up') return bad('grown-up-only', 'Only a grown-up can add devices.')
      // uniform 6-digit code: rejection-sample digits so 0-9 are exactly even
      const chars: string[] = []
      while (chars.length < 6) {
        const buf = new Uint32Array(8)
        crypto.getRandomValues(buf)
        for (const d of buf) {
          if (chars.length >= 6) break
          if (d < 4_000_000_000) chars.push(String(d % 10))
        }
      }
      const code = chars.join('')
      const expiresAt = new Date(now.getTime() + 10 * 60_000).toISOString()
      await store.createPairingCodeRow(hid, code, expiresAt)
      return ok200({ code, expiresAt })
    }

    case 'pairDevice': {
      const code = String(body.code ?? '')
      const label = typeof body.label === 'string' ? body.label.slice(0, 40) : null
      if (!CODE_RE.test(code)) return bad('bad-code', 'That is not a valid code.', 400)
      if (await store.householdIdFor(auth.userId)) {
        return bad('already-paired', 'This device is already paired.')
      }
      const failures = await store.pairingFailures(auth.userId, new Date(now.getTime() - 10 * 60_000))
      if (failures >= 5) return bad('too-many-tries', 'Too many tries — wait a bit and try again.', 429)
      const result = await store.consumePairingCode(code, now)
      if (result === 'missing' || result === 'expired' || result === 'used') {
        await store.recordPairingAttempt(auth.userId)
        return bad('bad-code', 'That code does not work — check it and try again.', 400)
      }
      await store.addMember(result, auth.userId, 'device', label)
      return ok200({ householdId: result })
    }

    case 'listMembers': {
      const hid = String(body.householdId)
      const m = await requireMembership(store, auth, hid)
      if ('status' in m) return m
      if (m.role !== 'grown_up') return bad('grown-up-only', 'Only a grown-up can see devices.')
      return ok200({ members: await store.listMembers(hid) })
    }

    case 'removeMember': {
      const hid = String(body.householdId)
      const target = String(body.userId ?? '')
      const m = await requireMembership(store, auth, hid)
      if ('status' in m) return m
      if (m.role !== 'grown_up') return bad('grown-up-only', 'Only a grown-up can remove devices.')
      if (target === auth.userId) return bad('cannot-remove-self', 'A grown-up cannot remove themselves.', 400)
      await store.removeMember(hid, target)
      return ok200({ ok: true })
    }

    case 'command': {
      const hid = String(body.householdId)
      const m = await requireMembership(store, auth, hid)
      if ('status' in m) return m
      const command = body.command as Command | undefined
      if (!command || typeof command.type !== 'string') {
        return bad('bad-command', 'Missing command.', 400)
      }
      if (GROWN_UP_COMMANDS.has(command.type as Command['type'])) {
        const pin = String(body.pin ?? '')
        if (!pin) return bad('pin-required', 'Enter the grown-up PIN first.', 403)
        const r = await store.checkPin(hid, pin)
        if (r === 'locked') return bad('pin-locked', 'Too many wrong PINs — wait a few minutes.', 423)
        if (r !== 'ok') return bad('pin-wrong', 'That PIN is not right.', 403)
      }
      // conditional update with retry: another device may write concurrently
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const row = await store.loadHousehold(hid)
        if (!row) return bad('not-found', 'Household not found.', 404)
        const current =
          migrateState(row.state, { now, timeZone: (row.state as { timeZone?: string }).timeZone ?? 'UTC' }) ??
          row.state
        const { state, result } = applyCommand(current, command, now, commandDeps)
        if (!result.ok) return ok200({ result, version: row.version, state: row.state })
        const wrote = await store.conditionalUpdate(hid, row.version, state)
        if (wrote) return ok200({ result, state, version: row.version + 1 })
      }
      return bad('conflict', 'Busy — try again.', 409)
    }

    default:
      return bad('unknown-action', `Unknown action "${action}".`, 400)
  }
}
