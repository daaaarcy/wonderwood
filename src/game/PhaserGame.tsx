import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type Phaser from 'phaser'
import { startGame, type WonderwoodScene } from './main'
import { EventBus } from './EventBus'

interface PhaserGameProps {
  scene: WonderwoodScene
  /** Fired when the scene signals it is ready to receive state. */
  onSceneReady?: (ready: boolean) => void
}

/**
 * React wrapper that creates/destroys a Phaser game (template-react-ts pattern).
 * The wrapper div carries data-scene-ready so tests and React can tell when the
 * canvas world is actually listening.
 */
export function PhaserGame({ scene, onSceneReady }: PhaserGameProps) {
  const game = useRef<Phaser.Game | null>(null)
  const container = useRef<HTMLDivElement | null>(null)
  const [ready, setReady] = useState(false)

  useLayoutEffect(() => {
    if (game.current === null && container.current) {
      game.current = startGame(container.current.id, scene)
      // Debug/testing handle (positions, scene graph); harmless in production.
      ;(window as unknown as { __phaserGame?: Phaser.Game }).__phaserGame = game.current
    }
    return () => {
      if (game.current) {
        game.current.destroy(true)
        game.current = null
      }
    }
  }, [scene])

  useEffect(() => {
    const handleReady = (sceneKey: string) => {
      const expected = scene === 'town' ? 'TownScene' : 'RoomScene'
      if (sceneKey === expected) {
        setReady(true)
        onSceneReady?.(true)
      }
    }
    EventBus.on('scene-ready', handleReady)
    return () => {
      EventBus.off('scene-ready', handleReady)
      setReady(false)
      onSceneReady?.(false)
    }
  }, [scene, onSceneReady])

  return (
    <div
      id={`phaser-${scene}-container`}
      ref={container}
      className="phaser-container"
      data-scene={scene}
      data-scene-ready={ready ? 'true' : 'false'}
    />
  )
}
