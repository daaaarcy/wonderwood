export type ChildId = 'theodore' | 'leonard'

export const CHILD_IDS: ChildId[] = ['theodore', 'leonard']

export type EquipSlot = 'hat' | 'toy'

/** Fixed positions in a child's room where furniture can be placed. */
export type FurnitureSpot =
  | 'bed'
  | 'rug'
  | 'chair'
  | 'desk'
  | 'computer'
  | 'shelf'
  | 'lamp'
  | 'decor-a'
  | 'decor-b'

export const FURNITURE_SPOTS: readonly FurnitureSpot[] = [
  'bed',
  'rug',
  'chair',
  'desk',
  'computer',
  'shelf',
  'lamp',
  'decor-a',
  'decor-b',
] as const

/** Decor items fit either decor spot. */
export const DECOR_SPOTS: readonly FurnitureSpot[] = ['decor-a', 'decor-b']

/** The spot a furniture item belongs to ('decor' = either decor spot). */
export type ItemSpot = Exclude<FurnitureSpot, 'decor-a' | 'decor-b'> | 'decor'

export type ClaimStatus = 'pending' | 'approved' | 'rejected'
export type ClaimRole = 'core' | 'bonus' | 'custom'
export type DateKey = string // 'YYYY-MM-DD' in the family's time zone

/** What the child actually did, for the grown-up's approval view + journal. */
export type ClaimDetails =
  | { kind: 'reading'; unit: 'book' | 'chapter'; title?: string; withGrownUp: boolean }
  | { kind: 'challenge'; hintsUsed: number; correctFirstTry: number }
  | { kind: 'housework'; job: string }
export type LedgerReason = 'welcome' | 'quest' | 'purchase' | 'kit' | 'weekly'

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
  /** 'core', 'bonus' or 'custom' — decided at claim time from that day's schedule. */
  role: ClaimRole
  status: ClaimStatus
  claimedAt: string
  decidedAt?: string
  details?: ClaimDetails
  /** v7: title stored on custom-quest claims so archived tasks still render. */
  questTitle?: string
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
  /** v7: furniture placed in the room — one item per spot. */
  placed: Partial<Record<FurnitureSpot, string>>
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
  /** v6: personalization chosen at/before opening day. */
  color?: string
  name?: string
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
  /** v6: the town's name, picked by the kids (null until named). */
  name?: string | null
  /** v6: collectible postcards — one per building that opened. */
  postcards?: Postcard[]
}

/** v6: a collectible stamped when a building opens. */
export interface Postcard {
  id: string
  projectId: ProjectId
  openedAt: string
}

export interface ChildConfig {
  mathLevel: 1 | 2 | 3
  violinGoal: string
  typingUrl: string | null
  houseworkJobs: string[]
}

/* ---------------- weekly challenge ---------------- */

/** v6: one challenge per child per week (distinct approved days). */
export interface WeeklyEntry {
  templateId: string
  completedAt?: string
}

/** v6: earned weekly badge (20 coins on completion, never stars). */
export interface WeeklyBadge {
  id: string
  childId: ChildId
  weekKey: string
  templateId: string
  earnedAt: string
}

/* ---------------- reset & repair ---------------- */

export type IncidentKind = 'spitting' | 'scattering' | 'untrue' | 'fighting' | 'other'

/** v6: a grown-up-logged repair moment. Private — never shown to the sibling. */
export interface RepairIncident {
  id: string
  childId: ChildId
  situation: IncidentKind
  /** Free-text when situation === 'other'. */
  otherText?: string
  note?: string
  /** "Toy set aside" real-world reminder (never touches in-game items). */
  toyReminder?: { text: string; returnAt?: string }
  createdAt: string
  repairedAt?: string
  /** Set when the child saw the one-time acknowledgment card. */
  acknowledgedAt?: string
}

/** Which quests are core (per weekday, 0=Mon..6=Sun) vs bonus for one child. */
export interface DaySchedule {
  core: Record<number, string[]>
  bonus: string[]
}

/**
 * v7: a task written by a grown-up. `days` holds weekdays 0=Mon..6=Sun;
 * an empty list means "every day". `active:false` = archived — kept so
 * history stays readable; claims store the title on themselves.
 */
export interface CustomQuest {
  id: string
  title: string
  coins: number
  stars: number
  childIds: ChildId[]
  days: number[]
  createdAt: string
  active: boolean
}

export interface GameState {
  schemaVersion: 8
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
  /** v6: weekly challenge per child per ISO week. */
  weekly: Record<ChildId, Record<string, WeeklyEntry>>
  /** v6: badges earned from weekly challenges. */
  badges: WeeklyBadge[]
  /** v6: grown-up repair log, keyed by incident id. */
  repairs: Record<string, RepairIncident>
  /** v7: grown-up-written tasks, keyed by quest id. */
  customQuests: Record<string, CustomQuest>
}

export interface CatalogItem {
  id: string
  name: string
  slot: EquipSlot | 'furniture'
  price: number
  assetKey: string
  /** Furniture only: which spot it belongs to ('decor' fits either). */
  spot?: ItemSpot
}

export type Command =
  | { type: 'claimQuest'; childId: ChildId; questId: string; claimId: string; details?: ClaimDetails }
  | { type: 'approveClaim'; claimId: string }
  | { type: 'rejectClaim'; claimId: string }
  | { type: 'parentCompleteAndApprove'; childId: ChildId; questId: string; claimId: string; details?: ClaimDetails }
  | { type: 'purchase'; childId: ChildId; itemId: string; purchaseId: string }
  | { type: 'equip'; childId: ChildId; slot: EquipSlot; itemId: string | null }
  | { type: 'placeItem'; childId: ChildId; spot: FurnitureSpot; itemId: string | null }
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
  | { type: 'nameCity'; childId: ChildId; name: string }
  | { type: 'customizeBuilding'; childId: ChildId; projectId: ProjectId; color?: string; name?: string | null }
  | { type: 'setWeeklyChallenge'; childId: ChildId; weekKey: string; templateId: string }
  | {
      type: 'logIncident'
      childId: ChildId
      incidentId: string
      situation: IncidentKind
      otherText?: string
      note?: string
      toyReminder?: { text: string; returnAt?: string }
    }
  | { type: 'markRepaired'; incidentId: string }
  | { type: 'deleteIncident'; incidentId: string }
  | { type: 'acknowledgeRepair'; incidentId: string }
  | {
      type: 'createCustomQuest'
      /** caller-supplied id so a re-send is a no-op (same as claimId/purchaseId) */
      questId: string
      childIds: ChildId[]
      title: string
      coins: number
      stars: number
      days: number[]
    }
  | {
      type: 'updateCustomQuest'
      id: string
      patch: Partial<Pick<CustomQuest, 'title' | 'coins' | 'stars' | 'childIds' | 'days' | 'active'>>
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
  | 'invalid-name'
  | 'invalid-color'
  | 'invalid-weekly'
  | 'unknown-incident'
  | 'incident-not-repaired'
  | 'invalid-quest'

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
/** Coins for finishing a weekly challenge (never stars, outside daily caps). */
export const WEEKLY_COINS = 20
/** Repaired incidents are pruned this many days later. */
export const REPAIR_PRUNE_DAYS = 30
/** Palette offered for building colors / city accents. */
export const CITY_PALETTE = ['#e0483e', '#ef8f1a', '#f2c40f', '#58b368', '#4a9ede', '#9a6fe0'] as const
