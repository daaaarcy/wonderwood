/**
 * Wonderwood palette — flat, saturated, Duolingo-inspired.
 * The same hexes are used inside the hand-authored SVGs in public/assets,
 * so art and UI always match.
 */
export const PALETTE = {
  // surfaces & text
  white: '#ffffff',
  bg: '#f7f7f7',
  border: '#e5e5e5',
  text: '#3c3c3c',
  textSoft: '#777777',
  disabled: '#afafaf',

  // accent + darker "lip" used for the chunky 3D edge
  green: '#58cc02',
  greenLip: '#58a700',
  blue: '#1cb0f6',
  blueLip: '#1899d6',
  yellow: '#ffc800',
  yellowLip: '#e5b400',
  orange: '#ff9600',
  orangeLip: '#e08600',
  red: '#ff4b4b',
  redLip: '#ea2b2b',
  purple: '#ce82ff',
  purpleLip: '#a568cc',

  // explorer identities
  theodore: '#1cb0f6',
  theodoreDark: '#1899d6',
  leonard: '#ff9600',
  leonardDark: '#e08600',

  // nature (scenes only — UI stays neutral)
  skyTop: '#7ed6f2',
  skyBottom: '#eafbff',
  sun: '#ffc800',
  cloud: '#ffffff',
  sea: '#4fb0d8',
  seaDeep: '#1899d6',
  sand: '#ffd98e',
  grass: '#58cc02',
  grassDark: '#46a302',
  leaf: '#58cc02',
  leafDark: '#58a700',
  trunk: '#96683f',
  wood: '#c98a5a',
  woodDark: '#a06a42',
  skin: '#ffd3ac',
  skinDark: '#f5bc8e',
  hairBrown: '#7a4f33',
  hairBrownDark: '#644027',
  hairDark: '#3a2e28',
  coin: '#ffc800',
  coinEdge: '#e5b400',
  star: '#ffc800',
  starEdge: '#e5b400',
  rainbow: ['#ff4b4b', '#ff9600', '#ffc800', '#58cc02', '#1cb0f6', '#ce82ff'],
} as const

export const FONT_FAMILY = "'Nunito', ui-rounded, 'SF Pro Rounded', system-ui, sans-serif"
