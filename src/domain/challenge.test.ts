import { describe, expect, it } from 'vitest'
import { awayValue, generateChallenge, orderSequence, picValue } from './challenge.ts'

describe('challenge generator', () => {
  it('is deterministic per seed and varies by seed', () => {
    const a = generateChallenge(2, 'theodore:2026-10-10:0')
    const b = generateChallenge(2, 'theodore:2026-10-10:0')
    const c = generateChallenge(2, 'leonard:2026-10-10:0')
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
  })

  it('every level produces ~3 valid questions with the answer among options', () => {
    for (const level of [1, 2, 3] as const) {
      for (let seed = 0; seed < 8; seed += 1) {
        const qs = generateChallenge(level, `s:${seed}`)
        expect(qs).toHaveLength(3)
        for (const q of qs) {
          expect(q.prompt.length).toBeGreaterThan(0)
          expect(q.options.length).toBeGreaterThanOrEqual(2)
          if (q.answerIndex === -1) {
            // ordering question — ascending sequence must be a permutation
            expect(orderSequence(q)).toEqual([...q.options].sort((x, y) => x - y))
          } else {
            expect(q.options[q.answerIndex]).toBeDefined()
            // sanity: counting questions' answer matches the picture
            if (q.prompt === 'How many do you see?') {
              expect(q.options[q.answerIndex]).toBe(q.picture.length)
            }
          }
        }
      }
    }
  })

  it('level 1 counts are within 1–10; level 3 groups use ×2/×5/×10', () => {
    const l1 = generateChallenge(1, 'x')
    expect(l1[0].options[l1[0].answerIndex]).toBeGreaterThanOrEqual(1)
    expect(l1[0].options[l1[0].answerIndex]).toBeLessThanOrEqual(10)
    const l3 = generateChallenge(3, 'x')
    const g = l3[2]
    expect(g.prompt).toMatch(/boxes of (2|5|10)/)
  })
})

describe('picture ↔ prompt invariants (500 seeds × level)', () => {
  for (const level of [1, 2, 3] as const) {
    it(`level ${level}: options valid, pictures match the math, piles capped`, () => {
      for (let seed = 0; seed < 500; seed += 1) {
        for (const q of generateChallenge(level, `prop:${level}:${seed}`)) {
          // options: ≥2 distinct, non-negative; answer present (order: permutation)
          const distinct = new Set(q.options)
          expect(distinct.size).toBe(q.options.length)
          for (const n of q.options) expect(n).toBeGreaterThanOrEqual(0)
          if (q.kind === 'order') {
            expect(q.options.length).toBeGreaterThanOrEqual(3)
            expect(orderSequence(q)).toEqual([...q.options].sort((x, y) => x - y))
          } else if (q.kind === 'compare') {
            expect(q.options[q.answerIndex]).toBeGreaterThanOrEqual(1)
          } else {
            expect(q.options.length).toBeGreaterThanOrEqual(2)
            expect(q.options).toContain(q.options[q.answerIndex])
          }

          // every pile is capped — place-value keeps pictures small
          // (singles ≤20; rods+ones sub piles can reach ~28)
          expect(q.picture.length).toBeLessThanOrEqual(30)
          if (q.pictureB) expect(q.pictureB.length).toBeLessThanOrEqual(20)

          const arith = q.prompt.match(/^(\d+) ([+−]) (\d+) = \?$/)
          if (arith) {
            const a = Number(arith[1])
            const op = arith[2]
            const b = Number(arith[3])
            expect(q.options[q.answerIndex]).toBe(op === '+' ? a + b : a - b)
            if (op === '+') {
              // two piles of a and b — counting them all gives the answer
              expect(picValue(q.picture)).toBe(a)
              expect(picValue(q.pictureB ?? [])).toBe(b)
            } else {
              // one pile of a, b worth crossed out
              expect(picValue(q.picture)).toBe(a)
              expect(awayValue(q.picture)).toBe(b)
            }
          }
          const missing = q.prompt.match(/^(\d+) \+ \? = (\d+)$/)
          if (missing) {
            expect(picValue(q.picture)).toBe(Number(missing[1]))
            expect(q.options[q.answerIndex]).toBe(Number(missing[2]) - Number(missing[1]))
          }
          if (q.prompt === 'How many do you see?') {
            expect(picValue(q.picture)).toBe(q.options[q.answerIndex])
          }
          const groups = q.prompt.match(/^(\d+) boxes of (\d+)/)
          if (groups) {
            expect(q.picture).toHaveLength(Number(groups[1]))
            for (const t of q.picture) expect(t).toBe(`box:${groups[2]}`)
          }
        }
      }
    })
  }
})
