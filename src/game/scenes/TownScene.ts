import Phaser from 'phaser'
import { EventBus, tapOnCanvas } from '../EventBus'
import { lookKey, registerLookTextures, type ExplorerPose } from '../avatarSvg'
import type { AvatarLook } from '../../domain/avatar'
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
  cityName: string | null
  looks: Record<ProjectId, { color: string | null; name: string | null }>
  /** v9: each explorer's avatar look (drives generated textures). */
  avatars?: Record<ChildId, AvatarLook>
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

/**
 * Truck route — measured against the painted roads:
 *  - vertical road: x 455–545, y 500 → 700 (centre line x=500, right lanes ±22)
 *  - plaza oval: centre (500,400) r 235×105 → its SE edge is skirted by the turns
 *  - east lane: x 762–1000, y 406–474 (dashes at y≈440, lanes y≈457 / y≈423)
 * One continuous loop: up the east lane → turn south of the plaza → right
 * along the south lane → off-screen pause → back west on the north lane →
 * turn down → down the west lane → pause → repeat.
 */
const TRUCK_SPEED = 95 // px/s
const TRUCK_SIZES = {
  truck: { w: 120, h: 84 },
  'truck-front': { w: 78, h: 78 },
  'truck-back': { w: 78, h: 78 },
} as const


interface RenderedProject {
  container: Phaser.GameObjects.Container
  kits: number
  status: ProjectStatus
  marker: string
}

export class TownScene extends Phaser.Scene {
  private bg!: Phaser.GameObjects.Image
  private explorers = {} as Record<ChildId, Phaser.GameObjects.Container>
  private explorerHats = {} as Record<ChildId, Phaser.GameObjects.Image | null>
  /** Generated texture keys per child/pose once the look's art exists. */
  private avatarKeys: Record<ChildId, Partial<Record<ExplorerPose, string>>> = {
    theodore: {},
    leonard: {},
  }
  private lastLookKey: Record<ChildId, string> = { theodore: '', leonard: '' }

  /** Texture key for an explorer pose — generated look if loaded, else the
   *  static default SVG from preload. */
  private texKey(id: ChildId, pose: ExplorerPose): string {
    const gen = this.avatarKeys[id][pose]
    if (gen && this.textures.exists(gen)) return gen
    return `explorer-${id}${pose === 'idle' ? '' : `-${pose}`}`
  }

