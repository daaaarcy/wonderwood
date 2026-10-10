import { useEffect, useState } from 'react'
import { PostcardAlbum } from '../components/Postcard'
import type { ChildId } from '../../domain/types'
import { CHILDREN } from '../../data/children'
import { assetUrl } from '../../game/assets'
import { EventBus } from '../../game/EventBus'
import { PhaserGame } from '../../game/PhaserGame'
import { useGameState, useRepository } from '../../storage/hooks'

export function RoomScreen({ childId }: { childId: ChildId }) {
  const state = useGameState()
  const repo = useRepository()
  const child = state.children[childId]
  const def = CHILDREN[childId]
  const [sceneReady, setSceneReady] = useState(false)
  const [trainRunning, setTrainRunning] = useState(false)
  const [album, setAlbum] = useState(false)

  useEffect(() => {
    const handler = (payload: { running: boolean }) => setTrainRunning(payload.running)
    EventBus.on('train-state', handler)
    return () => {
      EventBus.off('train-state', handler)
    }
  }, [])

  useEffect(() => {
    if (!sceneReady) return
    EventBus.emit('room-state', {
      childId,
      hat: child.equipped.hat,
      toy: child.equipped.toy,
    })
  }, [state, sceneReady, childId, child.equipped.hat, child.equipped.toy])

  const ownsHat = child.inventory.includes('hat-leaf')
  const hatOn = child.equipped.hat === 'hat-leaf'

  return (
    <div className="screen room-screen">
      <h2 className="screen-title">{def.name}&rsquo;s room</h2>
      <div className="room-wrap">
        <PhaserGame scene="room" onSceneReady={setSceneReady} />
      </div>

      <p className="sr-only" data-testid="equipped-hat">
        {child.equipped.hat ?? 'none'}
      </p>
      <p className="sr-only" data-testid="train-state">
        {trainRunning ? 'running' : 'stopped'}
      </p>

      <button
        className="btn btn-neutral album-btn"
        onClick={() => setAlbum(true)}
      >
        My postcard album {(state.city.postcards ?? []).length > 0 ? `(${(state.city.postcards ?? []).length})` : ''}
      </button>
      {album && (
        <div className="sheet-backdrop" onClick={() => setAlbum(false)}>
          <div className="sheet album-sheet" role="dialog" aria-label="Postcard album" onClick={(e) => e.stopPropagation()}>
            <p className="sheet-title">Our postcards</p>
            <PostcardAlbum state={state} />
            <button className="btn btn-neutral" onClick={() => setAlbum(false)}>Close</button>
          </div>
        </div>
      )}

      <div className="room-controls">
        {ownsHat ? (
          <button
            className="btn btn-big"
            onClick={() =>
              void repo.dispatch({ type: 'equip', childId, slot: 'hat', itemId: hatOn ? null : 'hat-leaf' })
            }
          >
            {hatOn ? 'Take off hat' : 'Wear hat'}
          </button>
        ) : (
          <span className="tag">No hat yet — visit the shop!</span>
        )}
        <button
          className="btn btn-big btn-yes"
          onClick={() => EventBus.emit('train-command', { running: !trainRunning })}
        >
          {trainRunning ? 'Stop train' : 'Start train'}
        </button>
        <span className="room-hint">
          <img src={assetUrl('toy-train')} alt="" className="hint-icon" /> Tap the train or the explorer in the room, too!
        </span>
      </div>
    </div>
  )
}
