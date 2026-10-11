import { describe, expect, it } from 'vitest'
import { applyCommand } from './commands.ts'
import { initialState } from './state.ts'
import { migrateState } from './migrate.ts'
import { todayQuestsFor, leagueWeekStatus } from './selectors.ts'
import { localDateKey } from './week.ts'
import { commandDeps } from '../data/registry.ts'
import type { GameState } from './types.ts'

const NOW = new Date('2026-10-12T12:00:00Z') // a Monday
const TZ = 'UTC'
const today = () => localDateKey(NOW, TZ)

function cmd(s: GameState, c: Parameters<typeof applyCommand>[1], now: Date = NOW) {
  const r = applyCommand(s, c, now, commandDeps)
  if (!r.result.ok) throw new Error(JSON.stringify(r.result))
  return r.state
}
function cmdResult(s: GameState, c: Parameters<typeof applyCommand>[1], now: Date = NOW) {
  return applyCommand(s, c, now, commandDeps)
}

function give(s: GameState, itemId: string): GameState {
  return cmd(s, { type: 'purchase', childId: 'theodore', itemId, purchaseId: `p-${itemId}` })
}

function rich(s: GameState): GameState {
  const next = { ...s, children: { ...s.children, theodore: { ...s.children.theodore, coins: 2000 } } }
  return next
}

function addTask(s: GameState, patch: Partial<Parameters<typeof applyCommand>[1]> = {}): GameState {
  return cmd(s, {
    type: 'createCustomQuest',
    questId: 'cq-1',
    title: 'Water the plants',
    coins: 12,
    stars: 1,
    childIds: ['leonard'],
    days: [],
    ...patch,
  } as Parameters<typeof applyCommand>[1])
}

describe('v6 → v7 migration', () => {
  it('adds placed={} per child and customQuests={} without touching equipment', () => {
    const v6 = initialState(NOW, TZ) as unknown as Record<string, unknown>
    v6.schemaVersion = 6
    delete v6.customQuests
    for (const id of ['theodore', 'leonard'] as const) {
      delete (v6.children as Record<string, Record<string, unknown>>)[id].placed
    }
    const s = migrateState(v6, { now: NOW, timeZone: TZ })
    expect(s?.schemaVersion).toBe(8)
    expect(s?.customQuests).toEqual({})
    expect(s?.children.theodore.placed).toEqual({})
    expect(s?.children.leonard.placed).toEqual({})
    // hats/toys untouched
    expect(s?.children.theodore.equipped).toEqual({ hat: null, toy: 'toy-train' })
    expect(s?.children.theodore.inventory).toContain('toy-train')
  })

  it('rejects a v7-shaped doc missing placed/customQuests', () => {
    const v7 = initialState(NOW, TZ) as unknown as Record<string, unknown>
    delete v7.customQuests
    expect(migrateState(v7, { now: NOW, timeZone: TZ })).toBeNull()
  })

  it('v7 → v8 removes the retired napkin job but keeps custom jobs', () => {
    const v7 = initialState(NOW, TZ) as unknown as Record<string, unknown>
    v7.schemaVersion = 7
    const jobs = (v7.config as Record<string, { houseworkJobs: string[] }>).theodore.houseworkJobs
    jobs.push('Put napkins on the table', 'Feed the fish')
    const s = migrateState(v7, { now: NOW, timeZone: TZ })
    expect(s?.schemaVersion).toBe(8)
    expect(s?.config.theodore.houseworkJobs).not.toContain('Put napkins on the table')
    expect(s?.config.theodore.houseworkJobs).toContain('Feed the fish')
  })
})

describe('furniture purchase → auto-place', () => {
  it('auto-places a desk into its empty spot on purchase', () => {
    let s = rich(initialState(NOW, TZ))
    s = give(s, 'desk-explorer')
    expect(s.children.theodore.placed.desk).toBe('desk-explorer')
  })

  it('keeps bought furniture in the inventory when the spot is occupied', () => {
    let s = rich(initialState(NOW, TZ))
    s = give(s, 'desk-explorer')
    s = give(s, 'desk-corner')
    expect(s.children.theodore.placed.desk).toBe('desk-explorer')
    expect(s.children.theodore.inventory).toContain('desk-corner')
  })

  it('decor fills the first free decor spot, then the second', () => {
    let s = rich(initialState(NOW, TZ))
    s = give(s, 'decor-rocket')
    s = give(s, 'decor-plant')
    expect(s.children.theodore.placed['decor-a']).toBe('decor-rocket')
    expect(s.children.theodore.placed['decor-b']).toBe('decor-plant')
    // third decor stays in the bag
    s = give(s, 'decor-frame')
    expect(s.children.theodore.placed['decor-a']).toBe('decor-rocket')
    expect(s.children.theodore.placed['decor-b']).toBe('decor-plant')
    expect(s.children.theodore.inventory).toContain('decor-frame')
  })

  it('hats and toys never auto-place into room spots', () => {
    let s = rich(initialState(NOW, TZ))
    s = give(s, 'hat-leaf')
    expect(s.children.theodore.placed).toEqual({})
  })
})

