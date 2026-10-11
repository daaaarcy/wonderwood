/**
 * Built-in math challenges — procedurally generated, seeded so a run is
 * deterministic (seed = childId + date + runIndex). Pure: no UI, no dates.
 *
 * Picture encoding: `picture` is the first (or only) pile, `pictureB` the
 * second. Entries are token ids; 'rod' is a place-value tens rod worth 10,
 * and a '@away' suffix marks a taken-away token (subtraction). Tests can
 * always reconstruct the shown numbers via picValue/awayValue.
 */

export type MathLevel = 1 | 2 | 3

export interface ChallengeQuestion {
  /** kid-facing prompt text */
  prompt: string
  /** picture tokens to draw, first pile (see encoding notes above) */
  picture: string[]
  /** second pile for "which is more" / addition */
  pictureB?: string[]
  /** what the picture means — drives the UI layout */
  kind: 'count' | 'compare' | 'add' | 'sub' | 'groups' | 'order'
  options: number[]
  answerIndex: number
  /** custom button labels for non-numeric options */
  labels?: string[]
  /** gentle text hint */
  hint: string
}

/** mulberry32 — small fast seeded PRNG. */
export function rngFromSeed(seed: string): () => number {
  let h = 1779033703
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }
}

const BRICKS = ['brick', 'box', 'rock', 'log', 'star', 'apple']

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]
}

/** Number value shown by a token list — a rod is worth 10, anything else 1. */
export function picValue(tokens: string[]): number {
  return tokens.reduce((n, t) => n + (t.startsWith('rod') ? 10 : 1), 0)
}

/** Value marked as taken away inside a token list. */
export function awayValue(tokens: string[]): number {
  return tokens
    .filter((t) => t.endsWith('@away'))
    .reduce((n, t) => n + (t.startsWith('rod') ? 10 : 1), 0)
}

/** Tokens for a number — place value (tens rods + singles) above `rodsAfter`. */
function pileFor(n: number, token: string, rodsAfter = 20): string[] {
  if (n > rodsAfter) {
    return [
      ...Array.from({ length: Math.floor(n / 10) }, () => 'rod'),
      ...Array.from({ length: n % 10 }, () => token),
    ]
  }
  return Array.from({ length: n }, () => token)
}

/** Three distinct non-negative options incl. the answer, shuffled. */
function optionsFor(
  rng: () => number,
  answer: number,
  near: number[],
): { options: number[]; answerIndex: number } {
  const set = new Set<number>([answer])
  for (const n of near) {
    if (set.size >= 3) break
    if (n >= 0 && n !== answer) set.add(n)
  }
  let d = 1
  while (set.size < 3) set.add(answer + d++)
  const options = [...set]
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[options[i], options[j]] = [options[j], options[i]]
  }
  return { options, answerIndex: options.indexOf(answer) }
}

/** A compact count-on/count-up list for hints. */
function countOn(from: number, to: number): string {
  if (to - from <= 5) {
    return Array.from({ length: to - from }, (_, i) => from + 1 + i).join(', ')
  }
  return `${from + 1}, ${from + 2}, ${from + 3}, …, ${to}`
}

function countQuestion(rng: () => number): ChallengeQuestion {
  const n = 1 + Math.floor(rng() * 10)
  const token = pick(rng, BRICKS)
  const { options, answerIndex } = optionsFor(rng, n, [n - 1, n + 1, n + 2])
  return {
    prompt: 'How many do you see?',
    picture: Array.from({ length: n }, () => token),
    kind: 'count',
    options,
    answerIndex,
    hint: 'Point at each one and count slowly.',
  }
}

function moreQuestion(rng: () => number): ChallengeQuestion {
  const a = 2 + Math.floor(rng() * 8)
  let b = 2 + Math.floor(rng() * 8)
  while (b === a) b = 2 + Math.floor(rng() * 8)
  const tokenA = pick(rng, BRICKS)
  const tokenB = pick(rng, BRICKS.filter((t) => t !== tokenA))
  return {
    prompt: 'Which pile has MORE?',
    picture: Array.from({ length: a }, () => tokenA),
    pictureB: Array.from({ length: b }, () => tokenB),
    kind: 'compare',
    options: [1, 2],
    answerIndex: a > b ? 0 : 1,
    labels: ['First pile', 'Second pile'],
    hint: `Count the first pile, then the second.`,
  }
}

