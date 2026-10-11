// 광장 씬 (PixiJS v8). 고정 가상 해상도(WORLD_W x WORLD_H)를 정수 배율로 키워 도트를 또렷하게 그린다.
// 이름표·말풍선은 화면 좌표 레이어에 실제 글자 크기로 그려 선명하게 유지한다.
import 'pixi.js/unsafe-eval'
import { Application, CanvasSource, Container, FederatedPointerEvent, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js'
import type { MinimiConfig } from '@shared/types'
import { renderMinimi, type MinimiFrame } from '@/minimi'
import { CX, CY, MARGIN_X, MARGIN_Y, WORLD_H, WORLD_W, drawClouds, drawGround, drawSky, getProps, isClear, isWalkable } from './map'
import { badgeFrames, butterflyFrames, markerFrames, ringFrames, shadowCanvas, type BadgeKind } from './icons'

export type Dir = 'front' | 'left' | 'right'
export interface AvatarState {
  x: number
  y: number
  dir: Dir
  moving: boolean
}
export interface AvatarInit extends AvatarState {
  id: string
  name: string
  minimi: MinimiConfig
  isSelf: boolean
}
/** 머리 위 상태 아이콘 */
export type AvatarBadge = 'calling' | 'called' | 'dnd' | 'answered' | 'away' | null

export interface PlazaCallbacks {
  /** 내 캐릭터 클릭 이동 시작 (목표 지점) */
  onSelfMove?: (x: number, y: number) => void
  /** 다른 캐릭터 클릭 */
  onAvatarClick?: (id: string) => void
}

const SPEED = 62 // 가상 px / 초
const INTERP_DELAY = 120 // 원격 보간 지연 (ms)
const TELEPORT_DIST = 150
const SPRITE_W = 32
const SPRITE_H = 40
const BUBBLE_MS = 5200

interface Snap {
  t: number
  x: number
  y: number
  dir: Dir
  moving: boolean
}

function makeTexture(canvas: HTMLCanvasElement): Texture {
  return new Texture({ source: new CanvasSource({ resource: canvas, scaleMode: 'nearest' }) })
}

function hashStr(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36) + ':' + s.length
}

/** 계단식으로 모서리를 깎은 도트풍 상자 */
function pixelBox(g: Graphics, x: number, y: number, w: number, h: number, u: number, fill: number, border: number | null, fillAlpha = 1): void {
  const steps = [2, 1]
  const shape = (ox: number, oy: number, ww: number, hh: number, color: number, alpha: number): void => {
    for (let i = 0; i < steps.length; i++) {
      const ins = steps[i] * u
      g.rect(ox + ins, oy + i * u, ww - ins * 2, u).fill({ color, alpha })
      g.rect(ox + ins, oy + hh - (i + 1) * u, ww - ins * 2, u).fill({ color, alpha })
    }
    g.rect(ox, oy + steps.length * u, ww, hh - steps.length * 2 * u).fill({ color, alpha })
  }
  if (border !== null) {
    shape(x, y, w, h, border, 1)
    shape(x + u, y + u, w - 2 * u, h - 2 * u, fill, fillAlpha)
  } else {
    shape(x, y, w, h, fill, fillAlpha)
  }
}

class Avatar {
  id: string
  name: string
  cfg: MinimiConfig
  cfgKey: string
  isSelf: boolean
  x: number
  y: number
  dir: Dir
  moving = false
  target: { x: number; y: number } | null = null
  snaps: Snap[] = []
  prevX: number
  prevY: number
  moveHold = 0
  stuckMs = 0
  lastDirChange = 0

  body = new Container()
  sprite = new Sprite()
  shadow: Sprite
  ring: Sprite
  badge: Sprite
  badgeKind: AvatarBadge = null
  badgeTex: Texture[] = []
  tag = new Container()
  tagW = 0
  bubble: Container | null = null
  bubbleW = 0
  bubbleH = 0
  bubbleBorn = 0

  walkT = 0
  frame: MinimiFrame = 'idle'
  texKey = ''
  blinkUntil = 0
  nextBlink = performance.now() + 1500 + Math.random() * 3000
  jumpT = -1

