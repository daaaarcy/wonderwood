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
  'resident-fox': 'assets/resident-fox.svg',
  'resident-rabbit': 'assets/resident-rabbit.svg',
  'resident-bear': 'assets/resident-bear.svg',
  'resident-owl': 'assets/resident-owl.svg',
  'resident-penguin': 'assets/resident-penguin.svg',
  'resident-hedgehog': 'assets/resident-hedgehog.svg',
  'resident-squirrel': 'assets/resident-squirrel.svg',
  'resident-turtle': 'assets/resident-turtle.svg',
  'resident-panda': 'assets/resident-panda.svg',
  'resident-duck': 'assets/resident-duck.svg',
  'kit-box': 'assets/kit-box.svg',
  truck: 'assets/truck.svg',
  'icon-road': 'assets/icon-road.svg',
  'icon-library': 'assets/icon-library.svg',
  'icon-music': 'assets/icon-music.svg',
  'icon-police': 'assets/icon-police.svg',
  'icon-hospital': 'assets/icon-hospital.svg',
  'room-bg': 'assets/room-bg.svg',
  'room-bg-leonard': 'assets/room-bg-leonard.svg',
  'bed-default': 'assets/bed-default.svg',
  'bed-cosy': 'assets/bed-cosy.svg',
  'bed-house': 'assets/bed-house.svg',
  'rug-round': 'assets/rug-round.svg',
  'rug-cloud': 'assets/rug-cloud.svg',
  'chair-beanbag': 'assets/chair-beanbag.svg',
  'chair-wood': 'assets/chair-wood.svg',
  'desk-explorer': 'assets/desk-explorer.svg',
  'desk-corner': 'assets/desk-corner.svg',
  'computer-laptop': 'assets/computer-laptop.svg',
  'computer-desktop': 'assets/computer-desktop.svg',
  'shelf-books': 'assets/shelf-books.svg',
  'lamp-floor': 'assets/lamp-floor.svg',
  'decor-plant': 'assets/decor-plant.svg',
  'decor-rocket': 'assets/decor-rocket.svg',
  'decor-garland': 'assets/decor-garland.svg',
  'decor-frame': 'assets/decor-frame.svg',
  coin: 'assets/coin.svg',
  star: 'assets/star.svg',
  'icon-language': 'assets/icon-language.svg',
  'icon-letters': 'assets/icon-letters.svg',
  'icon-kindness': 'assets/icon-kindness.svg',
  'icon-typing': 'assets/icon-typing.svg',
  'icon-writing': 'assets/icon-writing.svg',
  'icon-math': 'assets/icon-math.svg',
  'icon-music-quest': 'assets/icon-music-quest.svg',
  'icon-reading': 'assets/icon-reading.svg',
  'icon-housework': 'assets/icon-housework.svg',
} as const

export type AssetKey = keyof typeof ASSET_FILES

export function assetUrl(key: AssetKey | string): string {
  return ASSET_FILES[key as AssetKey] ?? `assets/${key}.svg`
}

/** Design resolution for both scenes (matches town-bg / room-bg viewBox). */
export const GAME_WIDTH = 1000
export const GAME_HEIGHT = 700
