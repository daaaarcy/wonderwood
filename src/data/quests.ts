import type { ChildId } from '../domain/types.ts'

export type QuestKind = 'language' | 'letters' | 'kindness'

export interface QuestDef {
  id: string
  childId: ChildId
  kind: QuestKind
  label: string
  iconKey: string
}

export const QUESTS: QuestDef[] = [
  {
    id: 'theodore-language',
    childId: 'theodore',
    kind: 'language',
    label: 'Do your Duolingo lesson',
    iconKey: 'icon-language',
  },
  {
    id: 'theodore-letters',
    childId: 'theodore',
    kind: 'letters',
    label: 'Typing practice',
    iconKey: 'icon-letters',
  },
  {
    id: 'theodore-kindness',
    childId: 'theodore',
    kind: 'kindness',
    label: 'Do a kind or helpful thing',
    iconKey: 'icon-kindness',
  },
  {
    id: 'leonard-language',
    childId: 'leonard',
    kind: 'language',
    label: 'Play the word picture game',
    iconKey: 'icon-language',
  },
  {
    id: 'leonard-letters',
    childId: 'leonard',
    kind: 'letters',
    label: 'Trace three letters',
    iconKey: 'icon-letters',
  },
  {
    id: 'leonard-kindness',
    childId: 'leonard',
    kind: 'kindness',
    label: 'Help tidy up',
    iconKey: 'icon-kindness',
  },
]

export function questsFor(childId: ChildId): QuestDef[] {
  return QUESTS.filter((q) => q.childId === childId)
}

export function questById(questId: string): QuestDef | undefined {
  return QUESTS.find((q) => q.id === questId)
}
