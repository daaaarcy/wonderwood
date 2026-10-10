import Phaser from 'phaser'
import { EventBus } from '../EventBus'
import { GAME_HEIGHT, GAME_WIDTH } from '../assets'
import { itemById } from '../../data/catalogue'
import type { ChildId } from '../../domain/types'
import { CHILDREN } from '../../data/children'

export interface RoomStatePayload {
  childId: ChildId
  /** itemId of equipped hat / toy, or null. */
  hat: string | null
  toy: string | null
}

const EXPLORER_HEIGHT = 250
const HAT_WIDTH = 105
const TRACK = { cx: 620, cy: 596, rx: 250, ry: 62 }

export class RoomScene extends Phaser.Scene {
  private charGroup!: Phaser.GameObjects.Container
  private bobber!: Phaser.GameObjects.Container
  private bodyImage: Phaser.GameObjects.Image | null = null
  private bodyChildId: string | null = null
  private train: Phaser.GameObjects.Image | null = null
  private trainT = 0.75
  private trainRunning = false
  private smokeTimer = 0

  constructor() {
    super('RoomScene')
  }

  preload() {
    this.load.svg('room-bg', 'assets/room-bg.svg', { width: 1000, height: 700 })
    this.load.svg('explorer-theodore', 'assets/explorer-theodore.svg', { width: 400, height: 480 })
    this.load.svg('explorer-theodore-blink', 'assets/explorer-theodore-blink.svg', { width: 400, height: 480 })
    this.load.svg('explorer-leonard', 'assets/explorer-leonard.svg', { width: 400, height: 480 })
    this.load.svg('explorer-leonard-blink', 'assets/explorer-leonard-blink.svg', { width: 400, height: 480 })
    this.load.svg('hat-leaf', 'assets/hat-leaf.svg', { width: 240, height: 180 })
    this.load.svg('toy-train', 'assets/toy-train.svg', { width: 320, height: 220 })
  }

  create() {
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'room-bg').setDisplaySize(GAME_WIDTH, GAME_HEIGHT)

    this.buildTrack()
    this.buildExplorer()

    EventBus.on('room-state', this.applyState, this)
    EventBus.on('train-command', this.applyTrainCommand, this)
    // game.destroy() fires DESTROY rather than SHUTDOWN — listen for both.
    const detach = () => {
      EventBus.off('room-state', this.applyState, this)
      EventBus.off('train-command', this.applyTrainCommand, this)
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, detach)
    this.events.once(Phaser.Scenes.Events.DESTROY, detach)

    EventBus.emit('scene-ready', 'RoomScene')
    this.emitTrainState()

