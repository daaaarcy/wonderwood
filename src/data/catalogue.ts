import type { CatalogItem, ItemSpot } from '../domain/types.ts'

export interface ShopItem extends CatalogItem {
  blurb: string
  /**
   * For hats: the point inside the hat SVG (fraction of its width/height)
   * that attaches to the explorer's headAnchor.
   */
  anchor?: { x: number; y: number }
  /** Never listed in the shop (e.g. the free starter bed the room draws). */
  hidden?: boolean
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
  /* ---------------- Room furniture & decor ---------------- */
  {
    id: 'bed-default',
    name: 'Starter bed',
    slot: 'furniture',
    spot: 'bed',
    price: 0,
    assetKey: 'bed-default',
    hidden: true,
    blurb: 'The cosy little bed every explorer starts with.',
  },
  {
    id: 'bed-cosy',
    name: 'Cosy wooden bed',
    slot: 'furniture',
    spot: 'bed',
    price: 180,
    assetKey: 'bed-cosy',
    blurb: 'Warm wood, a quilted blanket and the softest pillow.',
  },
  {
    id: 'bed-house',
    name: 'House-frame bed',
    slot: 'furniture',
    spot: 'bed',
    price: 240,
    assetKey: 'bed-house',
    blurb: 'A bed shaped like a tiny house — sleep inside your own den!',
  },
  {
    id: 'rug-round',
    name: 'Round rug',
    slot: 'furniture',
    spot: 'rug',
    price: 60,
    assetKey: 'rug-round',
    blurb: 'A squishy round rug, perfect under the train track.',
  },
  {
    id: 'rug-cloud',
    name: 'Cloud rug',
    slot: 'furniture',
    spot: 'rug',
    price: 80,
    assetKey: 'rug-cloud',
    blurb: 'A fluffy cloud that lives on your floor.',
  },
  {
    id: 'chair-beanbag',
    name: 'Beanbag',
    slot: 'furniture',
    spot: 'chair',
    price: 80,
    assetKey: 'chair-beanbag',
    blurb: 'Flop into it after a long day of exploring.',
  },
  {
    id: 'chair-wood',
    name: 'Wooden chair',
    slot: 'furniture',
    spot: 'chair',
    price: 60,
    assetKey: 'chair-wood',
    blurb: 'A sturdy little chair for desk adventures.',
  },
  {
    id: 'desk-explorer',
    name: 'Explorer desk',
    slot: 'furniture',
    spot: 'desk',
    price: 120,
    assetKey: 'desk-explorer',
    blurb: 'With a drawer for maps and a spot for treasures.',
  },
  {
    id: 'desk-corner',
    name: 'Corner desk',
    slot: 'furniture',
    spot: 'desk',
    price: 160,
    assetKey: 'desk-corner',
    blurb: 'A big corner desk with room for everything.',
  },
  {
    id: 'computer-laptop',
    name: 'Toy laptop',
    slot: 'furniture',
    spot: 'computer',
    price: 200,
    assetKey: 'computer-laptop',
    blurb: 'Clickety-clack! A laptop for typing practice.',
  },
  {
    id: 'computer-desktop',
    name: 'Toy computer',
    slot: 'furniture',
    spot: 'computer',
    price: 220,
    assetKey: 'computer-desktop',
    blurb: 'A big friendly screen for important explorer work.',
  },
  {
    id: 'shelf-books',
    name: 'Book shelf',
    slot: 'furniture',
    spot: 'shelf',
    price: 120,
    assetKey: 'shelf-books',
    blurb: 'A tall shelf that keeps every adventure book tidy.',
  },
  {
    id: 'lamp-floor',
    name: 'Floor lamp',
    slot: 'furniture',
    spot: 'lamp',
    price: 60,
    assetKey: 'lamp-floor',
    blurb: 'A warm glow for reading corner evenings.',
  },
  {
    id: 'decor-plant',
    name: 'Leafy plant',
    slot: 'furniture',
    spot: 'decor',
    price: 40,
    assetKey: 'decor-plant',
    blurb: 'A cheerful plant that hangs on your wall.',
  },
  {
    id: 'decor-rocket',
    name: 'Rocket poster',
    slot: 'furniture',
    spot: 'decor',
    price: 30,
    assetKey: 'decor-rocket',
    blurb: 'Blast off! A poster of a rocket heading to the stars.',
  },
  {
    id: 'decor-garland',
    name: 'Star garland',
    slot: 'furniture',
    spot: 'decor',
    price: 40,
    assetKey: 'decor-garland',
    blurb: 'A string of paper stars to brighten your wall.',
  },
  {
    id: 'decor-frame',
    name: 'Picture frame',
    slot: 'furniture',
    spot: 'decor',
    price: 30,
    assetKey: 'decor-frame',
    blurb: 'A framed drawing of your favourite day out.',
  },
]

/** Spot groups for shop display ("My room" tab). */
export const FURNITURE_GROUPS: { title: string; spots: ItemSpot[] }[] = [
  { title: 'Beds', spots: ['bed'] },
  { title: 'Rugs', spots: ['rug'] },
  { title: 'Seats & desks', spots: ['chair', 'desk', 'computer'] },
  { title: 'Shelves & lamps', spots: ['shelf', 'lamp'] },
  { title: 'Decorations', spots: ['decor'] },
]

export function itemById(itemId: string): ShopItem | undefined {
  return CATALOGUE.find((i) => i.id === itemId)
}
