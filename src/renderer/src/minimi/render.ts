// 미니미 합성기: 설정 → 32x40 픽셀
import type { MinimiConfig } from '@shared/types'
import { ACCS, ARMS, BLUSH, BOTTOMS, byId, EARS, EYES, HAIRS, HEAD, LEGS, MOUTHS, SHOES, TOPS, TORSO, Z } from './parts'
import type { Attach, Layer, Piece, Src } from './parts'
import { DOT_CHARS, DOT_PALETTE, hexToRgb, shadesOf } from './palette'
import type { RGBA, ShadeSet } from './palette'

export const MINIMI_W = 32
export const MINIMI_H = 40
export type MinimiFrame = 'idle' | 'blink' | 'walk1' | 'walk2'
export type MinimiDir = 'front' | 'left' | 'right'

const W = MINIMI_W
const H = MINIMI_H

/** 고정색 (외곽선 처리 안 함) */
const FIXED: Record<string, RGBA> = {
  w: [255, 255, 255, 255],
  k: [44, 34, 52, 255],
  m: [132, 52, 68, 255],
  r: [234, 92, 112, 255],
  R: [186, 50, 72, 255],
  p: [255, 158, 182, 255],
  P: [228, 92, 130, 255],
  q: [255, 118, 150, 110],
  Q: [255, 140, 168, 64],
  y: [255, 214, 74, 255],
  Y: [214, 156, 32, 255],
  h: [255, 82, 138, 255],
  t: [168, 220, 255, 255],
  L: [255, 255, 255, 64],
  G: [150, 160, 182, 255]
}

const OUTLINABLE = new Set(['a', 'b', 'c', 'd', 'e'])

interface Offsets {
  body: number
  armL: number
  armR: number
  legL: number
  legR: number
}

const FRAME_OFFSETS: Record<MinimiFrame, Offsets> = {
  idle: { body: 0, armL: 0, armR: 0, legL: 0, legR: 0 },
  blink: { body: 0, armL: 0, armR: 0, legL: 0, legR: 0 },
  // 걷기: 몸이 1px 튀어 오르고, 한쪽 발은 들고 반대쪽 팔이 앞으로
  walk1: { body: -1, armL: -1, armR: -2, legL: -1, legR: 0 },
  walk2: { body: -1, armL: -2, armR: -1, legL: 0, legR: -1 }
}

/** 걸을 때 추천 프레임 순서 (idle 을 끼우면 통통 튀는 느낌) */
export const WALK_CYCLE: MinimiFrame[] = ['walk1', 'idle', 'walk2', 'idle']

interface Ctx {
  cfg: MinimiConfig
  off: Offsets
  faceDx: number
  mirror: boolean
}

function srcHex(src: Src, cfg: MinimiConfig, main: string): string {
  switch (src) {
    case 'main':
      return main
    case 'skin':
      return cfg.skin
    case 'hair':
      return cfg.hairColor
    case 'acc':
      return cfg.accColor
    default:
      return src
  }
}

function colorOf(ch: string, sh: ShadeSet, skin: ShadeSet): RGBA | null {
  switch (ch) {
    case 'a':
    case 'A':
      return sh.a
    case 'b':
    case 'B':
      return sh.b
    case 'c':
    case 'C':
      return sh.c
    case 'd':
    case 'D':
      return sh.d
    case 'e':
    case 'E':
      return sh.e
    case 'o':
      return sh.o
    case 's':
      return skin.a
    case 'S':
      return skin.b
    default:
      return FIXED[ch] ?? null
  }
}

function blend(px: Uint8ClampedArray, i: number, c: RGBA): void {
  const a = c[3] / 255
  if (a >= 1) {
    px[i] = c[0]
    px[i + 1] = c[1]
    px[i + 2] = c[2]
    px[i + 3] = 255
    return
  }
  const da = px[i + 3] / 255
  const oa = a + da * (1 - a)
  if (oa <= 0) return
  px[i] = (c[0] * a + px[i] * da * (1 - a)) / oa
  px[i + 1] = (c[1] * a + px[i + 1] * da * (1 - a)) / oa
  px[i + 2] = (c[2] * a + px[i + 2] * da * (1 - a)) / oa
  px[i + 3] = oa * 255
}

