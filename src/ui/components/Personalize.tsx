import { useState } from 'react'
import { CITY_PALETTE, type GameState, type ProjectId } from '../../domain/types'
import { projectById } from '../../data/city'
import { WordWheel } from './NamePicker'
import {
  BUILDING_FIRST,
  BUILDING_SECOND,
  CITY_FIRST,
  CITY_SECOND,
} from '../../data/names'

/** "Make it yours" — pick a banner color and (optionally) a name for a building. */
export function CustomizeSheet({
  state,
  projectId,
  onDone,
}: {
  state: GameState
  projectId: ProjectId
  onDone: (color: string | undefined, name: string | null) => void
}) {
  const project = state.city.projects[projectId]
  const def = projectById(projectId)
  const [color, setColor] = useState<string | undefined>(project.color)
  const [nameMode, setNameMode] = useState(project.name ? 'pick' : 'default')
  const [first, setFirst] = useState(0)
  const [second, setSecond] = useState(0)

  const pickedName =
    nameMode === 'pick' ? `${BUILDING_FIRST[first]} ${BUILDING_SECOND[second]}` : null

  return (
    <div className="sheet-backdrop">
      <div className="sheet" role="dialog" aria-label="Make it yours" onClick={(e) => e.stopPropagation()}>
        <p className="sheet-title">Make it yours!</p>
        <p className="muted">Pick a banner color for the {project.name ?? def?.label}.</p>
        <div className="swatch-row" role="radiogroup" aria-label="Banner color">
          {CITY_PALETTE.map((c) => (
            <button
              key={c}
              className={`swatch ${color === c ? 'picked' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={`Color ${c}`}
              role="radio"
              aria-checked={color === c}
            />
          ))}
        </div>
        <div className="name-choice">
          <button
            className={`btn btn-small ${nameMode === 'default' ? 'btn-yes' : 'btn-neutral'}`}
            onClick={() => setNameMode('default')}
          >
            Keep “{def?.label}”
          </button>
          <button
            className={`btn btn-small ${nameMode === 'pick' ? 'btn-yes' : 'btn-neutral'}`}
            onClick={() => setNameMode('pick')}
          >
            Give it a name
          </button>
        </div>
        {nameMode === 'pick' && (
          <WordWheel
            first={first}
            second={second}
            firstWords={BUILDING_FIRST}
            secondWords={BUILDING_SECOND}
            onChange={(f, s) => {
              setFirst(f)
              setSecond(s)
            }}
          />
        )}
        <button className="btn btn-yes btn-big" onClick={() => onDone(color, pickedName)}>
          Looks great!
        </button>
      </div>
    </div>
  )
}

/** Name the town — word wheels for kids (grown-ups can also use this). */
export function NameCitySheet({
  current,
  onDone,
  onCancel,
}: {
  current: string | null
  onDone: (name: string) => void
  onCancel: () => void
}) {
  const [first, setFirst] = useState(0)
  const [second, setSecond] = useState(0)
  const [typed, setTyped] = useState('')
  const name = `${CITY_FIRST[first]} ${CITY_SECOND[second]}`
  return (
    <div className="sheet-backdrop">
      <div className="sheet" role="dialog" aria-label="Name our town" onClick={(e) => e.stopPropagation()}>
        <p className="sheet-title">Name our town</p>
        <WordWheel
          first={first}
          second={second}
          firstWords={CITY_FIRST}
          secondWords={CITY_SECOND}
          onChange={(f, s) => {
            setFirst(f)
            setSecond(s)
          }}
        />
        <p className="town-name-preview" data-testid="town-name-preview">{name}</p>
        <details className="grownup-name-field">
          <summary>A grown-up can type a name too</summary>
          <div className="pause-add">
            <input
              className="form-input"
              maxLength={30}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="e.g. Wonderwood Hollow"
            />
            <button className="btn btn-neutral btn-small" disabled={!typed.trim()} onClick={() => onDone(typed.trim())}>
              Use this
            </button>
          </div>
        </details>
        <div className="sheet-actions">
          <button className="btn btn-yes" onClick={() => onDone(name)}>
            {current ? 'Rename to this!' : 'That’s our town!'}
          </button>
          <button className="btn btn-neutral" onClick={onCancel}>
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}