  constructor(init: AvatarInit, shadowTex: Texture) {
    this.id = init.id
    this.name = init.name
    this.cfg = init.minimi
    this.cfgKey = hashStr(JSON.stringify(init.minimi))
    this.isSelf = init.isSelf
    this.x = init.x
    this.y = init.y
    this.prevX = init.x
    this.prevY = init.y
    this.dir = init.dir
    this.sprite.anchor.set(0.5, 1)
    this.body.addChild(this.sprite)
    this.shadow = new Sprite(shadowTex)
    this.shadow.anchor.set(0.5, 0.5)
    this.ring = new Sprite()
    this.ring.anchor.set(0.5, 0.5)
    this.ring.visible = false
    this.badge = new Sprite()
    this.badge.anchor.set(0.5, 1)
    this.badge.visible = false
  }
}

export class PlazaView {
  private app!: Application
  private host!: HTMLElement
  private cb: PlazaCallbacks = {}
  private world = new Container()
  private skyLayer = new Container()
  private cloudLayer = new Container()
  private groundLayer = new Container()
  private shadowLayer = new Container()
  private markerLayer = new Container()
  private sortLayer = new Container()
  private badgeLayer = new Container()
  private fxLayer = new Container()
  private ui = new Container()
  private tagLayer = new Container()
  private bubbleLayer = new Container()

  private avatars = new Map<string, Avatar>()
  private selfId: string | null = null
  private selectedId: string | null = null
  private texCache = new Map<string, Texture>()
  private shadowTex!: Texture
  private ringTex: Texture[] = []
  private markerTex: Texture[] = []
  private badgeCache = new Map<BadgeKind, Texture[]>()
  private animated: { sprite: Sprite; frames: Texture[]; fps: number }[] = []
  private clouds: { sprite: Sprite; speed: number }[] = []
  private butterflies: { sprite: Sprite; frames: Texture[]; hx: number; hy: number; ph: number; sp: number }[] = []
  private marker!: Sprite
  private markerT = -1

  private scale = 2
  private fontSize = 12
  private camX = 0
  private camY = 0
  private keys = new Set<string>()
  private ro: ResizeObserver | null = null
  private time = 0
  private destroyed = false
  private onKeyDown = (e: KeyboardEvent): void => this.handleKey(e, true)
  private onKeyUp = (e: KeyboardEvent): void => this.handleKey(e, false)
  private onBlur = (): void => this.keys.clear()
  /** 창이 숨겨지면(트레이) 그리기를 멈춰 CPU 를 아낀다 */
  private onVisibility = (): void => {
    if (!this.app || this.destroyed) return
    if (document.hidden) this.app.ticker.stop()
    else this.app.ticker.start()
  }

  static async create(host: HTMLElement, cb: PlazaCallbacks): Promise<PlazaView> {
    const v = new PlazaView()
    await v.init(host, cb)
    return v
  }