describe('placeItem', () => {
  it('requires the item to be owned', () => {
    const s = rich(initialState(NOW, TZ))
    const r = cmdResult(s, { type: 'placeItem', childId: 'theodore', spot: 'bed', itemId: 'bed-cosy' })
    expect(r.result.ok).toBe(false)
    if (!r.result.ok) expect(r.result.error.code).toBe('item-not-owned')
  })

  it('requires the item to match the spot', () => {
    let s = rich(initialState(NOW, TZ))
    s = give(s, 'bed-cosy')
    const r = cmdResult(s, { type: 'placeItem', childId: 'theodore', spot: 'desk', itemId: 'bed-cosy' })
    expect(r.result.ok).toBe(false)
    if (!r.result.ok) expect(r.result.error.code).toBe('wrong-slot')
    // decor items fit EITHER decor spot
    s = give(s, 'decor-rocket')
    s = cmd(s, { type: 'placeItem', childId: 'theodore', spot: 'decor-b', itemId: 'decor-rocket' })
    expect(s.children.theodore.placed['decor-b']).toBe('decor-rocket')
    expect(s.children.theodore.placed['decor-a']).toBeUndefined()
  })

  it('swaps the occupant when a spot is taken', () => {
    let s = rich(initialState(NOW, TZ))
    s = give(s, 'bed-cosy')
    s = give(s, 'bed-house')
    expect(s.children.theodore.placed.bed).toBe('bed-cosy')
    s = cmd(s, { type: 'placeItem', childId: 'theodore', spot: 'bed', itemId: 'bed-house' })
    expect(s.children.theodore.placed.bed).toBe('bed-house')
  })

  it('moves a decor item between spots instead of duplicating it', () => {
    let s = rich(initialState(NOW, TZ))
    s = give(s, 'decor-rocket')
    s = cmd(s, { type: 'placeItem', childId: 'theodore', spot: 'decor-b', itemId: 'decor-rocket' })
    expect(s.children.theodore.placed['decor-b']).toBe('decor-rocket')
    expect(s.children.theodore.placed['decor-a']).toBeUndefined()
  })

  it('itemId:null removes the item from the spot', () => {
    let s = rich(initialState(NOW, TZ))
    s = give(s, 'desk-explorer')
    s = cmd(s, { type: 'placeItem', childId: 'theodore', spot: 'desk', itemId: null })
    expect(s.children.theodore.placed.desk).toBeUndefined()
    expect(s.children.theodore.inventory).toContain('desk-explorer')
  })

  it('rejects a spot that does not exist', () => {
    const s = rich(initialState(NOW, TZ))
    const r = cmdResult(s, {
      type: 'placeItem',
      childId: 'theodore',
      spot: 'garage' as never,
      itemId: null,
    })
    expect(r.result.ok).toBe(false)
    if (!r.result.ok) expect(r.result.error.code).toBe('wrong-slot')
  })
})

describe('createCustomQuest', () => {
  it('creates a task with normalized title/days', () => {
    const s = addTask(initialState(NOW, TZ), { title: '  Feed   the   cat ', days: [4, 2, 2] })
    const q = s.customQuests['cq-1']
    expect(q.title).toBe('Feed the cat')
    expect(q.days).toEqual([2, 4])
    expect(q.coins).toBe(12)
    expect(q.stars).toBe(1)
    expect(q.childIds).toEqual(['leonard'])
    expect(q.active).toBe(true)
    expect(q.createdAt).toBe(NOW.toISOString())
  })

  it('is idempotent by questId', () => {
    const s = addTask(initialState(NOW, TZ))
    const again = cmdResult(s, {
      type: 'createCustomQuest',
      questId: 'cq-1',
      title: 'Different',
      coins: 1,
      stars: 0,
      childIds: ['theodore'],
      days: [1],
    })
    expect(again.result.ok).toBe(true)
    expect(again.state.customQuests['cq-1'].title).toBe('Water the plants')
  })

  it.each([
    ['empty title', { title: '   ' }],
    ['title too long', { title: 'x'.repeat(61) }],
    ['coins over max', { coins: 100 }],
    ['negative coins', { coins: -1 }],
    ['non-integer coins', { coins: 2.5 }],
    ['stars over max', { stars: 6 }],
    ['no children', { childIds: [] }],
    ['bad child', { childIds: ['nobody'] }],
    ['bad weekday', { days: [7] }],
  ])('rejects %s', (_label, patch) => {
    const r = cmdResult(initialState(NOW, TZ), {
      type: 'createCustomQuest',
      questId: 'cq-bad',
      title: 'Water the plants',
      coins: 12,
      stars: 1,
      childIds: ['leonard'],
      days: [],
      ...patch,
    } as Parameters<typeof applyCommand>[1])
    expect(r.result.ok).toBe(false)
    if (!r.result.ok) expect(r.result.error.code).toBe('invalid-quest')
  })
})

