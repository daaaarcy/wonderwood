import { describe, expect, it } from 'vitest'
import { applyCommand, GROWN_UP_COMMANDS } from './commands.ts'
import { initialState } from './state.ts'
import { projectView } from './selectors.ts'
import { commandDeps } from '../data/registry.ts'
import { KIT_PRICE } from '../data/city.ts'

const NOW = new Date('2026-10-10T10:00:00')
const run = (s: Parameters<typeof applyCommand>[0], c: Parameters<typeof applyCommand>[1]) =>
  applyCommand(s, c, NOW, commandDeps)

function withCoins(s: ReturnType<typeof initialState>, childId: 'theodore' | 'leonard', coins: number) {
  return { ...s, children: { ...s.children, [childId]: { ...s.children[childId], coins } } }
}

describe('buyKit', () => {
  it('buys a kit: coins deducted, kits +1, ledger entry', () => {
    const s = initialState(NOW)
    const r = run(s, { type: 'buyKit', childId: 'theodore', projectId: 'road', kitPurchaseId: 'k1' })
    expect(r.result.ok).toBe(true)
    const next = r.state
    expect(next.children.theodore.coins).toBe(20 - KIT_PRICE)
    expect(next.city.projects.road.kits).toBe(1)
    expect(next.city.projects.road.status).toBe('building')
    expect(next.ledger.at(-1)).toMatchObject({ reason: 'kit', coins: -KIT_PRICE, refId: 'road' })
  })

  it('is idempotent: same kitPurchaseId returns the original, no double charge', () => {
    const s = initialState(NOW)
    const first = run(s, { type: 'buyKit', childId: 'theodore', projectId: 'road', kitPurchaseId: 'k1' })
    const again = run(first.state, { type: 'buyKit', childId: 'theodore', projectId: 'road', kitPurchaseId: 'k1' })
    expect(again.result.ok).toBe(true)
    expect(again.state.children.theodore.coins).toBe(20 - KIT_PRICE)
    expect(again.state.city.projects.road.kits).toBe(1)
  })

  it('errors insufficient-coins when short', () => {
    const s = withCoins(initialState(NOW), 'theodore', 5)
    const r = run(s, { type: 'buyKit', childId: 'theodore', projectId: 'road', kitPurchaseId: 'k1' })
    expect(r.result.ok).toBe(false)
    if (!r.result.ok) expect(r.result.error.code).toBe('insufficient-coins')
    expect(r.state.city.projects.road.kits).toBe(0)
    expect(r.state.children.theodore.coins).toBe(5)
  })

  it('errors not-current-project for a locked/wrong project', () => {
    const s = initialState(NOW)
    const r = run(s, { type: 'buyKit', childId: 'theodore', projectId: 'hospital', kitPurchaseId: 'k1' })
    expect(r.result.ok).toBe(false)
    if (!r.result.ok) expect(r.result.error.code).toBe('not-current-project')
    expect(r.state.children.theodore.coins).toBe(20)
  })

  it('final kit opens the road and auto-starts the library', () => {
    let s = initialState(NOW)
    s = run(s, { type: 'buyKit', childId: 'theodore', projectId: 'road', kitPurchaseId: 'k1' }).state
    s = run(s, { type: 'buyKit', childId: 'leonard', projectId: 'road', kitPurchaseId: 'k2' }).state
    expect(s.city.projects.road.status).toBe('open')
    expect(s.city.projects.road.openedAt).toBeTruthy()
    expect(s.city.currentProjectId).toBe('library')
    expect(s.city.projects.library.status).toBe('building')
    // each child spent their own coins
    expect(s.children.theodore.coins).toBe(10)
    expect(s.children.leonard.coins).toBe(10)
  })

  it('library open → currentProjectId becomes null (family picks next)', () => {
    let s = initialState(NOW)
    s = run(s, { type: 'buyKit', childId: 'theodore', projectId: 'road', kitPurchaseId: 'k1' }).state
    s = run(s, { type: 'buyKit', childId: 'leonard', projectId: 'road', kitPurchaseId: 'k2' }).state
    s = withCoins(s, 'theodore', 100)
    for (let i = 0; i < 6; i += 1) {
      s = run(s, { type: 'buyKit', childId: 'theodore', projectId: 'library', kitPurchaseId: `L${i}` }).state
    }
    expect(s.city.projects.library.status).toBe('open')
    expect(s.city.currentProjectId).toBeNull()
  })

  it('buying after a project completed errors project-complete', () => {
    let s = initialState(NOW)
    s = run(s, { type: 'buyKit', childId: 'theodore', projectId: 'road', kitPurchaseId: 'k1' }).state
    s = run(s, { type: 'buyKit', childId: 'leonard', projectId: 'road', kitPurchaseId: 'k2' }).state
    const r = run(s, { type: 'buyKit', childId: 'theodore', projectId: 'road', kitPurchaseId: 'k3' })
    expect(r.result.ok).toBe(false)
    if (!r.result.ok) expect(r.result.error.code).toBe('project-complete')
    expect(r.state.children.theodore.coins).toBe(10)
  })

  it('kit purchases never touch league rank or stars', () => {
    let s = initialState(NOW)
    s = run(s, { type: 'buyKit', childId: 'theodore', projectId: 'road', kitPurchaseId: 'k1' }).state
    expect(s.children.theodore.league.rank).toBe(1)
    expect(s.children.theodore.stars).toBe(0)
  })
})

