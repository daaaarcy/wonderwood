import Phaser from 'phaser'

/**
 * Shared bridge between React and Phaser scenes (phaserjs/template-react-ts pattern).
 * React emits 'island-state' / 'room-state' / 'train-command';
 * scenes emit 'scene-ready' / 'train-state' / 'room-tap' / 'town-tap'.
 */
export const EventBus = new Phaser.Events.EventEmitter()

/**
 * Phaser listens at window level, so a tap that lands on a DOM overlay —
 * the fixed nav, a button floating over the canvas, a sticky tag — still
 * reaches interactive scene objects. Only honor taps whose actual DOM target
 * is the canvas (the window-level test hooks emit without a pointer).
 */
export function tapOnCanvas(pointer: Phaser.Input.Pointer): boolean {
  const el = pointer.downElement as Element | null | undefined
  return !(el instanceof Element) || el instanceof HTMLCanvasElement
}

// Test hooks: let e2e specs drive scene taps deterministically.
if (typeof window !== 'undefined') {
  ;(window as unknown as { __townTap?: (projectId: string) => void }).__townTap = (projectId) =>
    EventBus.emit(
      'town-tap',
      projectId === 'bridge' ? { kind: 'bridge', planks: 7 } : { kind: 'plot', projectId },
    )
  ;(window as unknown as { __townTruck?: () => void }).__townTruck = () =>
    EventBus.emit('town-tap', { kind: 'truck' })
  ;(window as unknown as { __roomTap?: (spot: string) => void }).__roomTap = (spot) =>
    EventBus.emit('room-tap', { spot })
}
