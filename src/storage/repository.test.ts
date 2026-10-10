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
    expect(s.schemaVersion).toBe(2)
    expect(s.children.theodore.coins).toBe(20)
    expect(storage.getItem(STORAGE_KEY)).toBe(JSON.stringify(s))
  })

  it('round-trips: load after save gives equal state', () => {
    const storage = new FakeStorage()
    const repo1 = new LocalStorageRepository(storage, commandDeps)
    repo1.dispatch({ type: 'claimQuest', childId: 'theodore', questId: 'theodore-language', claimId: 'c1' })
    repo1.dispatch({ type: 'approveClaim', claimId: 'c1' })
    repo1.dispatch({ type: 'purchase', childId: 'theodore', itemId: 'hat-leaf', purchaseId: 'p1' })
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
    expect(repo.load().schemaVersion).toBe(2)
    expect(storage.dump().some((k) => k.includes('corrupt'))).toBe(true)
  })

  it('dispatch re-reads storage: a stale tab cannot double-spend or drop approvals', () => {
    const storage = new FakeStorage()
    const repoA = new LocalStorageRepository(storage, commandDeps)
    const repoB = new LocalStorageRepository(storage, commandDeps) // never gets storage events

    // A approves a claim, then A buys the hat (coins 30 → 10)
    repoA.dispatch({ type: 'claimQuest', childId: 'theodore', questId: 'theodore-language', claimId: 'c1' })
    repoA.dispatch({ type: 'approveClaim', claimId: 'c1' })
    repoA.dispatch({ type: 'purchase', childId: 'theodore', itemId: 'hat-leaf', purchaseId: 'pA' })
    expect(repoA.load().children.theodore.coins).toBe(10)

    // Stale B (still holding 20 coins, no hat) tries to buy the same hat:
    // must fail already-owned — coins must NOT go 10 → -10.
    const r = repoB.dispatch({ type: 'purchase', childId: 'theodore', itemId: 'hat-leaf', purchaseId: 'pB' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('already-owned')
    const stored = JSON.parse(storage.getItem(STORAGE_KEY)!)
    expect(stored.children.theodore.coins).toBe(10)

    // B dispatches something unrelated — A's award and purchase survive.
    repoB.dispatch({ type: 'setWish', childId: 'leonard', itemId: 'hat-leaf' })
    const stored2 = JSON.parse(storage.getItem(STORAGE_KEY)!)
    expect(stored2.children.theodore.coins).toBe(10)
    expect(stored2.children.theodore.inventory).toContain('hat-leaf')
    expect(stored2.children.leonard.wishItem).toBe('hat-leaf')
    expect(stored2.claims.c1.status).toBe('approved')
  })

  it('migrates a v1 save to v2 without the corrupt-backup path', () => {
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
    expect(s.schemaVersion).toBe(2)
    expect(s.createdAt).toBe('2026-09-01T08:00:00.000Z') // earliest ledger entry
    expect(s.children.theodore.coins).toBe(33)
    expect(s.children.theodore.inventory).toContain('hat-leaf')
    expect(s.children.theodore.league.rank).toBe(1)
    expect(s.children.theodore.league.evaluatedWeeks).toEqual({})
    expect(s.settings.sound).toBe(true)
    expect(s.parentPinHash).toBe('abc123')
    // no corrupt backup was made
    expect(storage.dump().some((k) => k.includes('corrupt'))).toBe(false)
  })

  it('notifies subscribers on successful dispatch but not on failure', () => {
    const storage = new FakeStorage()
    const repo = new LocalStorageRepository(storage, commandDeps)
    let calls = 0
    const unsub = repo.subscribe(() => {
      calls += 1
    })
    repo.dispatch({ type: 'claimQuest', childId: 'theodore', questId: 'theodore-language', claimId: 'c1' })
    expect(calls).toBe(1)
    repo.dispatch({ type: 'approveClaim', claimId: 'nope' })
    expect(calls).toBe(1)
    unsub()
    repo.dispatch({ type: 'approveClaim', claimId: 'c1' })
    expect(calls).toBe(1)
  })
})