    // idle blinking
    this.time.addEvent({
      delay: 3400,
      loop: true,
      callback: () => {
        const body = this.bodyImage
        const id = this.bodyChildId
        if (!body || !id) return
        body.setTexture(`explorer-${id}-blink`)
        this.time.delayedCall(140, () => {
          if (body.scene) body.setTexture(`explorer-${id}`)
        })
      },
    })
  }

  private buildTrack() {
    const g = this.add.graphics()
    const { cx, cy, rx, ry } = TRACK
    // sleepers
    g.lineStyle(6, 0xa06a42, 1)
    for (let i = 0; i < 28; i += 1) {
      const t = (i / 28) * Math.PI * 2
      const x1 = cx + (rx - 9) * Math.cos(t)
      const y1 = cy + (ry - 9) * Math.sin(t)
      const x2 = cx + (rx + 9) * Math.cos(t)
      const y2 = cy + (ry + 9) * Math.sin(t)
      g.lineBetween(x1, y1, x2, y2)
    }
    // rails
    g.lineStyle(5, 0x8a5a3b, 1)
    g.strokeEllipse(cx, cy, rx * 2 - 22, ry * 2 - 22)
    g.strokeEllipse(cx, cy, rx * 2 + 22, ry * 2 + 22)
  }

  private buildExplorer() {
    this.charGroup = this.add.container(280, 585)
    this.charGroup.setData('baseY', 585)
    this.bobber = this.add.container(0, 0)
    this.charGroup.add(this.bobber)
    this.tweens.add({
      targets: this.bobber,
      y: -7,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
    })
    this.charGroup.setSize(140, EXPLORER_HEIGHT)
    this.charGroup.setInteractive({ useHandCursor: true })
    this.charGroup.on('pointerdown', () => this.hop())
  }

  private hop() {
    if (this.charGroup.getData('hopping')) return
    this.charGroup.setData('hopping', true)
    this.tweens.add({
      targets: this.charGroup,
      y: (this.charGroup.getData('baseY') as number) - 55,
      duration: 230,
      yoyo: true,
      ease: 'quad.out',
      onComplete: () => this.charGroup.setData('hopping', false),
    })
  }

  private applyState(payload: RoomStatePayload) {
    if (!this.sys.displayList) return // scene is gone (destroy called)
    const def = CHILDREN[payload.childId]

    // rebuild body (cheap enough to redo on every state push)
    this.bobber.removeAll(true)
    const body = this.add
      .image(0, 0, def.explorerKey)
      .setOrigin(0.5, 1)
      .setDisplaySize((EXPLORER_HEIGHT * 200) / 240, EXPLORER_HEIGHT)
    this.bobber.add(body)
    this.bodyImage = body
    this.bodyChildId = payload.childId

    if (payload.hat) {
      const item = itemById(payload.hat)
      if (item && item.slot === 'hat') {
        const anchor = item.anchor ?? { x: 0.5, y: 0.85 }
        const hat = this.add.image(0, 0, item.assetKey)
        hat.setDisplaySize(HAT_WIDTH, (HAT_WIDTH * 90) / 120)
        hat.setOrigin(anchor.x, anchor.y)
        hat.x = ((def.headAnchor.x - 100) / 200) * body.displayWidth
        hat.y = (-(240 - def.headAnchor.y) / 240) * body.displayHeight
        this.bobber.add(hat)
      }
    }

    // train visible only while the toy is equipped
    const showTrain = payload.toy === 'toy-train'
    if (showTrain && !this.train) {
      this.train = this.add.image(0, 0, 'toy-train').setDisplaySize(120, 82)
      // origin at the wheel line (wheels bottom ~y103 of the 110-tall svg)
      // so the wheels ride exactly on the track ellipse
      this.train.setOrigin(0.5, 0.94)
      this.train.setInteractive({ useHandCursor: true })
      this.train.on('pointerdown', () => this.setTrainRunning(!this.trainRunning))
      this.placeTrain()
    } else if (!showTrain && this.train) {
      this.train.destroy()
      this.train = null
    }
  }

  private applyTrainCommand(payload: { running: boolean }) {
    this.setTrainRunning(payload.running)
  }

  private setTrainRunning(running: boolean) {
    if (this.trainRunning === running) return
    this.trainRunning = running
    if (running && this.train) {
      // a celebratory starting puff
      this.puff()
    }
    this.emitTrainState()
  }

  private emitTrainState() {
    EventBus.emit('train-state', { running: this.trainRunning })
  }

  private placeTrain() {
    if (!this.train) return
    const { cx, cy, rx, ry } = TRACK
    const t = this.trainT * Math.PI * 2
    const x = cx + rx * Math.cos(t)
    const y = cy + ry * Math.sin(t)
    // tangent direction
    const angle = Math.atan2(ry * Math.cos(t), -rx * Math.sin(t))
    let deg = Phaser.Math.RadToDeg(angle)
    let flip = false
    if (deg > 90) {
      deg -= 180
      flip = true
    } else if (deg < -90) {
      deg += 180
      flip = true
    }
    this.train.setPosition(x, y)
    this.train.setAngle(deg)
    this.train.setFlipX(flip)
  }

  private puff() {
    if (!this.train) return
    const puff = this.add.circle(this.train.x, this.train.y - 78, 7, 0xffffff, 0.9)
    puff.setStrokeStyle(2, 0x9aa7ad)
    this.tweens.add({
      targets: puff,
      y: puff.y - 42,
      scale: 2.2,
      alpha: 0,
      duration: 800,
      onComplete: () => puff.destroy(),
    })
  }

  update(_time: number, delta: number) {
    if (this.trainRunning && this.train) {
      this.trainT = (this.trainT + delta * 0.00012) % 1
      this.placeTrain()
      this.smokeTimer += delta
      if (this.smokeTimer > 420) {
        this.smokeTimer = 0
        this.puff()
      }
    }
  }
}
