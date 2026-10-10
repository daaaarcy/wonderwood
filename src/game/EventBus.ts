import Phaser from 'phaser'

/**
 * Shared bridge between React and Phaser scenes (phaserjs/template-react-ts pattern).
 * React emits 'island-state' / 'room-state' / 'train-command';
 * scenes emit 'scene-ready' / 'train-state'.
 */
export const EventBus = new Phaser.Events.EventEmitter()

// Test hook: lets e2e specs drive scene taps deterministically.
if (typeof window !== 'undefined') {
  ;(window as unknown as { __townTap?: (projectId: string) => void }).__townTap = (projectId) =>
    EventBus.emit('town-tap', { kind: 'plot', projectId })
}
