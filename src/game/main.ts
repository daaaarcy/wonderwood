import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from './assets'
import { IslandScene } from './scenes/IslandScene'
import { RoomScene } from './scenes/RoomScene'

export type WonderwoodScene = 'island' | 'room'

export function startGame(parent: string, scene: WonderwoodScene): Phaser.Game {
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    parent,
    backgroundColor: '#eafbff',
    render: { antialias: true },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: scene === 'island' ? [IslandScene] : [RoomScene],
  }
  return new Phaser.Game(config)
}
