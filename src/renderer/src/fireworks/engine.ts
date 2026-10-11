import 'pixi.js/unsafe-eval'
import { Application, Container, Sprite, Texture, Ticker } from 'pixi.js'
import type { FireworkShow, PaletteId } from '@shared/types'
import { KIND_BOUND, ParticleField, TEX_VISIBLE, makeGlowTexture } from './particles'
import { DIGIT_FONT, MESSAGE_FONT, ShapePoints, imageShape, textShape } from './shapes'
import { PEONY_PALETTES, RGB, hslToRgb, paletteRgb } from './palettes'
import { Sfx } from './sound'

export { PALETTES, PALETTE_IDS } from './palettes'
export type { PaletteInfo } from './palettes'

/* ──────────────────────────────────────────────────────────────
   불꽃놀이 엔진
   발사 → 정점에서 폭발 → 입자가 목표 픽셀로 모여 글자·이미지 → 반짝이며 머묾 → 흩어지며 소멸
   ────────────────────────────────────────────────────────────── */

/** 로켓 중력 (화면 높이 배수, px/s²). 화면 높이 0.58 만큼 오르는 데 ≈0.84초 */
const GRAVITY_H = 1.65

/** 모양 불꽃의 거동 */
interface ShapeStyle {
  /** 목표점으로 끌려가는 감쇠 상수 (클수록 빨리 모임) */
  k: number
  /** 폭발 후 머무는 시간 (s) */
  hold: number
  holdJitter: number
  /** 흩어지는 시간 (s) */
  dissolve: number
  /** 흰색으로 달궈진 채 유지 (s) */
  heatHold: number
  /** 식는 시간 상수 (s) */
  cool: number
  heat: number
  size: number
  twinkle: number
  /** 모일 때 / 흩어질 때 꼬리 길이 계수 (속도 × s) */
  streakForm: number
  streakFree: number
  /** 흩어질 때 바깥으로 튕기는 속도 (px/s) */
  kick: number
  grav: number
  drag: number
  /** 폭발 지점의 퍼짐 반경 (px) */
  jitter: number
  /** 흩어질 때 개별 소멸 시점 퍼짐 (이미지용: 제자리에서 하나씩 꺼짐) */
  dieSpread: number
  fadeFrac: number
  alpha: number
}

interface Rocket {
  x: number
  y0: number
  vy0: number
  g: number
  launch: number
  fuse: number
  sprite: Sprite
  trail: number
  wobble: number
  onBurst: () => void
}

interface Flash {
  sprite: Sprite
  born: number
  life: number
  size: number
  alpha: number
}

interface Emitter {
  shape: ShapePoints
  cx: number
  cy: number
  from: number
  until: number
  rate: number
  acc: number
  colors: RGB[]
}

interface Cue {
  at: number
  fn: () => void
}

/** 백버퍼 픽셀 수 상한 (≈4.5M). 2560x1440pt @2x 화면이면 해상도 ≈1.10 */
const MAX_BACKBUFFER = 4.5e6

export function computeResolution(w: number, h: number, dpr: number): number {
  const cap = Math.sqrt(MAX_BACKBUFFER / Math.max(1, w * h))
  return Math.max(0.5, Math.min(dpr || 1, 2, cap))
}

const QUALITY_KEY = 'fw.quality'

/** 내장 GPU(인텔 등)면 입자 수를 줄여서 시작 */
function initialQuality(gl: WebGLRenderingContext | WebGL2RenderingContext | null): number {
  try {
    const saved = Number(localStorage.getItem(QUALITY_KEY))
    if (saved >= 0.4 && saved <= 1) return saved
  } catch {
    /* 저장소 없음 */
  }
  let q = 1
  try {
    const ext = gl?.getExtension('WEBGL_debug_renderer_info')
    const name = ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : ''
    if (/intel|swiftshader|llvmpipe|software/i.test(name)) q = 0.75
  } catch {
    /* 무시 */
  }
  return q
}

const rand = Math.random
const pick = <T,>(a: T[]): T => a[(rand() * a.length) | 0]

