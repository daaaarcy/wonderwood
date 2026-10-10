import type { ChildState, GameState, LeagueState } from './types'
import { WELCOME_COINS } from './types'

/** Local YYYY-MM-DD for a Date — the "activity day" a claim belongs to. */
export function localDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function initialLeague(): LeagueState {
  return { rank: 1, evaluatedWeeks: {}, unseenPromotion: null }
}

function initialChild(): ChildState {
  return {
    coins: WELCOME_COINS,
    stars: 0,
    inventory: ['toy-train'],
    equipped: { hat: null, toy: 'toy-train' },
    wishItem: null,
    league: initialLeague(),
  }
}

export function initialState(now: Date = new Date()): GameState {
  const at = now.toISOString()
  return {
    schemaVersion: 2,
    createdAt: at,
    children: {
      theodore: initialChild(),
      leonard: initialChild(),
    },
    claims: {},
    purchases: {},
    ledger: [
      { id: 'welcome-theodore', childId: 'theodore', coins: WELCOME_COINS, stars: 0, reason: 'welcome', refId: 'welcome', at },
      { id: 'welcome-leonard', childId: 'leonard', coins: WELCOME_COINS, stars: 0, reason: 'welcome', refId: 'welcome', at },
    ],
    parentPinHash: null,
    settings: { sound: true },
  }
}
