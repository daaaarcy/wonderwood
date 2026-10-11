import { describe, expect, it } from 'vitest'
import { LocalStorageRepository, STORAGE_KEY } from './LocalStorageRepository'
import { commandDeps } from '../data/registry'

class FakeStorage implements Storage {
  private map = new Map<string, string>()
  get length() {
    return this.map.size
  }
  clear() {
    this.map.clear()
  }
  getItem(key: string) {
    return this.map.get(key) ?? null
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null
  }
  removeItem(key: string) {
    this.map.delete(key)
  }
  setItem(key: string, value: string) {
    this.map.set(key, value)
  }
  dump() {
    return [...this.map.keys()]
  }
}

describe('LocalStorageRepository', () => {
  it('seeds a fresh state on first load and persists it', () => {
    const storage = new FakeStorage()
    const repo = new LocalStorageRepository(storage, commandDeps)
    const s = repo.load()
    expect(s.schemaVersion).toBe(7)
    expect(s.children.theodore.coins).toBe(20)
    expect(s.city.currentProjectId).toBe('road')
    expect(s.city.projects.road.status).toBe('building')
    expect(s.city.projects.library.status).toBe('locked')
    expect(s.city.foundersBridgePlanks).toBe(0)
    expect(storage.getItem(STORAGE_KEY)).toBe(JSON.stringify(s))
  })

  it('round-trips: load after save gives equal state', async () => {
    const storage = new FakeStorage()
    const repo1 = new LocalStorageRepository(storage, commandDeps)
    await repo1.dispatch({ type: 'claimQuest', childId: 'theodore', questId: 'spanish', claimId: 'c1' })
    await repo1.dispatch({ type: 'approveClaim', claimId: 'c1' })
    await repo1.dispatch({ type: 'purchase', childId: 'theodore', itemId: 'hat-leaf', purchaseId: 'p1' })
    await repo1.dispatch({ type: 'buyKit', childId: 'theodore', projectId: 'road', kitPurchaseId: 'k1' })
    const repo2 = new LocalStorageRepository(storage, commandDeps)
    expect(repo2.load()).toEqual(repo1.load())
  })

  it('falls back to fresh state on corrupt data and keeps a backup', () => {
    const storage = new FakeStorage()
    storage.setItem(STORAGE_KEY, '{not-json!!')
    const repo = new LocalStorageRepository(storage, commandDeps)
    expect(repo.load().children.theodore.coins).toBe(20)
    const backups = storage.dump().filter((k) => k.startsWith('wonderwood:v1:corrupt-'))
    expect(backups).toHaveLength(1)
    expect(storage.getItem(backups[0])).toBe('{not-json!!')
  })

  it('falls back on unknown schemaVersion with a backup', () => {
    const storage = new FakeStorage()
    storage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 99, children: {} }))
    const repo = new LocalStorageRepository(storage, commandDeps)
    expect(repo.load().schemaVersion).toBe(7)
    expect(storage.dump().some((k) => k.includes('corrupt'))).toBe(true)
  })

  it('dispatch re-reads storage: a stale tab cannot double-spend or drop approvals', async () => {
    const storage = new FakeStorage()
    const repoA = new LocalStorageRepository(storage, commandDeps)
    const repoB = new LocalStorageRepository(storage, commandDeps) // never gets storage events

    // A approves a claim, then A buys the hat (coins 30 → 10)
    await repoA.dispatch({ type: 'claimQuest', childId: 'theodore', questId: 'spanish', claimId: 'c1' })
    await repoA.dispatch({ type: 'approveClaim', claimId: 'c1' })
    await repoA.dispatch({ type: 'purchase', childId: 'theodore', itemId: 'hat-leaf', purchaseId: 'pA' })
    expect(repoA.load().children.theodore.coins).toBe(10)

    // Stale B (still holding 20 coins, no hat) tries to buy the same hat:
    // must fail already-owned — coins must NOT go 10 → -10.
    const r = await repoB.dispatch({ type: 'purchase', childId: 'theodore', itemId: 'hat-leaf', purchaseId: 'pB' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('already-owned')
    const stored = JSON.parse(storage.getItem(STORAGE_KEY)!)
    expect(stored.children.theodore.coins).toBe(10)

    // B dispatches something unrelated — A's award and purchase survive.
    await repoB.dispatch({ type: 'setWish', childId: 'leonard', itemId: 'hat-leaf' })
    const stored2 = JSON.parse(storage.getItem(STORAGE_KEY)!)
    expect(stored2.children.theodore.coins).toBe(10)
    expect(stored2.children.theodore.inventory).toContain('hat-leaf')
    expect(stored2.children.leonard.wishItem).toBe('hat-leaf')
    expect(stored2.claims.c1.status).toBe('approved')
  })

  it('two stale repos racing for the final road kit: only one succeeds', async () => {
    const storage = new FakeStorage()
    const repoA = new LocalStorageRepository(storage, commandDeps)
    const repoB = new LocalStorageRepository(storage, commandDeps)

    // Theodore gets 10 more coins, Leonard keeps his 20.
    await repoA.dispatch({ type: 'claimQuest', childId: 'theodore', questId: 'spanish', claimId: 'c1' })
    await repoA.dispatch({ type: 'approveClaim', claimId: 'c1' })
    await repoA.dispatch({ type: 'buyKit', childId: 'theodore', projectId: 'road', kitPurchaseId: 'k1' })
    expect(repoA.load().city.projects.road.kits).toBe(1)

    // Stale B (sees 0 kits) buys the final kit → road opens.
    const win = await repoB.dispatch({ type: 'buyKit', childId: 'leonard', projectId: 'road', kitPurchaseId: 'k2' })
    expect(win.ok).toBe(true)
    expect(repoB.load().city.projects.road.status).toBe('open')
    expect(repoB.load().city.currentProjectId).toBe('library')

    // Now stale A still thinks the road needs kits — its buy must fail and
    // keep its coins (Theodore has 20 left after buying kit k1... 30-10=20).
    const lose = await repoA.dispatch({ type: 'buyKit', childId: 'theodore', projectId: 'road', kitPurchaseId: 'k3' })
    expect(lose.ok).toBe(false)
    if (!lose.ok) {
      expect(['not-current-project', 'project-complete']).toContain(lose.error.code)
    }
    const stored = JSON.parse(storage.getItem(STORAGE_KEY)!)
    expect(stored.children.theodore.coins).toBe(20)
    expect(stored.children.leonard.coins).toBe(10)
    expect(stored.city.projects.road.kits).toBe(2)
  })

  it('migrates a v1 save to v4 without the corrupt-backup path', () => {
    const storage = new FakeStorage()
    const v1 = {
      schemaVersion: 1,
      children: {
        theodore: { coins: 33, stars: 2, inventory: ['toy-train', 'hat-leaf'], equipped: { hat: 'hat-leaf', toy: 'toy-train' }, wishItem: null },
        leonard: { coins: 20, stars: 0, inventory: ['toy-train'], equipped: { hat: null, toy: 'toy-train' }, wishItem: null },
      },
      claims: {},
      purchases: {},
      ledger: [
        { id: 'welcome-theodore', childId: 'theodore', coins: 20, stars: 0, reason: 'welcome', refId: 'welcome', at: '2026-09-01T08:00:00.000Z' },
        { id: 'welcome-leonard', childId: 'leonard', coins: 20, stars: 0, reason: 'welcome', refId: 'welcome', at: '2026-09-02T08:00:00.000Z' },
      ],
      parentPinHash: 'abc123',
    }
    storage.setItem(STORAGE_KEY, JSON.stringify(v1))
    const repo = new LocalStorageRepository(storage, commandDeps)
    const s = repo.load()
    expect(s.schemaVersion).toBe(7)
    expect(s.createdAt).toBe('2026-09-01T08:00:00.000Z') // earliest ledger entry
    expect(s.children.theodore.coins).toBe(33)
    expect(s.children.theodore.inventory).toContain('hat-leaf')
    expect(s.children.theodore.league.rank).toBe(1)
    expect(s.children.theodore.league.evaluatedWeeks).toEqual({})
    expect(s.settings.sound).toBe(true)
    // city: fresh town + founders' keepsake (2 stars → 2 planks)
    expect(s.city.currentProjectId).toBe('road')
    expect(s.city.foundersBridgePlanks).toBe(2)
    // no corrupt backup was made
    expect(storage.dump().some((k) => k.includes('corrupt'))).toBe(false)
  })

  it('migrates a v2 save to v4 and freezes the star-bridge as a keepsake', () => {
    const storage = new FakeStorage()
    const child = (coins: number, stars: number) => ({
      coins,
      stars,
      inventory: ['toy-train'],
      equipped: { hat: null, toy: 'toy-train' },
      wishItem: null,
      league: { rank: 3, evaluatedWeeks: { '2026-10-05': { promoted: true } }, unseenPromotion: null },
    })
    const v2 = {
      schemaVersion: 2,
      createdAt: '2026-10-05T09:00:00.000Z',
      children: { theodore: child(45, 4), leonard: child(20, 3) },
      claims: {},
      purchases: {},
      ledger: [
        { id: 'welcome-theodore', childId: 'theodore', coins: 20, stars: 0, reason: 'welcome', refId: 'welcome', at: '2026-10-05T09:00:00.000Z' },
      ],
      parentPinHash: 'def456',
      settings: { sound: false },
    }
    storage.setItem(STORAGE_KEY, JSON.stringify(v2))
    const repo = new LocalStorageRepository(storage, commandDeps)
    const s = repo.load()
    expect(s.schemaVersion).toBe(7)
    expect(s.children.theodore.coins).toBe(45)
    expect(s.children.theodore.league.rank).toBe(3)
    expect(s.children.theodore.league.evaluatedWeeks['2026-10-05']).toEqual({ promoted: true })
    expect(s.settings.sound).toBe(false)
    expect(s.city.foundersBridgePlanks).toBe(7) // 4 + 3 stars, capped at 12
    expect(s.city.projects.road).toEqual({ kits: 0, status: 'building' })
    expect(s.city.currentProjectId).toBe('road')
    expect(storage.dump().some((k) => k.includes('corrupt'))).toBe(false)
  })

  it('notifies subscribers on successful dispatch but not on failure', async () => {
    const storage = new FakeStorage()
    const repo = new LocalStorageRepository(storage, commandDeps)
    let calls = 0
    const unsub = repo.subscribe(() => {
      calls += 1
    })
    await repo.dispatch({ type: 'claimQuest', childId: 'theodore', questId: 'spanish', claimId: 'c1' })
    expect(calls).toBe(1)
    await repo.dispatch({ type: 'approveClaim', claimId: 'nope' })
    expect(calls).toBe(1)
    unsub()
    await repo.dispatch({ type: 'approveClaim', claimId: 'c1' })
    expect(calls).toBe(1)
  })

  it('migrates a v3 save to v4: drops parentPinHash, stamps the local time zone', () => {
    const storage = new FakeStorage()
    const child = (coins: number, stars: number) => ({
      coins, stars, inventory: ['toy-train'], equipped: { hat: null, toy: 'toy-train' },
      wishItem: null,
      league: { rank: 2, evaluatedWeeks: {}, unseenPromotion: null },
    })
    const v3 = {
      schemaVersion: 3,
      createdAt: '2026-10-05T09:00:00.000Z',
      children: { theodore: child(30, 4), leonard: child(20, 3) },
      claims: {}, purchases: {}, ledger: [], parentPinHash: 'sha256-xyz',
      settings: { sound: true },
      city: {
        currentProjectId: 'library', suggestedProjectId: null,
        projects: {
          road: { kits: 2, status: 'open', openedAt: '2026-10-06T00:00:00.000Z' },
          library: { kits: 0, status: 'building' },
          'music-school': { kits: 0, status: 'locked' },
          'police-station': { kits: 0, status: 'locked' },
          hospital: { kits: 0, status: 'locked' },
        },
        kitPurchases: {}, foundersBridgePlanks: 7,
      },
    }
    storage.setItem(STORAGE_KEY, JSON.stringify(v3))
    const repo = new LocalStorageRepository(storage, commandDeps)
    const s = repo.load()
    expect(s.schemaVersion).toBe(7)
    expect('parentPinHash' in s).toBe(false)
    expect(typeof s.timeZone).toBe('string')
    expect(s.timeZone.length).toBeGreaterThan(0)
    // city survives untouched
    expect(s.city.foundersBridgePlanks).toBe(7)
    expect(s.city.projects.road.status).toBe('open')
    expect(s.city.currentProjectId).toBe('library')
    expect(storage.dump().some((k) => k.includes('corrupt'))).toBe(false)
  })
})