/** 가운데가 더 어두운 밤하늘 배경 (화면 크기로 늘려 쓴다) */
function makeBackdropTexture(): Texture {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 160
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(128, 70, 10, 128, 80, 170)
  grad.addColorStop(0, 'rgba(8, 10, 26, 0.72)')
  grad.addColorStop(0.6, 'rgba(8, 10, 26, 0.6)')
  grad.addColorStop(1, 'rgba(8, 10, 26, 0.46)')
  g.fillStyle = grad
  g.fillRect(0, 0, c.width, c.height)
  return Texture.from(c)
}

export class FireworksStage {
  private app!: Application
  private field!: ParticleField
  /** 사진 불꽃용 (제 색 그대로 칠하는 normal 블렌드 — 겹쳐도 하얗게 타지 않는다) */
  private imgField!: ParticleField
  /** 밤하늘처럼 화면을 살짝 어둡게 까는 배경 (밝은 화면에서도 불꽃이 잘 보이게) */
  private backdrop!: Sprite
  private dim = 0
  private fx!: Container
  private tex!: Texture
  private caption!: HTMLDivElement
  private sfx = new Sfx()
  private host!: HTMLElement

  private t = 0
  private cues: Cue[] = []
  private rockets: Rocket[] = []
  private flashes: Flash[] = []
  private emitters: Emitter[] = []
  private spritePool: Sprite[] = []
  private waiters: (() => void)[] = []
  private running = false
  private sound = true
  private gen = 0
  private quality = 1

  // 성능 통계
  private stats = { frames: 0, time: 0, worst: 0, peak: 0, upd: 0 }

  static async create(host: HTMLElement): Promise<FireworksStage> {
    const s = new FireworksStage()
    await s.init(host)
    return s
  }

  private async init(host: HTMLElement): Promise<void> {
    this.host = host
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
    const app = new Application()
    await app.init({
      backgroundAlpha: 0,
      antialias: false,
      width: window.innerWidth,
      height: window.innerHeight,
      resolution: computeResolution(window.innerWidth, window.innerHeight, window.devicePixelRatio),
      autoDensity: true,
      preference: 'webgl',
      powerPreference: 'high-performance',
      autoStart: false,
      sharedTicker: false,
      hello: false
    })
    this.app = app
    const canvas = app.canvas
    canvas.style.position = 'absolute'
    canvas.style.inset = '0'
    canvas.style.pointerEvents = 'none'
    host.appendChild(canvas)

    this.tex = makeGlowTexture()
    this.field = new ParticleField(this.tex, 70000)
    this.imgField = new ParticleField(this.tex, 45000, 'normal')
    this.backdrop = new Sprite({ texture: makeBackdropTexture(), alpha: 0 })
    this.fx = new Container()
    app.stage.addChild(this.backdrop)
    app.stage.addChild(this.imgField.container)
    app.stage.addChild(this.field.container)
    app.stage.addChild(this.fx)
    this.field.setBounds(app.screen.width, app.screen.height)
    this.imgField.setBounds(app.screen.width, app.screen.height)
    this.backdrop.width = app.screen.width
    this.backdrop.height = app.screen.height
    window.addEventListener('resize', () => this.fitToWindow())

    const gl = (app.renderer as unknown as { gl?: WebGLRenderingContext }).gl ?? null
    this.quality = initialQuality(gl)
    const r = app.renderer.resolution
    console.log(
      `[fireworks] stage ${app.screen.width}x${app.screen.height} @${r.toFixed(2)} (dpr ${window.devicePixelRatio}) ` +
        `quality ${this.quality.toFixed(2)} · 2560x1440@2 → @${computeResolution(2560, 1440, 2).toFixed(2)}`
    )

    const cap = document.createElement('div')
    Object.assign(cap.style, {
      position: 'absolute',
      left: '50%',
      bottom: '8%',
      transform: 'translateX(-50%) translateY(8px)',
      padding: '10px 22px',
      borderRadius: '999px',
      background: 'rgba(14, 16, 30, 0.55)',
      color: '#fff',
      font: `700 20px ${MESSAGE_FONT}`,
      letterSpacing: '-0.2px',
      whiteSpace: 'nowrap',
      opacity: '0',
      transition: 'opacity 0.6s ease, transform 0.6s ease',
      pointerEvents: 'none',
      textShadow: '0 1px 2px rgba(0,0,0,0.4)'
    } as Partial<CSSStyleDeclaration>)
    host.appendChild(cap)
    this.caption = cap

    app.ticker.add(this.tick)
  }

