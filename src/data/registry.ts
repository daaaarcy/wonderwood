import type { CommandDeps } from '../domain/types'
import { fallbackHashPin } from '../domain/commands'
import { questById } from './quests'
import { itemById } from './catalogue'

/** Wires src/data lookups into the domain's injectable deps. */
export const commandDeps: CommandDeps = {
  questExists: (questId) => questById(questId) !== undefined,
  getItem: (itemId) => itemById(itemId),
  hashPin: fallbackHashPin,
}
