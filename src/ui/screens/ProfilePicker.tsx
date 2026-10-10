import { CHILD_LIST } from '../../data/children'
import type { ChildId } from '../../domain/types'
import { CharacterAvatar } from '../components/CharacterAvatar'

export function ProfilePicker({
  onPick,
  onGrownups,
}: {
  onPick: (id: ChildId) => void
  onGrownups: () => void
}) {
  return (
    <div className="screen picker-screen">
      <header className="picker-header">
        <h1 className="game-title">Wonderwood</h1>
        <p className="game-subtitle">Theodore &amp; Leonard's Island</p>
      </header>
      <p className="picker-prompt">Who is exploring today?</p>
      <div className="picker-cards">
        {CHILD_LIST.map((child) => (
          <button
            key={child.id}
            className="picker-card"
            style={{ borderColor: child.color }}
            onClick={() => onPick(child.id)}
          >
            <CharacterAvatar childId={child.id} size={150} />
            <span className="picker-name" style={{ color: child.darkColor }}>
              {child.name}
            </span>
          </button>
        ))}
      </div>
      <button className="btn btn-small btn-ghost grownups-btn" onClick={onGrownups}>
        Grown-ups
      </button>
    </div>
  )
}