  /** 창 크기·화면이 바뀌면 백버퍼를 다시 맞춘다 (해상도 상한 포함) */
  private fitToWindow(): void {
    const w = window.innerWidth
    const h = window.innerHeight
    const res = computeResolution(w, h, window.devicePixelRatio)
    const r = this.app.renderer
    if (r.width !== w * r.resolution || r.height !== h * r.resolution || r.resolution !== res) {
      r.resize(w, h, res)
    }
    this.field.setBounds(w, h)
    this.imgField.setBounds(w, h)
    this.backdrop.width = w
    this.backdrop.height = h
  }

  /** 지난 재생의 프레임률로 입자 수를 조절 (0.4 ~ 1) */
  private adaptQuality(avgFps: number): void {
    const before = this.quality
    if (avgFps < 45) this.quality = Math.max(0.4, this.quality * 0.75)
    else if (avgFps < 54) this.quality = Math.max(0.4, this.quality * 0.88)
    else if (avgFps > 58.5) this.quality = Math.min(1, this.quality + 0.05)
    if (this.quality !== before) {
      try {
        localStorage.setItem(QUALITY_KEY, this.quality.toFixed(2))
      } catch {
        /* 무시 */
      }
    }
  }

  get W(): number {
    return this.app.screen.width
  }
  get H(): number {
    return this.app.screen.height
  }

