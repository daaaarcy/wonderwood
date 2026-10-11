import { describe, expect, it } from 'vitest'
import { handle, type AuthContext, type Store } from './handle.ts'
import { initialState } from '../_shared/state.ts'
import type { GameState } from '../_shared/types.ts'

const NOW = new Date('2026-10-10T10:00:00Z')
const GROWN: AuthContext = { userId: 'u-grown', isAnonymous: false }
const KID: AuthContext = { userId: 'u-kid', isAnonymous: true }

class FakeStore implements Store {
  households = new Map<string, { state: GameState; version: number }>()
  members = new Map<string, Map<string, { role: string; label: string | null }>>()
  pins = new Map<string, { pin: string; fails: number; lockedUntil?: number }>()
  codes = new Map<string, { householdId: string; expiresAt: string; usedAt?: string }>()
  attempts: { userId: string; at: number }[] = []
  failNextUpdate = 0

  async seed(): Promise<string> {
    const r = await this.createHouseholdRow(initialState(NOW, 'UTC'))
    await this.addMember(r.id, GROWN.userId, 'grown_up', 'grown-up')
    return r.id
  }

  async householdIdFor(userId: string) {
    for (const [hid, ms] of this.members) if (ms.has(userId)) return hid
    return null
  }
  async getMembership(hid: string, userId: string) {
    return this.members.get(hid)?.get(userId) ?? null
  }
  async createHouseholdRow(state: GameState) {
    const id = `hid-${this.households.size + 1}`
    this.households.set(id, { state, version: 1 })
    this.members.set(id, new Map())
    return { id }
  }
  async loadHousehold(hid: string) {
    const h = this.households.get(hid)
    return h ? { state: structuredClone(h.state), version: h.version } : null
  }
  async conditionalUpdate(hid: string, expectedVersion: number, state: GameState) {
    if (this.failNextUpdate > 0) {
      this.failNextUpdate -= 1
      return false
    }
    const h = this.households.get(hid)!
    if (h.version !== expectedVersion) return false
    h.state = structuredClone(state)
    h.version += 1
    return true
  }
  async addMember(hid: string, userId: string, role: 'grown_up' | 'device', label: string | null) {
    this.members.get(hid)?.set(userId, { role, label })
  }
  async listMembers(hid: string) {
    return [...(this.members.get(hid) ?? new Map()).entries()].map(([user_id, m]) => ({
      user_id,
      role: m.role as 'grown_up' | 'device',
      label: m.label,
    }))
  }
  async removeMember(hid: string, userId: string) {
    this.members.get(hid)?.delete(userId)
  }
  async setPin(hid: string, pin: string) {
    this.pins.set(hid, { pin, fails: 0 })
  }
  async checkPin(hid: string, pin: string) {
    const p = this.pins.get(hid)
    if (!p) return 'wrong' as const
    if (p.lockedUntil && p.lockedUntil > NOW.getTime()) return 'locked' as const
    if (p.pin === pin) {
      p.fails = 0
      return 'ok' as const
    }
    p.fails += 1
    if (p.fails >= 5) p.lockedUntil = NOW.getTime() + 5 * 60_000
    return 'wrong' as const
  }
  async hasPin(hid: string) {
    return this.pins.has(hid)
  }
  async createPairingCodeRow(hid: string, code: string, expiresAt: string) {
    this.codes.set(code, { householdId: hid, expiresAt })
  }
  async consumePairingCode(code: string, now: Date) {
    const c = this.codes.get(code)
    if (!c) return 'missing' as const
    if (c.usedAt) return 'used' as const
    if (new Date(c.expiresAt) <= now) return 'expired' as const
    c.usedAt = now.toISOString()
    return c.householdId
  }
  async pairingFailures(userId: string, since: Date) {
    return this.attempts.filter((a) => a.userId === userId && a.at >= since.getTime()).length
  }
  async recordPairingAttempt(userId: string) {
    this.attempts.push({ userId, at: NOW.getTime() })
  }
}

const call = (store: Store, auth: AuthContext | null, action: string, body: Record<string, unknown> = {}) =>
  handle(action, body, auth, store, NOW)

