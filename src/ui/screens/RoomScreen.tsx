import { useEffect, useState } from 'react'
import { PostcardAlbum } from '../components/Postcard'
import type { ChildId, FurnitureSpot } from '../../domain/types'
import { FURNITURE_SPOTS } from '../../domain/types'
import { spotsFor } from '../../domain/commands'
import { CHILDREN } from '../../data/children'
import { assetUrl } from '../../game/assets'
import { itemById } from '../../data/catalogue'
import { EventBus } from '../../game/EventBus'
import { PhaserGame } from '../../game/PhaserGame'
import { useGameState, useRepository } from '../../storage/hooks'

const SPOT_NAMES: Record<FurnitureSpot, string> = {
  bed: 'Bed',
  rug: 'Rug',
  chair: 'Chair',
  desk: 'Desk',
  computer: 'Computer',
  shelf: 'Shelf',
  lamp: 'Lamp',
  'decor-a': 'Wall spot 1',
  'decor-b': 'Wall spot 2',
}

export function RoomScreen({
  childId,
  onEditLook,
}: {
  childId: ChildId
  onEditLook?: () => void
}) {
  const state = useGameState()
  const repo = useRepository()
  const child = state.children[childId]
  const def = CHILDREN[childId]
  const [sceneReady, setSceneReady] = useState(false)
  const [trainRunning, setTrainRunning] = useState(false)
  const [album, setAlbum] = useState(false)
  const [pickSpot, setPickSpot] = useState<FurnitureSpot | null>(null)

  useEffect(() => {
    const handler = (payload: { running: boolean }) => setTrainRunning(payload.running)
    EventBus.on('train-state', handler)
    return () => {
      EventBus.off('train-state', handler)
    }
  }, [])

  useEffect(() => {
    const handler = (payload: { spot: FurnitureSpot }) => {
      // the canvas is under the sheet — ignore scene taps while a dialog is open
      if (document.querySelector('[role="dialog"], .celebration')) return
      setPickSpot(payload.spot)
    }
    EventBus.on('room-tap', handler)
    return () => {
      EventBus.off('room-tap', handler)
    }
  }, [])

  useEffect(() => {
    if (!sceneReady) return
    EventBus.emit('room-state', {
      childId,
      hat: child.equipped.hat,
      toy: child.equipped.toy,
      placed: child.placed,
      look: child.look,
    })
  }, [state, sceneReady, childId, child.equipped.hat, child.equipped.toy, child.placed, child.look])

  const ownsHat = child.inventory.includes('hat-leaf')
  const hatOn = child.equipped.hat === 'hat-leaf'

  // owned furniture that fits the tapped spot
  const pickItems =
    pickSpot == null
      ? []
      : child.inventory
          .map((id) => itemById(id))
          .filter(
            (item): item is NonNullable<typeof item> =>
              !!item && item.slot === 'furniture' && spotsFor(item.spot).includes(pickSpot),
          )
  const placedId = pickSpot ? child.placed[pickSpot] : null

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
      {FURNITURE_SPOTS.map((s) => (
        <p key={s} className="sr-only" data-testid={`spot-${s}`}>
          {child.placed[s] ?? 'none'}
        </p>
      ))}

      <div className="room-buttons">
        <button className="btn btn-neutral" onClick={onEditLook}>
          Change my look
        </button>
        <button
          className="btn btn-neutral album-btn"
          onClick={() => setAlbum(true)}
        >
          My postcard album {(state.city.postcards ?? []).length > 0 ? `(${(state.city.postcards ?? []).length})` : ''}
        </button>
      </div>
      {album && (
        <div className="sheet-backdrop" onClick={() => setAlbum(false)}>
          <div className="sheet album-sheet" role="dialog" aria-label="Postcard album" onClick={(e) => e.stopPropagation()}>
            <p className="sheet-title">Our postcards</p>
            <PostcardAlbum state={state} />
            <button className="btn btn-neutral" onClick={() => setAlbum(false)}>Close</button>
          </div>
        </div>
      )}

      {pickSpot && (
        <div className="sheet-backdrop" onClick={() => setPickSpot(null)}>
          <div
            className="sheet pick-sheet"
            role="dialog"
            aria-label={`${SPOT_NAMES[pickSpot]} spot`}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="sheet-title">{SPOT_NAMES[pickSpot]}</p>
            {pickItems.length === 0 ? (
              <p className="hint">
                Nothing for this spot yet — visit the shop&rsquo;s &ldquo;My room&rdquo; tab!
              </p>
            ) : (
              <div className="pick-list">
                {pickItems.map((item) => {
                  const inPlace = placedId === item.id
                  return (
                    <div key={item.id} className="pick-row" data-testid={`pick-${item.id}`}>
                      <img src={assetUrl(item.assetKey)} alt="" className="pick-thumb" />
                      <span className="pick-name">{item.name}</span>
                      {inPlace ? (
                        <span className="tag tag-yes">In the room</span>
                      ) : (
                        <button
                          className="btn btn-small btn-yes"
                          onClick={() => {
                            void repo.dispatch({ type: 'placeItem', childId, spot: pickSpot, itemId: item.id })
                            setPickSpot(null)
                          }}
                        >
                          Place
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {placedId && (
              <button
                className="btn btn-neutral"
                data-testid="spot-remove"
                onClick={() => {
                  void repo.dispatch({ type: 'placeItem', childId, spot: pickSpot, itemId: null })
                  setPickSpot(null)
                }}
              >
                Remove
              </button>
            )}
            <button className="btn btn-neutral" onClick={() => setPickSpot(null)}>
              Close
            </button>
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
          <img src={assetUrl('toy-train')} alt="" className="hint-icon" /> Tap the train, the explorer or your furniture!
        </span>
      </div>
    </div>
  )
}
