import type { ChildState, CityState, GameState, LeagueState } from './types.ts'
import { WELCOME_COINS } from './types.ts'

function initialCity(): CityState {
  return {
    currentProjectId: 'road',
    suggestedProjectId: null,
    projects: {
      road: { kits: 0, status: 'building' },
      library: { kits: 0, status: 'locked' },
      'music-school': { kits: 0, status: 'locked' },
      'police-station': { kits: 0, status: 'locked' },
      hospital: { kits: 0, status: 'locked' },
    },
    kitPurchases: {},
    foundersBridgePlanks: 0,
  }
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

export function initialState(now: Date = new Date(), timeZone = 'UTC'): GameState {
  const at = now.toISOString()
  return {
    schemaVersion: 4,
    timeZone,
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
    settings: { sound: true },
    city: initialCity(),
  }
}