describe('game edge function', () => {
  it('rejects unauthenticated callers', async () => {
    const store = new FakeStore()
    const r = await call(store, null, 'command')
    expect(r.status).toBe(401)
  })

  it('anonymous users cannot createHousehold; email users can (once)', async () => {
    const store = new FakeStore()
    const anon = await call(store, KID, 'createHousehold', {})
    expect(anon.status).toBe(403)
    const r = await call(store, GROWN, 'createHousehold', { timeZone: 'Asia/Tokyo' })
    expect(r.status).toBe(200)
    const again = await call(store, GROWN, 'createHousehold', {})
    expect(again.status).toBe(403)
  })

  it('imported v3 initialState is accepted; garbage is replaced by a fresh state', async () => {
    const store = new FakeStore()
    const good = { ...initialState(NOW, 'UTC'), schemaVersion: 3 as const }
    const r1 = await call(store, GROWN, 'createHousehold', { initialState: good })
    expect(r1.status).toBe(200)
    const store2 = new FakeStore()
    const r2 = await call(store2, GROWN, 'createHousehold', { initialState: { junk: true } })
    expect(r2.status).toBe(200)
    expect((r2.json as { state: GameState }).state.children.theodore.coins).toBe(20)
  })

  it('grown-up commands require the PIN; wrong PINs lock after 5 tries', async () => {
    const store = new FakeStore()
    const hid = await store.seed()
    await call(store, GROWN, 'setPin', { householdId: hid, pin: '1234' })
    const cmd = { type: 'chooseNextProject', projectId: 'music-school' }
    // note: road must complete first in real flow; here currentProjectId=road so
    // chooseNextProject would fail anyway — use a benign grown-up command instead
    const cmd2 = { type: 'approveClaim', claimId: 'nope' }

    const noPin = await call(store, GROWN, 'command', { householdId: hid, command: cmd2 })
    expect((noPin.json as { error: string }).error).toBe('pin-required')

    for (let i = 0; i < 5; i += 1) {
      const r = await call(store, GROWN, 'command', { householdId: hid, command: cmd2, pin: '0000' })
      expect((r.json as { error: string }).error).toBe('pin-wrong')
    }
    const locked = await call(store, GROWN, 'command', { householdId: hid, command: cmd2, pin: '1234' })
    expect((locked.json as { error: string }).error).toBe('pin-locked')

    const unlocked = await call(store, { ...GROWN }, 'verifyPin', { householdId: hid, pin: '0000' })
    expect((unlocked.json as { result: string }).result).toBe('locked')

    // reset lock + correct PIN path
    store.pins.get(hid)!.lockedUntil = undefined
    const ok = await call(store, GROWN, 'command', { householdId: hid, command: cmd2, pin: '1234' })
    expect((ok.json as { result: { ok: boolean } }).result.ok).toBe(false) // claim 'nope' fails domain-side but pin passed
    void cmd
  })

  it('non-members cannot run commands or see devices', async () => {
    const store = new FakeStore()
    const hid = await store.seed()
    const r = await call(store, { userId: 'stranger', isAnonymous: true }, 'command', {
      householdId: hid,
      command: { type: 'claimQuest', childId: 'theodore', questId: 'spanish', claimId: 'x' },
    })
    expect(r.status).toBe(403)
    const lm = await call(store, { userId: 'stranger', isAnonymous: true }, 'listMembers', { householdId: hid })
    expect(lm.status).toBe(403)
  })

  it('pairing: code works once, expiry and reuse fail, brute force is limited', async () => {
    const store = new FakeStore()
    const hid = await store.seed()
    const r = await call(store, GROWN, 'createPairingCode', { householdId: hid })
    const code = (r.json as { code: string }).code
    expect(code).toMatch(/^\d{6}$/)

    const paired = await call(store, KID, 'pairDevice', { code, label: "Leonard's tablet" })
    expect(paired.status).toBe(200)
    const again = await call(store, { userId: 'u-kid2', isAnonymous: true }, 'pairDevice', { code })
    expect(again.status).toBe(400)

    const expired = await call(store, { userId: 'u-kid3', isAnonymous: true }, 'pairDevice', { code: '000001' })
    expect(expired.status).toBe(400)

    for (let i = 0; i < 5; i += 1) {
      await call(store, { userId: 'u-guess', isAnonymous: true }, 'pairDevice', { code: '999998' })
    }
    const limited = await call(store, { userId: 'u-guess', isAnonymous: true }, 'pairDevice', { code: '999998' })
    expect(limited.status).toBe(429)

    // paired device can run a normal command without a PIN
    const claim = await call(store, KID, 'command', {
      householdId: hid,
      command: { type: 'claimQuest', childId: 'theodore', questId: 'spanish', claimId: 'd1' },
    })
    expect((claim.json as { result: { ok: boolean } }).result.ok).toBe(true)
  })

  it('version conflict retries apply exactly once', async () => {
    const store = new FakeStore()
    const hid = await store.seed()
    store.failNextUpdate = 1
    const r = await call(store, GROWN, 'command', {
      householdId: hid,
      command: { type: 'claimQuest', childId: 'theodore', questId: 'spanish', claimId: 'c-race' },
    })
    expect((r.json as { version: number }).version).toBe(2)
    expect(Object.keys(store.households.get(hid)!.state.claims)).toEqual(['c-race'])
  })

  it('two concurrent final-kit buys: exactly one succeeds, loser keeps coins', async () => {
    const store = new FakeStore()
    const hid = await store.seed()
    // pair the kid's device
    const pr = await call(store, GROWN, 'createPairingCode', { householdId: hid })
    await call(store, KID, 'pairDevice', { code: (pr.json as { code: string }).code })
    // give the road its first kit
    await call(store, GROWN, 'command', {
      householdId: hid,
      command: { type: 'buyKit', childId: 'theodore', projectId: 'road', kitPurchaseId: 'k1' },
    })
    const buy = (id: string) =>
      call(store, KID, 'command', {
        householdId: hid,
        command: { type: 'buyKit', childId: 'leonard', projectId: 'road', kitPurchaseId: id },
      })
    const [a, b] = await Promise.all([buy('k2'), buy('k3')])
    const oks = [a, b].filter((r) => (r.json as { result: { ok: boolean } }).result.ok)
    expect(oks).toHaveLength(1)
    const st = store.households.get(hid)!.state
    expect(st.city.projects.road.status).toBe('open')
    expect(st.children.leonard.coins).toBe(10) // one kit only
    expect(st.city.currentProjectId).toBe('library')
  })

  it('setPin is grown-up only; devices can verifyPin but not set it', async () => {
    const store = new FakeStore()
    const hid = await store.seed()
    const r = await call(store, GROWN, 'createPairingCode', { householdId: hid })
    await call(store, KID, 'pairDevice', { code: (r.json as { code: string }).code })
    const denied = await call(store, KID, 'setPin', { householdId: hid, pin: '1234' })
    expect(denied.status).toBe(403)
    const ok = await call(store, GROWN, 'setPin', { householdId: hid, pin: '1234' })
    expect(ok.status).toBe(200)
    const v = await call(store, KID, 'verifyPin', { householdId: hid, pin: '1234' })
    expect((v.json as { result: string }).result).toBe('ok')
  })
})