  private async init(host: HTMLElement, cb: PlazaCallbacks): Promise<void> {
    this.host = host
    this.cb = cb
    await Promise.all([document.fonts.load('12px Galmuri11'), document.fonts.load('10px Galmuri9'), document.fonts.load('bold 12px Galmuri11')]).catch(() => {})

    const app = new Application()
    await app.init({
      width: Math.max(1, host.clientWidth),
      height: Math.max(1, host.clientHeight),
      backgroundColor: 0x92d76d,
      antialias: false,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      roundPixels: true,
      preference: 'webgl'
    })
    this.app = app
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
    app.canvas.style.position = 'absolute'
    app.canvas.style.inset = '0'
    app.canvas.style.display = 'block'
    host.appendChild(app.canvas)

    // ── 레이어 ──
    this.world.addChild(this.skyLayer, this.cloudLayer, this.groundLayer, this.shadowLayer, this.markerLayer, this.sortLayer, this.badgeLayer, this.fxLayer)
    this.sortLayer.sortableChildren = true
    this.ui.addChild(this.tagLayer, this.bubbleLayer)
    this.bubbleLayer.sortableChildren = true
    app.stage.addChild(this.world, this.ui)

    // ── 배경 ──
    const sky = new Sprite(makeTexture(drawSky()))
    sky.position.set(-MARGIN_X, -MARGIN_Y)
    this.skyLayer.addChild(sky)
    const cloudTex = drawClouds().map(makeTexture)
    const cloudSeeds = [
      [-120, 4, 3.2, 0],
      [40, -14, 2.2, 1],
      [180, 10, 2.8, 2],
      [300, -6, 1.8, 0],
      [470, 6, 2.5, 1],
      [-260, -20, 2, 2]
    ]
    for (const [x, y, sp, k] of cloudSeeds) {
      const s = new Sprite(cloudTex[k])
      s.position.set(x, y)
      this.cloudLayer.addChild(s)
      this.clouds.push({ sprite: s, speed: sp })
    }
    const ground = new Sprite(makeTexture(drawGround()))
    ground.position.set(-MARGIN_X, -MARGIN_Y)
    this.groundLayer.addChild(ground)

    // ── 소품 (깊이 정렬) ──
    for (const prop of getProps()) {
      const frames = prop.frames.map(makeTexture)
      const s = new Sprite(frames[0])
      s.position.set(prop.x, prop.y)
      s.zIndex = prop.baseline
      this.sortLayer.addChild(s)
      if (frames.length > 1) this.animated.push({ sprite: s, frames, fps: prop.fps })
    }

    // ── 나비 ──
    const bf: [string, string, number, number][] = [
      ['#ffd0e6', '#ff8fb8', 150, 252],
      ['#fff59d', '#ffc94a', 272, 250],
      ['#d6e4ff', '#8fa8ff', 96, 96]
    ]
    for (const [c, d, hx, hy] of bf) {
      const frames = butterflyFrames(c, d).map(makeTexture)
      const s = new Sprite(frames[0])
      s.anchor.set(0.5)
      this.fxLayer.addChild(s)
      this.butterflies.push({ sprite: s, frames, hx, hy, ph: Math.random() * 10, sp: 0.6 + Math.random() * 0.4 })
    }

    // ── 공용 텍스처 ──
    this.shadowTex = makeTexture(shadowCanvas())
    this.ringTex = ringFrames().map(makeTexture)
    this.markerTex = markerFrames().map(makeTexture)
    this.marker = new Sprite(this.markerTex[0])
    this.marker.anchor.set(0.5)
    this.marker.visible = false
    this.markerLayer.addChild(this.marker)

    // ── 입력 ──
    app.stage.eventMode = 'static'
    app.stage.hitArea = app.screen
    app.stage.on('pointerdown', (e: FederatedPointerEvent) => this.onGroundDown(e))
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)

    this.ro = new ResizeObserver(() => this.layout())
    this.ro.observe(host)
    this.layout()

