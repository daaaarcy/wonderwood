import Phaser from 'phaser'
import { EventBus } from '../EventBus'
import { GAME_HEIGHT, GAME_WIDTH } from '../assets'
import { CHILDREN } from '../../data/children'
import { PROJECTS, type ProjectDef } from '../../data/city'
import { itemById } from '../../data/catalogue'
import type { ChildId, ProjectId, ProjectStatus } from '../../domain/types'

export interface TownStatePayload {
  projects: Record<ProjectId, { kits: number; status: ProjectStatus }>
  currentProjectId: ProjectId | null
  suggestedProjectId: ProjectId | null
  hats: Record<ChildId, string | null>
  foundersPlanks: number
}

const EXPLORER_HEIGHT = 118
const HAT_WIDTH = 56
const SQUARE_POS: Record<ChildId, { x: number; y: number }> = {
  theodore: { x: 452, y: 492 },
  leonard: { x: 548, y: 492 },
}

const FONT = "'Nunito', ui-rounded, sans-serif"

/** The road extension occupies the lane leaving the square to the east. */
const ROAD_LANE = { x0: 762, y0: 406, x1: 1000, y1: 474 }

interface RenderedProject {
  container: Phaser.GameObjects.Container
  kits: number
  status: ProjectStatus
  marker: string
}

export class TownScene extends Phaser.Scene {
  private explorers = {} as Record<ChildId, Phaser.GameObjects.Container>
  private explorerHats = {} as Record<ChildId, Phaser.GameObjects.Image | null>
  private rendered = new Map<ProjectId, RenderedProject>()
  private truck: Phaser.GameObjects.Image | null = null
  private truckPath!: Phaser.Curves.Path
  private truckT = 0
  private truckDir = 1
  private truckDelivering = false
  private foundersBuilt = false
  private foundersPlanks = 0

  constructor() {
    super('TownScene')
  }

  preload() {
    this.load.svg('town-bg', 'assets/town-bg.svg', { width: 1000, height: 700 })
    for (const id of ['theodore', 'leonard'] as const) {
      for (const pose of ['', '-blink', '-cheer']) {
        this.load.svg(`explorer-${id}${pose}`, `assets/explorer-${id}${pose}.svg`, {
          width: 400,
          height: 480,
        })
      }
    }
    this.load.svg('hat-leaf', 'assets/hat-leaf.svg', { width: 240, height: 180 })
    this.load.svg('bridge-plank', 'assets/bridge-plank.svg', { width: 128, height: 56 })
    this.load.svg('kit-box', 'assets/kit-box.svg', { width: 128, height: 128 })
    this.load.svg('truck', 'assets/truck.svg', { width: 280, height: 180 })
    this.load.svg('star', 'assets/star.svg', { width: 96, height: 96 })
    for (const key of ['icon-road', 'icon-library', 'icon-music', 'icon-police', 'icon-hospital']) {
      this.load.svg(key, `assets/${key}.svg`, { width: 96, height: 96 })
    }
  }

  create() {
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'town-bg').setDisplaySize(GAME_WIDTH, GAME_HEIGHT)

    // plots: fixed-position containers; art rebuilt when state changes
    for (const def of PROJECTS) {
      const container = this.add.container(def.pos.x, def.pos.y)
      container.setSize(210, 170)
      container.setInteractive({ useHandCursor: true })
      container.on('pointerdown', () => {
        EventBus.emit('town-tap', { kind: 'plot', projectId: def.id })
        this.tweens.add({ targets: container, scale: 1.04, duration: 120, yoyo: true })
      })
      this.rendered.set(def.id, { container, kits: -1, status: 'locked', marker: '' })
    }

    this.buildExplorers()
    this.buildTruck()
    this.startBlinkLoop()

    EventBus.on('town-state', this.applyState, this)
    // game.destroy() fires DESTROY rather than SHUTDOWN — listen for both so a
    // dead scene never receives React state pushes.
    const detach = () => EventBus.off('town-state', this.applyState, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, detach)
    this.events.once(Phaser.Scenes.Events.DESTROY, detach)

