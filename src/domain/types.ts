export type ChildId = 'theodore' | 'leonard'

export const CHILD_IDS: ChildId[] = ['theodore', 'leonard']

export type EquipSlot = 'hat' | 'toy'
export type ClaimStatus = 'pending' | 'approved' | 'rejected'
export type LedgerReason = 'welcome' | 'quest' | 'purchase' | 'kit'

export interface LedgerEntry {
  id: string
  childId: ChildId
  coins: number
  stars: number
  reason: LedgerReason
  refId: string
  at: string
}

export interface Claim {
  id: string
  childId: ChildId
  questId: string
  /** Local YYYY-MM-DD of the day the child tapped "I did it!" */
  activityDate: string
  status: ClaimStatus
  claimedAt: string
  decidedAt?: string
}

export interface Purchase {
  id: string
  childId: ChildId
  itemId: string
  price: number
  at: string
}

/** Explorer League progress. rank is 1..14, promotions only ever go up. */
export interface LeagueState {
  rank: number
  /** weekKey (ISO Monday) → whether that week earned a promotion */
  evaluatedWeeks: Record<string, { promoted: boolean }>
  /** Set when a promotion happened and the child hasn't been shown it yet. */
  unseenPromotion: { from: number; to: number } | null
}

export interface ChildState {
  coins: number
  stars: number
  inventory: string[]
  equipped: { hat: string | null; toy: string | null }
  wishItem: string | null
  league: LeagueState
}

/* ---------------- Town / city ---------------- */

/** Town projects (defs in src/data/city.ts). */
export type ProjectId = 'road' | 'library' | 'music-school' | 'police-station' | 'hospital'

export type ProjectStatus = 'locked' | 'building' | 'open'

export interface CityProjectState {
  kits: number
  status: ProjectStatus
  openedAt?: string
}

export interface CityState {
  currentProjectId: ProjectId | null
  suggestedProjectId: ProjectId | null
  projects: Record<ProjectId, CityProjectState>
  /** Kit purchase log, keyed by kitPurchaseId for idempotency. */
  kitPurchases: Record<
    string,
    { id: string; childId: ChildId; projectId: ProjectId; at: string }
  >
  /** Keepsake from the island era — frozen at migration, never spent. */
  foundersBridgePlanks: number
}

export interface GameState {
  schemaVersion: 3
  /** ISO timestamp of when this save was first created. */
  createdAt: string
  children: Record<ChildId, ChildState>
  claims: Record<string, Claim>
  purchases: Record<string, Purchase>
  ledger: LedgerEntry[]
  parentPinHash: string | null
  /** Per-device settings. */
  settings: { sound: boolean }
  city: CityState
}

export interface CatalogItem {
  id: string
  name: string
  slot: EquipSlot
  price: number
  assetKey: string
}

export type Command =
  | { type: 'claimQuest'; childId: ChildId; questId: string; claimId: string }
  | { type: 'approveClaim'; claimId: string }
  | { type: 'rejectClaim'; claimId: string }
  | { type: 'parentCompleteAndApprove'; childId: ChildId; questId: string; claimId: string }
  | { type: 'purchase'; childId: ChildId; itemId: string; purchaseId: string }
  | { type: 'equip'; childId: ChildId; slot: EquipSlot; itemId: string | null }
  | { type: 'setWish'; childId: ChildId; itemId: string | null }
  | { type: 'setParentPin'; pin: string; pinHash?: string }
  | { type: 'evaluateLeagues' }
  | { type: 'acknowledgePromotion'; childId: ChildId }
  | { type: 'setSound'; enabled: boolean }
  | { type: 'buyKit'; childId: ChildId; projectId: ProjectId; kitPurchaseId: string }
  | { type: 'suggestProject'; childId: ChildId; projectId: ProjectId }
  | { type: 'chooseNextProject'; projectId: ProjectId }

export type DomainErrorCode =
  | 'already-claimed-today'
  | 'unknown-claim'
  | 'claim-not-pending'
  | 'unknown-quest'
  | 'unknown-item'
  | 'already-owned'
  | 'insufficient-coins'
  | 'item-not-owned'
  | 'wrong-slot'
  | 'invalid-pin'
  | 'not-current-project'
  | 'project-complete'

export interface DomainError {
  code: DomainErrorCode
  message: string
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: DomainError }

export interface CommandOutcome<T> {
  state: GameState
  result: Result<T>
}

/** Data lookups the domain needs, injected so domain stays free of data imports. */
export interface CommandDeps {
  questExists: (questId: string) => boolean
  getItem: (itemId: string) => CatalogItem | undefined
  /** Town project def (kits required); undefined for unknown ids. */
  getProject: (projectId: string) => { id: ProjectId; kits: number } | undefined
  /** Sync hasher for PINs. The UI passes a pre-computed crypto.subtle SHA-256 in cmd.pinHash. */
  hashPin: (pin: string) => string
}

/** Quest reward — same for every quest in Stage 1. */
export const QUEST_REWARD = { coins: 10, stars: 1 } as const
export const WELCOME_COINS = 20
export const MAX_LEAGUE_RANK = 14
