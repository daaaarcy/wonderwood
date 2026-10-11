/**
 * Runtime explorer renderer — every look is drawn procedurally in the same
 * flat picture-book style as the hand-authored explorer SVGs (which this file
 * reproduces exactly for the default looks). Head geometry never moves so the
 * hat headAnchor {x:100,y:20} keeps working for every look.
 */
import type {
  AvatarLook,
  EyeStyle,
  GlassesStyle,
  HairStyle,
  MouthStyle,
} from '../domain/avatar.ts'

export type ExplorerPose = 'idle' | 'blink' | 'cheer'

/* ---------------- color helpers ---------------- */

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

/** Multiply channels — tunic → shorts, skin → inner ear. */
function shade(hex: string, f: number): string {
  const [r, g, b] = hexToRgb(hex)
  return rgbToHex(r * f, g * f, b * f)
}

/** Mix toward white — hair highlights. */
function lighten(hex: string, f: number): string {
  const [r, g, b] = hexToRgb(hex)
  return rgbToHex(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f)
}

/* ---------------- hair ---------------- */

/** Hair drawn behind the head ellipse (long strands). */
function hairBack(style: HairStyle, color: string): string {
  if (style === 'long') {
    return (
      `<g fill="${color}">` +
      `<rect x="34" y="42" width="26" height="96" rx="13"/>` +
      `<rect x="140" y="42" width="26" height="96" rx="13"/>` +
      `<rect x="42" y="34" width="116" height="34" rx="17"/>` +
      `</g>`
    )
  }
  return ''
}

/** Hair drawn over the head dome. */
function hairTop(style: HairStyle, color: string): string {
  const hi = lighten(color, 0.14)
  switch (style) {
    case 'swoop':
      return (
        `<path d="M45 64 Q38 4 100 4 Q162 4 155 64 Q147 42 130 35 Q137 46 132 53 Q117 33 95 31 Q66 29 56 45 Q49 54 45 64 Z" fill="${color}"/>` +
        `<path d="M62 27 Q76 12 99 10 Q83 19 75 33 Z" fill="${hi}"/>`
      )
    case 'curly':
      return (
        `<g fill="${color}">` +
        `<circle cx="56" cy="32" r="16"/><circle cx="78" cy="16" r="18"/><circle cx="100" cy="11" r="18"/>` +
        `<circle cx="122" cy="16" r="18"/><circle cx="144" cy="32" r="16"/><circle cx="52" cy="50" r="13"/>` +
        `<circle cx="148" cy="50" r="13"/><circle cx="68" cy="46" r="14"/><circle cx="132" cy="46" r="14"/>` +
        `</g>`
      )
    case 'buzz':
      return (
        `<path d="M47 60 Q44 6 100 6 Q156 6 153 60 Q150 30 100 26 Q50 30 47 60 Z" fill="${color}"/>` +
        `<path d="M70 24 Q82 12 102 11 Q88 20 78 30 Z" fill="${hi}"/>`
      )
    case 'spiky':
      return (
        `<path d="M45 62 L40 40 L52 46 L48 16 L62 34 L66 6 L80 30 L88 2 L100 26 L112 2 L120 30 L134 6 L138 34 L152 16 L148 46 L160 40 L155 62 Q140 40 100 38 Q60 40 45 62 Z" fill="${color}"/>`
      )
    case 'bowl':
      return (
        `<path d="M45 62 Q38 6 100 6 Q162 6 155 62 L150 44 Q128 56 100 56 Q72 56 50 44 Z" fill="${color}"/>` +
        `<path d="M50 44 Q60 54 68 44 Q78 56 88 44 Q98 56 110 44 Q120 56 130 44 Q142 56 150 44 L155 62 Q150 46 100 44 Q50 46 45 62 Z" fill="${color}"/>` +
        `<path d="M66 22 Q82 10 104 9 Q88 18 76 28 Z" fill="${hi}"/>`
      )
    case 'long':
      return (
        `<path d="M45 62 Q38 6 100 6 Q162 6 155 62 Q148 38 118 34 Q122 44 116 50 Q110 36 92 34 Q64 32 55 46 Q48 54 45 62 Z" fill="${color}"/>` +
        `<path d="M64 25 Q78 12 100 11 Q85 20 76 32 Z" fill="${hi}"/>`
      )
    case 'bun':
      return (
        `<circle cx="100" cy="2" r="15" fill="${color}"/>` +
        `<path d="M45 62 Q38 4 100 4 Q162 4 155 62 Q147 40 130 34 Q136 44 131 52 Q116 32 96 31 Q68 30 57 46 Q50 55 45 62 Z" fill="${color}"/>` +
        `<path d="M62 27 Q76 12 99 10 Q83 19 75 33 Z" fill="${hi}"/>`
      )
    case 'mohawk':
      return (
        `<path d="M84 60 Q80 14 84 6 L92 24 L96 -6 L100 20 L104 -6 L108 24 L116 6 Q120 14 116 60 Q108 44 100 44 Q92 44 84 60 Z" fill="${color}"/>` +
        `<path d="M50 58 Q48 34 74 30 Q60 40 56 52 Z" fill="${color}"/>` +
        `<path d="M150 58 Q152 34 126 30 Q140 40 144 52 Z" fill="${color}"/>`
      )
  }
}

