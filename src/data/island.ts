export interface IslandChapter {
  id: string
  name: string
  /** Total approved stars (both children together) needed to finish. */
  planks: number
}

export const CHAPTER_ONE: IslandChapter = {
  id: 'rainbow-bridge',
  name: 'Rainbow Bridge',
  planks: 12,
}
