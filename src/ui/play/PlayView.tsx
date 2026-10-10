import type { ChildId, GameState, ProjectId } from '../../domain/types'
import { LibraryPlay } from './LibraryPlay'
import { MusicPlay } from './MusicPlay'
import { PolicePlay } from './PolicePlay'
import { HospitalPlay } from './HospitalPlay'

const TITLES: Partial<Record<ProjectId, string>> = {
  library: 'Our Library',
  'music-school': 'Music school',
  'police-station': 'Police station',
  hospital: 'Hospital',
}

/** Full-screen play view for an open building. No coins — just playing. */
export function PlayView({
  projectId,
  state,
  childId,
  onClose,
}: {
  projectId: ProjectId
  state: GameState
  childId: ChildId
  onClose: () => void
}) {
  const project = state.city.projects[projectId]
  const title = project.name ?? TITLES[projectId] ?? 'Town'
  return (
    <div className="play-view" role="dialog" aria-label={title}>
      <header className="play-header">
        <h2 className="play-title">{title}</h2>
        <button className="btn btn-neutral" onClick={onClose} autoFocus>
          Done playing
        </button>
      </header>
      <div className="play-body">
        {projectId === 'library' && <LibraryPlay state={state} childId={childId} />}
        {projectId === 'music-school' && <MusicPlay soundOn={state.settings.sound} />}
        {projectId === 'police-station' && <PolicePlay />}
        {projectId === 'hospital' && <HospitalPlay />}
        {projectId === 'road' && <p className="muted">Tap the delivery truck to ride along!</p>}
      </div>
    </div>
  )
}
