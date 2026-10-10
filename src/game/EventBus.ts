import Phaser from 'phaser'

/**
 * Shared bridge between React and Phaser scenes (phaserjs/template-react-ts pattern).
 * React emits 'island-state' / 'room-state' / 'train-command';
 * scenes emit 'scene-ready' / 'train-state'.
 */
export const EventBus = new Phaser.Events.EventEmitter()