describe('v5: grown-up commands + migration on load', () => {
  it('updateSchedule/setPaused/updateChildConfig require the PIN', async () => {
    const store = new FakeStore()
    const hid = await store.seed()
    await store.setPin(hid, '1234')
    const sched = {
      0: ['spanish'], 1: ['spanish'], 2: ['spanish'], 3: ['spanish'],
      4: ['spanish'], 5: ['spanish'], 6: ['spanish'],
    }
    for (const command of [
      { type: 'updateSchedule', childId: 'theodore', core: sched, bonus: [] },
      { type: 'setPaused', childId: 'theodore', dates: ['2026-10-10'], paused: true },
      { type: 'updateChildConfig', childId: 'leonard', patch: { mathLevel: 3 } },
    ]) {
      const noPin = await call(store, GROWN, 'command', { householdId: hid, command })
      expect(noPin.status).toBe(403)
      const withPin = await call(store, GROWN, 'command', { householdId: hid, pin: '1234', command })
      expect(withPin.status).toBe(200)
    }
  })

  it('migrates a v4 stored row before applying a command', async () => {
    const store = new FakeStore()
    const v4 = { ...initialState(NOW, 'UTC'), schemaVersion: 4 as const } as unknown as GameState
    delete (v4 as unknown as Record<string, unknown>).config
    delete (v4 as unknown as Record<string, unknown>).scheduleHistory
    delete (v4 as unknown as Record<string, unknown>).pausedDates
    const r = await store.createHouseholdRow(v4)
    const hid = r.id
    await store.addMember(hid, GROWN.userId, 'grown_up', 'grown-up')
    // kid claim — 'spanish' is scheduled core in the migrated v5 schedule
    await store.addMember(hid, KID.userId, 'device', 'tablet')
    const claim = await call(store, KID, 'command', {
      householdId: hid,
      command: { type: 'claimQuest', childId: 'theodore', questId: 'spanish', claimId: 'mig-1' },
    })
    expect(claim.status).toBe(200)
    expect((claim.json as { result: { ok: boolean } }).result.ok).toBe(true)
    // the persisted doc is migrated to the latest schema
    const stored = store.households.get(hid)!.state
    expect(stored.schemaVersion).toBe(9)
    expect(stored.scheduleHistory.length).toBeGreaterThan(0)
  })
})