describe('suggestProject / chooseNextProject', () => {
  function readyToPick() {
    let s = initialState(NOW)
    s = run(s, { type: 'buyKit', childId: 'theodore', projectId: 'road', kitPurchaseId: 'k1' }).state
    s = run(s, { type: 'buyKit', childId: 'leonard', projectId: 'road', kitPurchaseId: 'k2' }).state
    return s // current = library (still has a current project)
  }

  it('suggest only works when nothing is in progress', () => {
    const s = readyToPick()
    const r = run(s, { type: 'suggestProject', childId: 'theodore', projectId: 'hospital' })
    expect(r.result.ok).toBe(false)
  })

  it('choose only works when nothing is in progress and target is locked', () => {
    const s = readyToPick()
    const r = run(s, { type: 'chooseNextProject', projectId: 'hospital' })
    expect(r.result.ok).toBe(false)
    if (!r.result.ok) expect(r.result.error.code).toBe('not-current-project')
    const r2 = run(s, { type: 'chooseNextProject', projectId: 'road' })
    expect(r2.result.ok).toBe(false)
  })

  it('suggest then confirm starts the building and clears the suggestion', () => {
    let s = initialState(NOW)
    s = run(s, { type: 'buyKit', childId: 'theodore', projectId: 'road', kitPurchaseId: 'k1' }).state
    s = run(s, { type: 'buyKit', childId: 'leonard', projectId: 'road', kitPurchaseId: 'k2' }).state
    s = withCoins(s, 'theodore', 200)
    for (let i = 0; i < 6; i += 1) {
      s = run(s, { type: 'buyKit', childId: 'theodore', projectId: 'library', kitPurchaseId: `L${i}` }).state
    }
    expect(s.city.currentProjectId).toBeNull()

    s = run(s, { type: 'suggestProject', childId: 'leonard', projectId: 'music-school' }).state
    expect(s.city.suggestedProjectId).toBe('music-school')

    s = run(s, { type: 'chooseNextProject', projectId: 'music-school' }).state
    expect(s.city.currentProjectId).toBe('music-school')
    expect(s.city.suggestedProjectId).toBeNull()
    expect(s.city.projects['music-school'].status).toBe('building')
  })
})

describe('projectView stages', () => {
  it('maps kits → stage', () => {
    let s = initialState(NOW)
    expect(projectView(s, 'library').stage).toBe('site')
    expect(projectView(s, 'library').status).toBe('locked')
    // library needs 6: 1 → foundations, 3 → walls, 5 → roof, 6 → open
    s = { ...s, city: { ...s.city, projects: { ...s.city.projects, library: { kits: 1, status: 'building' } } } }
    expect(projectView(s, 'library').stage).toBe('foundations')
    s = { ...s, city: { ...s.city, projects: { ...s.city.projects, library: { kits: 3, status: 'building' } } } }
    expect(projectView(s, 'library').stage).toBe('walls')
    s = { ...s, city: { ...s.city, projects: { ...s.city.projects, library: { kits: 5, status: 'building' } } } }
    expect(projectView(s, 'library').stage).toBe('roof')
    s = { ...s, city: { ...s.city, projects: { ...s.city.projects, library: { kits: 6, status: 'open' } } } }
    expect(projectView(s, 'library').stage).toBe('open')
  })

  it('the 2-kit road reads half-paved at 1 kit', () => {
    const s = { ...initialState(NOW) }
    s.city.projects.road = { kits: 1, status: 'building' }
    expect(projectView(s, 'road').stage).toBe('walls') // "half paved" visual
    s.city.projects.road = { kits: 2, status: 'open' }
    expect(projectView(s, 'road').stage).toBe('open')
  })
})

describe('GROWN_UP_COMMANDS', () => {
  it('includes the grown-up-only command set', () => {
    for (const t of ['approveClaim', 'rejectClaim', 'parentCompleteAndApprove', 'chooseNextProject'] as const) {
      expect(GROWN_UP_COMMANDS.has(t)).toBe(true)
    }
    expect(GROWN_UP_COMMANDS.has('buyKit')).toBe(false)
    expect(GROWN_UP_COMMANDS.has('claimQuest')).toBe(false)
    expect(GROWN_UP_COMMANDS.has('suggestProject')).toBe(false)
  })
})