describe('updateCustomQuest', () => {
  it('patches fields and validates them', () => {
    let s = addTask(initialState(NOW, TZ))
    s = cmd(s, { type: 'updateCustomQuest', id: 'cq-1', patch: { coins: 20, days: [0] } })
    expect(s.customQuests['cq-1'].coins).toBe(20)
    expect(s.customQuests['cq-1'].days).toEqual([0])
    const bad = cmdResult(s, { type: 'updateCustomQuest', id: 'cq-1', patch: { stars: 9 } })
    expect(bad.result.ok).toBe(false)
    if (!bad.result.ok) expect(bad.result.error.code).toBe('invalid-quest')
  })

  it('archives with active:false and keeps the record', () => {
    let s = addTask(initialState(NOW, TZ))
    s = cmd(s, { type: 'updateCustomQuest', id: 'cq-1', patch: { active: false } })
    expect(s.customQuests['cq-1'].active).toBe(false)
    expect(s.customQuests['cq-1'].title).toBe('Water the plants')
  })

  it('rejects unknown ids', () => {
    const s = initialState(NOW, TZ)
    const r = cmdResult(s, { type: 'updateCustomQuest', id: 'nope', patch: { coins: 5 } })
    expect(r.result.ok).toBe(false)
    if (!r.result.ok) expect(r.result.error.code).toBe('unknown-quest')
  })
})

describe('custom quest claiming', () => {
  it('assigned child claims → role custom, title stored', () => {
    let s = addTask(initialState(NOW, TZ))
    s = cmd(s, { type: 'claimQuest', childId: 'leonard', questId: 'cq-1', claimId: 'c-1' })
    const claim = s.claims['c-1']
    expect(claim.role).toBe('custom')
    expect(claim.questTitle).toBe('Water the plants')
    expect(claim.activityDate).toBe(today())
  })

  it('unassigned child gets unknown-quest', () => {
    const s = addTask(initialState(NOW, TZ))
    const r = cmdResult(s, { type: 'claimQuest', childId: 'theodore', questId: 'cq-1', claimId: 'c-2' })
    expect(r.result.ok).toBe(false)
    if (!r.result.ok) expect(r.result.error.code).toBe('unknown-quest')
  })

  it('weekday filter: wrong day → not-scheduled; right day → ok; empty = every day', () => {
    // days [0] = Monday only. NOW is a Monday; Tuesday is +1.
    let s = addTask(initialState(NOW, TZ), { days: [0] })
    s = cmd(s, { type: 'claimQuest', childId: 'leonard', questId: 'cq-1', claimId: 'c-mon' })
    expect(s.claims['c-mon'].role).toBe('custom')
    const tue = new Date(NOW.getTime() + 86400000)
    const r = cmdResult(s, { type: 'claimQuest', childId: 'leonard', questId: 'cq-1', claimId: 'c-tue' }, tue)
    expect(r.result.ok).toBe(false)
    if (!r.result.ok) expect(r.result.error.code).toBe('not-scheduled')
    // every day
    const s2 = addTask(initialState(NOW, TZ), { days: [] })
    const r2 = cmdResult(s2, { type: 'claimQuest', childId: 'leonard', questId: 'cq-1', claimId: 'c-any' }, tue)
    expect(r2.result.ok).toBe(true)
  })

  it('one claim per day per custom quest', () => {
    let s = addTask(initialState(NOW, TZ))
    s = cmd(s, { type: 'claimQuest', childId: 'leonard', questId: 'cq-1', claimId: 'c-1' })
    const r = cmdResult(s, { type: 'claimQuest', childId: 'leonard', questId: 'cq-1', claimId: 'c-2' })
    expect(r.result.ok).toBe(false)
    if (!r.result.ok) expect(r.result.error.code).toBe('already-claimed-today')
  })

  it('archived quest cannot be claimed but its claim keeps the title', () => {
    let s = addTask(initialState(NOW, TZ))
    s = cmd(s, { type: 'claimQuest', childId: 'leonard', questId: 'cq-1', claimId: 'c-1' })
    s = cmd(s, { type: 'updateCustomQuest', id: 'cq-1', patch: { active: false } })
    const r = cmdResult(s, { type: 'claimQuest', childId: 'leonard', questId: 'cq-1', claimId: 'c-2' })
    expect(r.result.ok).toBe(false)
    // the earlier claim still renders by stored title
    expect(s.claims['c-1'].questTitle).toBe('Water the plants')
    // ...and it still shows on today's view (claimed before archiving)
    const view = todayQuestsFor(s, 'leonard', NOW)
    expect(view.restDay).toBe(false)
    if (!view.restDay) {
      expect(view.custom.map((t) => t.questId)).toContain('cq-1')
    }
  })

  it('approval pays exactly the configured coins + stars and stamps the reward', () => {
    let s = addTask(initialState(NOW, TZ), { coins: 12, stars: 2 })
    s = cmd(s, { type: 'claimQuest', childId: 'leonard', questId: 'cq-1', claimId: 'c-1' })
    s = cmd(s, { type: 'approveClaim', claimId: 'c-1' })
    const claim = s.claims['c-1']
    expect(claim.reward).toEqual({ coins: 12, stars: 2 })
    expect(s.children.leonard.coins).toBe(20 + 12)
    expect(s.children.leonard.stars).toBe(2)
  })

  it('custom claims do not consume bonus slots', () => {
    // custom task with 5 coins — the exact bonus reward amount — must not eat a slot.
    let s = addTask(initialState(NOW, TZ), { coins: 5, stars: 0 })
    s = cmd(s, { type: 'claimQuest', childId: 'leonard', questId: 'cq-1', claimId: 'c-1' })
    s = cmd(s, { type: 'approveClaim', claimId: 'c-1' })
    const view = todayQuestsFor(s, 'leonard', NOW)
    expect(view.restDay).toBe(false)
    if (!view.restDay) {
      expect(view.bonusSlotsLeft).toBe(2)
    }
  })
})