/* ---------------- eyes ---------------- */

/** Eyes per style; blink/cheer poses override with the shared arcs. */
function eyes(style: EyeStyle, pose: ExplorerPose): string {
  if (pose === 'blink') {
    return (
      `<path d="M65 62 q11 10 22 0" fill="none" stroke="#3c3c3c" stroke-width="5" stroke-linecap="round"/>` +
      `<path d="M113 62 q11 10 22 0" fill="none" stroke="#3c3c3c" stroke-width="5" stroke-linecap="round"/>`
    )
  }
  if (pose === 'cheer' || style === 'happy') {
    return (
      `<path d="M65 66 q11 -11 22 0" fill="none" stroke="#3c3c3c" stroke-width="5" stroke-linecap="round"/>` +
      `<path d="M113 66 q11 -11 22 0" fill="none" stroke="#3c3c3c" stroke-width="5" stroke-linecap="round"/>`
    )
  }
  switch (style) {
    case 'dot':
      return (
        `<circle cx="76" cy="64" r="5.5" fill="#3c3c3c"/>` +
        `<circle cx="124" cy="64" r="5.5" fill="#3c3c3c"/>`
      )
    case 'sleepy':
      return (
        `<path d="M64 62 a12 10 0 0 0 24 0 z" fill="#3c3c3c"/>` +
        `<path d="M112 62 a12 10 0 0 0 24 0 z" fill="#3c3c3c"/>` +
        `<path d="M64 62 h24 M112 62 h24" stroke="#3c3c3c" stroke-width="2.4" stroke-linecap="round"/>`
      )
    case 'sparkle':
      return (
        `<ellipse cx="76" cy="62" rx="10.5" ry="13" fill="#3c3c3c"/>` +
        `<ellipse cx="124" cy="62" rx="10.5" ry="13" fill="#3c3c3c"/>` +
        `<circle cx="72.5" cy="56.5" r="4" fill="#ffffff"/>` +
        `<circle cx="120.5" cy="56.5" r="4" fill="#ffffff"/>` +
        `<circle cx="80" cy="67" r="1.6" fill="#ffffff" opacity="0.85"/>` +
        `<circle cx="128" cy="67" r="1.6" fill="#ffffff" opacity="0.85"/>` +
        `<path d="M87 52 l1.8 4 4 1.8 -4 1.8 -1.8 4 -1.8 -4 -4 -1.8 4 -1.8 Z" fill="#ffffff"/>` +
        `<path d="M113 52 l1.8 4 4 1.8 -4 1.8 -1.8 4 -1.8 -4 -4 -1.8 4 -1.8 Z" fill="#ffffff"/>`
      )
    case 'round':
    default:
      return (
        `<ellipse cx="76" cy="62" rx="10.5" ry="13" fill="#3c3c3c"/>` +
        `<ellipse cx="124" cy="62" rx="10.5" ry="13" fill="#3c3c3c"/>` +
        `<circle cx="72.5" cy="56.5" r="4" fill="#ffffff"/>` +
        `<circle cx="120.5" cy="56.5" r="4" fill="#ffffff"/>` +
        `<circle cx="80" cy="67" r="1.6" fill="#ffffff" opacity="0.85"/>` +
        `<circle cx="128" cy="67" r="1.6" fill="#ffffff" opacity="0.85"/>`
      )
  }
}