  /** 재생. 모든 입자가 사라지면 resolve. 재생 중에 또 부르면 겹쳐서 이어 붙인다 */
  async play(show: FireworkShow): Promise<void> {
    const gen = this.gen
    this.fitToWindow()
    const q = this.quality
    this.sound = show.sound !== false
    this.sfx.enabled = this.sound
    const W = this.W
    const H = this.H
    const scale = Math.max(0.6, Math.min(2, H / 900))

    // 모양 준비 (이미지 디코드는 비동기)
    let main: ShapePoints | null = null
    let mainStyle: ShapeStyle
    let mainColor: (i: number, s: ShapePoints) => RGB
    let mainCy: number
    const content = show.content
    if (content.kind === 'image') {
      mainCy = H * 0.465
      try {
        main = await imageShape(content.dataUrl, { maxW: W * 0.86, maxH: H * 0.78, maxCount: Math.round(32000 * q) })
      } catch (err) {
        console.warn('[fireworks] image failed', err)
        main = null
      }
      const cell = main ? main.cell : 3
      mainStyle = {
        k: 5.6,
        hold: 2.7,
        holdJitter: 0.25,
        dissolve: 2.2,
        heatHold: 0.12,
        cool: 0.38,
        heat: 0.95,
        size: Math.max(1.8, Math.min(5.2, cell * 1.15)),
        twinkle: 0.4,
        streakForm: 0.006,
        streakFree: 0.02,
        kick: 6,
        grav: 10,
        drag: 0.6,
        jitter: 5,
        dieSpread: 1.0,
        fadeFrac: 0.6,
        alpha: 0.92
      }
      mainColor = (i, s) => [s.colors![i * 3], s.colors![i * 3 + 1], s.colors![i * 3 + 2]]
    } else {
      mainCy = H * 0.42
      main = textShape(content.text.slice(0, 40), {
        maxW: W * 0.8,
        maxH: H * 0.5,
        maxLineH: H * 0.27,
        targetCount: Math.round(9000 * q),
        font: MESSAGE_FONT,
        weight: 800,
        stroke: 0.06
      })
      mainStyle = {
        k: 15,
        hold: 2.5,
        holdJitter: 0.3,
        dissolve: 1.1,
        heatHold: 0.32,
        cool: 0.3,
        heat: 1,
        size: 2.7 * scale,
        twinkle: 0.6,
        streakForm: 0.02,
        streakFree: 0.16,
        kick: 60 * scale,
        grav: 80 * scale,
        drag: 1.1,
        jitter: 6,
        dieSpread: 0,
        fadeFrac: 0.8,
        alpha: 1
      }
      mainColor = this.textColorFn(content.palette, main)
    }
    if (gen !== this.gen) return // 준비 중에 stop() 됨

    // 이미 재생 중이면 그 뒤에 이어 붙인다
    const start = Math.max(this.t, this.lastCueTime() - 0.4)
    const g = GRAVITY_H * H
    const fuseFor = (cy: number): number => {
      const rise = Math.max(40, H - cy + 6)
      return Math.sqrt((2 * rise) / g)
    }

    let burstAt = start + 0.12 + fuseFor(mainCy)
    if (show.countdown) {
      const digitStyle: ShapeStyle = {
        k: 28,
        hold: 0.45,
        holdJitter: 0.12,
        dissolve: 0.75,
        heatHold: 0.22,
        cool: 0.16,
        heat: 1,
        size: 2.6 * scale,
        twinkle: 0.5,
        streakForm: 0.012,
        streakFree: 0.17,
        kick: 55 * scale,
        grav: 85 * scale,
        drag: 1.0,
        jitter: 4,
        dieSpread: 0,
        fadeFrac: 0.75,
        alpha: 1
      }
      for (const d of ['3', '2', '1']) {
        const shape = textShape(d, {
          maxW: W * 0.5,
          maxH: H * 0.23,
          maxLineH: H * 0.23,
          targetCount: Math.round(2600 * Math.max(0.7, q)),
          font: DIGIT_FONT,
          weight: 900,
          stroke: 0.03
        })
        const cy = H * 0.42
        this.scheduleShapeRocket(burstAt, W / 2, cy, shape, digitStyle, this.textColorFn('gold', shape), H * 0.11, 0.8)
        burstAt += 1.0
      }
    }

    if (main && main.count > 0) {
      const flash = content.kind === 'image' ? H * 0.2 : H * 0.16
      this.scheduleShapeRocket(burstAt, W / 2, mainCy, main, mainStyle!, mainColor!, flash, 1, content.kind === 'image' ? this.imgField : this.field)
      if (content.kind === 'text') {
        // 머무는 동안 아래로 흘러내리는 반짝이
        const pal = content.palette === 'rainbow' ? paletteRgb('gold') : paletteRgb(content.palette)
        this.emitters.push({
          shape: main,
          cx: W / 2,
          cy: mainCy,
          from: burstAt + 0.35,
          until: burstAt + mainStyle!.hold,
          rate: 80,
          acc: 0,
          colors: pal
        })
      }
    }
    const mainEnd = burstAt + mainStyle!.hold

    if (show.finale) {
      // 이미지는 화면을 크게 차지하므로 거의 다 흩어진 뒤에 쏜다
      const at = content.kind === 'image' ? mainEnd + mainStyle!.dissolve * 0.75 : mainEnd + 0.25
      this.scheduleVolley(at, 0)
      this.scheduleVolley(at + 0.7, 1)
    }

    // 보낸 사람 표시
    if (show.fromName) {
      const name = show.fromName.slice(0, 20)
      this.addCue(start + 0.2, () => {
        this.caption.textContent = `${name}님이 보낸 불꽃 💌`
        this.caption.style.opacity = '1'
        this.caption.style.transform = 'translateX(-50%) translateY(0)'
      })
    }

    this.stats = { frames: 0, time: 0, worst: 0, peak: 0, upd: 0 }
    this.start()
    await new Promise<void>((resolve) => this.waiters.push(resolve))
  }

  /** 즉시 정지·초기화 */
  stop(): void {
    this.gen++
    this.cues.length = 0
    for (const r of this.rockets) this.release(r.sprite)
    for (const f of this.flashes) this.release(f.sprite)
    this.rockets.length = 0
    this.flashes.length = 0
    this.emitters.length = 0
    this.field.clear()
    this.imgField.clear()
    this.dim = 0
    this.backdrop.alpha = 0
    this.caption.style.opacity = '0'
    this.finish()
  }