describe('custom quests in today view', () => {
  it('shows only for the assigned child', () => {
    const s = addTask(initialState(NOW, TZ))
    const leo = todayQuestsFor(s, 'leonard', NOW)
    const theo = todayQuestsFor(s, 'theodore', NOW)
    expect(leo.restDay).toBe(false)
    expect(theo.restDay).toBe(false)
    if (!leo.restDay) expect(leo.custom.map((t) => t.questId)).toEqual(['cq-1'])
    if (!theo.restDay) expect(theo.custom).toEqual([])
  })
})

describe('custom quests and the league', () => {
  it('a scheduled custom task counts as an opportunity; its approval counts like core', () => {
    const base = initialState(NOW, TZ)
    const baseStatus = leagueWeekStatus(base, 'leonard', NOW)

    // add an every-day custom quest for leonard
    let s = addTask(base)
    const withTask = leagueWeekStatus(s, 'leonard', NOW)
    expect(withTask.opportunities).toBeGreaterThan(baseStatus.opportunities)

    // approve it (stars 1 > 0) → count +1
    s = cmd(s, { type: 'claimQuest', childId: 'leonard', questId: 'cq-1', claimId: 'c-1' })
    s = cmd(s, { type: 'approveClaim', claimId: 'c-1' })
    const after = leagueWeekStatus(s, 'leonard', NOW)
    expect(after.count).toBe(withTask.count + 1)
  })

  it('the unassigned child sees no opportunity change', () => {
    const base = initialState(NOW, TZ)
    const s = addTask(base)
    expect(leagueWeekStatus(s, 'theodore', NOW).opportunities).toBe(
      leagueWeekStatus(base, 'theodore', NOW).opportunities,
    )
  })

  it('a one-day task (other weekday) does not add an opportunity today', () => {
    const base = initialState(NOW, TZ)
    const s = addTask(base, { days: [1] }) // Tuesdays only (0=Mon)
    // only this week's Tuesday gains an opportunity
    const status = leagueWeekStatus(s, 'leonard', NOW)
    const baseStatus = leagueWeekStatus(base, 'leonard', NOW)
    expect(status.opportunities).toBe(baseStatus.opportunities + 1)
    // but claiming on Monday is not allowed
    const r = cmdResult(s, { type: 'claimQuest', childId: 'leonard', questId: 'cq-1', claimId: 'c-x' })
    expect(r.result.ok).toBe(false)
  })
})