// 레이어 그리기용 임시 버퍼 (재사용)
const letters = new Uint8Array(W * H)
const srcs: (string | null)[] = new Array(W * H).fill(null)

function drawLayer(px: Uint8ClampedArray, layer: Layer, main: string, ctx: Ctx, mirror: boolean): void {
  letters.fill(0)
  const touched: number[] = []
  for (const piece of layer.pieces) stamp(piece, layer, main, ctx, mirror, touched)
  const skin = shadesOf(ctx.cfg.skin)
  const colors: (RGBA | null)[] = new Array(touched.length)
  for (let t = 0; t < touched.length; t++) {
    const idx = touched[t]
    const ch = String.fromCharCode(letters[idx])
    const sh = shadesOf(srcs[idx] ?? main)
    colors[t] = layer.outline && OUTLINABLE.has(ch) && isEdge(idx) ? sh.o : colorOf(ch, sh, skin)
  }
  for (let t = 0; t < touched.length; t++) {
    const c = colors[t]
    if (c) blend(px, touched[t] * 4, c)
  }
}

function isEdge(idx: number): boolean {
  const x = idx % W
  const y = (idx / W) | 0
  if (x === 0 || x === W - 1 || y === 0 || y === H - 1) return true
  return !letters[idx - 1] || !letters[idx + 1] || !letters[idx - W] || !letters[idx + W]
}

function stamp(piece: Piece, layer: Layer, main: string, ctx: Ctx, mirror: boolean, touched: number[]): void {
  const attach: Attach = piece.attach ?? 'body'
  const dy = attach === 'face' ? ctx.off.body : ctx.off[attach]
  const dx = attach === 'face' ? ctx.faceDx : 0
  const hex = srcHex(piece.src ?? layer.src, ctx.cfg, main)
  for (let r = 0; r < piece.rows.length; r++) {
    const row = piece.rows[r]
    const Y = piece.y + r + dy
    if (Y < 0 || Y >= H) continue
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]
      if (ch === '.') continue
      const X = (mirror ? W - 1 - x : x) + dx
      if (X < 0 || X >= W) continue
      const idx = Y * W + X
      if (!letters[idx]) touched.push(idx)
      letters[idx] = ch.charCodeAt(0)
      srcs[idx] = hex
    }
  }
}

interface QueuedLayer {
  layer: Layer
  main: string
  mirror: boolean
  order: number
}

function collect(cfg: MinimiConfig, frame: MinimiFrame, dir: MinimiDir): QueuedLayer[] {
  const q: QueuedLayer[] = []
  const right = dir === 'right'
  const push = (layers: Layer[], main: string, asym = false): void => {
    for (const layer of layers) q.push({ layer, main, mirror: right && asym, order: q.length })
  }
  const hair = byId(HAIRS, cfg.hair)
  const top = byId(TOPS, cfg.top)
  const eyes = byId(EYES, cfg.eyes)
  const mouth = byId(MOUTHS, cfg.mouth)

  // 몸
  push([{ z: Z.legs, src: 'skin', outline: true, pieces: LEGS }], cfg.skin)
  push([{ z: Z.torso, src: 'skin', outline: true, pieces: [TORSO] }], cfg.skin)
  push([{ z: Z.arms, src: 'skin', outline: true, pieces: ARMS }], cfg.skin)
  push([{ z: Z.head, src: 'skin', outline: true, pieces: hair.ears ? [HEAD, EARS] : [HEAD] }], cfg.skin)

  // 얼굴
  if (cfg.blush) push([{ z: Z.blush, src: 'skin', outline: false, pieces: [{ ...BLUSH, attach: 'face' }] }], cfg.skin)
  const eyePiece = frame === 'blink' ? eyes.closed : eyes.open
  push([{ z: Z.eyes, src: 'skin', outline: false, pieces: [{ ...eyePiece, attach: 'face' }] }], cfg.skin, eyes.asym)
  push([{ z: Z.mouth, src: 'skin', outline: false, pieces: [{ ...mouth.piece, attach: 'face' }] }], cfg.skin, mouth.asym)

  // 옷
  push(hair.layers, cfg.hairColor, hair.asym)
  push(top.layers, cfg.topColor, top.asym)
  if (!top.hidesBottom) {
    const bottom = byId(BOTTOMS, cfg.bottom)
    push(bottom.layers, cfg.bottomColor, bottom.asym)
  }
  const shoes = byId(SHOES, cfg.shoes)
  push(shoes.layers, cfg.shoesColor, shoes.asym)
  const acc = byId(ACCS, cfg.acc)
  push(acc.layers, cfg.accColor, acc.asym)

  q.sort((a, b) => a.layer.z - b.layer.z || a.order - b.order)
  return q
}

