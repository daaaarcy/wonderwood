/**
 * Built-in math challenges — procedurally generated, seeded so a run is
 * deterministic (seed = childId + date + runIndex). Pure: no UI, no dates.
 */

export type MathLevel = 1 | 2 | 3

export interface ChallengeQuestion {
  /** kid-facing prompt text */
  prompt: string
  /** picture tokens to draw (e.g. 4× 'box' for count) */
  picture: string[]
  /** optional second group for "which is more" questions */
  pictureB?: string[]
  options: number[]
  answerIndex: number
  /** custom button labels for non-numeric options ("more" question) */
  labels?: string[]
  /** gentle text hint (e.g. "Count the bricks one by one") */
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

/** Three distinct options incl. the answer, shuffled. */
function optionsFor(rng: () => number, answer: number, near: number[]): { options: number[]; answerIndex: number } {
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

function countQuestion(rng: () => number): ChallengeQuestion {
  const n = 1 + Math.floor(rng() * 10)
  const token = pick(rng, BRICKS)
  const { options, answerIndex } = optionsFor(rng, n, [n - 1, n + 1, n + 2])
  return {
    prompt: 'How many do you see?',
    picture: Array.from({ length: n }, () => token),
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
  return {
    prompt: `${a} ${add ? '+' : '−'} ${b} = ?`,
    picture: Array.from({ length: a }, () => token),
    pictureB: Array.from({ length: b }, () => (add ? 'add' : 'away')),
    options,
    answerIndex,
    hint: add ? `Start at ${a}, then count on ${b} more.` : `Start at ${a}, take away ${b}.`,
  }
}

function groupsQuestion(rng: () => number): ChallengeQuestion {
  const mult = pick(rng, [2, 5, 10])
  const groups = 2 + Math.floor(rng() * 4)
  const answer = mult * groups
  const { options, answerIndex } = optionsFor(rng, answer, [answer - mult, answer + mult, answer + 1])
  return {
    prompt: `${groups} boxes of ${mult} bricks — how many bricks?`,
    picture: Array.from({ length: groups }, () => 'box'),
    options,
    answerIndex,
    hint: `Count by ${mult}s: ${Array.from({ length: groups }, (_, i) => mult * (i + 1)).join(', ')}…`,
  }
}

/**
 * Build a ~3-question run for a math level. Deterministic per seed.
 * L1 counting/more/order; L2 add/sub ≤20; L3 add/sub ≤100 + times-groups.
 */
export function generateChallenge(level: MathLevel, seed: string): ChallengeQuestion[] {
  const rng = rngFromSeed(seed)
  switch (level) {
    case 1:
      return [countQuestion(rng), moreQuestion(rng), orderQuestion(rng)]
    case 2:
      return [addSub(rng, 20), addSub(rng, 20), countQuestion(rng)]
    case 3:
      return [addSub(rng, 100), addSub(rng, 100), groupsQuestion(rng)]
  }
}

/** Special handling for ordering questions: the full sorted sequence. */
export function orderSequence(q: ChallengeQuestion): number[] {
  return [...q.options].sort((a, b) => a - b)
}