  destroy(): void {
    this.stop()
    this.sfx.close()
    this.app.destroy(true, { children: true, texture: true })
    this.caption.remove()
  }

  // ───────── 스케줄 ─────────

  private addCue(at: number, fn: () => void): void {
    const c = { at, fn }
    let i = this.cues.length
    while (i > 0 && this.cues[i - 1].at > at) i--
    this.cues.splice(i, 0, c)
  }

  private lastCueTime(): number {
    let last = this.t
    for (const c of this.cues) last = Math.max(last, c.at)
    for (const f of [this.field, this.imgField]) {
      for (let i = 0; i < f.n; i += 97) last = Math.max(last, f.dieAt[i])
    }
    return last
  }

  private textColorFn(palette: PaletteId, shape: ShapePoints): (i: number) => RGB {
    if (palette === 'rainbow') {
      const half = shape.width / 2 || 1
      return (i) => {
        const u = (shape.pts[i * 2] + half) / (half * 2)
        return hslToRgb((Math.max(0, Math.min(1, u)) * 0.82 + rand() * 0.04) % 1, 0.95, 0.62 + rand() * 0.08)
      }
    }
    const cols = paletteRgb(palette)
    // 흰색은 덜 나오게 (첫 색 = 흰색)
    return () => (rand() < 0.12 ? cols[0] : cols[1 + ((rand() * (cols.length - 1)) | 0)])
  }

  /** 정점이 (cx, cy) 가 되도록 로켓을 쏘고, 정점에서 모양으로 터뜨린다 */
  private scheduleShapeRocket(
    burstAt: number,
    cx: number,
    cy: number,
    shape: ShapePoints,
    style: ShapeStyle,
    color: (i: number, s: ShapePoints) => RGB,
    flashSize: number,
    power: number,
    field: ParticleField = this.field
  ): void {
    const H = this.H
    const g = GRAVITY_H * H
    // SPEC: rise = max(40, cue.height * world.height), vy = -sqrt(2·g·rise), fuse = -vy/g
    const rise = Math.max(40, H - cy + 6)
    const vy0 = -Math.sqrt(2 * g * rise)
    const fuse = -vy0 / g
    const launchAt = burstAt - fuse
    const pan = (cx / this.W) * 2 - 1
    this.addCue(launchAt, () => {
      if (this.sound) this.sfx.launch(fuse, pan * 0.6, 0.9)
      this.launchRocket(cx, H + 6, vy0, g, fuse, () => {
        this.addFlash(cx, cy, flashSize, 0.85)
        this.burstShape(cx, cy, shape, style, color, field)
        if (this.sound) this.sfx.burst(power, pan * 0.6, power > 0.9 ? 26 : 14)
      })
    })
  }

  /** 일제 발사 — 발사대 9개가 같은 순간에 한 줄로 쏜다 */
  private scheduleVolley(burstBase: number, wave: number): void {
    const W = this.W
    const H = this.H
    const g = GRAVITY_H * H
    const PADS = 9
    const baseH = 0.72 - wave * 0.06
    // 모두 같은 순간에 발사 (높이가 다르면 터지는 순간도 조금씩 다르다)
    const launchAt = burstBase - Math.sqrt((2 * baseH * H) / g)
    for (let pad = 0; pad < PADS; pad++) {
      // 높이를 조금씩 어긋나게 준다 — 같은 높이면 자로 그은 줄처럼 보인다
      const h = baseH + ((pad * 3) % 5) / 45
      const rise = Math.max(40, h * H)
      const vy0 = -Math.sqrt(2 * g * rise)
      const fuse = -vy0 / g
      const x = W * (0.08 + (0.84 * pad) / (PADS - 1)) + (rand() - 0.5) * W * 0.02
      const cy = H + 6 - rise
      const pal = PEONY_PALETTES[(pad + wave * 3) % PEONY_PALETTES.length]
      const pan = (x / W) * 2 - 1
      const R = H * (0.13 + rand() * 0.04)
      this.addCue(launchAt, () => {
        if (this.sound && pad % 3 === 1) this.sfx.launch(fuse, pan * 0.7, 0.7)
        this.launchRocket(x, H + 6, vy0, g, fuse, () => {
          this.addFlash(x, cy, R * 0.8, 0.7)
          this.burstPeony(x, cy, R, pal, 170)
          if (this.sound && pad % 2 === 0) this.sfx.burst(0.8, pan * 0.7, 10)
        })
      })
    }
  }