function orderQuestion(rng: () => number): ChallengeQuestion {
  const nums = new Set<number>()
  while (nums.size < 3) nums.add(1 + Math.floor(rng() * 10))
  const sorted = [...nums].sort((a, b) => a - b)
  const shuffled = [...sorted]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  void rng
  return {
    prompt: 'Tap the numbers from smallest to biggest!',
    picture: [],
    kind: 'order',
    options: shuffled,
    answerIndex: -1, // ordering question — answered by sequence, handled by UI
    hint: 'Look for the littlest number first.',
  }
}

function addSub(rng: () => number, max: number): ChallengeQuestion {
  const add = rng() < 0.5
  const a = add ? 1 + Math.floor(rng() * (max - 1)) : 2 + Math.floor(rng() * (max - 2))
  const b = add ? Math.floor(rng() * (max - a)) + 1 : 1 + Math.floor(rng() * (a - 1))
  const answer = add ? a + b : a - b
  const token = pick(rng, BRICKS)
  const { options, answerIndex } = optionsFor(rng, answer, [answer - 1, answer + 1, answer + 10])
  if (add) {
    // two piles of the SAME token — counting all gives the answer
    return {
      prompt: `${a} + ${b} = ?`,
      picture: pileFor(a, token),
      pictureB: pileFor(b, token),
      kind: 'add',
      options,
      answerIndex,
      hint: `Start at ${a} and count on ${b}: ${countOn(a, a + b)}`,
    }
  }
  // ONE pile of a — the last b worth of tokens is faded/crossed out.
  // In place-value territory (a > 20) both parts use rods+ones, so a pile
  // never spills past ~26 pieces on a phone.
  const place = a > 20 ? 0 : 20
  const picture = [
    ...pileFor(a - b, token, place),
    ...pileFor(b, token, place).map((t) => `${t}@away`),
  ]
  return {
    prompt: `${a} − ${b} = ?`,
    picture,
    kind: 'sub',
    options,
    answerIndex,
    hint:
      answer <= 5
        ? `Count up from ${b} to ${a}: ${countOn(b, a)}`
        : `Start at ${a} and count back ${b}.`,
  }
}

/** Level-2 closer: `a + ? = t` — find the missing number. */
function missingQuestion(rng: () => number): ChallengeQuestion {
  const t = 6 + Math.floor(rng() * 10) // 6–15
  const a = 2 + Math.floor(rng() * (t - 4)) // 2..t-3 → answer ≥2
  const answer = t - a
  const token = pick(rng, BRICKS)
  const { options, answerIndex } = optionsFor(rng, answer, [answer - 1, answer + 1, t - a + 2])
  return {
    prompt: `${a} + ? = ${t}`,
    picture: pileFor(a, token),
    pictureB: ['mystery'],
    kind: 'add',
    options,
    answerIndex,
    hint: `Count up from ${a} to ${t}: ${countOn(a, t)}`,
  }
}

function groupsQuestion(rng: () => number): ChallengeQuestion {
  const mult = pick(rng, [2, 5, 10])
  const groups = 2 + Math.floor(rng() * 4)
  const answer = mult * groups
  const { options, answerIndex } = optionsFor(rng, answer, [answer - mult, answer + mult, answer + 1])
  return {
    prompt: `${groups} boxes of ${mult} bricks — how many bricks?`,
    picture: Array.from({ length: groups }, () => `box:${mult}`),
    kind: 'groups',
    options,
    answerIndex,
    hint: `Count by ${mult}s: ${Array.from({ length: groups }, (_, i) => mult * (i + 1)).join(', ')}…`,
  }
}

/**
 * Build a ~3-question run for a math level. Deterministic per seed.
 * L1 counting/more/order; L2 add/sub ≤20 + missing number; L3 add/sub ≤100
 * (place-value pictures) + times-groups.
 */
export function generateChallenge(level: MathLevel, seed: string): ChallengeQuestion[] {
  const rng = rngFromSeed(seed)
  switch (level) {
    case 1:
      return [countQuestion(rng), moreQuestion(rng), orderQuestion(rng)]
    case 2:
      return [addSub(rng, 20), addSub(rng, 20), missingQuestion(rng)]
    case 3:
      return [addSub(rng, 100), addSub(rng, 100), groupsQuestion(rng)]
  }
}

/** Special handling for ordering questions: the full sorted sequence. */
export function orderSequence(q: ChallengeQuestion): number[] {
  return [...q.options].sort((a, b) => a - b)
}
