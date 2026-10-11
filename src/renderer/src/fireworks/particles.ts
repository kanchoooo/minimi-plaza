import { Particle, ParticleContainer, Rectangle, Texture } from 'pixi.js'
import type { BLEND_MODES } from 'pixi.js'

/**
 * 입자 저장소 (구조체-배열 형태, 풀링).
 * Pixi ParticleContainer 에 고정된 슬롯을 두고, 살아있는 n개만 그린다.
 *
 * 입자는 두 상태가 있다.
 *  - BOUND: 목표점으로 끌려가는 중/머무는 중. 해석해(지수 감쇠)를 그대로 쓴다.
 *      v0 = (target - p0) * k, v' = -k v  →  p(τ) = target + (p0 - target)·e^{-kτ}
 *      (v0/k 만큼 이동하고 멈추는 성질 → 정확히 목표점에 선다)
 *  - FREE: 중력·공기저항을 받는 자유 입자 (로켓 꼬리, 국화 불꽃, 흩어지는 글자)
 */

export const KIND_FREE = 0
export const KIND_BOUND = 1

/** 글로우 텍스처에서 '눈에 보이는' 지름 (px) */
const TEX_SIZE = 32
export const TEX_VISIBLE = 14

export function makeGlowTexture(): Texture {
  const c = document.createElement('canvas')
  c.width = c.height = TEX_SIZE
  const g = c.getContext('2d')!
  const r = TEX_SIZE / 2
  const grad = g.createRadialGradient(r, r, 0, r, r, r)
  // 텍스처를 꽉 채우는 부드러운 점 (여백이 적을수록 채우기 비용이 줄어든다)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.24, 'rgba(255,255,255,1)')
  grad.addColorStop(0.44, 'rgba(255,255,255,0.55)')
  grad.addColorStop(0.64, 'rgba(255,255,255,0.15)')
  grad.addColorStop(0.84, 'rgba(255,255,255,0.03)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, TEX_SIZE, TEX_SIZE)
  return Texture.from(c)
}

export class ParticleField {
  readonly cap: number
  n = 0
  readonly container: ParticleContainer
  private slots: Particle[] = []

  // 상태
  x: Float32Array
  y: Float32Array
  vx: Float32Array
  vy: Float32Array
  ox: Float32Array
  oy: Float32Array
  tx: Float32Array
  ty: Float32Array
  k: Float32Array
  born: Float32Array
  bindEnd: Float32Array
  dieAt: Float32Array
  fadeDur: Float32Array
  heatEnd: Float32Array
  coolDur: Float32Array
  heat: Float32Array
  size: Float32Array
  r: Float32Array
  g: Float32Array
  b: Float32Array
  alpha: Float32Array
  phase: Float32Array
  twinkle: Float32Array
  grav: Float32Array
  drag: Float32Array
  streak: Float32Array
  /** 묶임 해제 뒤의 꼬리 계수 */
  streakFree: Float32Array
  kind: Uint8Array

  private arrays: (Float32Array | Uint8Array)[]

  /** blendMode: 'add' = 빛처럼 더해짐(불꽃) / 'normal' = 제 색 그대로(사진 불꽃) */
  constructor(texture: Texture, cap = 60000, blendMode: BLEND_MODES = 'add') {
    this.cap = cap
    const f = (): Float32Array => new Float32Array(cap)
    this.x = f()
    this.y = f()
    this.vx = f()
    this.vy = f()
    this.ox = f()
    this.oy = f()
    this.tx = f()
    this.ty = f()
    this.k = f()
    this.born = f()
    this.bindEnd = f()
    this.dieAt = f()
    this.fadeDur = f()
    this.heatEnd = f()
    this.coolDur = f()
    this.heat = f()
    this.size = f()
    this.r = f()
    this.g = f()
    this.b = f()
    this.alpha = f()
    this.phase = f()
    this.twinkle = f()
    this.grav = f()
    this.drag = f()
    this.streak = f()
    this.streakFree = f()
    this.kind = new Uint8Array(cap)
    this.arrays = [
      this.x, this.y, this.vx, this.vy, this.ox, this.oy, this.tx, this.ty, this.k, this.born,
      this.bindEnd, this.dieAt, this.fadeDur, this.heatEnd, this.coolDur, this.heat, this.size,
      this.r, this.g, this.b, this.alpha, this.phase, this.twinkle, this.grav, this.drag, this.streak, this.streakFree, this.kind
    ]

    this.container = new ParticleContainer({
      texture,
      blendMode,
      dynamicProperties: { position: true, rotation: true, vertex: true, color: true, uvs: false }
    })
    this.texture = texture
  }

  private texture: Texture

  setBounds(w: number, h: number): void {
    this.container.boundsArea = new Rectangle(-w, -h, w * 3, h * 3)
  }

  /** 빈 슬롯 하나를 기본값으로 채워 인덱스를 돌려준다 (가득 차면 -1) */
  alloc(t: number): number {
    if (this.n >= this.cap) return -1
    const i = this.n++
    this.kind[i] = KIND_FREE
    this.vx[i] = this.vy[i] = 0
    this.born[i] = t
    this.bindEnd[i] = 0
    this.dieAt[i] = t + 1
    this.fadeDur[i] = 0.3
    this.heatEnd[i] = t
    this.coolDur[i] = 0.2
    this.heat[i] = 0
    this.size[i] = 2
    this.r[i] = this.g[i] = this.b[i] = 1
    this.alpha[i] = 1
    this.phase[i] = Math.random() * Math.PI * 2
    this.twinkle[i] = 0
    this.grav[i] = 0
    this.drag[i] = 0
    this.streak[i] = 0
    this.streakFree[i] = 0
    this.k[i] = 0
    return i
  }

  clear(): void {
    this.n = 0
    this.container.particleChildren.length = 0
  }

  private copy(from: number, to: number): void {
    const a = this.arrays
    for (let j = 0; j < a.length; j++) a[j][to] = a[j][from]
  }

  /** 물리 갱신 + 죽은 입자 압축 + Pixi 슬롯 반영 */
  update(t: number, dt: number): void {
    const { x, y, vx, vy, ox, oy, tx, ty, k, born, bindEnd, dieAt, fadeDur, heatEnd, coolDur, heat } = this
    const { size, r, g, b, alpha, phase, twinkle, grav, drag, streak, kind } = this
    const slots = this.slots
    const children = this.container.particleChildren
    let w = 0
    const n = this.n
    for (let i = 0; i < n; i++) {
      if (t >= dieAt[i]) continue
      if (w !== i) this.copy(i, w)
      const p = w++

      let px: number, py: number, pvx: number, pvy: number
      if (kind[p] === KIND_BOUND) {
        if (t < bindEnd[p]) {
          const e = Math.exp(-k[p] * (t - born[p]))
          px = tx[p] + (ox[p] - tx[p]) * e
          py = ty[p] + (oy[p] - ty[p]) * e
          pvx = (tx[p] - ox[p]) * k[p] * e
          pvy = (ty[p] - oy[p]) * k[p] * e
          x[p] = px
          y[p] = py
        } else {
          // 묶임 해제 → 자유 입자. vx/vy 에는 생성 때 넣어둔 '흩어짐' 속도가 들어 있다
          const e = Math.exp(-k[p] * (bindEnd[p] - born[p]))
          x[p] = tx[p] + (ox[p] - tx[p]) * e
          y[p] = ty[p] + (oy[p] - ty[p]) * e
          kind[p] = KIND_FREE
          this.streak[p] = this.streakFree[p]
          px = x[p]
          py = y[p]
          pvx = vx[p]
          pvy = vy[p]
        }
      } else {
        const d = Math.exp(-drag[p] * dt)
        pvx = vx[p] * d
        pvy = vy[p] * d + grav[p] * dt
        px = x[p] + pvx * dt
        py = y[p] + pvy * dt
        vx[p] = pvx
        vy[p] = pvy
        x[p] = px
        y[p] = py
      }

      // 색: 흰색으로 달궈졌다가 식으며 제 색으로
      let h = 0
      if (heat[p] > 0) {
        h = t < heatEnd[p] ? heat[p] : heat[p] * Math.exp(-(t - heatEnd[p]) / coolDur[p])
      }
      // 반짝임: 대부분 밝게 있다가 가끔 어두워지고, 가끔 하얗게 번쩍인다
      let tw = 0
      if (twinkle[p] > 0) {
        const ph = phase[p]
        tw = Math.sin(t * (7 + ph * 2.4) + ph * 7.0)
        if (tw > 0.93) {
          const gl = (tw - 0.93) * 14 * twinkle[p]
          if (gl > h) h = gl > 1 ? 1 : gl
        }
      }
      const cr = r[p] + (1 - r[p]) * h
      const cg = g[p] + (1 - g[p]) * h
      const cb = b[p] + (1 - b[p]) * h

      // 밝기: 반짝임 + 소멸 페이드 + 시작 페이드인
      let a = alpha[p]
      if (twinkle[p] > 0) {
        const d = 0.5 - 0.5 * tw // 0..1, 1 = 가장 어두움
        a *= 1 - twinkle[p] * d * d * d
      }
      const left = dieAt[p] - t
      if (left < fadeDur[p]) {
        const u = left / fadeDur[p]
        a *= u * u
      }
      const age = t - born[p]
      if (age < 0.04) a *= age / 0.04

      // 모양: 속도 방향 꼬리(스트릭)
      const sz = size[p] * (1 + 0.45 * h)
      let len = sz
      let rot = 0
      if (streak[p] > 0) {
        const sp = Math.sqrt(pvx * pvx + pvy * pvy)
        const l = sp * streak[p]
        if (l > sz) {
          len = l > 42 ? 42 : l
          rot = Math.atan2(pvy, pvx)
        }
      }

      let slot = slots[p]
      if (!slot) {
        slot = slots[p] = new Particle({ texture: this.texture, anchorX: 0.5, anchorY: 0.5 })
      }
      slot.x = px
      slot.y = py
      slot.rotation = rot
      slot.scaleX = len / TEX_VISIBLE
      slot.scaleY = sz / TEX_VISIBLE
      const ai = a <= 0 ? 0 : a >= 1 ? 255 : (a * 255) | 0
      const ri = cr >= 1 ? 255 : (cr * 255) | 0
      const gi = cg >= 1 ? 255 : (cg * 255) | 0
      const bi = cb >= 1 ? 255 : (cb * 255) | 0
      slot.color = ((ai << 24) | (bi << 16) | (gi << 8) | ri) >>> 0
    }
    this.n = w

    // 그릴 슬롯 수 맞추기 (늘어날 때는 정적 버퍼(uv)도 다시 올린다)
    if (children.length < w) {
      for (let i = children.length; i < w; i++) children.push(slots[i])
      this.container._childrenDirty = true
    } else if (children.length > w) {
      children.length = w
    }
  }
}
