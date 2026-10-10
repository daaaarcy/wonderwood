export type ChildId = 'theodore' | 'leonard'

export const CHILD_IDS: ChildId[] = ['theodore', 'leonard']

export type EquipSlot = 'hat' | 'toy'
export type ClaimStatus = 'pending' | 'approved' | 'rejected'
export type ClaimRole = 'core' | 'bonus'
export type DateKey = string // 'YYYY-MM-DD' in the family's time zone

/** What the child actually did, for the grown-up's approval view + journal. */
export type ClaimDetails =
  | { kind: 'reading'; unit: 'book' | 'chapter'; title?: string; withGrownUp: boolean }
  | { kind: 'challenge'; hintsUsed: number; correctFirstTry: number }
  | { kind: 'housework'; job: string }
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
  /** 'core' or 'bonus' — decided at claim time from that day's schedule. */
  role: ClaimRole
  status: ClaimStatus
  claimedAt: string
  decidedAt?: string
  details?: ClaimDetails
  /** The reward actually given — stamped at approval. */
  reward?: { coins: number; stars: number }
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

export interface ChildConfig {
  mathLevel: 1 | 2 | 3
  violinGoal: string
  typingUrl: string | null
  houseworkJobs: string[]
}

/** Which quests are core (per weekday, 0=Mon..6=Sun) vs bonus for one child. */
export interface DaySchedule {
  core: Record<number, string[]>
  bonus: string[]
}

export interface GameState {
  schemaVersion: 5
  /** Grown-up-editable per-child settings. */
  config: Record<ChildId, ChildConfig>
  /** Schedule history — a day uses the latest entry with effectiveFrom ≤ day. */
  scheduleHistory: { effectiveFrom: DateKey; schedule: Record<ChildId, DaySchedule> }[]
  /** Days with no quests ("Rest day"), per child. */
  pausedDates: Record<ChildId, DateKey[]>
  /** ISO timestamp of when this save was first created. */
  createdAt: string
  /** IANA time zone the family lives in — all activity dates/weeks are local to it. */
  timeZone: string
  children: Record<ChildId, ChildState>
  claims: Record<string, Claim>
  purchases: Record<string, Purchase>
  ledger: LedgerEntry[]
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
  | { type: 'claimQuest'; childId: ChildId; questId: string; claimId: string; details?: ClaimDetails }
  | { type: 'approveClaim'; claimId: string }
  | { type: 'rejectClaim'; claimId: string }
  | { type: 'parentCompleteAndApprove'; childId: ChildId; questId: string; claimId: string; details?: ClaimDetails }
  | { type: 'purchase'; childId: ChildId; itemId: string; purchaseId: string }
  | { type: 'equip'; childId: ChildId; slot: EquipSlot; itemId: string | null }
  | { type: 'setWish'; childId: ChildId; itemId: string | null }
  | { type: 'evaluateLeagues' }
  | { type: 'acknowledgePromotion'; childId: ChildId }
  | { type: 'setSound'; enabled: boolean }
  | { type: 'buyKit'; childId: ChildId; projectId: ProjectId; kitPurchaseId: string }
  | { type: 'suggestProject'; childId: ChildId; projectId: ProjectId }
  | { type: 'chooseNextProject'; projectId: ProjectId }
  | {
      type: 'updateSchedule'
      childId: ChildId
      core: Record<number, string[]>
      bonus: string[]
      effectiveFrom?: string
    }
  | { type: 'setPaused'; childId: ChildId; dates: string[]; paused: boolean }
  | {
      type: 'updateChildConfig'
      childId: ChildId
      patch: Partial<ChildConfig>
    }

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
  | 'rest-day'
  | 'not-scheduled'
  | 'invalid-schedule'
  | 'invalid-config'

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
/** The quest info commands need from the data layer. */
export interface QuestInfo {
  id: string
  childIds: ChildId[]
  retired?: boolean
}

export interface CommandDeps {
  getQuest: (questId: string) => QuestInfo | undefined
  getItem: (itemId: string) => CatalogItem | undefined
  /** Town project def (kits required); undefined for unknown ids. */
  getProject: (projectId: string) => { id: ProjectId; kits: number } | undefined
}

export const CORE_REWARD = { coins: 10, stars: 1 } as const
export const BONUS_REWARD = { coins: 5, stars: 0 } as const
/** Rewarded bonus activities per child per day (shared across bonus types). */
export const BONUS_SLOTS_PER_DAY = 2
export const WELCOME_COINS = 20
export const MAX_LEAGUE_RANK = 14