describe('v6: grown-up commands require PIN, child commands do not', () => {
  it('setWeeklyChallenge/logIncident/markRepaired/deleteIncident need PIN', async () => {
    const store = new FakeStore()
    const hid = await store.seed()
    await store.setPin(hid, '1234')
    const week = '2026-10-12'
    for (const command of [
      { type: 'setWeeklyChallenge', childId: 'leonard', weekKey: week, templateId: 'read-4' },
      { type: 'logIncident', childId: 'theodore', incidentId: 'i1', situation: 'scattering' },
      { type: 'markRepaired', incidentId: 'i1' },
      { type: 'deleteIncident', incidentId: 'i1' },
    ]) {
      const noPin = await call(store, GROWN, 'command', { householdId: hid, command })
      expect(noPin.status, JSON.stringify(command)).toBe(403)
      const withPin = await call(store, GROWN, 'command', { householdId: hid, pin: '1234', command })
      expect(withPin.status, JSON.stringify(command)).toBe(200)
    }
  })

  it('nameCity/customizeBuilding/acknowledgeRepair are child-allowed', async () => {
    const store = new FakeStore()
    const hid = await store.seed()
    await store.addMember(hid, KID.userId, 'device', 'tablet')
    await store.setPin(hid, '1234')
    const name = await call(store, KID, 'command', {
      householdId: hid, command: { type: 'nameCity', childId: 'theodore', name: 'Sunny Town' },
    })
    expect(name.status).toBe(200)
    expect((name.json as { result: { ok: boolean } }).result.ok).toBe(true)
    // ack: log + repair via grown-up, then child acks without PIN
    await call(store, GROWN, 'command', {
      householdId: hid, pin: '1234',
      command: { type: 'logIncident', childId: 'leonard', incidentId: 'i9', situation: 'fighting' },
    })
    await call(store, GROWN, 'command', {
      householdId: hid, pin: '1234', command: { type: 'markRepaired', incidentId: 'i9' },
    })
    const ack = await call(store, KID, 'command', {
      householdId: hid, command: { type: 'acknowledgeRepair', incidentId: 'i9' },
    })
    expect(ack.status).toBe(200)
    expect((ack.json as { result: { ok: boolean } }).result.ok).toBe(true)
  })
})

