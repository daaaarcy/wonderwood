import { useRef, useState } from 'react'

interface LostToy {
  id: string
  emoji: string
  name: string
  /** map position % */
  pos: { x: number; y: number }
  owner: { animal: string; pos: { x: number; y: number } }
}

const TOYS: LostToy[] = [
  { id: 'teddy', emoji: '🧸', name: 'a teddy', pos: { x: 18, y: 66 }, owner: { animal: '🐰', pos: { x: 78, y: 22 } } },
  { id: 'ball', emoji: '⚽', name: 'a ball', pos: { x: 62, y: 74 }, owner: { animal: '🦊', pos: { x: 14, y: 18 } } },
  { id: 'kite', emoji: '🪁', name: 'a kite', pos: { x: 44, y: 40 }, owner: { animal: '🐻', pos: { x: 82, y: 66 } } },
]

/** Patrol car returns lost toys to their owners. Nothing scary — just helping. */
export function PolicePlay() {
  const [carPos, setCarPos] = useState({ x: 40, y: 58 })
  const [carrying, setCarrying] = useState<LostToy | null>(null)
  const [returned, setReturned] = useState<string[]>([])
  const [cheerOwner, setCheerOwner] = useState<string | null>(null)
  const busy = useRef(false)
  const mapRef = useRef<HTMLDivElement>(null)

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
    setCheerOwner(toy.owner.animal)
    setTimeout(() => setCheerOwner(null), 1200)
    setReturned((r) => [...r, toy.id])
    await driveTo({ x: 40, y: 58 })
    busy.current = false
  }

  return (
    <div className="police-play">
      <p className="muted">Three toys got lost — tap one and the patrol car will bring it home!</p>
      <div className="patrol-map" ref={mapRef} data-testid="patrol-map">
        {TOYS.map((t) =>
          returned.includes(t.id) ? null : (
            <button
              key={t.id}
              className="lost-toy"
              style={{ left: `${t.pos.x}%`, top: `${t.pos.y}%` }}
              onClick={() => void pickToy(t)}
              aria-label={`Pick up ${t.name}`}
            >
              {t.emoji}
            </button>
          ),
        )}
        {TOYS.map((t) => (
          <span
            key={`o${t.id}`}
            className={`patrol-owner ${cheerOwner === t.owner.animal ? 'cheering' : ''}`}
            style={{ left: `${t.owner.pos.x}%`, top: `${t.owner.pos.y}%` }}
            aria-hidden="true"
          >
            {t.owner.animal}
          </span>
        ))}
        <div
          className={`patrol-car ${carrying ? 'carrying' : ''}`}
          style={{ left: `${carPos.x}%`, top: `${carPos.y}%` }}
          data-testid="patrol-car"
        >
          🚓{carrying ? carrying.emoji : ''}
        </div>
      </div>
      {returned.length === TOYS.length && <p className="cheer-note">Every toy is home — lovely patrolling!</p>}
    </div>
  )
}
