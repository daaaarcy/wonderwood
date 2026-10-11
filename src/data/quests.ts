import type { ChildId, DaySchedule } from '../domain/types.ts'

export type QuestCategory =
  | 'language'
  | 'typing'
  | 'writing'
  | 'math'
  | 'music'
  | 'reading'
  | 'housework'
  | 'kindness'

export type QuestKind =
  | { type: 'external'; url?: string; buttonLabel?: string }
  | { type: 'challenge'; challengeId: 'math' }
  | { type: 'reading' }
  | { type: 'real-world' }

export interface QuestDef {
  id: string
  /** who may claim it */
  childIds: ChildId[]
  /** short, child-facing title */
  label: string
  category: QuestCategory
  kind: QuestKind
  iconKey: string
  /** grown-up-only context (schedule editor / approvals) */
  note?: string
  /** kept so old claims still render */
  retired?: boolean
}

export const QUESTS: QuestDef[] = [
  // ---------------- Theodore ----------------
  {
    id: 'spanish',
    childIds: ['theodore'],
    label: 'Spanish lesson',
    category: 'language',
    kind: { type: 'external', url: 'https://www.duolingo.com', buttonLabel: 'Open Duolingo' },
    iconKey: 'icon-language',
  },
  {
    id: 'typing',
    childIds: ['theodore'],
    label: 'Typing practice',
    category: 'typing',
    kind: { type: 'external', buttonLabel: 'Open typing' }, // url from config.typingUrl
    iconKey: 'icon-typing',
    note: 'Set the typing site link in the grown-up settings.',
  },
  {
    id: 'zoo-nightkeeper',
    childIds: ['theodore'],
    label: 'Zoo Nightkeeper',
    category: 'writing',
    kind: { type: 'external', url: 'https://www.nightzookeeper.com', buttonLabel: 'Open Zoo Nightkeeper' },
    iconKey: 'icon-writing',
  },
  {
    id: 'math-mission',
    childIds: ['theodore'],
    label: "Builders' math",
    category: 'math',
    kind: { type: 'challenge', challengeId: 'math' },
    iconKey: 'icon-math',
  },
  {
    id: 'spanish-extra',
    childIds: ['theodore'],
    label: 'Extra Spanish',
    category: 'language',
    kind: { type: 'external', url: 'https://www.duolingo.com', buttonLabel: 'Open Duolingo' },
    iconKey: 'icon-language',
  },
  {
    id: 'french-explore',
    childIds: ['theodore'],
    label: 'Try some French',
    category: 'language',
    kind: { type: 'external', url: 'https://www.duolingo.com', buttonLabel: 'Open Duolingo' },
    iconKey: 'icon-language',
    note: 'Just exploring — never compulsory.',
  },
  // ---------------- Leonard ----------------
  {
    id: 'violin',
    childIds: ['leonard'],
    label: 'Violin practice',
    category: 'music',
    kind: { type: 'real-world' },
    iconKey: 'icon-music-quest',
    note: 'Reward is for completing the goal, not for playing perfectly.',
  },
  {
    id: 'reading',
    childIds: ['leonard'],
    label: 'Reading',
    category: 'reading',
    kind: { type: 'reading' },
    iconKey: 'icon-reading',
  },
  {
    id: 'math-counting',
    childIds: ['leonard'],
    label: 'Counting for builders',
    category: 'math',
    kind: { type: 'challenge', challengeId: 'math' },
    iconKey: 'icon-math',
  },
  // ---------------- shared ----------------
  {
    id: 'housework',
    childIds: ['theodore', 'leonard'],
    label: 'Helping at home',
    category: 'housework',
    kind: { type: 'real-world' },
    iconKey: 'icon-housework',
  },
  {
    id: 'kindness',
    childIds: ['theodore', 'leonard'],
    label: 'Do a kind thing',
    category: 'kindness',
    kind: { type: 'real-world' },
    iconKey: 'icon-kindness',
  },
  // ---------------- retired (Stage 1 ids kept so history renders) ----------------
  { id: 'theodore-language', childIds: ['theodore'], label: 'Do your Duolingo lesson', category: 'language', kind: { type: 'real-world' }, iconKey: 'icon-language', retired: true },
  { id: 'theodore-letters', childIds: ['theodore'], label: 'Typing practice', category: 'typing', kind: { type: 'real-world' }, iconKey: 'icon-letters', retired: true },
  { id: 'theodore-kindness', childIds: ['theodore'], label: 'Do a kind or helpful thing', category: 'kindness', kind: { type: 'real-world' }, iconKey: 'icon-kindness', retired: true },
  { id: 'leonard-language', childIds: ['leonard'], label: 'Play the word picture game', category: 'language', kind: { type: 'real-world' }, iconKey: 'icon-language', retired: true },
  { id: 'leonard-letters', childIds: ['leonard'], label: 'Trace three letters', category: 'writing', kind: { type: 'real-world' }, iconKey: 'icon-letters', retired: true },
  { id: 'leonard-kindness', childIds: ['leonard'], label: 'Help tidy up', category: 'kindness', kind: { type: 'real-world' }, iconKey: 'icon-kindness', retired: true },
]

export function questById(questId: string): QuestDef | undefined {
  return QUESTS.find((q) => q.id === questId)
}

const EVERY_DAY = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 } as const

/** Weekday-aware core map: same three quests every day (0=Mon..6=Sun). */
function daily(...ids: string[]): Record<number, string[]> {
  return Object.fromEntries(Object.keys(EVERY_DAY).map((d) => [Number(d), [...ids]]))
}

/** New-family defaults. */
export const DEFAULT_SCHEDULE: Record<ChildId, DaySchedule> = {
  theodore: {
    core: daily('spanish', 'typing', 'zoo-nightkeeper'),
    bonus: ['math-mission', 'spanish-extra', 'french-explore', 'housework'],
  },
  leonard: {
    core: daily('violin', 'reading', 'math-counting'),
    bonus: ['housework'],
  },
}

/** Stage-1 schedule — kept as scheduleHistory[0] for weeks before the v5 migration. */
export const LEGACY_SCHEDULE: Record<ChildId, DaySchedule> = {
  theodore: { core: daily('theodore-language', 'theodore-letters', 'theodore-kindness'), bonus: [] },
  leonard: { core: daily('leonard-language', 'leonard-letters', 'leonard-kindness'), bonus: [] },
}

export const DEFAULT_HOUSEWORK_JOBS = [
  'Put away the agreed toys',
  'Sort the socks',
  'Arrange the books',
  'Water a plant',
]
