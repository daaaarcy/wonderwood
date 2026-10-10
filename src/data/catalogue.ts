import type { CatalogItem } from '../domain/types'

export interface ShopItem extends CatalogItem {
  blurb: string
  /**
   * For hats: the point inside the hat SVG (fraction of its width/height)
   * that attaches to the explorer's headAnchor.
   */
  anchor?: { x: number; y: number }
}

export const CATALOGUE: ShopItem[] = [
  {
    id: 'toy-train',
    name: 'Toy train',
    slot: 'toy',
    price: 0,
    assetKey: 'toy-train',
    blurb: 'Your very first island toy. It loves to chug around its track!',
  },
  {
    id: 'hat-leaf',
    name: 'Leaf hat',
    slot: 'hat',
    price: 20,
    assetKey: 'hat-leaf',
    anchor: { x: 0.5, y: 0.86 },
    blurb: 'A big leafy hat for shady exploring.',
  },
]

export function itemById(itemId: string): ShopItem | undefined {
  return CATALOGUE.find((i) => i.id === itemId)
}
