/**
 * Explorer League ladder — exact order/names/colors. Rank 1 is the start,
 * rank 14 is the top. Promotions only ever go up; there is no relegation.
 */
export interface LeagueDef {
  rank: number
  name: string
  color: string
}

export const LEAGUES: LeagueDef[] = [
  { rank: 1, name: 'Plastic', color: '#ffffff' },
  { rank: 2, name: 'Wood', color: '#c9862f' },
  { rank: 3, name: 'Brick', color: '#873d32' },
  { rank: 4, name: 'Silver', color: '#a8a9a5' },
  { rank: 5, name: 'Gold', color: '#d5ac57' },
  { rank: 6, name: 'Sapphire', color: '#253e8e' },
  { rank: 7, name: 'Ruby', color: '#d94b65' },
  { rank: 8, name: 'Lapis Lazuli', color: '#259fca' },
  { rank: 9, name: 'Emerald', color: '#59ab45' },
  { rank: 10, name: 'Amethyst', color: '#a24fb1' },
  { rank: 11, name: 'Netherite', color: '#bf39a3' },
  { rank: 12, name: 'Obsidian', color: '#25211f' },
  { rank: 13, name: 'Gold Diamond', color: '#e9b92e' },
  { rank: 14, name: 'Special Diamond', color: '#75d8de' },
]

export function leagueByRank(rank: number): LeagueDef {
  return LEAGUES[Math.min(Math.max(rank, 1), LEAGUES.length) - 1]
}

export function leagueTitle(rank: number): string {
  return `${leagueByRank(rank).name} League`
}
