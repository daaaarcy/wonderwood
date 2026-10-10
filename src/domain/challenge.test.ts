import { describe, expect, it } from 'vitest'
import { generateChallenge, orderSequence } from './challenge.ts'

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
            if (/^\d+ [+−] \d+ = \?$/.test(q.prompt)) {
              const [a, op, b] = q.prompt.split(' ')
              const expected = op === '+' ? Number(a) + Number(b) : Number(a) - Number(b)
              expect(q.options[q.answerIndex]).toBe(expected)
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