/* ---------------- mouth ---------------- */

function mouth(style: MouthStyle, pose: ExplorerPose): string {
  if (pose === 'cheer') {
    return (
      `<path d="M83 80 a17 16 0 0 0 34 0 z" fill="#8c4636"/>` +
      `<ellipse cx="100" cy="92" rx="9" ry="6" fill="#ff8f7d"/>`
    )
  }
  switch (style) {
    case 'grin':
      return (
        `<path d="M76 80 a24 15 0 0 0 48 0 z" fill="#8c4636"/>` +
        `<path d="M78 80 h44 v4 a24 10 0 0 1 -44 0 z" fill="#ffffff"/>`
      )
    case 'smile':
      return `<path d="M80 82 a20 10 0 0 0 40 0 z" fill="#8c4636"/>`
    case 'tongue':
      return (
        `<path d="M84 80 a16 14 0 0 0 32 0 z" fill="#8c4636"/>` +
        `<ellipse cx="100" cy="94" rx="8" ry="7" fill="#ff8f7d"/>`
      )
    case 'o':
      return `<ellipse cx="100" cy="87" rx="7.5" ry="8.5" fill="#8c4636"/>`
    case 'open':
    default:
      return (
        `<path d="M86 82 a14 13 0 0 0 28 0 z" fill="#8c4636"/>` +
        `<ellipse cx="100" cy="90.5" rx="7" ry="4.5" fill="#ff8f7d"/>`
      )
  }
}

/* ---------------- glasses ---------------- */

function glasses(style: GlassesStyle): string {
  switch (style) {
    case 'round':
      return (
        `<g fill="none" stroke="#5a4633" stroke-width="3.4">` +
        `<circle cx="76" cy="62" r="15"/>` +
        `<circle cx="124" cy="62" r="15"/>` +
        `<path d="M91 62 q9 -7 18 0"/>` +
        `<path d="M61 60 q-11 -4 -14 -10"/>` +
        `<path d="M139 60 q11 -4 14 -10"/>` +
        `</g>`
      )
    case 'square':
      return (
        `<g fill="none" stroke="#3c3c3c" stroke-width="3.4">` +
        `<rect x="60" y="50" width="32" height="24" rx="7"/>` +
        `<rect x="108" y="50" width="32" height="24" rx="7"/>` +
        `<path d="M92 58 h16"/>` +
        `<path d="M60 56 q-10 -4 -13 -9"/>` +
        `<path d="M140 56 q10 -4 13 -9"/>` +
        `</g>`
      )
    case 'shades':
      return (
        `<g fill="#3c3c3c">` +
        `<path d="M58 50 h84 l-4 16 a20 14 0 0 1 -20 0 l-4 -10 a10 8 0 0 0 -28 0 l-4 10 a20 14 0 0 1 -20 0 z"/>` +
        `<rect x="58" y="46" width="84" height="7" rx="3.5"/>` +
        `</g>` +
        `<path d="M66 52 l12 -4" stroke="#777777" stroke-width="3" stroke-linecap="round"/>` +
        `<path d="M112 52 l12 -4" stroke="#777777" stroke-width="3" stroke-linecap="round"/>`
      )
    case 'none':
    default:
      return ''
  }
}

/* ---------------- body ---------------- */

function arms(look: AvatarLook, pose: ExplorerPose): string {
  if (pose === 'cheer') {
    return (
      `<rect x="34" y="64" width="14" height="48" rx="7" transform="rotate(28 41 88)" fill="${look.shirt}"/>` +
      `<rect x="152" y="64" width="14" height="48" rx="7" transform="rotate(-28 159 88)" fill="${look.shirt}"/>` +
      `<circle cx="31" cy="62" r="8" fill="${look.skin}"/>` +
      `<circle cx="169" cy="62" r="8" fill="${look.skin}"/>`
    )
  }
  return (
    `<rect x="45" y="118" width="14" height="44" rx="7" transform="rotate(16 52 140)" fill="${look.shirt}"/>` +
    `<rect x="141" y="118" width="14" height="44" rx="7" transform="rotate(-16 148 140)" fill="${look.shirt}"/>` +
    `<circle cx="45" cy="158" r="8" fill="${look.skin}"/>` +
    `<circle cx="155" cy="158" r="8" fill="${look.skin}"/>`
  )
}