    EventBus.emit('scene-ready', 'TownScene')
  }

  override update(_time: number, delta: number) {
    if (!this.truck || !this.truck.visible || this.truckDelivering) return
    this.truckT += 0.000055 * delta * this.truckDir
    if (this.truckT >= 1 || this.truckT <= 0) {
      this.truckT = Phaser.Math.Clamp(this.truckT, 0, 1)
      this.truckDir *= -1
      this.truck.setFlipX(this.truckDir < 0)
    }
    const p = this.truckPath.getPoint(this.truckT)
    this.truck.setPosition(p.x, p.y)
  }

  /* ---------------- explorers ---------------- */

  private buildExplorers() {
    for (const id of ['theodore', 'leonard'] as const) {
      const outer = this.add.container(SQUARE_POS[id].x, SQUARE_POS[id].y)
      const bobber = this.add.container(0, 0)
      const body = this.add
        .image(0, 0, `explorer-${id}`)
        .setOrigin(0.5, 1)
        .setDisplaySize((EXPLORER_HEIGHT * 200) / 240, EXPLORER_HEIGHT)
      bobber.add(body)
      outer.add(bobber)
      outer.setData('body', body)
      outer.setData('bobber', bobber)
      outer.setSize(90, EXPLORER_HEIGHT)
      outer.setInteractive({ useHandCursor: true })
      outer.on('pointerdown', () => this.cheer(id))
      this.explorers[id] = outer
      this.explorerHats[id] = null
    }
  }

  private cheer(id: ChildId) {
    const outer = this.explorers[id]
    const body = outer.getData('body') as Phaser.GameObjects.Image
    if (outer.getData('cheering')) return
    outer.setData('cheering', true)
    body.setTexture(`explorer-${id}-cheer`)
    this.tweens.add({
      targets: outer.getData('bobber') as Phaser.GameObjects.Container,
      y: -24,
      duration: 190,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => {
        outer.setData('cheering', false)
        if (body.scene) body.setTexture(`explorer-${id}`)
      },
    })
  }

  private startBlinkLoop() {
    this.time.addEvent({
      delay: 3200,
      loop: true,
      callback: () => {
        for (const id of ['theodore', 'leonard'] as const) {
          const outer = this.explorers[id]
          if (!outer || outer.getData('cheering')) continue
          const body = outer.getData('body') as Phaser.GameObjects.Image
          body.setTexture(`explorer-${id}-blink`)
          this.time.delayedCall(140, () => {
            if (body.scene && !outer.getData('cheering')) body.setTexture(`explorer-${id}`)
          })
        }
      },
    })
  }

  private setHat(childId: ChildId, itemId: string | null) {
    const outer = this.explorers[childId]
    const bobber = outer.getData('bobber') as Phaser.GameObjects.Container
    const old = this.explorerHats[childId]
    if (old) {
      bobber.remove(old, true)
      this.explorerHats[childId] = null
    }
    if (!itemId) return
    const item = itemById(itemId)
    if (!item || item.slot !== 'hat') return
    const anchor = item.anchor ?? { x: 0.5, y: 0.85 }
    const hat = this.add.image(0, 0, item.assetKey)
    hat.setDisplaySize(HAT_WIDTH, (HAT_WIDTH * 90) / 120)
    hat.setOrigin(anchor.x, anchor.y)
    hat.x = ((CHILDREN[childId].headAnchor.x - 100) / 200) * ((EXPLORER_HEIGHT * 200) / 240)
    hat.y = (-(240 - CHILDREN[childId].headAnchor.y) / 240) * EXPLORER_HEIGHT
    bobber.add(hat)
    this.explorerHats[childId] = hat
  }

  /* ---------------- truck ---------------- */

  private buildTruck() {
    this.truckPath = new Phaser.Curves.Path(500, 714)
    this.truckPath.lineTo(500, 452)
    this.truckPath.lineTo(560, 440)
    this.truckPath.lineTo(940, 440)
    this.truck = this.add.image(500, 714, 'truck').setOrigin(0.5, 0.9)
    this.truck.setDisplaySize(92, 60)
    this.truck.setVisible(false)
    this.truck.setInteractive({ useHandCursor: true })
    this.truck.on('pointerdown', () => {
      const truck = this.truck
      if (!truck) return
      // honk bounce
      this.tweens.add({
        targets: truck,
        scaleX: truck.scaleX * 1.12,
        scaleY: truck.scaleY * 1.12,
        duration: 90,
        yoyo: true,
      })
      EventBus.emit('town-tap', { kind: 'truck' })
    })
  }

  /** Deliver a kit: truck drives to the site, drops the box, puffs, leaves. */
  private deliverKit(projectId: ProjectId) {
    if (!this.truck) return
    const def = PROJECTS.find((p) => p.id === projectId)
    if (!def) return
    this.truckDelivering = true
    this.truck.setVisible(true).setFlipX(false).setPosition(500, 714)
    const dropX = Phaser.Math.Clamp(def.pos.x + 64, 60, 930)
    const dropY = Phaser.Math.Clamp(def.pos.y + 56, 200, 668)
    this.tweens.chain({
      targets: this.truck,
      tweens: [
        { x: 500, y: 452, duration: 700, ease: 'Sine.easeInOut' },
        { x: 560, y: 440, duration: 260, ease: 'Sine.easeInOut' },
        { x: dropX, y: dropY, duration: 650, ease: 'Sine.easeInOut' },
      ],
      onComplete: () => this.dropKit(def.pos.x, def.pos.y, def.pos.x > 500),
    })
  }

  private dropKit(x: number, y: number, leaveRight: boolean) {
    const box = this.add.image(x, y + 6, 'kit-box').setDisplaySize(52, 52).setScale(0)
    this.tweens.add({ targets: box, scale: 1, duration: 320, ease: 'Back.easeOut' })
    this.time.delayedCall(1400, () => {
      this.tweens.add({
        targets: box,
        alpha: 0,
        y: box.y - 12,
        duration: 400,
        onComplete: () => box.destroy(),
      })
    })
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2
      const puff = this.add.circle(x, y - 12, 6, 0xffc800, 0.9)
      this.tweens.add({
        targets: puff,
        x: x + Math.cos(a) * 46,
        y: y - 12 + Math.sin(a) * 26,
        alpha: 0,
        scale: 0.2,
        duration: 500,
        onComplete: () => puff.destroy(),
      })
    }
    this.tweens.chain({
      targets: this.truck!,
      tweens: leaveRight
        ? [{ x: 1030, y: 445, duration: 800, ease: 'Sine.easeIn' }]
        : [
            { x: 560, y: 440, duration: 500, ease: 'Sine.easeIn' },
            { x: 500, y: 714, duration: 700, ease: 'Sine.easeIn' },
          ],
      onComplete: () => {
        this.truckDelivering = false
        if (this.truck!.visible) {
          const p = this.truckPath.getPoint(this.truckT)
          this.truck!.setPosition(p.x, p.y)
        }
      },
    })
  }

  /* ---------------- founders' bridge ---------------- */

  private buildFoundersBridge() {
    if (this.foundersBuilt || this.foundersPlanks <= 0) return
    this.foundersBuilt = true
    const c = this.add.container(0, 0)
    const g = this.add.graphics()
    const colors = [0xff4b4b, 0xffc800, 0x58cc02, 0x1cb0f6]
    colors.forEach((color, i) => {
      const arc = new Phaser.Curves.QuadraticBezier(
        new Phaser.Math.Vector2(28, 626),
        new Phaser.Math.Vector2(108, 566 - i * 7),
        new Phaser.Math.Vector2(188, 640),
      )
      g.lineStyle(8 - i * 1.4, color, 0.95)
      arc.draw(g, 30)
    })
    // one plank per remembered star, up to 12
    const curve = new Phaser.Curves.QuadraticBezier(
      new Phaser.Math.Vector2(30, 624),
      new Phaser.Math.Vector2(108, 562),
      new Phaser.Math.Vector2(186, 638),
    )
    const n = Math.min(this.foundersPlanks, 12)
    for (let i = 0; i < n; i += 1) {
      const t = (i + 0.5) / 12
      const p = curve.getPoint(t)
      const tangent = curve.getTangent(t)
      const plank = this.add
        .image(p.x, p.y, 'bridge-plank')
        .setDisplaySize(26, 12)
        .setRotation(Math.atan2(tangent.y, tangent.x) + Math.PI / 2)
      c.add(plank)
    }
    // plaque
    const plaque = this.add.container(196, 566)
    const pg = this.add.graphics()
    pg.fillStyle(0xffffff, 1)
    pg.fillRoundedRect(-56, -16, 112, 32, 10)
    pg.lineStyle(3, 0xe5b400, 1)
    pg.strokeRoundedRect(-56, -16, 112, 32, 10)
    const label = this.add
      .text(0, 0, 'Founders\u2019 Bridge', {
        fontFamily: FONT,
        fontSize: '15px',
        fontStyle: '800',
        color: '#3c3c3c',
      })
      .setOrigin(0.5)
    plaque.add([pg, label])
    plaque.setSize(112, 32).setInteractive({ useHandCursor: true })
    plaque.on('pointerdown', () =>
      EventBus.emit('town-tap', { kind: 'bridge', planks: this.foundersPlanks }),
    )
    c.add([g, plaque])
  }

  /* ---------------- plot art ---------------- */

  private renderPlot(def: ProjectDef, kits: number, status: ProjectStatus, marker: string, suggested: boolean) {
    const r = this.rendered.get(def.id)
    if (!r) return
    if (r.kits === kits && r.status === status && r.marker === marker) return
    r.container.removeAll(true)
    const g = this.add.graphics()
    r.container.add(g)

    if (status === 'locked') {
      this.drawLocked(r.container, g)
    } else if (def.id === 'road') {
      this.drawRoad(r.container, g, status, kits, def)
    } else if (status === 'open') {
      this.drawBuilding(r.container, g, def)
    } else {
      const p = kits / def.kits
      if (kits === 0) this.drawSite(r.container, g, def)
      else if (p < 0.4) this.drawFoundations(r.container, g, def)
      else if (p < 0.75) this.drawWalls(r.container, g, def)
      else this.drawRoof(r.container, g, def)
    }
    if (suggested && status === 'locked') {
      const badge = this.add.image(52, -52, 'star').setDisplaySize(36, 36)
      r.container.add(badge)
    }
    r.kits = kits
    r.status = status
    r.marker = marker
  }

  private fence(g: Phaser.GameObjects.Graphics, w: number, h: number) {
    g.lineStyle(5, 0xffffff, 0.95)
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 8)
    for (const [x, y] of [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [-w / 2, h / 2],
      [w / 2, h / 2],
    ]) {
      g.fillStyle(0xff9600, 1)
      g.fillRoundedRect(x - 7, y - 7, 14, 14, 5)
    }
  }

  private nameSign(container: Phaser.GameObjects.Container, def: ProjectDef) {
    const s = this.add.container(0, 62)
    const g = this.add.graphics()
    g.fillStyle(0x96683f, 1)
    g.fillRoundedRect(-4, -8, 8, 26, 3)
    g.fillStyle(0xffffff, 1)
    g.fillRoundedRect(-78, -46, 156, 38, 10)
    g.lineStyle(3, Phaser.Display.Color.HexStringToColor(def.color).color, 1)
    g.strokeRoundedRect(-78, -46, 156, 38, 10)
    const icon = this.add.image(-58, -27, def.iconKey).setDisplaySize(24, 24)
    const t = this.add
      .text(-40, -27, def.label, {
        fontFamily: FONT,
        fontSize: '15px',
        fontStyle: '800',
        color: '#3c3c3c',
      })
      .setOrigin(0, 0.5)
    s.add([g, icon, t])
    container.add(s)
  }

  private drawLocked(container: Phaser.GameObjects.Container, g: Phaser.GameObjects.Graphics) {
    // grassy lot with a "?" signpost
    g.fillStyle(0xffffff, 0.9)
    g.fillRoundedRect(-30, -58, 60, 42, 10)
    g.lineStyle(4, 0xafafaf, 1)
    g.strokeRoundedRect(-30, -58, 60, 42, 10)
    g.fillStyle(0xafafaf, 1)
    g.fillRoundedRect(-4, -16, 8, 24, 3)
    const q = this.add
      .text(0, -38, '?', { fontFamily: FONT, fontSize: '26px', fontStyle: '900', color: '#777777' })
      .setOrigin(0.5)
    container.add(q)
  }

  private drawSite(container: Phaser.GameObjects.Container, g: Phaser.GameObjects.Graphics, def: ProjectDef) {
    this.fence(g, 190, 100)
    g.fillStyle(0xc98a5a, 0.6)
    g.fillEllipse(-30, 8, 90, 30)
    const box = this.add.image(40, 0, 'kit-box').setDisplaySize(40, 40)
    container.add(box)
    this.nameSign(container, def)
  }

  private drawFoundations(container: Phaser.GameObjects.Container, g: Phaser.GameObjects.Graphics, def: ProjectDef) {
    this.fence(g, 190, 100)
    g.fillStyle(0xd9d9d9, 1)
    g.fillRoundedRect(-80, -20, 160, 46, 10)
    g.lineStyle(3, 0xb8b8b8, 1)
    g.strokeRoundedRect(-80, -20, 160, 46, 10)
    this.drawCrane(g)
    this.nameSign(container, def)
  }

  private drawWalls(container: Phaser.GameObjects.Container, g: Phaser.GameObjects.Graphics, def: ProjectDef) {
    this.fence(g, 190, 100)
    const color = Phaser.Display.Color.HexStringToColor(def.color).color
    g.fillStyle(0xfff3e4, 1)
    g.fillRoundedRect(-70, -34, 140, 62, 8)
    g.fillStyle(color, 0.35)
    g.fillRoundedRect(-70, -34, 140, 22, 8)
    g.lineStyle(3, 0xd8c4a0, 1)
    g.strokeRoundedRect(-70, -34, 140, 62, 8)
    this.drawScaffold(g)
    this.nameSign(container, def)
  }

  private drawRoof(container: Phaser.GameObjects.Container, g: Phaser.GameObjects.Graphics, def: ProjectDef) {
    this.fence(g, 190, 100)
    const color = Phaser.Display.Color.HexStringToColor(def.color).color
    g.fillStyle(0xfff3e4, 1)
    g.fillRoundedRect(-70, -40, 140, 68, 8)
    g.fillStyle(color, 1)
    g.fillTriangle(-82, -40, 82, -40, 0, -86)
    g.lineStyle(3, 0xd8c4a0, 1)
    g.strokeRoundedRect(-70, -40, 140, 68, 8)
    this.drawScaffold(g)
    this.nameSign(container, def)
  }

  private drawCrane(g: Phaser.GameObjects.Graphics) {
    g.fillStyle(0xffc800, 1)
    g.fillRoundedRect(52, -96, 10, 100, 3)
    g.fillRoundedRect(-40, -96, 112, 9, 3)
    g.lineStyle(2, 0x777777, 1)
    g.lineBetween(-20, -88, -20, -46)
    g.fillStyle(0x777777, 1)
    g.fillRoundedRect(-26, -46, 12, 10, 3)
  }

  private drawScaffold(g: Phaser.GameObjects.Graphics) {
    g.lineStyle(4, 0xa06a42, 1)
    for (const x of [-84, 84]) {
      g.lineBetween(x, 32, x, -72)
      g.lineBetween(x - 10, 32, x + 10, -72)
    }
    g.lineStyle(3, 0xc98a5a, 1)
    g.lineBetween(-88, -36, 88, -36)
  }

  private drawBuilding(container: Phaser.GameObjects.Container, g: Phaser.GameObjects.Graphics, def: ProjectDef) {
    const color = Phaser.Display.Color.HexStringToColor(def.color).color
    g.fillStyle(0x3c3c3c, 0.08)
    g.fillEllipse(0, 44, 170, 22)
    g.fillStyle(0xfff8ee, 1)
    g.fillRoundedRect(-78, -44, 156, 88, 12)
    g.fillStyle(color, 1)
    g.fillTriangle(-92, -44, 92, -44, 0, -98)
    g.fillStyle(0x96683f, 1)
    g.fillRoundedRect(-16, 6, 32, 38, 9)
    g.fillStyle(0xeafbff, 1)
    g.fillRoundedRect(-60, -26, 30, 26, 7)
    g.fillRoundedRect(30, -26, 30, 26, 7)
    g.fillStyle(0xffffff, 1)
    g.fillCircle(0, -58, 16)
    g.lineStyle(3, color, 1)
    g.strokeCircle(0, -58, 16)
    g.lineStyle(4, 0x96683f, 1)
    g.lineBetween(0, -98, 0, -120)
    g.fillStyle(color, 1)
    g.fillTriangle(0, -120, 28, -113, 0, -106)
    const icon = this.add.image(0, -58, def.iconKey).setDisplaySize(22, 22)
    container.add(icon)
  }

  /* ---- the road project ---- */

  private drawRoad(
    container: Phaser.GameObjects.Container,
    g: Phaser.GameObjects.Graphics,
    status: ProjectStatus,
    kits: number,
    def: ProjectDef,
  ) {
    // container sits at def.pos; the lane is in world coords → local offset
    const lx0 = ROAD_LANE.x0 - def.pos.x
    const lx1 = ROAD_LANE.x1 - def.pos.x
    const ly0 = ROAD_LANE.y0 - def.pos.y
    const ly1 = ROAD_LANE.y1 - def.pos.y
    const mid = lx0 + (lx1 - lx0) / 2
    const cy = (ly0 + ly1) / 2

    if (status === 'open') {
      g.fillStyle(0xc9c9c9, 1)
      g.fillRoundedRect(lx0, ly0, lx1 - lx0, ly1 - ly0, 8)
      g.lineStyle(5, 0xafafaf, 1)
      g.strokeRoundedRect(lx0, ly0, lx1 - lx0, ly1 - ly0, 8)
      for (let x = lx0 + 12; x < lx1 - 10; x += 34) {
        g.fillStyle(0xffffff, 1)
        g.fillRoundedRect(x, cy - 3, 20, 6, 3)
      }
      // the new meadow the road reaches
      g.fillStyle(0x6ddb1e, 1)
      g.fillRoundedRect(lx1 - 14, ly0 - 48, 60, ly1 - ly0 + 96, 14)
      g.fillStyle(0xffc800, 1)
      g.fillCircle(lx1 - 26, ly0 - 62, 10)
      g.fillCircle(lx1 - 40, ly1 + 58, 7)
      return
    }

    if (kits >= 1) {
      // half paved
      g.fillStyle(0xc9c9c9, 1)
      g.fillRoundedRect(lx0, ly0, mid - lx0, ly1 - ly0, 8)
      g.lineStyle(5, 0xafafaf, 1)
      g.strokeRoundedRect(lx0, ly0, mid - lx0, ly1 - ly0, 8)
      for (let x = lx0 + 12; x < mid - 10; x += 34) {
        g.fillStyle(0xffffff, 1)
        g.fillRoundedRect(x, cy - 3, 20, 6, 3)
      }
      g.fillStyle(0xc98a5a, 0.55)
      g.fillRoundedRect(mid, ly0 + 4, lx1 - mid - 4, ly1 - ly0 - 8, 6)
    } else {
      g.lineStyle(4, 0xffffff, 0.9)
      g.strokeRoundedRect(lx0 + 4, ly0 + 4, lx1 - lx0 - 8, ly1 - ly0 - 8, 8)
      g.fillStyle(0xc98a5a, 0.45)
      g.fillRoundedRect(lx0 + 8, ly0 + 8, lx1 - lx0 - 16, ly1 - ly0 - 16, 6)
    }
    // cones mark the work zone
    for (const cx of [lx1 - 16, lx1 - 34]) {
      g.fillStyle(0xff9600, 1)
      g.fillTriangle(cx - 8, ly1 + 26, cx + 8, ly1 + 26, cx, ly1 + 2)
      g.fillStyle(0xffffff, 1)
      g.fillRoundedRect(cx - 6, ly1 + 12, 12, 4, 2)
    }
    this.nameSign(container, def)
  }

  /* ---------------- state ---------------- */

  private applyState(payload: TownStatePayload) {
    if (!this.sys.displayList) return
    this.foundersPlanks = payload.foundersPlanks
    this.buildFoundersBridge()

    for (const def of PROJECTS) {
      const prev = this.rendered.get(def.id)
      const next = payload.projects[def.id]
      if (prev && next && next.kits > prev.kits && prev.kits >= 0) {
        this.deliverKit(def.id)
      }
      this.renderPlot(
        def,
        next?.kits ?? 0,
        next?.status ?? 'locked',
        `${payload.currentProjectId}:${payload.suggestedProjectId}:${next?.status}:${next?.kits}`,
        payload.suggestedProjectId === def.id,
      )
    }

    for (const id of ['theodore', 'leonard'] as const) {
      const current = this.explorerHats[id]?.getData('itemId') ?? null
      if ((payload.hats[id] ?? null) !== current) {
        this.setHat(id, payload.hats[id])
        this.explorerHats[id]?.setData('itemId', payload.hats[id])
      }
    }

    if (this.truck) {
      const roadOpen = payload.projects.road?.status === 'open'
      if (!this.truckDelivering) this.truck.setVisible(roadOpen)
    }
  }
}
