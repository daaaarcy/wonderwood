/**
 * Asset manifest: every image the game loads, keyed by texture key.
 * Swap a file here (e.g. for commissioned art) and the whole app picks it up.
 */
export const ASSET_FILES = {
  'explorer-theodore': 'assets/explorer-theodore.svg',
  'explorer-leonard': 'assets/explorer-leonard.svg',
  'hat-leaf': 'assets/hat-leaf.svg',
  'toy-train': 'assets/toy-train.svg',
  'island-bg': 'assets/island-bg.svg',
  'treehouse-theodore': 'assets/treehouse-theodore.svg',
  'treehouse-leonard': 'assets/treehouse-leonard.svg',
  'bridge-plank': 'assets/bridge-plank.svg',
  'room-bg': 'assets/room-bg.svg',
  coin: 'assets/coin.svg',
  star: 'assets/star.svg',
  'icon-language': 'assets/icon-language.svg',
  'icon-letters': 'assets/icon-letters.svg',
  'icon-kindness': 'assets/icon-kindness.svg',
} as const

export type AssetKey = keyof typeof ASSET_FILES

export function assetUrl(key: AssetKey | string): string {
  return ASSET_FILES[key as AssetKey] ?? `assets/${key}.svg`
}

/** Design resolution for both scenes (matches island-bg / room-bg viewBox). */
export const GAME_WIDTH = 1000
export const GAME_HEIGHT = 700
