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
      <p className="picker-prompt">Who's exploring today?</p>
      <div className="picker-cards">
        {CHILD_LIST.map((child) => (
          <button
            key={child.id}
            className="picker-card"
            style={
              {
                ['--kid' as string]: child.color,
                ['--kid-lip' as string]: child.darkColor,
              }
            }
            onClick={() => onPick(child.id)}
          >
            <span className="picker-hero">
              <CharacterAvatar childId={child.id} size={150} />
            </span>
            <span className="picker-name">{child.name}</span>
          </button>
        ))}
      </div>
      <button className="btn btn-neutral btn-small grownups-btn" onClick={onGrownups}>
        Grown-ups
      </button>
    </div>
  )
}
