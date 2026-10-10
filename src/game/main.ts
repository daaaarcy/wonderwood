import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from './assets'
import { TownScene } from './scenes/TownScene'
import { RoomScene } from './scenes/RoomScene'

export type WonderwoodScene = 'town' | 'room'

export function startGame(parent: string, scene: WonderwoodScene): Phaser.Game {
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    parent,
    backgroundColor: '#bfe9f8',
    render: { antialias: true },
    scale:
      scene === 'town'
        ? // town fills whatever box it gets; the scene keeps the world centered
          { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH }
        : { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: scene === 'town' ? [TownScene] : [RoomScene],
  }
  return new Phaser.Game(config)
}
