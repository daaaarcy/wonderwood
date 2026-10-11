import { describe, expect, it } from 'vitest'
import { applyCommand, GROWN_UP_COMMANDS } from './commands.ts'
import { initialState } from './state.ts'
import { migrateState } from './migrate.ts'
import { commandDeps } from '../data/registry.ts'
import { DEFAULT_LOOKS, isValidLook } from './avatar.ts'

const NOW = new Date('2026-10-12T12:00:00Z')

describe('avatar looks (v9)', () => {
  it('initial state carries each child’s default look', () => {
    const s = initialState(NOW, 'UTC')
    expect(s.schemaVersion).toBe(9)
    expect(s.children.theodore.look).toEqual(DEFAULT_LOOKS.theodore)
    expect(s.children.leonard.look).toEqual(DEFAULT_LOOKS.leonard)
  })

  it('migrates a v8 save, filling default looks', () => {
    const s = initialState(NOW, 'UTC')
    const v8 = JSON.parse(JSON.stringify(s)) as {
      schemaVersion: number
      children: Record<string, Record<string, unknown>>
    }
    v8.schemaVersion = 8
    delete v8.children.theodore.look
    delete v8.children.leonard.look
    const m = migrateState(v8, { now: NOW, timeZone: 'UTC' })
    expect(m?.schemaVersion).toBe(9)
    expect(m?.children.theodore.look).toEqual(DEFAULT_LOOKS.theodore)
    expect(m?.children.leonard.look).toEqual(DEFAULT_LOOKS.leonard)
  })

  it('rejects a v9-shaped state whose look is invalid', () => {
    const s = initialState(NOW, 'UTC')
    const bad = JSON.parse(JSON.stringify(s)) as Record<string, never>
    ;(bad.children as { theodore: { look: unknown } }).theodore.look = { skin: 'oops' }
    expect(migrateState(bad, { now: NOW, timeZone: 'UTC' })).toBeNull()
  })

  it('setLook applies a valid look and touches nothing else', () => {
    const s = initialState(NOW, 'UTC')
    const look = { ...DEFAULT_LOOKS.theodore, hair: 'mohawk', glasses: 'round' } as const
    const r = applyCommand(s, { type: 'setLook', childId: 'theodore', look }, NOW, commandDeps)
    expect(r.result.ok).toBe(true)
    expect(r.state.children.theodore.look).toEqual(look)
    // nothing else changed — free, no coins/stars/league effects
    expect(r.state.children.theodore.coins).toBe(s.children.theodore.coins)
    expect(r.state.children.theodore.stars).toBe(s.children.theodore.stars)
    expect(r.state.children.theodore.league).toEqual(s.children.theodore.league)
    expect(r.state.children.leonard).toEqual(s.children.leonard)
    expect(r.state.ledger).toEqual(s.ledger)
    expect(r.state.city).toEqual(s.city)
  })

  it('setLook is idempotent on the same look', () => {
    const s = initialState(NOW, 'UTC')
    const look = { ...DEFAULT_LOOKS.leonard, eyes: 'happy' } as const
    const s1 = applyCommand(s, { type: 'setLook', childId: 'leonard', look }, NOW, commandDeps).state
    const s2 = applyCommand(s1, { type: 'setLook', childId: 'leonard', look }, NOW, commandDeps).state
    expect(s2.children.leonard.look).toEqual(look)
  })

  it('rejects invalid looks with invalid-look', () => {
    const s = initialState(NOW, 'UTC')
    const r = applyCommand(
      s,
      { type: 'setLook', childId: 'theodore', look: { ...DEFAULT_LOOKS.theodore, hair: 'afro' as never } },
      NOW,
      commandDeps,
    )
    expect(r.result.ok).toBe(false)
    if (!r.result.ok) expect(r.result.error.code).toBe('invalid-look')
    expect(r.state.children.theodore.look).toEqual(DEFAULT_LOOKS.theodore)
  })

  it('rejects off-palette colours', () => {
    const s = initialState(NOW, 'UTC')
    const r = applyCommand(
      s,
      {
        type: 'setLook',
        childId: 'theodore',
        look: { ...DEFAULT_LOOKS.theodore, shirt: '#123456' },
      },
      NOW,
      commandDeps,
    )
    expect(r.result.ok).toBe(false)
  })

  it('is child-allowed — not in GROWN_UP_COMMANDS', () => {
    expect(GROWN_UP_COMMANDS.has('setLook')).toBe(false)
  })

  it('isValidLook accepts defaults, rejects junk', () => {
    expect(isValidLook(DEFAULT_LOOKS.theodore)).toBe(true)
    expect(isValidLook(null)).toBe(false)
    expect(isValidLook({ ...DEFAULT_LOOKS.theodore, eyes: 'alien' })).toBe(false)
  })
})
