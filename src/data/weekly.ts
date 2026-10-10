import type { ChildId } from '../domain/types.ts'

/** A weekly challenge: approved claims of these quests on N distinct days. */
export interface WeeklyTemplate {
  id: string
  title: string
  questIds: string[]
  days: number
}

export const WEEKLY_TEMPLATES: WeeklyTemplate[] = [
  { id: 'read-4', title: 'Read on 4 different days', questIds: ['reading'], days: 4 },
  { id: 'violin-4', title: 'Practise violin on 4 different days', questIds: ['violin'], days: 4 },
  { id: 'spanish-4', title: 'Spanish on 4 different days', questIds: ['spanish'], days: 4 },
  { id: 'housework-3', title: 'Help at home on 3 different days', questIds: ['housework'], days: 3 },
  {
    id: 'math-3',
    title: 'Do a math challenge on 3 different days',
    questIds: ['math-mission', 'math-counting'],
    days: 3,
  },
]

export const DEFAULT_WEEKLY: Record<ChildId, string> = {
  theodore: 'spanish-4',
  leonard: 'read-4',
}

export function weeklyTemplateById(id: string): WeeklyTemplate | undefined {
  return WEEKLY_TEMPLATES.find((t) => t.id === id)
}
