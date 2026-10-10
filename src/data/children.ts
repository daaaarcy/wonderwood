import type { ChildId } from '../domain/types'

export interface ChildDef {
  id: ChildId
  name: string
  /** Primary explorer color, also used for the treehouse flag and UI accents. */
  color: string
  darkColor: string
  /** Asset key for the full-body explorer SVG (see src/game/assets.ts). */
  explorerKey: string
  treehouseKey: string
  /**
   * Point on the explorer SVG (in its 200x240 viewBox units) where hats attach.
   * Both explorers share proportions so one anchor works for both.
   */
  headAnchor: { x: number; y: number }
}

export const EXPLORER_VIEWBOX = { width: 200, height: 240 } as const

export const CHILDREN: Record<ChildId, ChildDef> = {
  theodore: {
    id: 'theodore',
    name: 'Theodore',
    color: '#1cb0f6',
    darkColor: '#1899d6',
    explorerKey: 'explorer-theodore',
    treehouseKey: 'treehouse-theodore',
    headAnchor: { x: 100, y: 20 },
  },
  leonard: {
    id: 'leonard',
    name: 'Leonard',
    color: '#ff9600',
    darkColor: '#e08600',
    explorerKey: 'explorer-leonard',
    treehouseKey: 'treehouse-leonard',
    headAnchor: { x: 100, y: 20 },
  },
}

export const CHILD_LIST: ChildDef[] = [CHILDREN.theodore, CHILDREN.leonard]