/** 원시 RGBA 픽셀 (W*H*4) */
export function composeMinimi(cfg: MinimiConfig, frame: MinimiFrame = 'idle', dir: MinimiDir = 'front', withDots = true): Uint8ClampedArray {
  const px = new Uint8ClampedArray(W * H * 4)
  const off = FRAME_OFFSETS[frame] ?? FRAME_OFFSETS.idle
  const ctx: Ctx = { cfg, off, faceDx: dir === 'left' ? -1 : dir === 'right' ? 1 : 0, mirror: false }
  for (const { layer, main, mirror } of collect(cfg, frame, dir)) drawLayer(px, layer, main, ctx, mirror)
  if (withDots) drawDots(px, cfg.dots, off.body)
  return px
}

const dotRgb = DOT_PALETTE.map(hexToRgb)

function drawDots(px: Uint8ClampedArray, dots: string, dy: number): void {
  for (let i = 0; i < dots.length && i < W * H; i++) {
    const ch = dots[i]
    if (ch === '.') continue
    const k = DOT_CHARS.indexOf(ch)
    if (k < 0) continue
    const x = i % W
    const y = ((i / W) | 0) + dy
    if (y < 0 || y >= H) continue
    const j = (y * W + x) * 4
    const [r, g, b] = dotRgb[k]
    px[j] = r
    px[j + 1] = g
    px[j + 2] = b
    px[j + 3] = 255
  }
}

// ───────── 캔버스 캐시 (LRU) ─────────
const CACHE_MAX = 400
const cache = new Map<string, HTMLCanvasElement>()

export function minimiKey(cfg: MinimiConfig): string {
  return [
    cfg.skin,
    cfg.hair,
    cfg.hairColor,
    cfg.eyes,
    cfg.mouth,
    cfg.blush ? 1 : 0,
    cfg.top,
    cfg.topColor,
    cfg.bottom,
    cfg.bottomColor,
    cfg.shoes,
    cfg.shoesColor,
    cfg.acc,
    cfg.accColor,
    cfg.dots
  ].join('|')
}

/**
 * 32x40 캔버스. 같은 설정·프레임이면 캐시된 같은 캔버스를 돌려주므로 **그리기 전용**으로 쓸 것 (수정 금지).
 */
export function renderMinimi(cfg: MinimiConfig, frame: MinimiFrame = 'idle', dir: MinimiDir = 'front'): HTMLCanvasElement {
  const key = `${minimiKey(cfg)}#${frame}#${dir}`
  const hit = cache.get(key)
  if (hit) {
    cache.delete(key)
    cache.set(key, hit)
    return hit
  }
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const g = canvas.getContext('2d')!
  const img = g.createImageData(W, H)
  img.data.set(composeMinimi(cfg, frame, dir))
  g.putImageData(img, 0, 0)
  cache.set(key, canvas)
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  return canvas
}

/** 확대한 PNG data URL (불꽃 이미지·알림 등) */
export function minimiDataUrl(cfg: MinimiConfig, scale = 4, frame: MinimiFrame = 'idle', dir: MinimiDir = 'front'): string {
  const src = renderMinimi(cfg, frame, dir)
  const c = document.createElement('canvas')
  c.width = W * scale
  c.height = H * scale
  const g = c.getContext('2d')!
  g.imageSmoothingEnabled = false
  g.drawImage(src, 0, 0, c.width, c.height)
  return c.toDataURL('image/png')
}
