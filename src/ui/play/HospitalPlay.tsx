import { useMemo, useState } from 'react'

const PAIRS = ['🩹', '🌡️', '❤️']

/** Teddy care — a gentle 6-card memory match, ending with a happy teddy. */
export function HospitalPlay() {
  const cards = useMemo(() => {
    const all = [...PAIRS, ...PAIRS].map((pic, i) => ({ id: i, pic }))
    // small deterministic shuffle
    for (let i = all.length - 1; i > 0; i -= 1) {
      const j = (i * 7 + 3) % (i + 1)
      ;[all[i], all[j]] = [all[j] ?? { id: -1, pic: '' }, all[i] ?? { id: -1, pic: '' }]
    }
    return all
  }, [])
  const [flipped, setFlipped] = useState<number[]>([])
  const [matched, setMatched] = useState<number[]>([])
  const [lock, setLock] = useState(false)

  const done = matched.length === cards.length

  const flip = (i: number) => {
    if (lock || flipped.includes(i) || matched.includes(i)) return
    const next = [...flipped, i]
    setFlipped(next)
    if (next.length === 2) {
      const [a, b] = next as [number, number]
      if (cards[a]?.pic === cards[b]?.pic) {
        setMatched((m) => [...m, a, b])
        setFlipped([])
      } else {
        setLock(true)
        setTimeout(() => {
          setFlipped([])
          setLock(false)
        }, 800)
      }
    }
  }

  return (
    <div className="hospital-play">
      {done ? (
        <div className="teddy-done" data-testid="teddy-done">
          <span className="big-teddy">🧸</span>
          <span className="teddy-bandage">🩹</span>
          <p className="cheer-note">All better! Teddy feels wonderful.</p>
        </div>
      ) : (
        <>
          <p className="muted">Match the care items to help teddy feel better.</p>
          <div className="memory-grid" data-testid="memory-grid">
            {cards.map((c, i) => {
              const up = flipped.includes(i) || matched.includes(i)
              return (
                <button
                  key={c.id}
                  className={`memory-card ${up ? 'up' : ''} ${matched.includes(i) ? 'matched' : ''}`}
                  onClick={() => flip(i)}
                  aria-label={up ? c.pic : 'Card face down'}
                >
                  {up ? c.pic : '🩹'}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