  // ───────── 생성 ─────────

  private take(): Sprite {
    const s = this.spritePool.pop() ?? new Sprite({ texture: this.tex, anchor: 0.5, blendMode: 'add' })
    s.visible = true
    this.fx.addChild(s)
    return s
  }

  private release(s: Sprite): void {
    s.visible = false
    this.fx.removeChild(s)
    this.spritePool.push(s)
  }

  private launchRocket(x: number, y0: number, vy0: number, g: number, fuse: number, onBurst: () => void): void {
    const sprite = this.take()
    sprite.tint = 0xfff0d2
    this.rockets.push({ x, y0, vy0, g, launch: this.t, fuse, sprite, trail: 0, wobble: rand() * 10, onBurst })
  }

  private addFlash(x: number, y: number, size: number, alpha: number): void {
    const sprite = this.take()
    sprite.x = x
    sprite.y = y
    sprite.tint = 0xfff6e8
    this.flashes.push({ sprite, born: this.t, life: 0.32, size, alpha })
  }

  private burstShape(
    cx: number,
    cy: number,
    shape: ShapePoints,
    st: ShapeStyle,
    color: (i: number, s: ShapePoints) => RGB,
    f: ParticleField = this.field
  ): void {
    const t = this.t
    const pts = shape.pts
    for (let j = 0; j < shape.count; j++) {
      const i = f.alloc(t)
      if (i < 0) break
      const dx = pts[j * 2]
      const dy = pts[j * 2 + 1]
      const a = rand() * Math.PI * 2
      const rr = rand() * st.jitter
      f.kind[i] = KIND_BOUND
      f.ox[i] = cx + Math.cos(a) * rr
      f.oy[i] = cy + Math.sin(a) * rr
      f.tx[i] = cx + dx
      f.ty[i] = cy + dy
      f.x[i] = f.ox[i]
      f.y[i] = f.oy[i]
      f.k[i] = st.k * (0.8 + rand() * 0.4)
      f.bindEnd[i] = t + st.hold + rand() * st.holdJitter
      const dieDelay = st.dieSpread > 0 ? rand() * st.dieSpread * st.dissolve : 0
      const life = st.dieSpread > 0 ? st.dissolve * (1 - st.dieSpread) + dieDelay : st.dissolve * (0.55 + rand() * 0.45)
      f.dieAt[i] = f.bindEnd[i] + Math.max(0.15, life)
      f.fadeDur[i] = Math.max(0.12, (f.dieAt[i] - f.bindEnd[i]) * st.fadeFrac)
      f.heat[i] = st.heat
      f.heatEnd[i] = t + st.heatHold * (0.8 + rand() * 0.4)
      f.coolDur[i] = st.cool
      f.size[i] = st.size * (0.8 + rand() * 0.4)
      const c = color(j, shape)
      f.r[i] = c[0]
      f.g[i] = c[1]
      f.b[i] = c[2]
      f.alpha[i] = st.alpha
      f.twinkle[i] = st.twinkle
      // 흩어질 때 속도: 폭발 중심에서 바깥쪽 + 무작위
      const d = Math.sqrt(dx * dx + dy * dy) || 1
      const out = st.kick * (0.25 + rand() * 0.75)
      f.vx[i] = (dx / d) * out + (rand() - 0.5) * st.kick * 0.6
      f.vy[i] = (dy / d) * out + (rand() - 0.5) * st.kick * 0.6
      f.grav[i] = st.grav * (0.7 + rand() * 0.6)
      f.drag[i] = st.drag
      f.streak[i] = st.streakForm
      f.streakFree[i] = st.streakFree
    }
    this.stats.peak = Math.max(this.stats.peak, f.n)
  }

