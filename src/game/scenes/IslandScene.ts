import Phaser from 'phaser'
import { EventBus } from '../EventBus'
import { GAME_HEIGHT, GAME_WIDTH } from '../assets'
import { CHILDREN } from '../../data/children'
import { itemById } from '../../data/catalogue'
import type { ChildId } from '../../domain/types'

export interface IslandStatePayload {
  planks: number
  total: number
  complete: boolean
  /** itemId of the equipped hat per child (or null). */
  hats: Record<ChildId, string | null>
}

const EXPLORER_HEIGHT = 132
const HAT_WIDTH = 62
const HOME_POS: Record<ChildId, { x: number; y: number }> = {
  theodore: { x: 205, y: 500 },
  leonard: { x: 795, y: 500 },
}
const BRIDGE_POS: Record<ChildId, { x: number; y: number }> = {
  theodore: { x: 462, y: 438 },
  leonard: { x: 540, y: 438 },
}

interface Slot {
  x: number
  y: number
  angle: number
}

export class IslandScene extends Phaser.Scene {
  private slots: Slot[] = []
  private plankImages: (Phaser.GameObjects.Image | null)[] = []
  private slotGraphics!: Phaser.GameObjects.Graphics
  private rainbow!: Phaser.GameObjects.Graphics
  private banner!: Phaser.GameObjects.Container
  private explorers = {} as Record<ChildId, Phaser.GameObjects.Container>
  private explorerHats = {} as Record<ChildId, Phaser.GameObjects.Image | null>
  private currentPlanks = 0
  private isComplete = false

  constructor() {
    super('IslandScene')
  }

  preload() {
    this.load.svg('island-bg', 'assets/island-bg.svg', { width: 1000, height: 700 })
    this.load.svg('treehouse-theodore', 'assets/treehouse-theodore.svg', { width: 360, height: 440 })
    this.load.svg('treehouse-leonard', 'assets/treehouse-leonard.svg', { width: 360, height: 440 })
    this.load.svg('explorer-theodore', 'assets/explorer-theodore.svg', { width: 400, height: 480 })
    this.load.svg('explorer-theodore-blink', 'assets/explorer-theodore-blink.svg', { width: 400, height: 480 })
    this.load.svg('explorer-leonard', 'assets/explorer-leonard.svg', { width: 400, height: 480 })
    this.load.svg('explorer-leonard-blink', 'assets/explorer-leonard-blink.svg', { width: 400, height: 480 })
    this.load.svg('hat-leaf', 'assets/hat-leaf.svg', { width: 240, height: 180 })
    this.load.svg('bridge-plank', 'assets/bridge-plank.svg', { width: 128, height: 56 })
    this.load.svg('star', 'assets/star.svg', { width: 96, height: 96 })
  }

  create() {
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'island-bg').setDisplaySize(GAME_WIDTH, GAME_HEIGHT)

    // treehouses, bottom-anchored onto their islands
    this.add.image(178, 468, 'treehouse-theodore').setOrigin(0.5, 1).setDisplaySize(150, 183)
    this.add.image(822, 468, 'treehouse-leonard').setOrigin(0.5, 1).setDisplaySize(150, 183)

    this.buildBridge()
    this.buildExplorers()
    this.buildBanner()
    this.startBlinkLoop()

    EventBus.on('island-state', this.applyState, this)
    // game.destroy() fires DESTROY rather than SHUTDOWN — listen for both so a
    // dead scene never receives React state pushes.
    const detach = () => EventBus.off('island-state', this.applyState, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, detach)
    this.events.once(Phaser.Scenes.Events.DESTROY, detach)