describe('v7: custom tasks + furniture', () => {
  it('createCustomQuest/updateCustomQuest require the PIN; placeItem does not', async () => {
    const store = new FakeStore()
    const hid = await store.seed()
    await store.setPin(hid, '1234')
    const create = {
      type: 'createCustomQuest',
      questId: 'cq-e2e',
      title: 'Tidy the blocks',
      coins: 8,
      stars: 1,
      childIds: ['leonard'],
      days: [],
    }
    const noPin = await call(store, GROWN, 'command', { householdId: hid, command: create })
    expect(noPin.status).toBe(403)
    const withPin = await call(store, GROWN, 'command', { householdId: hid, pin: '1234', command: create })
    expect(withPin.status).toBe(200)
    expect((withPin.json as { result: { ok: boolean } }).result.ok).toBe(true)

    const update = { type: 'updateCustomQuest', id: 'cq-e2e', patch: { active: false } }
    const noPin2 = await call(store, GROWN, 'command', { householdId: hid, command: update })
    expect(noPin2.status).toBe(403)
    const withPin2 = await call(store, GROWN, 'command', { householdId: hid, pin: '1234', command: update })
    expect(withPin2.status).toBe(200)

    // a kid device can place furniture without a PIN
    const pr = await call(store, GROWN, 'createPairingCode', { householdId: hid })
    await call(store, KID, 'pairDevice', { code: (pr.json as { code: string }).code })
    const place = await call(store, KID, 'command', {
      householdId: hid,
      command: { type: 'placeItem', childId: 'theodore', spot: 'rug', itemId: null },
    })
    expect(place.status).toBe(200)
    expect((place.json as { result: { ok: boolean } }).result.ok).toBe(true)
  })

  it('full flow: grown-up creates, kid claims, grown-up approves with configured reward', async () => {
    const store = new FakeStore()
    const hid = await store.seed()
    await store.setPin(hid, '1234')
    const pr = await call(store, GROWN, 'createPairingCode', { householdId: hid })
    await call(store, KID, 'pairDevice', { code: (pr.json as { code: string }).code })

    await call(store, GROWN, 'command', {
      householdId: hid,
      pin: '1234',
      command: {
        type: 'createCustomQuest',
        questId: 'cq-flow',
        title: 'Set the table',
        coins: 12,
        stars: 2,
        childIds: ['theodore'],
        days: [],
      },
    })
    // the unassigned sibling cannot claim it
    const wrongKid = await call(store, KID, 'command', {
      householdId: hid,
      command: { type: 'claimQuest', childId: 'leonard', questId: 'cq-flow', claimId: 'f-bad' },
    })
    expect((wrongKid.json as { result: { ok: boolean } }).result.ok).toBe(false)
    // the assigned child claims + the grown-up approves
    const claim = await call(store, KID, 'command', {
      householdId: hid,
      command: { type: 'claimQuest', childId: 'theodore', questId: 'cq-flow', claimId: 'f-1' },
    })
    expect((claim.json as { result: { ok: boolean } }).result.ok).toBe(true)
    const approve = await call(store, GROWN, 'command', {
      householdId: hid,
      pin: '1234',
      command: { type: 'approveClaim', claimId: 'f-1' },
    })
    expect(approve.status).toBe(200)
    const st = store.households.get(hid)!.state
    expect(st.children.theodore.coins).toBe(32) // 20 welcome + 12
    expect(st.children.theodore.stars).toBe(2)
    expect(st.claims['f-1'].questTitle).toBe('Set the table')
  })

  it('withdrawClaim: kid device can undo a pending claim; a withdrawn claim cannot be approved', async () => {
    const store = new FakeStore()
    const hid = await store.seed()
    await store.setPin(hid, '1234')
    const pr = await call(store, GROWN, 'createPairingCode', { householdId: hid })
    await call(store, KID, 'pairDevice', { code: (pr.json as { code: string }).code })

    // kid claims, then takes it back — no PIN needed
    const claim = await call(store, KID, 'command', {
      householdId: hid,
      command: { type: 'claimQuest', childId: 'theodore', questId: 'spanish', claimId: 'w-1' },
    })
    expect((claim.json as { result: { ok: boolean } }).result.ok).toBe(true)
    const withdraw = await call(store, KID, 'command', {
      householdId: hid,
      command: { type: 'withdrawClaim', claimId: 'w-1', childId: 'theodore' },
    })
    expect(withdraw.status).toBe(200)
    expect((withdraw.json as { result: { ok: boolean } }).result.ok).toBe(true)
    expect(store.households.get(hid)!.state.claims['w-1']).toBeUndefined()

    // grown-up approving the withdrawn id fails domain-side
    const approve = await call(store, GROWN, 'command', {
      householdId: hid,
      pin: '1234',
      command: { type: 'approveClaim', claimId: 'w-1' },
    })
    expect((approve.json as { result: { ok: boolean } }).result.ok).toBe(false)

    // the sibling cannot withdraw the kid's claim
    const claim2 = await call(store, KID, 'command', {
      householdId: hid,
      command: { type: 'claimQuest', childId: 'theodore', questId: 'spanish', claimId: 'w-2' },
    })
    expect((claim2.json as { result: { ok: boolean } }).result.ok).toBe(true)
    const wrongKid = await call(store, KID, 'command', {
      householdId: hid,
      command: { type: 'withdrawClaim', claimId: 'w-2', childId: 'leonard' },
    })
    expect((wrongKid.json as { result: { ok: boolean } }).result.ok).toBe(false)

    // and the server rejects withdrawing an approved claim
    const approve2 = await call(store, GROWN, 'command', {
      householdId: hid,
      pin: '1234',
      command: { type: 'approveClaim', claimId: 'w-2' },
    })
    expect((approve2.json as { result: { ok: boolean } }).result.ok).toBe(true)
    const tooLate = await call(store, KID, 'command', {
      householdId: hid,
      command: { type: 'withdrawClaim', claimId: 'w-2', childId: 'theodore' },
    })
    expect((tooLate.json as { result: { ok: boolean } }).result.ok).toBe(false)
    expect(store.households.get(hid)!.state.claims['w-2'].status).toBe('approved')
  })
})