  /** 국화(peony) — 구 모양으로 퍼지는 일반 불꽃 */
  private burstPeony(cx: number, cy: number, R: number, pal: RGB[], count: number): void {
    const f = this.field
    const t = this.t
    const drag = 2.4
    for (let j = 0; j < count; j++) {
      const i = f.alloc(t)
      if (i < 0) break
      const a = rand() * Math.PI * 2
      // 구 표면에 고르게 뿌린 별을 화면에 투영: 반지름 = R·√(1-u²)
      const u = rand() * 2 - 1
      const sp = R * drag * (0.12 + 0.88 * Math.sqrt(1 - u * u)) * (0.92 + rand() * 0.16)
      f.x[i] = cx
      f.y[i] = cy
      f.vx[i] = Math.cos(a) * sp
      f.vy[i] = Math.sin(a) * sp
      f.drag[i] = drag
      f.grav[i] = this.H * 0.14
      f.dieAt[i] = t + 1.1 + rand() * 0.7
      f.fadeDur[i] = 0.7
      f.heat[i] = 1
      f.heatEnd[i] = t + 0.05
      f.coolDur[i] = 0.16
      f.size[i] = 2.5 * Math.max(0.7, this.H / 900)
      const c = j % 7 === 0 ? pal[0] : pal[1 + (j % (pal.length - 1))]
      f.r[i] = c[0]
      f.g[i] = c[1]
      f.b[i] = c[2]
      f.twinkle[i] = 0.55
      f.streak[i] = 0.075
    }
    this.stats.peak = Math.max(this.stats.peak, f.n)
  }

  private spawnTrail(x: number, y: number, vy: number): void {
    const f = this.field
    const i = f.alloc(this.t)
    if (i < 0) return
    f.x[i] = x + (rand() - 0.5) * 2
    f.y[i] = y + rand() * 4
    f.vx[i] = (rand() - 0.5) * 36
    f.vy[i] = vy * 0.06 + 10 + rand() * 30
    f.grav[i] = 260
    f.drag[i] = 2.6
    f.dieAt[i] = this.t + 0.22 + rand() * 0.38
    f.fadeDur[i] = 0.3
    f.size[i] = 1.5 + rand() * 0.8
    f.r[i] = 1
    f.g[i] = 0.78 + rand() * 0.15
    f.b[i] = 0.45 + rand() * 0.2
    f.heat[i] = 0.5
    f.heatEnd[i] = this.t
    f.coolDur[i] = 0.12
    f.alpha[i] = 0.75
    f.twinkle[i] = 0.5
    f.streak[i] = 0.02
  }

  private spawnGlitter(e: Emitter): void {
    const f = this.field
    const i = f.alloc(this.t)
    if (i < 0) return
    const j = (rand() * e.shape.count) | 0
    f.x[i] = e.cx + e.shape.pts[j * 2]
    f.y[i] = e.cy + e.shape.pts[j * 2 + 1]
    f.vx[i] = (rand() - 0.5) * 24
    f.vy[i] = 10 + rand() * 30
    f.grav[i] = 90
    f.drag[i] = 1.2
    f.dieAt[i] = this.t + 0.5 + rand() * 0.7
    f.fadeDur[i] = 0.45
    f.size[i] = 1.7 + rand() * 0.8
    const c = pick(e.colors)
    f.r[i] = c[0]
    f.g[i] = c[1]
    f.b[i] = c[2]
    f.heat[i] = 0.6
    f.heatEnd[i] = this.t
    f.coolDur[i] = 0.25
    f.alpha[i] = 0.9
    f.twinkle[i] = 0.6
    f.streak[i] = 0.07
  }

  // ───────── 프레임 ─────────

  private start(): void {
    if (this.running) return
    this.running = true
    this.app.ticker.start()
  }

