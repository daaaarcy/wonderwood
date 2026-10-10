/**
 * Asset manifest: every image the game loads, keyed by texture key.
 * Swap a file here (e.g. for commissioned art) and the whole app picks it up.
 */
export const ASSET_FILES = {
  'explorer-theodore': 'assets/explorer-theodore.svg',
  'explorer-theodore-blink': 'assets/explorer-theodore-blink.svg',
  'explorer-theodore-cheer': 'assets/explorer-theodore-cheer.svg',
  'explorer-leonard': 'assets/explorer-leonard.svg',
  'explorer-leonard-blink': 'assets/explorer-leonard-blink.svg',
  'explorer-leonard-cheer': 'assets/explorer-leonard-cheer.svg',
  'hat-leaf': 'assets/hat-leaf.svg',
  'toy-train': 'assets/toy-train.svg',
  'bridge-plank': 'assets/bridge-plank.svg',
  'town-bg': 'assets/town-bg.svg',
  'kit-box': 'assets/kit-box.svg',
  truck: 'assets/truck.svg',
  'icon-road': 'assets/icon-road.svg',
  'icon-library': 'assets/icon-library.svg',
  'icon-music': 'assets/icon-music.svg',
  'icon-police': 'assets/icon-police.svg',
  'icon-hospital': 'assets/icon-hospital.svg',
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

/** Design resolution for both scenes (matches town-bg / room-bg viewBox). */
export const GAME_WIDTH = 1000
export const GAME_HEIGHT = 700
