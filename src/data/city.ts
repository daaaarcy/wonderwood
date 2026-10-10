/**
 * Wonderwood town — the shared city both boys build together.
 * One Building Kit = a box of supplies (never a currency): it costs
 * KIT_PRICE coins and goes straight into the current shared project.
 */
import type { ChildId, ProjectId } from '../domain/types.ts'

export const KIT_PRICE = 10

export interface ProjectDef {
  id: ProjectId
  /** Short name used in status text ("Library: 2 of 6 kits"). */
  label: string
  /** Full name ("Road extension"). */
  name: string
  /** Kits required to finish. */
  kits: number
  /** Plot center in the 1000x700 town scene. */
  pos: { x: number; y: number }
  /** Icon asset key used on signs and project cards. */
  iconKey: string
  /** Identity color for signs/cards. */
  color: string
}

export const PROJECTS: ProjectDef[] = [
  {
    id: 'road',
    label: 'Road',
    name: 'Road extension',
    kits: 2,
    pos: { x: 835, y: 440 },
    iconKey: 'icon-road',
    color: '#777777',
  },
  {
    id: 'library',
    label: 'Library',
    name: 'Library',
    kits: 6,
    pos: { x: 225, y: 545 },
    iconKey: 'icon-library',
    color: '#a568cc',
  },
  {
    id: 'music-school',
    label: 'Music school',
    name: 'Music school',
    kits: 8,
    pos: { x: 760, y: 560 },
    iconKey: 'icon-music',
    color: '#1899d6',
  },
  {
    id: 'police-station',
    label: 'Police station',
    name: 'Police station',
    kits: 10,
    pos: { x: 340, y: 190 },
    iconKey: 'icon-police',
    color: '#1cb0f6',
  },
  {
    id: 'hospital',
    label: 'Hospital',
    name: 'Hospital',
    kits: 12,
    pos: { x: 660, y: 185 },
    iconKey: 'icon-hospital',
    color: '#ea2b2b',
  },
]

export function projectById(id: string): ProjectDef | undefined {
  return PROJECTS.find((p) => p.id === id)
}

export const PROJECT_IDS: ProjectId[] = PROJECTS.map((p) => p.id)

/** The project that becomes current automatically when the road opens. */
export const NEXT_AFTER_ROAD: ProjectId = 'library'
export const STARTER_PROJECT: ProjectId = 'road'

/** A kit purchase record lives in state.city.kitPurchases. */
export interface KitPurchase {
  id: string
  childId: ChildId
  projectId: ProjectId
  at: string
}
