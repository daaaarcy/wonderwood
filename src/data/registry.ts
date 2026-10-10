import type { CommandDeps } from '../domain/types.ts'
import { questById } from './quests.ts'
import { itemById } from './catalogue.ts'
import { projectById } from './city.ts'

/** Wires src/data lookups into the domain's injectable deps. */
export const commandDeps: CommandDeps = {
  getQuest: (questId) => questById(questId),
  getItem: (itemId) => itemById(itemId),
  getProject: (projectId) => projectById(projectId),
}
