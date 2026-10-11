/**
 * Avatar looks — each explorer's face/hair/outfit customization.
 * Pure data + validation only (this file is synced into the edge function's
 * _shared bundle); the SVG renderer lives in src/game/avatarSvg.ts.
 */
import type { ChildId } from './types.ts'

export type HairStyle =
  | 'swoop'
  | 'curly'
  | 'buzz'
  | 'spiky'
  | 'bowl'
  | 'long'
  | 'bun'
  | 'mohawk'
export type EyeStyle = 'round' | 'sparkle' | 'happy' | 'dot' | 'sleepy'
export type MouthStyle = 'open' | 'grin' | 'smile' | 'tongue' | 'o'
export type GlassesStyle = 'none' | 'round' | 'square' | 'shades'

export interface AvatarLook {
  skin: string
  hair: HairStyle
  hairColor: string
  eyes: EyeStyle
  mouth: MouthStyle
  glasses: GlassesStyle
  /** Explorer tunic color. */
  shirt: string
  /** Neckerchief color. */
  scarf: string
}

export const HAIR_STYLES: readonly HairStyle[] = [
  'swoop',
  'curly',
  'buzz',
  'spiky',
  'bowl',
  'long',
  'bun',
  'mohawk',
]
export const EYE_STYLES: readonly EyeStyle[] = ['round', 'sparkle', 'happy', 'dot', 'sleepy']
export const MOUTH_STYLES: readonly MouthStyle[] = ['open', 'grin', 'smile', 'tongue', 'o']
export const GLASSES_STYLES: readonly GlassesStyle[] = ['none', 'round', 'square', 'shades']

/* Brand hexes from src/ui/theme.ts (PALETTE). */
export const SKIN_TONES = ['#ffe0c4', '#ffd3ac', '#f1b98c', '#d39a6a', '#a8714a', '#7a4e33']
export const HAIR_COLORS = [
  '#1f1a17',
  '#3a2e28',
  '#7a4f33',
  '#b5763c',
  '#e8b64c',
  '#c9542f',
  '#8e6fd1',
  '#1cb0f6',
]
/** Used for both shirt and scarf tiles. */
export const OUTFIT_COLORS = [
  '#1cb0f6',
  '#ff9600',
  '#58cc02',
  '#ff4b4b',
  '#ce82ff',
  '#ffc800',
  '#2b70c9',
  '#3c3c3c',
]

export const DEFAULT_LOOKS: Record<ChildId, AvatarLook> = {
  theodore: {
    skin: '#ffd3ac',
    hair: 'swoop',
    hairColor: '#7a4f33',
    eyes: 'round',
    mouth: 'open',
    glasses: 'none',
    shirt: '#1cb0f6',
    scarf: '#ff9600',
  },
  leonard: {
    skin: '#ffd3ac',
    hair: 'curly',
    hairColor: '#3a2e28',
    eyes: 'round',
    mouth: 'open',
    glasses: 'none',
    shirt: '#ff9600',
    scarf: '#1cb0f6',
  },
}

const isColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)

export function isValidLook(x: unknown): x is AvatarLook {
  if (typeof x !== 'object' || x === null) return false
  const l = x as Record<string, unknown>
  return (
    isColor(l.skin) &&
    SKIN_TONES.includes(l.skin) &&
    HAIR_STYLES.includes(l.hair as HairStyle) &&
    HAIR_COLORS.includes(l.hairColor as string) &&
    EYE_STYLES.includes(l.eyes as EyeStyle) &&
    MOUTH_STYLES.includes(l.mouth as MouthStyle) &&
    GLASSES_STYLES.includes(l.glasses as GlassesStyle) &&
    OUTFIT_COLORS.includes(l.shirt as string) &&
    OUTFIT_COLORS.includes(l.scarf as string)
  )
}