describe('v4 → v5 migration', () => {
  it('stamps roles/rewards on old claims and installs both schedule entries', () => {
    const storage = new FakeStorage()
    const oldClaim = {
      id: 'c1', childId: 'theodore', questId: 'theodore-language',
      activityDate: '2026-10-01', status: 'approved',
      claimedAt: '2026-10-01T10:00:00Z', decidedAt: '2026-10-01T11:00:00Z',
    }
    storage.setItem(STORAGE_KEY, JSON.stringify({
      schemaVersion: 4,
      createdAt: '2026-09-20T09:00:00Z',
      timeZone: 'UTC',
      children: {
        theodore: { coins: 30, stars: 1, inventory: ['toy-train'], equipped: { hat: null, toy: 'toy-train' }, wishItem: null, league: { rank: 1, evaluatedWeeks: {}, unseenPromotion: null } },
        leonard: { coins: 20, stars: 0, inventory: ['toy-train'], equipped: { hat: null, toy: 'toy-train' }, wishItem: null, league: { rank: 1, evaluatedWeeks: {}, unseenPromotion: null } },
      },
      claims: { c1: oldClaim },
      purchases: {},
      ledger: [],
      settings: { sound: true },
      city: { currentProjectId: 'road', suggestedProjectId: null, projects: { road: { kits: 0, status: 'building' }, library: { kits: 0, status: 'locked' }, 'music-school': { kits: 0, status: 'locked' }, 'police-station': { kits: 0, status: 'locked' }, hospital: { kits: 0, status: 'locked' } }, kitPurchases: {}, foundersBridgePlanks: 0 },
    }))
    const repo = new LocalStorageRepository(storage, commandDeps)
    const s = repo.load()
    expect(s.schemaVersion).toBe(7)
    expect(s.claims.c1.role).toBe('core')
    expect(s.claims.c1.reward).toEqual({ coins: 10, stars: 1 })
    expect(s.scheduleHistory).toHaveLength(2)
    expect(s.scheduleHistory[0].effectiveFrom).toBe('2026-09-20')
    expect(s.config.theodore.mathLevel).toBe(2)
    expect(s.config.leonard.mathLevel).toBe(1)
    expect(s.pausedDates).toEqual({ theodore: [], leonard: [] })
  })
})