  /** Generate runtime textures for a new look, then re-skin the body sprite. */
  private ensureAvatar(id: ChildId, look: AvatarLook) {
    const k = lookKey(look)
    if (this.lastLookKey[id] === k) return
    this.lastLookKey[id] = k
    registerLookTextures(this, `av-${id}-${k}`, look, (keys) => {
      if (!this.sys?.displayList) return
      this.avatarKeys[id] = keys
      const outer = this.explorers[id]
      const body = outer?.getData('body') as Phaser.GameObjects.Image | undefined
      if (body?.scene && !outer.getData('cheering')) body.setTexture(this.texKey(id, 'idle'))
    })
  }
  private rendered = new Map<ProjectId, RenderedProject>()
  private truck: Phaser.GameObjects.Image | null = null
  private truckShadow: Phaser.GameObjects.Ellipse | null = null
  /** Route legs — driven as one continuous loop, no reversing. */
  private truckLegs: { curve: Phaser.Curves.Line | Phaser.Curves.QuadraticBezier; len: number }[] = []
  private truckLegIdx = 0
  private truckDist = 0
  private truckPause = 0
  private puffMs = 0
  private bobMs = 0
  private truckSprite = ''
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
    this.load.svg('truck', 'assets/truck.svg', { width: 280, height: 196 })
    this.load.svg('truck-front', 'assets/truck-front.svg', { width: 196, height: 196 })
    this.load.svg('truck-back', 'assets/truck-back.svg', { width: 196, height: 196 })
    this.load.svg('resident-fox', 'assets/resident-fox.svg', { width: 120, height: 90 })
    this.load.svg('resident-rabbit', 'assets/resident-rabbit.svg', { width: 100, height: 100 })
    this.load.svg('resident-bear', 'assets/resident-bear.svg', { width: 120, height: 100 })
    this.load.svg('star', 'assets/star.svg', { width: 96, height: 96 })
    for (const key of ['icon-road', 'icon-library', 'icon-music', 'icon-police', 'icon-hospital']) {
      this.load.svg(key, `assets/${key}.svg`, { width: 96, height: 96 })
    }
  }

  create() {
    this.bg = this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'town-bg')
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
    this.scale.on('resize', this.layout, this)
    this.layout()

    // plots: fixed-position containers; art rebuilt when state changes
    for (const def of PROJECTS) {
      const container = this.add.container(def.pos.x, def.pos.y)
      container.setSize(210, 170)
      container.setInteractive(
        new Phaser.Geom.Rectangle(-105, -85, 210, 170),
        Phaser.Geom.Rectangle.Contains,
      )
      container.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (!tapOnCanvas(pointer)) return
        EventBus.emit('town-tap', { kind: 'plot', projectId: def.id })
        this.tweens.add({ targets: container, scale: 1.04, duration: 120, yoyo: true })
      })
      this.rendered.set(def.id, { container, kits: -1, status: 'locked', marker: '' })
    }

    this.buildAmbient()

    this.buildExplorers()
    this.buildTruck()
    this.startBlinkLoop()

    EventBus.on('town-state', this.applyState, this)
    EventBus.on('town-ride', this.onRideRequest, this)
    const detachRide = () => EventBus.off('town-ride', this.onRideRequest, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, detachRide)
    this.events.once(Phaser.Scenes.Events.DESTROY, detachRide)
    // game.destroy() fires DESTROY rather than SHUTDOWN — listen for both so a
    // dead scene never receives React state pushes.
    const detach = () => EventBus.off('town-state', this.applyState, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, detach)
    this.events.once(Phaser.Scenes.Events.DESTROY, detach)

    EventBus.emit('scene-ready', 'TownScene')
  }

  /**
   * Contain-fit: the WHOLE town (houses, square, road, all plots, stream) is
   * always inside the camera view. Any extra canvas space is filled by
   * extending the world edges — grass, trees, flowers, distant hills.
   */
  private marginGroup?: Phaser.GameObjects.Container
  private groundFill?: Phaser.GameObjects.Rectangle

  private layout() {
    const w = this.scale.width
    const h = this.scale.height
    const s = Math.min(w / GAME_WIDTH, h / GAME_HEIGHT)
    const viewW = w / s
    const viewH = h / s

    // grass fills the whole visible area, then the painted backdrop on top
    if (!this.groundFill) {
      this.groundFill = this.add
        .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 1, 1, 0x7ed957)
        .setDepth(-10)
    }
    this.groundFill.setDisplaySize(viewW + 60, viewH + 60)
    this.bg.setPosition(GAME_WIDTH / 2, GAME_HEIGHT / 2).setDisplaySize(GAME_WIDTH, GAME_HEIGHT)

    // margin scenery — rebuilt on each resize (cheap, a dozen shapes)
    if (this.marginGroup) this.marginGroup.destroy(true)
    const g = this.add.container(0, 0).setDepth(-9)
    this.marginGroup = g
    const left = (GAME_WIDTH - viewW) / 2
    const top = (GAME_HEIGHT - viewH) / 2
    const tree = (x: number, y: number, r: number, c: number) => {
      g.add(this.add.circle(x, y, r, c))
      g.add(this.add.rectangle(x, y + r * 0.9, r * 0.24, r * 0.7, 0x96683f))
    }
    const flower = (x: number, y: number, c: number) => {
      g.add(this.add.circle(x, y, 4, c))
    }
    // side bands — treelines mirroring the backdrop
    for (let x = left + 40; x < left + viewW - 40; x += 130) {
      if (top < 0) {
        // extra space above — distant hills + treeline
        g.add(this.add.circle(x, top + 30, 70, 0x46a302))
        g.add(this.add.circle(x + 60, top + 10, 55, 0x58cc02))
      }
      if (GAME_HEIGHT + viewH - top - viewH > 0) {
        // bottom band — bushes + flowers
        const by = GAME_HEIGHT + (-top) / 2 + 20
        if (by < GAME_HEIGHT + viewH / 2 - 10) {
          g.add(this.add.circle(x, GAME_HEIGHT + 20 + (x % 3) * 8, 42, 0x46a302))
        }
      }
    }
    for (let y = 40; y < GAME_HEIGHT + viewH; y += 150) {
      if (left < 0) {
        tree(left + 60 + (y % 2) * 24, y - top - GAME_HEIGHT / 2 + 350 > 700 ? 700 : y, 44, 0x46a302)
      }
      if (GAME_WIDTH + viewW - left - viewW > 0) {
        // right margin
        const rx = GAME_WIDTH - left - 0
        if (rx < GAME_WIDTH + viewW / 2 + left) {
          tree(GAME_WIDTH + 60, y, 44, 0x46a302)
        }
      }
    }
    // flowers scattered in margins
    const cols = [0xf2c40f, 0xff7b9c, 0xffffff]
    for (let i = 0; i < 24; i += 1) {
      const fx = left + 30 + (i * 137) % Math.max(60, viewW - 60)
      const fy = top + 30 + (i * 211) % Math.max(60, viewH - 60)
      if (fx > 10 && fx < GAME_WIDTH - 10 && fy > 10 && fy < GAME_HEIGHT - 10) continue
      flower(fx, fy, cols[i % 3] ?? 0xffffff)
    }
    this.cameras.main.setZoom(s)
    this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2)
  }

  override update(_time: number, delta: number) {
    if (!this.truck || !this.truckShadow || !this.truck.visible || this.truckDelivering) return
    if (this.reducedMotion) return // parked at the roadside

    // off-screen pause between loops
    if (this.truckPause > 0) {
      this.truckPause -= delta
      if (this.truckPause <= 0) {
        this.truckLegIdx = (this.truckLegIdx + 1) % this.truckLegs.length
        this.truckDist = 0
        this.truck.setAlpha(0)
        this.truckShadow.setAlpha(0)
      }
      return
    }

    const leg = this.truckLegs[this.truckLegIdx]
    if (!leg) return
    this.truckDist += (TRUCK_SPEED * delta) / 1000
    if (this.truckDist >= leg.len) {
      if (this.riding) {
        if (this.truckLegIdx >= 4) {
          // lap done — drop the explorer at the plaza edge, truck drives on
          this.finishRide()
        } else {
          this.truckLegIdx += 1
          this.truckDist = 0
        }
        return
      }
      // hidden pauses only where the route leaves the view (east exit, bottom exit)
      if (this.truckLegIdx === 2 || this.truckLegIdx === this.truckLegs.length - 1) {
        this.truckPause = Phaser.Math.Between(2000, 5000)
        return
      }
      this.truckLegIdx += 1
      this.truckDist = 0
      return
    }

    const t = leg.curve.getUtoTmapping(0, this.truckDist / leg.len)
    const p = leg.curve.getPoint(t)
    const ahead = leg.curve.getPoint(Math.min(1, t + 0.01))
    const dx = ahead.x - p.x
    const dy = ahead.y - p.y

    // the rider hops on when the truck reaches the road top, follows it around
    const ride = this.rideExplorer
    if (ride) {
      if (!ride.boarded && this.truckLegIdx >= 1) ride.boarded = true
      if (ride.boarded) ride.outer.setPosition(p.x, p.y - 52)
    }

    // sprite by heading; gentle suspension bob
    this.bobMs += delta
    const bob = Math.sin(this.bobMs / 140) * 1
    this.setTruckSprite(dx, dy)
    this.truck.setPosition(p.x, p.y + bob)
    this.truckShadow.setPosition(p.x, p.y + 6)
    this.truck.setDepth(2 + p.y / 700)
    this.truckShadow.setDepth(2 + (p.y - 1) / 700)

    // fade in/out over the off-screen ends of the route
    const fade = Math.min(1, this.truckDist / 40, (leg.len - this.truckDist) / 40)
    this.truck.setAlpha(Phaser.Math.Clamp(fade * 1.4, 0, 1))
    this.truckShadow.setAlpha(this.truck.alpha * 0.5)

    // little exhaust puffs from the rear
    this.puffMs += delta
    if (this.puffMs > 700) {
      this.puffMs = 0
      this.exhaustPuff(p.x, p.y, dx, dy)
    }
  }

  /** Pick the truck art for a heading: side when |dx|>|dy|, else front/back. */
  private setTruckSprite(dx: number, dy: number) {
    const horiz = Math.abs(dx) >= Math.abs(dy)
    const key = horiz ? 'truck' : dy > 0 ? 'truck-front' : 'truck-back'
    const flip = horiz && dx < 0
    if (key !== this.truckSprite) {
      this.truckSprite = key
      const size = TRUCK_SIZES[key]
      this.truck?.setTexture(key).setDisplaySize(size.w, size.h)
    }
    this.truck?.setFlipX(flip)
    // keep the shadow under whichever view is showing
    this.truckShadow?.setSize(key === 'truck' ? 100 : 76, 12)
  }

  private exhaustPuff(x: number, y: number, dx: number, dy: number) {
    const behind = Phaser.Math.Angle.Normalize(Math.atan2(dy, dx) + Math.PI)
    const px = x + Math.cos(behind) * 52
    const py = y + Math.sin(behind) * 20 - 4
    const puff = this.add.circle(px, py, 5, 0xe2e2e2, 0.8).setDepth(2)
    this.tweens.add({
      targets: puff,
      y: py - 16,
      scale: 1.8,
      alpha: 0,
      duration: 700,
      onComplete: () => puff.destroy(),
    })
  }

  /* ---------------- ambient life ---------------- */

  private get reducedMotion() {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  }

  /** Trees, beds, lamp posts, fountain sparkle, chimney smoke, wandering
   *  friends — the calm picture-book dressing around the tappable town. */
  private buildAmbient() {
    const g = this.add.graphics().setDepth(1)

    // flower beds framing each plot
    const bedColors = [0xff7b9c, 0xf2c40f, 0xffffff, 0x9a6fe0]
    for (const def of PROJECTS) {
      if (def.id === 'road') continue
      const bx = def.pos.x - 96
      const by = def.pos.y + 66
      for (let i = 0; i < 4; i += 1) {
        const x = bx + i * 24
        g.fillStyle(0x3f9e34, 0.9)
        g.fillEllipse(x, by + 10, 26, 14)
        g.fillStyle(bedColors[(i + PROJECTS.indexOf(def)) % 4] ?? 0xffffff, 1)
        g.fillCircle(x, by + 4, 5)
        g.fillStyle(0xf2c40f, 1)
        g.fillCircle(x, by + 4, 2)
      }
    }

    // lamp posts along the road
    for (const [x, y] of [
      [640, 408],
      [880, 406],
    ]) {
      g.fillStyle(0x5a5a5a, 1)
      g.fillRoundedRect(x - 3, y - 46, 6, 50, 3)
      g.fillStyle(0xf2c40f, 1)
      g.fillCircle(x, y - 48, 9)
      g.fillStyle(0xfff3b8, 0.4)
      g.fillCircle(x, y - 48, 14)
    }

    // bushes + trees framing the square
    for (const [x, y, r, c] of [
      [300, 610, 16, 0x3f9e34],
      [700, 610, 18, 0x3f9e34],
      [90, 430, 14, 0x58cc02],
      [920, 530, 15, 0x3f9e34],
      [120, 620, 17, 0x58cc02],
      [860, 640, 15, 0x3f9e34],
      [500, 130, 16, 0x58cc02],
    ] as const) {
      g.fillStyle(c, 1)
      g.fillCircle(x, y, r)
      g.fillCircle(x - r * 0.7, y + r * 0.3, r * 0.7)
      g.fillCircle(x + r * 0.7, y + r * 0.3, r * 0.7)
    }

    // little fountain on the square's west edge
    const fx = 372
    const fy = 470
    g.fillStyle(0xd9d9d9, 1)
    g.fillEllipse(fx, fy, 74, 30)
    g.fillStyle(0x7fd4f0, 1)
    g.fillEllipse(fx, fy - 4, 58, 20)
    g.fillStyle(0xd9d9d9, 1)
    g.fillEllipse(fx, fy - 16, 22, 10)

    const rm = this.reducedMotion
    // fountain sparkle
    if (!rm) {
      for (let i = 0; i < 3; i += 1) {
        const spark = this.add.star(fx - 8 + i * 8, fy - 26, 4, 2, 6, 0xffffff)
        this.tweens.add({
          targets: spark,
          y: fy - 40,
          alpha: 0,
          scale: 0.4,
          duration: 900 + i * 300,
          repeat: -1,
          repeatDelay: 400 * i,
          onComplete: () => spark.setPosition(fx - 8 + i * 8, fy - 26).setAlpha(1).setScale(1),
        })
      }
      // chimney smoke for both houses (top corners of the bg)
      for (const hx of [96, 906]) {
        for (let i = 0; i < 2; i += 1) {
          const puff = this.add.circle(hx + i * 6, 58, 7 + i * 2, 0xffffff, 0.75)
          this.tweens.add({
            targets: puff,
            y: 14,
            alpha: 0,
            scale: 1.9,
            duration: 2400,
            delay: i * 900,
            repeat: -1,
            onRepeat: () => puff.setPosition(hx + i * 6, 58).setAlpha(0.75).setScale(1),
          })
        }
      }
      // two drifting butterflies
      for (const [bx, by, col] of [
        [250, 300, 0xf2c40f],
        [740, 320, 0xff7b9c],
      ] as const) {
        const b = this.add.container(bx, by)
        const l = this.add.ellipse(-4, 0, 9, 13, col).setRotation(-0.5)
        const r = this.add.ellipse(4, 0, 9, 13, col).setRotation(0.5)
        const body = this.add.rectangle(0, 0, 3, 10, 0x3c3c3c).setRotation(0.2)
        b.add([l, r, body])
        b.setDepth(2)
        this.tweens.add({
          targets: b,
          x: bx + 90,
          y: by + Phaser.Math.Between(-50, 50),
          duration: 5200,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        })
      }
      // wandering friends — and Bramble the Bear, too sleepy to wander:
      // he just naps by the roadside with a slow snore-breath
      this.wander(this.add.image(90, 632, 'resident-fox').setDisplaySize(88, 66), 90, 170)
      this.wander(this.add.image(880, 330, 'resident-rabbit').setDisplaySize(62, 62).setFlipX(true), 880, 700)
      const bramble = this.add.image(605, 652, 'resident-bear').setDisplaySize(80, 67).setDepth(2)
      this.tweens.add({
        targets: bramble,
        scaleY: bramble.scaleY * 1.05,
        duration: 1400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
    } else {
      // reduced motion — the friends still say hello, just standing still
      this.add.image(90, 632, 'resident-fox').setDisplaySize(88, 66)
      this.add.image(880, 330, 'resident-rabbit').setDisplaySize(62, 62)
      this.add.image(605, 652, 'resident-bear').setDisplaySize(80, 67).setDepth(2)
    }
  }

  /** Slow stroll between two spots, bobbing gently along the way. */
  private wander(img: Phaser.GameObjects.Image, a: number, b: number) {
    img.setDepth(2)
    const go = (to: number) => {
      img.setFlipX(to < img.x)
      this.tweens.add({
        targets: img,
        x: to,
        duration: Math.abs(to - img.x) * 40,
        ease: 'Sine.easeInOut',
        onComplete: () => this.time.delayedCall(1600, () => go(to === a ? b : a)),
      })
      this.tweens.add({
        targets: img,
        y: img.y - 4,
        duration: 400,
        yoyo: true,
        repeat: Math.max(1, Math.round(Math.abs(to - img.x) / 60)),
        ease: 'Sine.easeInOut',
      })
    }
    go(b)
  }

  /* ---------------- explorers ---------------- */

  private buildExplorers() {
    for (const id of ['theodore', 'leonard'] as const) {
      const outer = this.add.container(SQUARE_POS[id].x, SQUARE_POS[id].y)
      const bobber = this.add.container(0, 0)
      const body = this.add
        .image(0, 0, this.texKey(id, 'idle'))
        .setOrigin(0.5, 1)
        .setDisplaySize((EXPLORER_HEIGHT * 200) / 240, EXPLORER_HEIGHT)
      bobber.add(body)
      outer.add(bobber)
      outer.setData('body', body)
      outer.setData('bobber', bobber)
      outer.setSize(90, EXPLORER_HEIGHT)
      outer.setInteractive({ useHandCursor: true })
      outer.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (tapOnCanvas(pointer)) this.tapExplorer(id)
      })
      this.explorers[id] = outer
      this.explorerHats[id] = null
    }
  }

  private lastExplorerTap: { id: ChildId; t: number } | null = null

  /** Tap one explorer then the other within 2s → high-five between them. */
  private tapExplorer(id: ChildId) {
    const now = this.time.now
    const last = this.lastExplorerTap
    this.lastExplorerTap = { id, t: now }
    const other: ChildId = id === 'theodore' ? 'leonard' : 'theodore'
    if (last && last.id === other && now - last.t < 2000) {
      this.highFive()
      this.lastExplorerTap = null
      return
    }
    this.cheer(id)
  }

  private highFive() {
    const t = this.explorers.theodore
    const l = this.explorers.leonard
    if (!t || !l || t.getData('cheering') || l.getData('cheering')) return
    t.setData('cheering', true)
    l.setData('cheering', true)
    const tb = t.getData('body') as Phaser.GameObjects.Image
    const lb = l.getData('body') as Phaser.GameObjects.Image
    tb.setTexture(this.texKey('theodore', 'cheer'))
    lb.setTexture(this.texKey('leonard', 'cheer'))
    // hop toward each other
    for (const [c, dir] of [[t, -1], [l, 1]] as const) {
      const bobber = c.getData('bobber') as Phaser.GameObjects.Container
      this.tweens.add({
        targets: bobber,
        x: dir * 22,
        y: -20,
        duration: 220,
        yoyo: true,
        ease: 'Quad.easeOut',
      })
    }
    // burst of little stars between them
    const mx = (t.x + l.x) / 2
    const my = Math.min(t.y, l.y) - 120
    for (let i = 0; i < 5; i += 1) {
      const star = this.add.image(mx, my, 'star').setDisplaySize(18, 18).setScale(0)
      this.tweens.add({
        targets: star,
        scale: 1,
        x: mx + (i - 2) * 26,
        y: my - 14 - (i % 2) * 12,
        duration: 260,
        delay: 120 + i * 40,
        ease: 'Back.easeOut',
        onComplete: () => this.tweens.add({ targets: star, alpha: 0, scale: 0.3, duration: 240, delay: 260, onComplete: () => star.destroy() }),
      })
    }
    this.time.delayedCall(900, () => {
      t.setData('cheering', false)
      l.setData('cheering', false)
      if (tb.scene) tb.setTexture(this.texKey('theodore', 'idle'))
      if (lb.scene) lb.setTexture(this.texKey('leonard', 'idle'))
    })
  }

  /**
   * "Ride along!" — the current child's explorer hops in the truck and rides
   * one lap of the road, waving. No coins — just for fun.
   */
  private riding = false
  private rideExplorer: {
    outer: Phaser.GameObjects.Container
    body: Phaser.GameObjects.Image
    homeX: number
    homeY: number
    childId: ChildId
    boarded: boolean
  } | null = null
  private onRideRequest(childId: ChildId) {
    this.rideAlong(childId)
  }
  public rideAlong(childId: ChildId) {
    if (this.riding || !this.truck || this.reducedMotion || this.truckDelivering) return
    const outer = this.explorers[childId]
    if (!outer) return
    const body = outer.getData('body') as Phaser.GameObjects.Image
    this.riding = true
    body.setTexture(this.texKey(childId, 'cheer'))
    this.rideExplorer = {
      outer,
      body,
      homeX: outer.x,
      homeY: outer.y,
      childId,
      boarded: false,
    }
    // fresh lap from below the bottom edge — fades in and picks them up
    this.truckLegIdx = 0
    this.truckDist = 0
    this.truckPause = 0
    this.truck.setAlpha(0)
    this.truckShadow?.setAlpha(0)
    // trot to the kerb to meet it
    this.tweens.add({ targets: outer, x: 500, y: 540, duration: 600, ease: 'Quad.easeOut' })
  }

  /** The lap is done — the explorer hops off at the road top, truck drives on. */
  private finishRide() {
    const ride = this.rideExplorer
    this.riding = false
    this.rideExplorer = null
    if (!ride) return
    if (ride.body.scene) ride.body.setTexture(this.texKey(ride.childId, 'idle'))
    this.tweens.add({
      targets: ride.outer,
      x: ride.homeX,
      y: ride.homeY,
      duration: 520,
      ease: 'Quad.easeOut',
    })
    // continue the loop — leg 5 is the drive down off the bottom edge
    this.truckLegIdx = 5
    this.truckDist = 0
  }

  private cheer(id: ChildId) {
    const outer = this.explorers[id]
    const body = outer.getData('body') as Phaser.GameObjects.Image
    if (outer.getData('cheering')) return
    outer.setData('cheering', true)
    body.setTexture(this.texKey(id, 'cheer'))
    this.tweens.add({
      targets: outer.getData('bobber') as Phaser.GameObjects.Container,
      y: -24,
      duration: 190,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => {
        outer.setData('cheering', false)
        if (body.scene) body.setTexture(this.texKey(id, 'idle'))
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
          body.setTexture(this.texKey(id, 'blink'))
          this.time.delayedCall(140, () => {
            if (body.scene && !outer.getData('cheering')) body.setTexture(this.texKey(id, 'idle'))
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
    // route legs, measured on the painted roads (see TRUCK_* notes above)
    const up = new Phaser.Curves.Line(new Phaser.Math.Vector2(522, 780), new Phaser.Math.Vector2(522, 512))
    const turnOut = new Phaser.Curves.QuadraticBezier(
      new Phaser.Math.Vector2(522, 512),
      new Phaser.Math.Vector2(648, 560), // belly stays below the plaza oval
      new Phaser.Math.Vector2(796, 457),
    )
    const east = new Phaser.Curves.Line(new Phaser.Math.Vector2(796, 457), new Phaser.Math.Vector2(1060, 457))
    const west = new Phaser.Curves.Line(new Phaser.Math.Vector2(1060, 423), new Phaser.Math.Vector2(796, 423))
    const turnIn = new Phaser.Curves.QuadraticBezier(
      new Phaser.Math.Vector2(796, 423),
      new Phaser.Math.Vector2(646, 560), // same south channel, back to the road top
      new Phaser.Math.Vector2(478, 514),
    )
    const down = new Phaser.Curves.Line(new Phaser.Math.Vector2(478, 514), new Phaser.Math.Vector2(478, 780))
    this.truckLegs = [up, turnOut, east, west, turnIn, down].map((curve) => ({
      curve,
      len: curve.getLength(),
    }))

    this.truckShadow = this.add
      .ellipse(522, 786, 100, 12, 0x3c3c3c, 0.12)
      .setVisible(false)
      .setDepth(2)
    this.truck = this.add
      .image(522, 780, 'truck')
      .setOrigin(0.5, 0.85)
      .setDisplaySize(TRUCK_SIZES.truck.w, TRUCK_SIZES.truck.h)
    this.truck.setVisible(false)
    this.truck.setInteractive({ useHandCursor: true })
    this.truck.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!tapOnCanvas(pointer)) return
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

    // test hook — park the walker at a leg+fraction for deterministic captures
    const posHook = (leg: number, frac: number) => {
      if (!this.truck || !this.truckLegs[leg]) return
      this.truckDelivering = false
      this.riding = false
      this.truckPause = 0
      this.truckLegIdx = leg
      this.truckDist = frac * this.truckLegs[leg].len
    }
    EventBus.on('town-truck-pos', posHook)
    const off = () => EventBus.off('town-truck-pos', posHook)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, off)
    this.events.once(Phaser.Scenes.Events.DESTROY, off)

    if (this.reducedMotion) {
      // parked at the roadside, facing right — no loop, no bob, no puffs
      this.truck.setPosition(560, 470).setDepth(2.5)
      this.truckShadow.setPosition(560, 476).setDepth(2.49)
    }
  }

  /** Deliver a kit: truck drives up the road then across to the plot, drops
   *  the box, puffs, leaves. Sprites follow its heading during the tween. */
  private deliverKit(projectId: ProjectId) {
    if (!this.truck) return
    const def = PROJECTS.find((p) => p.id === projectId)
    if (!def) return
    this.truckDelivering = true
    this.truck.setVisible(true).setAlpha(1).setPosition(522, 730)
    this.truckShadow?.setVisible(true).setAlpha(0.12).setPosition(522, 736)
    const dropX = Phaser.Math.Clamp(def.pos.x + 64, 60, 930)
    const dropY = Phaser.Math.Clamp(def.pos.y + 56, 200, 668)
    const keepShadow = () => {
      this.truckShadow?.setPosition(this.truck!.x, this.truck!.y + 6)
      this.truck?.setDepth(2 + this.truck.y / 700)
    }
    this.tweens.chain({
      targets: this.truck,
      tweens: [
        {
          x: 522, y: 505, duration: 750, ease: 'Sine.easeInOut',
          onStart: () => this.setTruckSprite(0, -1),
          onUpdate: keepShadow,
        },
        {
          x: dropX, y: dropY, duration: 750, ease: 'Sine.easeInOut',
          onStart: () => this.setTruckSprite(dropX - 522, dropY - 505),
          onUpdate: keepShadow,
        },
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
    const keepShadow = () => this.truckShadow?.setPosition(this.truck!.x, this.truck!.y + 6)
    this.tweens.chain({
      targets: this.truck!,
      tweens: leaveRight
        ? [{
            x: 1060, y: 457, duration: 850, ease: 'Sine.easeIn',
            onStart: () => this.setTruckSprite(1, 0),
            onUpdate: keepShadow,
          }]
        : [
            {
              x: 522, y: 505, duration: 500, ease: 'Sine.easeIn',
              onStart: () => this.setTruckSprite(522 - this.truck!.x, 505 - this.truck!.y),
              onUpdate: keepShadow,
            },
            {
              x: 478, y: 760, duration: 700, ease: 'Sine.easeIn',
              onStart: () => this.setTruckSprite(-44, 255),
              onUpdate: keepShadow,
            },
          ],
      onComplete: () => {
        this.truckDelivering = false
        this.truckLegIdx = 0
        this.truckDist = 0
        this.truckPause = Phaser.Math.Between(1500, 3000)
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
    plaque.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!tapOnCanvas(pointer)) return
      EventBus.emit('town-tap', { kind: 'bridge', planks: this.foundersPlanks })
    })
    c.add([g, plaque])
  }

  /* ---------------- plot art ---------------- */

  private looks: TownStatePayload['looks'] | null = null

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
      this.drawBuilding(r.container, g, def, this.looks?.[def.id] ?? undefined)
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

  private drawBuilding(
    container: Phaser.GameObjects.Container,
    g: Phaser.GameObjects.Graphics,
    def: ProjectDef,
    look?: { color: string | null; name: string | null },
  ) {
    const color = Phaser.Display.Color.HexStringToColor(look?.color ?? def.color).color
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
    // bespoke touches per building
    if (def.id === 'music-school') {
      g.fillStyle(color, 1)
      g.fillRoundedRect(-78, 28, 156, 16, 6)
      g.fillStyle(0xffffff, 1)
      for (const x of [-56, -24, 8, 40]) g.fillCircle(x, 36, 5)
    }
    if (def.id === 'police-station') {
      g.fillStyle(0xffffff, 1)
      g.fillRoundedRect(-40, 10, 80, 20, 8)
      g.fillStyle(color, 1)
      g.fillRoundedRect(-36, 13, 72, 14, 6)
    }
    if (def.id === 'hospital') {
      g.fillStyle(color, 1)
      g.fillRoundedRect(-14, -36, 28, 10, 3)
      g.fillRoundedRect(-5, -45, 10, 28, 3)
    }
    if (def.id === 'library') {
      g.fillStyle(0xffffff, 1)
      g.fillRoundedRect(-66, 18, 132, 12, 5)
      g.fillStyle(color, 1)
      for (const x of [-60, -36, -12, 12, 36, 60]) g.fillRoundedRect(x - 4, 19, 8, 10, 2)
    }
    // custom name plaque above the door
    if (look?.name) {
      const pl = this.add.container(0, -104)
      const pg = this.add.graphics()
      pg.fillStyle(0xffffff, 1)
      pg.fillRoundedRect(-62, -14, 124, 26, 9)
      pg.lineStyle(3, color, 1)
      pg.strokeRoundedRect(-62, -14, 124, 26, 9)
      const t = this.add
        .text(0, -1, look.name, { fontFamily: FONT, fontSize: '14px', fontStyle: '900', color: '#3c3c3c' })
        .setOrigin(0.5)
      pl.add([pg, t])
      container.add(pl)
    }
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
    if (payload.avatars) {
      for (const id of ['theodore', 'leonard'] as const) {
        const look = payload.avatars[id]
        if (look) this.ensureAvatar(id, look)
      }
    }
    this.looks = payload.looks
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
        `${payload.currentProjectId}:${payload.suggestedProjectId}:${next?.status}:${next?.kits}:${payload.looks[def.id]?.color}:${payload.looks[def.id]?.name}`,
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

    if (this.truck && this.truckShadow) {
      const roadOpen = payload.projects.road?.status === 'open'
      if (!this.truckDelivering) {
        this.truck.setVisible(roadOpen)
        this.truckShadow.setVisible(roadOpen)
        if (!roadOpen) {
          this.truckPause = 0
          this.truckLegIdx = 0
          this.truckDist = 0
        }
      }
    }

    this.renderWelcomeSign(payload.cityName)
    this.renderLooks(payload)
  }

  /* ---------------- town welcome sign + building looks ---------------- */

  private welcomeSign?: Phaser.GameObjects.Container
  private welcomeLabel?: Phaser.GameObjects.Text

  private renderWelcomeSign(cityName: string | null) {
    if (!cityName) {
      this.welcomeSign?.setVisible(false)
      return
    }
    const text = `Welcome to ${cityName}`
    if (this.welcomeLabel && this.welcomeLabel.text === text) return
    if (!this.welcomeSign) {
      const c = this.add.container(318, 668).setDepth(3)
      const g = this.add.graphics()
      const label = this.add
        .text(0, -31, '', {
          fontFamily: FONT,
          fontSize: '20px',
          fontStyle: '900',
          color: '#3c3c3c',
          align: 'center',
          wordWrap: { width: 226, useAdvancedWrap: true },
        })
        .setOrigin(0.5)
      c.add([g, label])
      c.setData('g', g)
      this.welcomeLabel = label
      this.welcomeSign = c
    }
    const label = this.welcomeLabel!
    label.setText(text)
    // size the board to the measured text — long names wrap to two lines
    const bw = Math.min(268, Math.max(150, label.width + 30))
    const bh = label.height + 20
    const top = -34 - bh
    const g = this.welcomeSign!.getData('g') as Phaser.GameObjects.Graphics
    g.clear()
    g.fillStyle(0x96683f, 1)
    g.fillRoundedRect(-bw / 2 + 10, -6, 10, 34, 3)
    g.fillRoundedRect(bw / 2 - 20, -6, 10, 34, 3)
    g.fillStyle(0xffffff, 1)
    g.fillRoundedRect(-bw / 2, top, bw, bh, 12)
    g.lineStyle(4, 0x58cc02, 1)
    g.strokeRoundedRect(-bw / 2, top, bw, bh, 12)
    label.setY(top + bh / 2)
    this.welcomeSign.setVisible(true)
  }

  /** Redraw open buildings when their color/name changes. */
  private renderLooks(payload: TownStatePayload) {
    for (const def of PROJECTS) {
      const p = payload.projects[def.id]
      if (p?.status !== 'open' || def.id === 'road') continue
      // nameSign already re-rendered via marker diff — nothing extra needed
      void p
    }
  }
}