/** The complete explorer SVG (200×240 viewBox, rasterised at 400×480). */
export function explorerSvg(look: AvatarLook, pose: ExplorerPose = 'idle'): string {
  const skinDark = shade(look.skin, 0.9)
  const shorts = shade(look.shirt, 0.85)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240" width="400" height="480">
<ellipse cx="100" cy="231" rx="46" ry="7" fill="#3c3c3c" opacity="0.08"/>
<rect x="72" y="200" width="26" height="18" rx="9" fill="#96683f"/>
<rect x="102" y="200" width="26" height="18" rx="9" fill="#96683f"/>
<rect x="72" y="211" width="26" height="7" rx="3.5" fill="#7a5230"/>
<rect x="102" y="211" width="26" height="7" rx="3.5" fill="#7a5230"/>
<rect x="84" y="168" width="13" height="36" rx="6.5" fill="${look.skin}"/>
<rect x="103" y="168" width="13" height="36" rx="6.5" fill="${look.skin}"/>
<rect x="72" y="156" width="56" height="24" rx="10" fill="${shorts}"/>
${arms(look, pose)}
<rect x="64" y="110" width="72" height="62" rx="20" fill="${look.shirt}"/>
<path d="M83 111 h34 l-17 17 z" fill="${look.scarf}"/>
<circle cx="100" cy="112" r="5.5" fill="${look.scarf}" opacity="0.85"/>
${hairBack(look.hair, look.hairColor)}
<circle cx="47" cy="66" r="8" fill="${look.skin}"/>
<circle cx="153" cy="66" r="8" fill="${look.skin}"/>
<circle cx="47" cy="66" r="3.5" fill="${skinDark}"/>
<circle cx="153" cy="66" r="3.5" fill="${skinDark}"/>
<ellipse cx="100" cy="60" rx="55" ry="53" fill="${look.skin}"/>
<ellipse cx="72" cy="28" rx="20" ry="10" fill="#ffffff" opacity="0.22" transform="rotate(-22 72 28)"/>
${hairTop(look.hair, look.hairColor)}
${eyes(look.eyes, pose)}
<ellipse cx="63" cy="80" rx="9.5" ry="6" fill="#ffab9e" opacity="0.8"/>
<ellipse cx="137" cy="80" rx="9.5" ry="6" fill="#ffab9e" opacity="0.8"/>
${mouth(look.mouth, pose)}
${glasses(look.glasses)}
</svg>`
}

/** Stable key for texture caching — identical looks share one texture. */
export function lookKey(look: AvatarLook): string {
  return [
    look.skin,
    look.hair,
    look.hairColor,
    look.eyes,
    look.mouth,
    look.glasses,
    look.shirt,
    look.scarf,
  ]
    .join('|')
    .replace(/#/g, '')
}

/** Data URI for <img>/<image>/Phaser textures. */
export function explorerDataUrl(look: AvatarLook, pose: ExplorerPose = 'idle'): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(explorerSvg(look, pose))}`
}

import type Phaser from 'phaser'

/**
 * Generate a Phaser texture for each pose of a look and call `ready(keys)`
 * once they exist. Guards against the scene being destroyed mid-load.
 */
export function registerLookTextures(
  scene: Phaser.Scene,
  prefix: string,
  look: AvatarLook,
  ready: (keys: Record<ExplorerPose, string>) => void,
): void {
  const poses: ExplorerPose[] = ['idle', 'blink', 'cheer']
  const keys = {} as Record<ExplorerPose, string>
  let done = 0
  for (const pose of poses) {
    const key = `${prefix}-${pose}`
    keys[pose] = key
    if (scene.textures.exists(key)) {
      done += 1
      if (done === poses.length) ready(keys)
      continue
    }
    const img = new Image()
    img.onload = () => {
      done += 1
      if (!scene.sys?.displayList) return
      if (!scene.textures.exists(key)) scene.textures.addImage(key, img)
      if (done === poses.length) ready(keys)
    }
    img.onerror = () => {
      done += 1
      if (done === poses.length) ready(keys)
    }
    img.src = explorerDataUrl(look, pose)
  }
}
