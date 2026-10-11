import type { ChildState, CityState, GameState, LeagueState } from './types.ts'
import { DEFAULT_CHILD_CONFIG } from './migrate.ts'
import { DEFAULT_SCHEDULE } from '../data/quests.ts'
import { localDateKey } from './week.ts'
import { WELCOME_COINS } from './types.ts'
import { DEFAULT_LOOKS } from './avatar.ts'

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

function initialChild(id: 'theodore' | 'leonard'): ChildState {
  return {
    coins: WELCOME_COINS,
    stars: 0,
    inventory: ['toy-train'],
    equipped: { hat: null, toy: 'toy-train' },
    placed: {},
    wishItem: null,
    league: initialLeague(),
    look: { ...DEFAULT_LOOKS[id] },
  }
}

export function initialState(now: Date = new Date(), timeZone = 'UTC'): GameState {
  const at = now.toISOString()
  return {
    schemaVersion: 9,
    timeZone,
    createdAt: at,
    config: structuredClone(DEFAULT_CHILD_CONFIG),
    scheduleHistory: [
      { effectiveFrom: localDateKey(now, timeZone), schedule: structuredClone(DEFAULT_SCHEDULE) },
    ],
    pausedDates: { theodore: [], leonard: [] },
    children: {
      theodore: initialChild('theodore'),
      leonard: initialChild('leonard'),
    },
    claims: {},
    purchases: {},
    ledger: [
      { id: 'welcome-theodore', childId: 'theodore', coins: WELCOME_COINS, stars: 0, reason: 'welcome', refId: 'welcome', at },
      { id: 'welcome-leonard', childId: 'leonard', coins: WELCOME_COINS, stars: 0, reason: 'welcome', refId: 'welcome', at },
    ],
    settings: { sound: true },
    city: initialCity(),
    weekly: { theodore: {}, leonard: {} },
    badges: [],
    repairs: {},
    customQuests: {},
  }
}