    EventBus.emit('scene-ready', 'IslandScene')
  }

  /** Bridge: 12 plank slots across a tall rainbow arc between the islands. */
  private buildBridge() {
    const curve = new Phaser.Curves.QuadraticBezier(
      new Phaser.Math.Vector2(390, 512),
      new Phaser.Math.Vector2(500, 380),
      new Phaser.Math.Vector2(610, 512),
    )
    // soft glow so the bridge reads as the scene's focus
    const glow = this.add.graphics()
    glow.fillStyle(0xffffff, 0.35)
    glow.fillEllipse(500, 468, 300, 190)

    // rainbow arcs rising above the planks (the bridge's magic)
    this.rainbow = this.add.graphics()
    const colors = [0x1cb0f6, 0xffc800, 0xff4b4b]
    colors.forEach((color, i) => {
      const lift = 52 + i * 20
      const arc = new Phaser.Curves.QuadraticBezier(
        new Phaser.Math.Vector2(384, 512),
        new Phaser.Math.Vector2(500, 376 - lift),
        new Phaser.Math.Vector2(616, 512),
      )
      this.rainbow.lineStyle(14, color, 0.9)
      arc.draw(this.rainbow, 40)
    })

    // faint dashed outlines for unplaced planks
    this.slotGraphics = this.add.graphics()
    const points = curve.getPoints(11)
    this.slots = []
    this.plankImages = []
    points.forEach((p, i) => {
      const t = i / 11
      const tangent = curve.getTangent(t)
      // planks lie ACROSS the walking direction
      const angle = Phaser.Math.RadToDeg(Math.atan2(tangent.y, tangent.x)) + 90
      this.slots.push({ x: p.x, y: p.y, angle })
      this.plankImages.push(null)
    })
    this.redrawSlots()
  }

  private redrawSlots() {
    this.slotGraphics.clear()
    this.slots.forEach((slot, i) => {
      if (this.plankImages[i]) return
      this.drawDashedRect(slot.x, slot.y, slot.angle, 42, 16)
    })
  }

  private drawDashedRect(cx: number, cy: number, angleDeg: number, w: number, h: number) {
    const g = this.slotGraphics
    g.lineStyle(2.5, 0xffffff, 0.85)
    const a = Phaser.Math.DegToRad(angleDeg)
    const cos = Math.cos(a)
    const sin = Math.sin(a)
    const corner = (dx: number, dy: number) => ({
      x: cx + dx * cos - dy * sin,
      y: cy + dx * sin + dy * cos,
    })
    const edges = [
      [corner(-w / 2, -h / 2), corner(w / 2, -h / 2)],
      [corner(w / 2, -h / 2), corner(w / 2, h / 2)],
      [corner(w / 2, h / 2), corner(-w / 2, h / 2)],
      [corner(-w / 2, h / 2), corner(-w / 2, -h / 2)],
    ]
    for (const [p, q] of edges) {
      const len = Math.hypot(q.x - p.x, q.y - p.y)
      const dash = 4
      const gap = 4
      for (let d = 0; d < len; d += dash + gap) {
        const t0 = d / len
        const t1 = Math.min((d + dash) / len, 1)
        g.lineBetween(
          p.x + (q.x - p.x) * t0,
          p.y + (q.y - p.y) * t0,
          p.x + (q.x - p.x) * t1,
          p.y + (q.y - p.y) * t1,
        )
      }
    }
  }

  private makeExplorer(childId: ChildId, x: number, y: number) {
    const def = CHILDREN[childId]
    const outer = this.add.container(x, y)
    const bobber = this.add.container(0, 0)
    const body = this.add.image(0, 0, def.explorerKey).setOrigin(0.5, 1)
    body.setDisplaySize((EXPLORER_HEIGHT * 200) / 240, EXPLORER_HEIGHT)
    bobber.add(body)
    outer.add(bobber)
    outer.setData('bobber', bobber)
    outer.setData('body', body)
    outer.setSize(body.displayWidth, EXPLORER_HEIGHT)
    outer.setInteractive({ useHandCursor: true })
    outer.on('pointerdown', () => this.hopExplorer(outer))
    // gentle idle bob
    this.tweens.add({
      targets: bobber,
      y: -5,
      duration: 1300 + (childId === 'leonard' ? 250 : 0),
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
    })
    this.explorers[childId] = outer
    this.explorerHats[childId] = null
  }

  private hopExplorer(outer: Phaser.GameObjects.Container) {
    if (outer.getData('hopping')) return
    outer.setData('hopping', true)
    const baseY = outer.getData('baseY') as number
    this.tweens.add({
      targets: outer,
      y: baseY - 42,
      duration: 210,
      yoyo: true,
      ease: 'quad.out',
      onComplete: () => outer.setData('hopping', false),
    })
  }

  private buildExplorers() {
    this.makeExplorer('theodore', HOME_POS.theodore.x, HOME_POS.theodore.y)
    this.makeExplorer('leonard', HOME_POS.leonard.x, HOME_POS.leonard.y)
    for (const id of ['theodore', 'leonard'] as const) {
      this.explorers[id].setData('baseY', HOME_POS[id].y)
    }
  }

  /** Idle blinking: swap to the closed-eyes texture briefly every few seconds. */
  private startBlinkLoop() {
    this.time.addEvent({
      delay: 3200,
      loop: true,
      callback: () => {
        for (const id of ['theodore', 'leonard'] as const) {
          const body = this.explorers[id]?.getData('body') as Phaser.GameObjects.Image | undefined
          if (!body) continue
          body.setTexture(`${id === 'theodore' ? 'explorer-theodore' : 'explorer-leonard'}-blink`)
          this.time.delayedCall(140, () => {
            if (body.scene) body.setTexture(id === 'theodore' ? 'explorer-theodore' : 'explorer-leonard')
          })
        }
      },
    })
  }

  private setHat(childId: ChildId, itemId: string | null) {
    const outer = this.explorers[childId]
    const bobber = outer.getData('bobber') as Phaser.GameObjects.Container
    const existing = this.explorerHats[childId]
    if (existing) {
      existing.destroy()
      this.explorerHats[childId] = null
    }
    if (!itemId) return
    const item = itemById(itemId)
    if (!item || item.slot !== 'hat') return
    const def = CHILDREN[childId]
    const body = outer.getData('body') as Phaser.GameObjects.Image
    const w = body.displayWidth
    const h = body.displayHeight
    const anchor = item.anchor ?? { x: 0.5, y: 0.85 }
    const hat = this.add.image(0, 0, item.assetKey)
    hat.setDisplaySize(HAT_WIDTH, (HAT_WIDTH * 90) / 120)
    hat.setOrigin(anchor.x, anchor.y)
    hat.x = ((def.headAnchor.x - 100) / 200) * w
    hat.y = (-(240 - def.headAnchor.y) / 240) * h
    bobber.add(hat)
    this.explorerHats[childId] = hat
  }

  private buildBanner() {
    const g = this.add.graphics()
    // string of pennant flags above the bridge
    g.lineStyle(3, 0xffffff, 0.9)
    g.lineBetween(360, 330, 640, 330)
    const flagColors = [0xff4b4b, 0xffc800, 0x58cc02, 0x1cb0f6, 0xce82ff, 0xff9600, 0xff4b4b, 0x58cc02]
    flagColors.forEach((c, i) => {
      const x = 375 + i * 36
      g.fillStyle(c, 1)
      g.fillTriangle(x - 12, 330, x + 12, 330, x, 356)
    })
    const label = this.add
      .text(500, 296, 'Rainbow Bridge!', {
        fontFamily: "'Nunito', ui-rounded, sans-serif",
        fontSize: '30px',
        fontStyle: '800',
        color: '#3c3c3c',
        backgroundColor: '#ffffffee',
        padding: { x: 16, y: 8 },
      })
      .setOrigin(0.5)
    this.banner = this.add.container(0, 0, [g, label])
    this.banner.setVisible(false)
  }

  private applyState(payload: IslandStatePayload) {
    if (!this.sys.displayList) return // scene is gone (destroy called)
    const target = Math.min(payload.planks, this.slots.length)
    if (target > this.currentPlanks) {
      for (let i = this.currentPlanks; i < target; i += 1) this.placePlank(i)
    } else if (target < this.currentPlanks) {
      for (let i = target; i < this.currentPlanks; i += 1) {
        this.plankImages[i]?.destroy()
        this.plankImages[i] = null
      }
    }
    this.currentPlanks = target
    this.redrawSlots()

    for (const id of ['theodore', 'leonard'] as const) {
      this.setHat(id, payload.hats[id])
    }

    if (payload.complete && !this.isComplete) {
      this.isComplete = true
      this.banner.setVisible(true)
      this.banner.setAlpha(0)
      this.tweens.add({ targets: this.banner, alpha: 1, duration: 500 })
      for (const id of ['theodore', 'leonard'] as const) {
        const outer = this.explorers[id]
        outer.setData('baseY', BRIDGE_POS[id].y)
        this.tweens.add({ targets: outer, x: BRIDGE_POS[id].x, y: BRIDGE_POS[id].y, duration: 900, ease: 'sine.inOut' })
      }
    } else if (!payload.complete && this.isComplete) {
      this.isComplete = false
      this.banner.setVisible(false)
      for (const id of ['theodore', 'leonard'] as const) {
        const outer = this.explorers[id]
        outer.setData('baseY', HOME_POS[id].y)
        this.tweens.add({ targets: outer, x: HOME_POS[id].x, y: HOME_POS[id].y, duration: 600 })
      }
    }
  }

  private placePlank(i: number) {
    const slot = this.slots[i]
    const plank = this.add.image(slot.x, slot.y - 70, 'bridge-plank')
    plank.setDisplaySize(46, 20)
    plank.setAngle(slot.angle)
    plank.setAlpha(0)
    this.plankImages[i] = plank
    // star puff where the plank lands
    const sparkle = this.add.image(slot.x, slot.y - 12, 'star').setDisplaySize(26, 26).setAlpha(0)
    this.tweens.add({
      targets: plank,
      y: slot.y,
      alpha: 1,
      duration: 450,
      delay: i === this.currentPlanks ? 0 : 80,
      ease: 'bounce.out',
    })
    this.tweens.add({
      targets: sparkle,
      alpha: { from: 0, to: 1 },
      scale: { from: 0.4, to: 1.4 },
      duration: 300,
      yoyo: true,
      onComplete: () => sparkle.destroy(),
    })
  }
}
