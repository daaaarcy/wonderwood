import { useMemo, useState } from 'react'
import { BandageIcon, CardBackIcon, HeartIcon, ThermoIcon, TeddyIcon } from '../components/FlatIcons'

const FACES = [
  { name: 'bandage', Face: BandageIcon },
  { name: 'thermometer', Face: ThermoIcon },
  { name: 'heart', Face: HeartIcon },
]

/** Teddy care — a gentle 6-card memory match, ending with a happy teddy. */
export function HospitalPlay() {
  const cards = useMemo(() => {
    const all = [...FACES, ...FACES].map((f, i) => ({ id: i, ...f }))
    for (let i = all.length - 1; i > 0; i -= 1) {
      const j = (i * 7 + 3) % (i + 1)
      ;[all[i], all[j]] = [all[j] ?? { id: -1, name: 'heart', Face: HeartIcon }, all[i] ?? { id: -1, name: 'heart', Face: HeartIcon }]
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
      if (cards[a]?.name === cards[b]?.name) {
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
      <svg className="clinic-bg" viewBox="0 0 520 320" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
        <rect width="520" height="320" fill="#fff3ee" />
        <rect y="240" width="520" height="80" fill="#f7d9c9" />
        {/* window */}
        <rect x="36" y="36" width="90" height="80" rx="12" fill="#eafbff" />
        <rect x="36" y="36" width="90" height="80" rx="12" fill="none" stroke="#d5b8a6" strokeWidth="6" />
        <line x1="81" y1="36" x2="81" y2="116" stroke="#d5b8a6" strokeWidth="4" />
        <circle cx="60" cy="58" r="12" fill="#f2c40f" />
        {/* bed with teddy */}
        <rect x="330" y="150" width="150" height="16" rx="8" fill="#96683f" />
        <rect x="342" y="166" width="12" height="50" rx="4" fill="#96683f" />
        <rect x="456" y="166" width="12" height="50" rx="4" fill="#96683f" />
        <rect x="326" y="128" width="158" height="34" rx="14" fill="#eafbff" />
        <rect x="326" y="142" width="158" height="20" rx="10" fill="#cdeffb" />
        {/* teddy resting on the bed */}
        <g transform="translate(372 128)">
          <circle cx="-10" cy="-10" r="5" fill="#a06a42" />
          <circle cx="10" cy="-10" r="5" fill="#a06a42" />
          <circle cx="-10" cy="-10" r="2.2" fill="#e5b083" />
          <circle cx="10" cy="-10" r="2.2" fill="#e5b083" />
          <circle cx="0" cy="-3" r="11" fill="#c98a5a" />
          <ellipse cx="0" cy="0" rx="5" ry="4" fill="#e5b083" />
          <circle cx="-4" cy="-6" r="1.8" fill="#3c3c3c" />
          <circle cx="4" cy="-6" r="1.8" fill="#3c3c3c" />
        </g>
        {/* plant */}
        <rect x="180" y="200" width="34" height="30" rx="6" fill="#e08600" />
        <circle cx="197" cy="188" r="22" fill="#58b368" />
      </svg>
      {done ? (
        <div className="teddy-done" data-testid="teddy-done">
          <div className="teddy-well">
            <TeddyIcon size={120} />
            <span className="teddy-bandage-flat"><BandageIcon size={40} /></span>
          </div>
          <p className="cheer-note">All better! Teddy feels wonderful.</p>
        </div>
      ) : (
        <>
          <p className="muted clinic-hint">Match the care items to help teddy feel better.</p>
          <div className="memory-grid" data-testid="memory-grid">
            {cards.map((c, i) => {
              const up = flipped.includes(i) || matched.includes(i)
              const Face = c.Face
              return (
                <button
                  key={c.id}
                  className={`memory-card ${up ? 'up' : ''} ${matched.includes(i) ? 'matched' : ''}`}
                  onClick={() => flip(i)}
                  aria-label={up ? c.name : 'Card face down'}
                >
                  {up ? <Face size={52} /> : <CardBackIcon size={52} />}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