  private finish(): void {
    if (this.running) {
      this.running = false
      this.app.ticker.stop()
    }
    // 마지막 프레임을 지운다
    this.field.container.particleChildren.length = 0
    this.imgField.container.particleChildren.length = 0
    this.dim = 0
    this.backdrop.alpha = 0
    this.app.render()
    this.caption.style.opacity = '0'
    this.caption.style.transform = 'translateX(-50%) translateY(8px)'
    const s = this.stats
    if (s.frames > 0) {
      const fps = s.frames / s.time
      console.log(
        `[fireworks] avg ${fps.toFixed(1)}fps, worst frame ${s.worst.toFixed(1)}ms, ` +
          `peak ${s.peak} particles, update ${(s.upd / s.frames).toFixed(2)}ms/frame, ` +
          `res @${this.app.renderer.resolution.toFixed(2)}, quality ${this.quality.toFixed(2)}`
      )
      // 충분히 길게 재생된 경우에만 품질 조정 (stop 으로 끊긴 짧은 재생은 무시)
      if (s.time > 2) this.adaptQuality(fps)
      this.stats = { frames: 0, time: 0, worst: 0, peak: 0, upd: 0 }
    }
    const w = this.waiters
    this.waiters = []
    for (const r of w) r()
  }

  private tick = (ticker: Ticker): void => {
    const ms = ticker.deltaMS
    const dt = Math.min(ms, 50) / 1000
    this.t += dt
    const t = this.t
    const u0 = performance.now()

    while (this.cues.length && this.cues[0].at <= t) this.cues.shift()!.fn()

    // 로켓
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i]
      const tau = Math.min(t - r.launch, r.fuse)
      const y = r.y0 + r.vy0 * tau + 0.5 * r.g * tau * tau
      const vy = r.vy0 + r.g * tau
      const x = r.x + Math.sin(tau * 9 + r.wobble) * 0.8
      const s = r.sprite
      const speed = Math.abs(vy)
      const len = 5 + speed * 0.024
      s.x = x
      s.y = y + len * 0.3
      s.rotation = Math.PI / 2
      s.scale.set(len / TEX_VISIBLE, 3 / TEX_VISIBLE)
      s.alpha = 0.95
      r.trail += dt * (40 + speed * 0.06)
      while (r.trail >= 1) {
        r.trail -= 1
        this.spawnTrail(x, y, vy)
      }
      if (t - r.launch >= r.fuse) {
        this.release(s)
        this.rockets.splice(i, 1)
        r.onBurst()
      }
    }

    // 반짝이 흘러내림
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i]
      if (t >= e.until) {
        this.emitters.splice(i, 1)
        continue
      }
      if (t < e.from) continue
      e.acc += dt * e.rate
      while (e.acc >= 1) {
        e.acc -= 1
        this.spawnGlitter(e)
      }
    }

    this.field.update(t, dt)
    this.imgField.update(t, dt)

    // 배경 어둡게: 불꽃이 남아 있는 동안 켜고, 거의 다 사라지면 걷는다
    const alive = this.field.n + this.imgField.n
    const busy = this.cues.length > 0 || this.rockets.length > 0 || alive > this.stats.peak * 0.12
    const target = busy ? 1 : 0
    this.dim += (target - this.dim) * Math.min(1, dt * (target > this.dim ? 3.2 : 1.6))
    if (!busy && this.dim < 0.01) this.dim = 0
    this.backdrop.alpha = this.dim

    // 폭발 섬광
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const fl = this.flashes[i]
      const u = (t - fl.born) / fl.life
      if (u >= 1) {
        this.release(fl.sprite)
        this.flashes.splice(i, 1)
        continue
      }
      const sc = (fl.size * (0.5 + 0.7 * Math.sqrt(u))) / TEX_VISIBLE
      fl.sprite.scale.set(sc)
      fl.sprite.alpha = fl.alpha * (1 - u) * (1 - u)
    }

    const u1 = performance.now()
    const st = this.stats
    st.frames++
    st.time += ms / 1000
    st.upd += u1 - u0
    if (st.frames > 3 && ms > st.worst) st.worst = ms
    if (alive > st.peak) st.peak = alive

    const idle = (): boolean => !this.cues.length && !this.rockets.length && this.field.n === 0 && this.imgField.n === 0 && this.dim === 0
    if (idle() && !this.flashes.length && !this.emitters.length) {
      // 다음 틱에서 빈 화면이 그려진 뒤 멈춘다
      queueMicrotask(() => {
        if (idle()) this.finish()
      })
    }
  }
}