    app.ticker.maxFPS = 60
    app.ticker.add((t) => this.tick(Math.min(100, t.deltaMS)))
    document.addEventListener('visibilitychange', this.onVisibility)
  }

  // ───────────────────────── 공개 API ─────────────────────────
  addAvatar(a: AvatarInit): void {
    if (this.destroyed) return
    this.removeAvatar(a.id)
    const av = new Avatar(a, this.shadowTex)
    if (a.isSelf) this.selfId = a.id
    this.shadowLayer.addChild(av.shadow, av.ring)
    this.sortLayer.addChild(av.body)
    this.badgeLayer.addChild(av.badge)
    this.tagLayer.addChild(av.tag)
    if (!a.isSelf) {
      av.sprite.eventMode = 'static'
      av.sprite.cursor = 'pointer'
      av.sprite.hitArea = new Rectangle(-12, -38, 24, 38)
      av.sprite.on('pointerdown', (e: FederatedPointerEvent) => {
        e.stopPropagation()
        this.cb.onAvatarClick?.(av.id)
      })
    }
    av.snaps.push({ t: performance.now(), x: a.x, y: a.y, dir: a.dir, moving: false })
    this.avatars.set(a.id, av)
    this.buildTag(av)
    this.refreshSprite(av, true)
    if (this.selectedId === a.id) av.ring.visible = true
    if (a.isSelf && this.app) {
      const cam = this.cameraTarget()
      this.camX = cam.x
      this.camY = cam.y
    }
  }

  updateAvatar(id: string, patch: { name?: string; minimi?: MinimiConfig }): void {
    const av = this.avatars.get(id)
    if (!av) return
    if (patch.name !== undefined && patch.name !== av.name) {
      av.name = patch.name
      this.buildTag(av)
    }
    if (patch.minimi) {
      av.cfg = patch.minimi
      av.cfgKey = hashStr(JSON.stringify(patch.minimi))
      this.refreshSprite(av, true)
    }
  }

  removeAvatar(id: string): void {
    const av = this.avatars.get(id)
    if (!av) return
    av.body.destroy({ children: true })
    av.shadow.destroy()
    av.ring.destroy()
    av.badge.destroy()
    av.tag.destroy({ children: true })
    av.bubble?.destroy({ children: true })
    this.avatars.delete(id)
    if (this.selfId === id) this.selfId = null
    if (this.selectedId === id) this.selectedId = null
  }

  hasAvatar(id: string): boolean {
    return this.avatars.has(id)
  }

  /** 원격 피어 위치 수신 — 내부에서 보간 */
  pushRemoteState(id: string, s: AvatarState): void {
    const av = this.avatars.get(id)
    if (!av || av.isSelf) return
    const now = performance.now()
    av.snaps.push({ t: now, x: s.x, y: s.y, dir: s.dir, moving: s.moving })
    while (av.snaps.length > 2 && av.snaps[1].t < now - 1000) av.snaps.shift()
    if (av.snaps.length > 30) av.snaps.splice(0, av.snaps.length - 30)
  }

  getSelfState(): AvatarState {
    const av = this.selfId ? this.avatars.get(this.selfId) : null
    if (!av) return { x: CX, y: CY + 50, dir: 'front', moving: false }
    return { x: Math.round(av.x * 10) / 10, y: Math.round(av.y * 10) / 10, dir: av.dir, moving: av.moving }
  }

  /** 내 캐릭터를 해당 지점으로 걷게 함 (코드에서 이동시킬 때) */
  walkSelfTo(x: number, y: number): void {
    const av = this.selfId ? this.avatars.get(this.selfId) : null
    if (!av) return
    av.target = { x: clamp(x, 0, WORLD_W), y: clamp(y, 0, WORLD_H) }
    av.stuckMs = 0
  }

  showBubble(id: string, text: string): void {
    const av = this.avatars.get(id)
    if (!av) return
    let t = text.replace(/\s+/g, ' ').trim()
    if (!t) return
    if (t.length > 60) t = t.slice(0, 58) + '…'
    av.bubble?.destroy({ children: true })
    const fs = this.fontSize
    const u = this.uiUnit()
    const label = new Text({
      text: t,
      style: {
        fontFamily: 'Galmuri11',
        fontSize: fs,
        fill: '#2f3a44',
        wordWrap: true,
        breakWords: true,
        wordWrapWidth: Math.round(150 * (fs / 12)),
        lineHeight: fs + 4,
        align: 'center'
      }
    })
    const padX = 7 * u
    const padY = 4 * u
    const w = Math.ceil(label.width) + padX * 2
    const h = Math.ceil(label.height) + padY * 2
    const tailH = 4 * u
    const g = new Graphics()
    pixelBox(g, 0, 0, w, h, u, 0xffffff, 0x4f5d6b)
    // 꼬리 (계단식 삼각형)
    const cx = Math.round(w / 2)
    g.rect(cx - 3 * u, h - u, 6 * u, u).fill(0xffffff)
    g.rect(cx - 4 * u, h - u, u, u).fill(0x4f5d6b)
    g.rect(cx + 3 * u, h - u, u, u).fill(0x4f5d6b)
    g.rect(cx - 2 * u, h, 4 * u, u).fill(0xffffff)
    g.rect(cx - 3 * u, h, u, u).fill(0x4f5d6b)
    g.rect(cx + 2 * u, h, u, u).fill(0x4f5d6b)
    g.rect(cx - u, h + u, 2 * u, u).fill(0xffffff)
    g.rect(cx - 2 * u, h + u, u, u).fill(0x4f5d6b)
    g.rect(cx + u, h + u, u, u).fill(0x4f5d6b)
    g.rect(cx - u, h + 2 * u, 2 * u, u).fill(0x4f5d6b)
    label.position.set(padX, padY)
    const c = new Container()
    c.addChild(g, label)
    av.bubble = c
    av.bubbleW = w
    av.bubbleH = h + tailH
    av.bubbleBorn = performance.now()
    c.zIndex = av.bubbleBorn
    this.bubbleLayer.addChild(c)
    this.placeUi(av)
  }

  setBadge(id: string, badge: AvatarBadge): void {
    const av = this.avatars.get(id)
    if (!av) return
    av.badgeKind = badge
    if (!badge) {
      av.badge.visible = false
      return
    }
    let frames = this.badgeCache.get(badge)
    if (!frames) {
      frames = badgeFrames(badge).map(makeTexture)
      this.badgeCache.set(badge, frames)
    }
    av.badgeTex = frames
    av.badge.texture = frames[0]
    av.badge.visible = true
  }

  setSelected(id: string | null): void {
    this.selectedId = id
    for (const av of this.avatars.values()) av.ring.visible = av.id === id
  }

  /** 깡총 (부르기 받았을 때 등) */
  jump(id: string): void {
    const av = this.avatars.get(id)
    if (av) av.jumpT = 0
  }

  /** 캐릭터의 화면 위치 (host 기준 CSS px). 팝업 위치 잡기용 */
  getAvatarScreenPosition(id: string): { x: number; y: number; top: number } | null {
    const av = this.avatars.get(id)
    if (!av) return null
    const s = this.scale
    return {
      x: this.world.x + Math.round(av.x) * s,
      y: this.world.y + Math.round(av.y) * s,
      top: this.world.y + (Math.round(av.y) - SPRITE_H) * s
    }
  }

  /** 빈 자리 아무 데나 (걸을 수 있는 곳) */
  randomSpawn(): { x: number; y: number } {
    for (let i = 0; i < 300; i++) {
      const a = Math.random() * Math.PI * 2
      const r = 0.5 + Math.random() * 0.42
      const x = Math.round(CX + Math.cos(a) * 150 * r)
      const y = Math.round(CY + 6 + Math.sin(a) * 74 * r)
      if (!isClear(x, y, 5)) continue
      let ok = true
      for (const av of this.avatars.values()) {
        if (Math.hypot(av.x - x, (av.y - y) * 1.6) < 26) {
          ok = false
          break
        }
      }
      if (ok) return { x, y }
    }
    return { x: CX, y: CY + 60 }
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.ro?.disconnect()
    this.app?.destroy({ removeView: true }, { children: true, texture: true, textureSource: true })
    this.texCache.clear()
    this.avatars.clear()
  }

  // ───────────────────────── 내부 ─────────────────────────
  private uiUnit(): number {
    return this.scale >= 4 ? 2 : 1
  }

  private layout(): void {
    if (this.destroyed || !this.app) return
    const w = Math.max(1, this.host.clientWidth)
    const h = Math.max(1, this.host.clientHeight)
    this.app.renderer.resize(w, h)
    // 높이 기준 정수 배율 (6% 까지는 잘려도 됨). 폭이 모자라면 카메라가 내 캐릭터를 따라간다.
    const sH = Math.floor(h / (WORLD_H * 0.94))
    const sW = Math.floor(w / (WORLD_W * 0.7))
    const s = Math.max(1, Math.min(sH, sW))
    const fs = s >= 4 ? 24 : 12
    const fontChanged = fs !== this.fontSize
    this.scale = s
    this.fontSize = fs
    this.world.scale.set(s)
    const cam = this.cameraTarget()
    this.camX = cam.x
    this.camY = cam.y
    this.world.position.set(cam.x, cam.y)
    if (fontChanged) {
      for (const av of this.avatars.values()) {
        this.buildTag(av)
        av.bubble?.destroy({ children: true })
        av.bubble = null
      }
    }
    for (const av of this.avatars.values()) this.placeUi(av)
  }

  /** 월드가 화면보다 크면 내 캐릭터 중심으로, 아니면 가운데 정렬 */
  private cameraTarget(): { x: number; y: number } {
    const w = this.app.screen.width
    const h = this.app.screen.height
    const s = this.scale
    const ww = WORLD_W * s
    const wh = WORLD_H * s
    const self = this.selfId ? this.avatars.get(this.selfId) : null
    const fx = (self ? self.x : WORLD_W / 2) * s
    const fy = (self ? self.y - 20 : WORLD_H / 2) * s
    const x = ww <= w ? (w - ww) / 2 : clamp(w / 2 - fx, w - ww, 0)
    const y = wh <= h ? (h - wh) / 2 : clamp(h / 2 - fy, h - wh, 0)
    return { x: Math.round(x), y: Math.round(y) }
  }

  private buildTag(av: Avatar): void {
    av.tag.removeChildren().forEach((c) => c.destroy())
    const fs = this.fontSize
    const u = this.uiUnit()
    const label = new Text({
      text: av.name || '이름없음',
      style: { fontFamily: 'Galmuri11', fontSize: fs, fill: av.isSelf ? '#ffffff' : '#2f3a44', fontWeight: av.isSelf ? 'bold' : 'normal' }
    })
    const padX = 5 * u
    const padY = 1 * u
    const w = Math.ceil(label.width) + padX * 2
    const h = Math.ceil(label.height) + padY * 2
    const g = new Graphics()
    if (av.isSelf) pixelBox(g, 0, 0, w, h, u, 0xff7f2a, 0xd9601a)
    else pixelBox(g, 0, 0, w, h, u, 0xffffff, 0x8fa3b5, 0.92)
    label.position.set(padX, padY)
    av.tag.addChild(g, label)
    av.tagW = w
    this.placeUi(av)
  }

  private refreshSprite(av: Avatar, force = false): void {
    const key = `${av.cfgKey}|${av.frame}|${av.dir}`
    if (!force && key === av.texKey) return
    av.texKey = key
    let tex = this.texCache.get(key)
    if (!tex) {
      if (this.texCache.size > 400) {
        // 오래된 것부터 정리 (현재 쓰는 것은 남김)
        const inUse = new Set([...this.avatars.values()].map((a) => a.texKey))
        for (const [k, t] of this.texCache) {
          if (this.texCache.size <= 200) break
          if (inUse.has(k)) continue
          t.destroy(true)
          this.texCache.delete(k)
        }
      }
      tex = makeTexture(renderMinimi(av.cfg, av.frame, av.dir))
      this.texCache.set(key, tex)
    }
    av.sprite.texture = tex
  }

  private handleKey(e: KeyboardEvent, down: boolean): void {
    const el = document.activeElement as HTMLElement | null
    if (down && el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return
    const map: Record<string, string> = {
      ArrowLeft: 'l',
      ArrowRight: 'r',
      ArrowUp: 'u',
      ArrowDown: 'd',
      KeyA: 'l',
      KeyD: 'r',
      KeyW: 'u',
      KeyS: 'd'
    }
    const k = map[e.code]
    if (!k) return
    if (down) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      this.keys.add(k)
      e.preventDefault()
    } else this.keys.delete(k)
  }

  private onGroundDown(e: FederatedPointerEvent): void {
    const av = this.selfId ? this.avatars.get(this.selfId) : null
    if (!av || e.button !== 0) return
    const s = this.scale
    const wx = (e.global.x - this.world.x) / s
    const wy = (e.global.y - this.world.y) / s
    if (wx < 0 || wy < 0 || wx > WORLD_W || wy > WORLD_H) return
    av.target = { x: wx, y: wy }
    av.stuckMs = 0
    this.marker.position.set(Math.round(wx), Math.round(wy))
    this.marker.visible = true
    this.markerT = 0
    this.cb.onSelfMove?.(Math.round(wx), Math.round(wy))
  }

  private tick(dt: number): void {
    if (this.destroyed) return
    this.time += dt
    const now = performance.now()

    for (const av of this.avatars.values()) {
      if (av.isSelf) this.stepSelf(av, dt)
      else this.stepRemote(av, now, dt)
    }
    // 카메라 (부드럽게 따라감, 위치는 정수 픽셀)
    const cam = this.cameraTarget()
    const k = 1 - Math.exp(-dt / 140)
    this.camX += (cam.x - this.camX) * k
    this.camY += (cam.y - this.camY) * k
    if (Math.abs(cam.x - this.camX) < 0.5) this.camX = cam.x
    if (Math.abs(cam.y - this.camY) < 0.5) this.camY = cam.y
    this.world.position.set(Math.round(this.camX), Math.round(this.camY))
    for (const av of this.avatars.values()) this.animate(av, now, dt)
    this.stackBubbles()

    // 소품 애니메이션
    for (const a of this.animated) {
      const i = Math.floor((this.time / 1000) * a.fps) % a.frames.length
      if (a.sprite.texture !== a.frames[i]) a.sprite.texture = a.frames[i]
    }
    // 구름
    for (const c of this.clouds) {
      c.sprite.x += (c.speed * dt) / 1000
      if (c.sprite.x > WORLD_W + MARGIN_X) c.sprite.x = -MARGIN_X - c.sprite.width
      c.sprite.x = c.sprite.x // 부동소수 위치 유지, 그릴 때 반올림
    }
    // 나비
    const ts = this.time / 1000
    for (const b of this.butterflies) {
      const t = ts * b.sp + b.ph
      const x = b.hx + Math.sin(t * 0.35) * 46 + Math.sin(t * 1.3) * 9
      const y = b.hy + Math.sin(t * 0.52) * 12 + Math.sin(t * 2.3) * 3 - 14
      b.sprite.position.set(Math.round(x), Math.round(y))
      b.sprite.texture = b.frames[Math.floor(ts * 7 + b.ph) % 2]
    }
    // 클릭 표시
    if (this.markerT >= 0) {
      this.markerT += dt
      const i = Math.floor(this.markerT / 60)
      if (i >= this.markerTex.length) {
        this.marker.visible = false
        this.markerT = -1
      } else this.marker.texture = this.markerTex[i]
    }
    // 선택 링
    const ri = Math.floor(this.time / 120) % this.ringTex.length
    for (const av of this.avatars.values()) if (av.ring.visible) av.ring.texture = this.ringTex[ri]
  }

  private stepSelf(av: Avatar, dt: number): void {
    const step = (SPEED * dt) / 1000
    let vx = 0
    let vy = 0
    let maxStep = step
    const kx = (this.keys.has('r') ? 1 : 0) - (this.keys.has('l') ? 1 : 0)
    const ky = (this.keys.has('d') ? 1 : 0) - (this.keys.has('u') ? 1 : 0)
    if (kx || ky) {
      av.target = null
      const len = Math.hypot(kx, ky)
      vx = kx / len
      vy = ky / len
    } else if (av.target) {
      const dx = av.target.x - av.x
      const dy = av.target.y - av.y
      const d = Math.hypot(dx, dy)
      if (d < 0.6) {
        av.target = null
      } else {
        vx = dx / d
        vy = dy / d
        maxStep = Math.min(step, d)
      }
    }
    if (!vx && !vy) {
      av.moving = false
      return
    }
    const ox = av.x
    const oy = av.y
    const nx = av.x + vx * maxStep
    const ny = av.y + vy * maxStep
    if (isWalkable(nx, ny)) {
      av.x = nx
      av.y = ny
    } else if (Math.abs(vx) > 0.15 && isWalkable(av.x + Math.sign(vx) * maxStep, av.y)) {
      av.x += Math.sign(vx) * maxStep * Math.max(0.5, Math.abs(vx))
    } else if (Math.abs(vy) > 0.15 && isWalkable(av.x, av.y + Math.sign(vy) * maxStep)) {
      av.y += Math.sign(vy) * maxStep * Math.max(0.5, Math.abs(vy))
    } else {
      // 막힘: 마지막으로 설 수 있던 곳에서 멈춤
      av.target = null
      av.moving = false
      return
    }
    const moved = Math.hypot(av.x - ox, av.y - oy)
    if (av.target && moved < maxStep * 0.25) {
      av.stuckMs += dt
      if (av.stuckMs > 250) av.target = null
    } else av.stuckMs = 0
    av.moving = true
    const mvx = av.x - ox
    const mvy = av.y - oy
    this.setDir(av, Math.abs(mvx) > Math.abs(mvy) * 0.45 ? (mvx < 0 ? 'left' : 'right') : 'front')
  }

  private setDir(av: Avatar, d: Dir): void {
    if (d === av.dir) return
    const now = performance.now()
    // 방향이 너무 자주 바뀌어 깜빡이지 않도록 아주 짧게 유지
    if (now - av.lastDirChange < 90) return
    av.dir = d
    av.lastDirChange = now
  }

  private stepRemote(av: Avatar, now: number, dt: number): void {
    const snaps = av.snaps
    if (!snaps.length) return
    const rt = now - INTERP_DELAY
    let x: number
    let y: number
    let dir: Dir
    if (rt <= snaps[0].t || snaps.length === 1) {
      x = snaps[0].x
      y = snaps[0].y
      dir = snaps[0].dir
    } else if (rt >= snaps[snaps.length - 1].t) {
      const last = snaps[snaps.length - 1]
      x = last.x
      y = last.y
      dir = last.dir
    } else {
      let i = 0
      while (i < snaps.length - 2 && snaps[i + 1].t < rt) i++
      const a = snaps[i]
      const b = snaps[i + 1]
      const k = (rt - a.t) / Math.max(1, b.t - a.t)
      if (Math.hypot(b.x - a.x, b.y - a.y) > TELEPORT_DIST) {
        x = b.x
        y = b.y
      } else {
        x = a.x + (b.x - a.x) * k
        y = a.y + (b.y - a.y) * k
      }
      dir = b.dir
    }
    if (Math.hypot(x - av.x, y - av.y) > TELEPORT_DIST) {
      av.prevX = x
      av.prevY = y
    }
    av.x = x
    av.y = y
    const speed = (Math.hypot(av.x - av.prevX, av.y - av.prevY) / Math.max(1, dt)) * 1000
    av.prevX = av.x
    av.prevY = av.y
    if (speed > 6) av.moveHold = 140
    else av.moveHold -= dt
    av.moving = av.moveHold > 0
    this.setDir(av, dir)
  }

  private animate(av: Avatar, now: number, dt: number): void {
    // 프레임 선택
    let bob = 0
    if (av.moving) {
      av.walkT += dt
      const i = Math.floor(av.walkT / 165) % 2
      av.frame = i === 0 ? 'walk1' : 'walk2'
      bob = i === 0 ? -1 : 0
    } else {
      av.walkT = 0
      if (now >= av.nextBlink) {
        av.blinkUntil = now + 130
        av.nextBlink = now + 2200 + Math.random() * 3800
      }
      av.frame = now < av.blinkUntil ? 'blink' : 'idle'
    }
    let jump = 0
    if (av.jumpT >= 0) {
      av.jumpT += dt
      if (av.jumpT > 420) av.jumpT = -1
      else jump = -Math.round(Math.sin((Math.PI * av.jumpT) / 420) * 7)
    }
    this.refreshSprite(av)
    const px = Math.round(av.x)
    const py = Math.round(av.y)
    av.body.position.set(px, py + bob + jump)
    av.body.zIndex = py + (av.isSelf ? 0.5 : 0)
    av.shadow.position.set(px, py)
    av.shadow.scale.set(jump < -3 ? 0.8 : 1)
    av.ring.position.set(px, py)

    // 머리 위 아이콘
    if (av.badgeKind) {
      const t = this.time / 1000
      let by = py - SPRITE_H - 1 + jump
      let bx = px
      const frames = av.badgeTex
      if (av.badgeKind === 'calling') {
        av.badge.texture = frames[Math.floor(t * 4) % frames.length]
        bx += Math.round(Math.sin(t * 18) * 0.6)
      } else if (av.badgeKind === 'called') {
        by -= Math.round(Math.abs(Math.sin(t * 5)) * 4)
      } else if (av.badgeKind === 'away') {
        av.badge.texture = frames[Math.floor(t * 1.6) % frames.length]
        bx += 6
      } else {
        by -= Math.round((Math.sin(t * 2.4) + 1) * 1)
      }
      av.badge.position.set(bx, by)
    }
    this.placeUi(av)

    // 말풍선 수명
    if (av.bubble) {
      const age = now - av.bubbleBorn
      const life = BUBBLE_MS + Math.min(3000, (av.bubble.children[1] as Text).text.length * 40)
      if (age > life) {
        av.bubble.destroy({ children: true })
        av.bubble = null
      } else {
        av.bubble.alpha = age > life - 400 ? (life - age) / 400 : age < 120 ? age / 120 : 1
      }
    }
  }

  /** 말풍선끼리 겹치면 오래된 것을 위로 밀어 올린다 */
  private stackBubbles(): void {
    const list = [...this.avatars.values()].filter((a) => a.bubble).sort((a, b) => b.bubbleBorn - a.bubbleBorn)
    if (list.length < 2) return
    const placed: { x: number; y: number; w: number; h: number }[] = []
    for (const av of list) {
      const b = av.bubble!
      let y = b.y
      for (let guard = 0; guard < 8; guard++) {
        const hit = placed.find((r) => b.x < r.x + r.w + 2 && b.x + av.bubbleW + 2 > r.x && y < r.y + r.h + 2 && y + av.bubbleH + 2 > r.y)
        if (!hit) break
        y = hit.y - av.bubbleH - 2
      }
      if (y < 2) y = Math.max(2, b.y < 2 ? b.y : 2)
      b.y = Math.round(y)
      placed.push({ x: b.x, y: b.y, w: av.bubbleW, h: av.bubbleH })
    }
  }

  private placeUi(av: Avatar): void {
    const s = this.scale
    const sx = this.world.x + Math.round(av.x) * s
    const sy = this.world.y + Math.round(av.y) * s
    av.tag.position.set(Math.round(sx - av.tagW / 2), Math.round(sy + 3 * s))
    if (av.bubble) {
      const head = sy - (SPRITE_H + 1) * s - (av.badgeKind ? 15 * s : 0) - (av.jumpT >= 0 ? 7 * s : 0)
      let bx = Math.round(sx - av.bubbleW / 2)
      const W = this.app.screen.width
      bx = clamp(bx, 4, Math.max(4, W - av.bubbleW - 4))
      av.bubble.position.set(bx, Math.round(Math.max(4, head - av.bubbleH)))
    }
  }
}

function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v
}
