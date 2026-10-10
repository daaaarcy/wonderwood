import { useRef, useState } from 'react'
import { BallIcon, BearIcon, FoxIcon, KiteIcon, PatrolCarIcon, RabbitIcon, TeddyIcon } from '../components/FlatIcons'

interface LostToy {
  id: string
  name: string
  pos: { x: number; y: number }
  owner: { Animal: (p: { size?: number }) => React.ReactElement; pos: { x: number; y: number } }
  Toy: (p: { size?: number }) => React.ReactElement
}

const TOYS: LostToy[] = [
  { id: 'teddy', name: 'the teddy', pos: { x: 20, y: 64 }, owner: { Animal: RabbitIcon, pos: { x: 78, y: 20 } }, Toy: TeddyIcon },
  { id: 'ball', name: 'the ball', pos: { x: 60, y: 74 }, owner: { Animal: FoxIcon, pos: { x: 14, y: 20 } }, Toy: BallIcon },
  { id: 'kite', name: 'the kite', pos: { x: 44, y: 38 }, owner: { Animal: BearIcon, pos: { x: 84, y: 66 } }, Toy: KiteIcon },
]

/** Illustrated mini-map backdrop: roads, little houses, trees. */
function MapScene() {
  return (
    <svg className="map-bg" viewBox="0 0 520 300" preserveAspectRatio="none" aria-hidden="true">
      <rect width="520" height="300" fill="#8fd76a" />
      {/* roads */}
      <path d="M-10 210 Q140 190 260 205 T530 190" stroke="#c9c9c9" strokeWidth="34" fill="none" strokeLinecap="round" />
      <path d="M-10 210 Q140 190 260 205 T530 190" stroke="#ffffff" strokeWidth="3" fill="none" strokeDasharray="14 12" />
      <path d="M110 -10 Q120 120 100 310" stroke="#c9c9c9" strokeWidth="28" fill="none" />
      <path d="M110 -10 Q120 120 100 310" stroke="#ffffff" strokeWidth="3" fill="none" strokeDasharray="12 11" />
      <path d="M370 -10 Q360 120 380 310" stroke="#c9c9c9" strokeWidth="28" fill="none" />
      <path d="M370 -10 Q360 120 380 310" stroke="#ffffff" strokeWidth="3" fill="none" strokeDasharray="12 11" />
      {/* houses */}
      {[
        { x: 60, y: 42, roof: '#e0483e' },
        { x: 420, y: 40, roof: '#1cb0f6' },
        { x: 445, y: 235, roof: '#f2c40f' },
        { x: 175, y: 245, roof: '#9a6fe0' },
      ].map((h, i) => (
        <g key={i} transform={`translate(${h.x} ${h.y})`}>
          <rect x="0" y="14" width="46" height="34" rx="6" fill="#fff8ee" />
          <path d="M-4 16 L23 -6 L50 16 Z" fill={h.roof} />
          <rect x="18" y="30" width="10" height="18" rx="3" fill="#96683f" />
          <rect x="6" y="22" width="9" height="9" rx="2" fill="#eafbff" />
        </g>
      ))}
      {/* trees */}
      {[
        [230, 60], [310, 70], [40, 150], [255, 250], [340, 255], [490, 140],
      ].map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <rect x="-3" y="6" width="6" height="12" rx="3" fill="#96683f" />
          <circle r="14" cy="-4" fill="#3f9e34" />
        </g>
      ))}
      {/* little pond */}
      <ellipse cx="265" cy="130" rx="42" ry="20" fill="#7fd4f0" />
    </svg>
  )
}

/** Patrol car returns lost toys to their owners. Nothing scary — just helping. */
export function PolicePlay() {
  const [carPos, setCarPos] = useState({ x: 47, y: 55 })
  const [carrying, setCarrying] = useState<LostToy | null>(null)
  const [returned, setReturned] = useState<string[]>([])
  const [cheerOwner, setCheerOwner] = useState<string | null>(null)
  const busy = useRef(false)

  const driveTo = async (pos: { x: number; y: number }) => {
    await new Promise((r) => setTimeout(r, 60))
    setCarPos(pos)
    await new Promise((r) => setTimeout(r, 900))
  }

  const pickToy = async (toy: LostToy) => {
    if (busy.current || returned.includes(toy.id)) return
    busy.current = true
    setCarrying(toy)
    await driveTo(toy.pos)
    await driveTo(toy.owner.pos)
    setCarrying(null)
    setCheerOwner(toy.id)
    setTimeout(() => setCheerOwner(null), 1200)
    setReturned((r) => [...r, toy.id])
    await driveTo({ x: 47, y: 55 })
    busy.current = false
  }

  return (
    <div className="police-play">
      <p className="muted">Three toys got lost — tap one and the patrol car will bring it home!</p>
      <div className="patrol-map" data-testid="patrol-map">
        <MapScene />
        {TOYS.map((t) =>
          returned.includes(t.id) ? null : (
            <button
              key={t.id}
              className="lost-toy"
              style={{ left: `${t.pos.x}%`, top: `${t.pos.y}%` }}
              onClick={() => void pickToy(t)}
              aria-label={`Pick up ${t.name}`}
            >
              <t.Toy size={40} />
            </button>
          ),
        )}
        {TOYS.map((t) => (
          <span
            key={`o${t.id}`}
            className={`patrol-owner ${cheerOwner === t.id ? 'cheering' : ''}`}
            style={{ left: `${t.owner.pos.x}%`, top: `${t.owner.pos.y}%` }}
            aria-hidden="true"
          >
            <t.owner.Animal size={46} />
            {returned.includes(t.id) && <t.Toy size={20} />}
          </span>
        ))}
        <div
          className={`patrol-car ${carrying ? 'carrying' : ''}`}
          style={{ left: `${carPos.x}%`, top: `${carPos.y}%` }}
          data-testid="patrol-car"
        >
          <PatrolCarIcon size={64} />
          {carrying && <span className="patrol-cargo"><carrying.Toy size={26} /></span>}
        </div>
      </div>
      {returned.length === TOYS.length && <p className="cheer-note">Every toy is home — lovely patrolling!</p>}
    </div>
  )
}
