// 미니미 광장 맵: 바닥(하늘·언덕·울타리·잔디·포장길) + 깊이 정렬되는 소품 + 걸을 수 있는 영역
// 전부 코드로 그린 오리지널 도트 그림.
import { Pix, bayer, inEllipse, mix, rng, valueNoise } from './pixel'

export const WORLD_W = 420
export const WORLD_H = 280
/** 맵 바깥으로 이어 그리는 여백 (창 비율이 달라도 빈 공간 대신 풍경이 보이게) */
export const MARGIN_X = 200
export const MARGIN_Y = 140
export const MAP_W = WORLD_W
export const MAP_H = WORLD_H

/** 광장(포장) 중심 = 분수 중심 */
export const CX = 210
export const CY = 178
const PRX = 166
const PRY = 82
/** 캐릭터 발이 갈 수 있는 위쪽 한계 (울타리 앞) */
export const WALK_TOP = 78
const WALK_BOTTOM = WORLD_H - 6
const WALK_LEFT = 8
const WALK_RIGHT = WORLD_W - 8

const TOP_PATH = { x0: 197, x1: 223 }
const BOTTOM_PATH = { x0: 192, x1: 228 }
const SIDE_PATH = { y0: 167, y1: 189 }

export interface Prop {
  id: string
  frames: HTMLCanvasElement[]
  fps: number
  /** 캔버스 왼쪽 위의 월드 좌표 */
  x: number
  y: number
  /** 깊이 정렬 기준 y (이 값보다 발이 위에 있는 캐릭터는 소품 뒤로) */
  baseline: number
}

type Obstacle = { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number } | { kind: 'rect'; x: number; y: number; w: number; h: number }

// ───────────────────────── 팔레트 ─────────────────────────
const C = {
  sky: ['#62bdf0', '#74c7f3', '#88d1f6', '#9cdaf8', '#b0e3fa', '#c4ebfc', '#d6f2fd'],
  hillFar: '#b6e4a6',
  hillFarHi: '#cbeebd',
  hillNear: '#7fcb70',
  hillNearHi: '#97d986',
  hillNearDk: '#68b75e',
  hedge: '#4fa84a',
  hedgeHi: '#6cc262',
  hedgeHi2: '#8ad57a',
  hedgeDk: '#3e923e',
  hedgeOl: '#2f7434',
  fence: '#ffffff',
  fenceSh: '#dde5ee',
  fenceOl: '#8494a8',
  grass: ['#86ce62', '#92d76d', '#9edf79'],
  grassShadow: '#74bb55',
  tuftDk: '#6db64f',
  tuftLt: '#b6ea90',
  stone: ['#f4ead7', '#efe3cd', '#eadcc3', '#f7efe1'],
  grout: '#d6c4a4',
  curb: '#cdb78f',
  curbOl: '#a88f69',
  ring: ['#eab48d', '#e4a882', '#efbf9a'],
  ringGrout: '#c98f69',
  shadow: '#1b3a1d30'
}

// ───────────────────────── 포장 마스크 ─────────────────────────
function onPaving(x: number, y: number): boolean {
  if (inEllipse(x, y, CX, CY, PRX, PRY)) return true
  if (x >= TOP_PATH.x0 && x <= TOP_PATH.x1 && y >= 56 && y <= CY) return true
  if (x >= BOTTOM_PATH.x0 && x <= BOTTOM_PATH.x1 && y >= CY) return true
  if (y >= SIDE_PATH.y0 && y <= SIDE_PATH.y1) return true
  return false
}

// ───────────────────────── 하늘 ─────────────────────────
export function drawSky(): HTMLCanvasElement {
  const W = WORLD_W + MARGIN_X * 2
  const top = -MARGIN_Y
  const bottom = 48
  const H = bottom - top
  const p = new Pix(W, H)
  const n = C.sky.length
  for (let py = 0; py < H; py++) {
    const y = py + top
    // 위는 진한 파랑, 지평선 쪽은 밝게 (디더로 띠 사이를 섞는다)
    const t = Math.max(0, Math.min(1, (y - top) / (40 - top)))
    const f = t * (n - 1)
    const i = Math.floor(f)
    const frac = f - i
    for (let px = 0; px < W; px++) {
      const idx = frac > bayer(px, py) ? Math.min(n - 1, i + 1) : i
      p.set(px, py, C.sky[idx])
    }
  }
  return p.commit()
}

/** 떠다니는 구름 (몇 가지 모양) */
export function drawClouds(): HTMLCanvasElement[] {
  const shapes: [number, number, number][][] = [
    [
      [10, 10, 7],
      [20, 7, 9],
      [32, 10, 7],
      [40, 12, 5],
      [6, 13, 4]
    ],
    [
      [8, 8, 6],
      [17, 6, 7],
      [26, 9, 5]
    ],
    [
      [10, 12, 8],
      [22, 8, 10],
      [36, 9, 9],
      [48, 13, 6],
      [30, 14, 6]
    ]
  ]
  return shapes.map((clumps) => {
    const w = Math.max(...clumps.map(([x, , r]) => x + r)) + 2
    const h = Math.max(...clumps.map(([, y, r]) => y + r)) + 1
    const p = new Pix(w, h)
    const flatY = h - 3
    for (const [cx, cy, r] of clumps) {
      for (let y = Math.floor(cy - r); y <= cy + r; y++) {
        for (let x = Math.floor(cx - r); x <= cx + r; x++) {
          if (y > flatY) continue
          if (!inEllipse(x, y, cx, cy, r, r)) continue
          p.set(x, y, '#ffffff')
        }
      }
    }
    // 아랫부분 그늘
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!p.opaque(x, y)) continue
        if (!p.opaque(x, y + 2) || y >= flatY - 1) p.set(x, y, '#e2f2fd')
      }
    }
    return p.commit()
  })
}

// ───────────────────────── 바닥 (언덕·울타리·잔디·길) ─────────────────────────
export function drawGround(): HTMLCanvasElement {
  getProps() // 소품 그림자 목록이 필요
  const W = WORLD_W + MARGIN_X * 2
  const H = WORLD_H + MARGIN_Y * 2
  const p = new Pix(W, H)
  const ox = MARGIN_X
  const oy = MARGIN_Y
  const S = (x: number, y: number, c: string): void => p.set(x + ox, y + oy, c)
  const X0 = -MARGIN_X
  const X1 = WORLD_W + MARGIN_X

  // 먼 언덕
  for (let x = X0; x < X1; x++) {
    const top = Math.round(27 - 5 * Math.sin(x * 0.021 + 0.6) - 3 * Math.sin(x * 0.057 + 2.1))
    for (let y = top; y < 50; y++) S(x, y, y < top + 2 ? C.hillFarHi : C.hillFar)
  }
  // 가까운 나무 줄
  const r = rng(7)
  for (let x = X0 - 10; x < X1 + 10; x += 9 + Math.floor(r() * 5)) {
    const rad = 7 + Math.floor(r() * 4)
    const cy = 41 - Math.floor(r() * 3)
    for (let y = cy - rad; y <= 50; y++) {
      for (let xx = x - rad; xx <= x + rad; xx++) {
        if (y < cy && !inEllipse(xx, y, x, cy, rad, rad)) continue
        const light = (xx - x) / rad < -0.2 && y < cy - rad * 0.3
        S(xx, y, light ? C.hillNearHi : C.hillNear)
      }
    }
  }
  for (let x = X0; x < X1; x++) {
    for (let y = 30; y < 50; y++) {
      // 나무 줄 아래쪽 어두운 띠
      if (y >= 46 && p.opaque(x + ox, y + oy)) S(x, y, C.hillNearDk)
    }
  }

  // 덤불 울타리 (hedge)
  const hedgeTop = new Map<number, number>()
  for (let x = X0 - 10; x < X1 + 10; x += 8) {
    const cy = 49
    const rad = 7
    for (let y = cy - rad; y <= 58; y++) {
      for (let xx = x - rad; xx <= x + rad; xx++) {
        if (y < cy && !inEllipse(xx, y, x, cy, rad + 0.5, rad)) continue
        const nx = (xx - x) / rad
        const ny = (y - cy) / rad
        const l = -(nx * 0.6 + ny * 0.8)
        let c = C.hedge
        if (l > 0.55) c = C.hedgeHi2
        else if (l > 0.15) c = C.hedgeHi
        else if (y > 54) c = C.hedgeDk
        S(xx, y, c)
        hedgeTop.set(xx, Math.min(hedgeTop.get(xx) ?? 99, y))
      }
    }
  }
  // 덤불 위쪽 외곽선
  for (const [x, top] of hedgeTop) S(x, top - 1, C.hedgeOl)

  // 잔디
  const n1 = valueNoise(11, 30)
  const n2 = valueNoise(23, 9)
  for (let y = 57; y < WORLD_H + MARGIN_Y; y++) {
    for (let x = X0; x < X1; x++) {
      const v = 0.7 * n1(x, y) + 0.3 * n2(x, y) + (bayer(x, y) - 0.5) * 0.09
      const c = v < 0.37 ? C.grass[0] : v > 0.63 ? C.grass[2] : C.grass[1]
      S(x, y, c)
    }
  }
  // 덤불 아래 그림자
  for (let x = X0; x < X1; x++) {
    S(x, 57, C.hedgeDk)
    S(x, 58, C.grassShadow)
    if ((x & 1) === 0) S(x, 59, C.grassShadow)
  }

  // 흰 울타리 + 입구 장미 아치
  drawFence(S, X0, X1)
  drawArch(S)

  // 포장길
  drawPaving(p, ox, oy, X0, X1)

  // 잔디 장식 (풀포기·꽃) — 포장 위는 피한다
  const rr = rng(99)
  const area = (X1 - X0) * (WORLD_H + MARGIN_Y - 64)
  for (let i = 0; i < area / 150; i++) {
    const x = Math.floor(X0 + rr() * (X1 - X0))
    const y = Math.floor(66 + rr() * (WORLD_H + MARGIN_Y - 70))
    if (nearPaving(x, y, 3)) continue
    const k = rr()
    if (k < 0.55) {
      // 풀포기 v
      const c = rr() < 0.7 ? C.tuftDk : C.tuftLt
      S(x, y, c)
      S(x + 2, y, c)
      S(x + 1, y + 1, c)
    } else if (k < 0.72) {
      // 작은 꽃
      const petals = ['#ffffff', '#ffd1e3', '#fff3a6', '#e3d4ff'][Math.floor(rr() * 4)]
      S(x + 1, y, petals)
      S(x, y + 1, petals)
      S(x + 2, y + 1, petals)
      S(x + 1, y + 2, petals)
      S(x + 1, y + 1, petals === '#fff3a6' ? '#ff9d4d' : '#ffcf3d')
      S(x + 1, y + 3, C.tuftDk)
    } else if (k < 0.8) {
      // 점 꽃
      S(x, y, ['#ff8fb6', '#ffffff', '#ffe066'][Math.floor(rr() * 3)])
    } else if (k < 0.86) {
      // 클로버
      S(x, y, C.tuftDk)
      S(x + 1, y, C.tuftDk)
      S(x, y + 1, C.tuftDk)
      S(x + 1, y + 1, '#5fa846')
    }
  }

  // 맵 바깥 장식 나무 (여백에만, 움직이는 영역 밖)
  const deco = [
    { x: -52, y: 118, k: 'green' as const },
    { x: -120, y: 200, k: 'apple' as const },
    { x: -70, y: 300, k: 'green' as const },
    { x: -160, y: 120, k: 'blossom' as const },
    { x: 468, y: 124, k: 'green' as const },
    { x: 540, y: 210, k: 'blossom' as const },
    { x: 480, y: 310, k: 'apple' as const },
    { x: 590, y: 120, k: 'green' as const },
    { x: 60, y: 330, k: 'green' as const },
    { x: 140, y: 360, k: 'blossom' as const },
    { x: 300, y: 340, k: 'green' as const },
    { x: 370, y: 372, k: 'apple' as const }
  ]
  for (const d of deco) {
    const t = drawTree(d.k, d.x * 7 + d.y)
    shadowEllipse(p, d.x + ox, d.y + oy + 1, 17, 5)
    p.blit(t.pix, d.x - t.baseX + ox, d.y - t.baseY + oy)
  }

  // 소품 그림자
  for (const s of propShadows) shadowEllipse(p, s[0] + ox, s[1] + oy, s[2], s[3])

  return p.commit()
}

function shadowEllipse(p: Pix, cx: number, cy: number, rx: number, ry: number): void {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      if (inEllipse(x, y, cx, cy, rx, ry)) p.set(x, y, C.shadow)
    }
  }
}

function drawFence(S: (x: number, y: number, c: string) => void, X0: number, X1: number): void {
  const railY = [54, 60]
  const gate0 = TOP_PATH.x0 - 6
  const gate1 = TOP_PATH.x1 + 6
  // 가로대
  for (let x = X0; x < X1; x++) {
    if (x > gate0 && x < gate1) continue
    for (const ry of railY) {
      S(x, ry - 1, C.fenceOl)
      S(x, ry, C.fence)
      S(x, ry + 1, C.fenceSh)
      S(x, ry + 2, C.fenceOl)
    }
  }
  // 말뚝
  for (let x = X0 + ((X0 % 8) + 8) % 8; x < X1; x += 8) {
    if (x > gate0 - 3 && x < gate1) continue
    postAt(S, x, 47, 66)
  }
  // 문 기둥 (조금 더 크고 꼭지에 구슬)
  for (const gx of [gate0 - 2, gate1 - 2]) {
    for (let y = 44; y <= 67; y++) {
      for (let x = gx; x < gx + 5; x++) {
        const edge = x === gx || x === gx + 4 || y === 67
        S(x, y, edge ? C.fenceOl : x === gx + 3 ? C.fenceSh : C.fence)
      }
    }
    // 구슬
    S(gx + 1, 41, C.fenceOl)
    S(gx + 2, 41, C.fenceOl)
    S(gx + 3, 41, C.fenceOl)
    S(gx, 42, C.fenceOl)
    S(gx + 4, 42, C.fenceOl)
    S(gx + 1, 42, '#ffd86b')
    S(gx + 2, 42, '#fff4c2')
    S(gx + 3, 42, '#ffd86b')
    S(gx, 43, C.fenceOl)
    S(gx + 4, 43, C.fenceOl)
    S(gx + 1, 43, '#ffc94a')
    S(gx + 2, 43, '#ffd86b')
    S(gx + 3, 43, '#f2b02e')
    S(gx + 1, 44, C.fenceOl)
    S(gx + 2, 44, C.fenceOl)
    S(gx + 3, 44, C.fenceOl)
  }
}

function drawArch(S: (x: number, y: number, c: string) => void): void {
  const cx = (TOP_PATH.x0 + TOP_PATH.x1) / 2 + 0.5
  const cy = 48
  const rx = 21
  const ry = 21
  const th = 5.5
  const r = rng(5)
  const band = new Set<string>()
  const pts: [number, number][] = []
  const add = (x: number, y: number): void => {
    const k = x + ',' + y
    if (band.has(k)) return
    band.add(k)
    pts.push([x, y])
  }
  for (let y = cy - ry - 2; y <= cy; y++) {
    for (let x = Math.floor(cx - rx - 3); x <= cx + rx + 3; x++) {
      const d = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry)
      const inner = Math.hypot((x + 0.5 - cx) / (rx - th), (y + 0.5 - cy) / (ry - th))
      if (d <= 1 && inner >= 1) add(x, y)
    }
  }
  // 기둥에 감긴 잎 몇 덩이
  const postL = TOP_PATH.x0 - 8
  const postR = TOP_PATH.x1 + 4
  for (const px of [postL, postR]) {
    for (const [lx, ly] of [
      [0, 3],
      [3, 6],
      [-1, 10],
      [2, 14]
    ]) {
      add(px + lx, cy + ly)
      add(px + lx + 1, cy + ly)
      add(px + lx, cy + ly + 1)
    }
  }
  for (const [x, y] of pts) {
    const dx = (x + 0.5 - cx) / rx
    const dy = (y + 0.5 - cy) / ry
    const l = -(dx * 0.35 + dy * 0.95)
    const n = (x * 13 + y * 7) % 9
    S(x, y, l > 0.8 && n < 5 ? '#8ad57a' : l > 0.45 ? (n < 2 ? '#4fa84a' : '#6cc262') : n < 2 ? '#3e923e' : '#4fa84a')
  }
  // 외곽선
  for (const [x, y] of pts) {
    for (const [ddx, ddy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ]) {
      if (!band.has(x + ddx + ',' + (y + ddy))) S(x + ddx, y + ddy, C.hedgeOl)
    }
  }
  // 장미
  const roses = ['#ff6f9a', '#ff9cc0', '#ffffff', '#ff4f6d', '#ff6f9a']
  let placed = 0
  for (let i = 0; i < 400 && placed < 22; i++) {
    const [x, y] = pts[Math.floor(r() * pts.length)]
    if (y > cy) continue
    if (!band.has(x + 1 + ',' + y) || !band.has(x + ',' + (y + 1)) || !band.has(x + 1 + ',' + (y + 1))) continue
    const c = roses[Math.floor(r() * roses.length)]
    S(x, y, c)
    S(x + 1, y, c)
    S(x, y + 1, c)
    S(x + 1, y + 1, c === '#ffffff' ? '#ffd1e3' : '#d93a63')
    placed++
  }
}

function postAt(S: (x: number, y: number, c: string) => void, x: number, top: number, bottom: number): void {
  // 뾰족한 꼭대기
  S(x + 1, top - 1, C.fenceOl)
  S(x + 2, top - 1, C.fenceOl)
  S(x, top, C.fenceOl)
  S(x + 1, top, C.fence)
  S(x + 2, top, C.fence)
  S(x + 3, top, C.fenceOl)
  for (let y = top + 1; y <= bottom; y++) {
    S(x - 1, y, C.fenceOl)
    S(x, y, C.fence)
    S(x + 1, y, C.fence)
    S(x + 2, y, C.fence)
    S(x + 3, y, C.fenceSh)
    S(x + 4, y, C.fenceOl)
  }
  for (let xx = x - 1; xx <= x + 4; xx++) S(xx, bottom + 1, C.fenceOl)
}

function nearPaving(x: number, y: number, d: number): boolean {
  for (let yy = y - d; yy <= y + d; yy += d) for (let xx = x - d; xx <= x + d; xx += d) if (onPaving(xx, yy)) return true
  return false
}

function drawPaving(p: Pix, ox: number, oy: number, X0: number, X1: number): void {
  const S = (x: number, y: number, c: string): void => p.set(x + ox, y + oy, c)
  const hash = (a: number, b: number): number => {
    let h = (a * 374761393 + b * 668265263) | 0
    h = (h ^ (h >>> 13)) * 1274126177
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296
  }
  const Y0 = 56
  const Y1 = WORLD_H + MARGIN_Y
  const isEdge = (x: number, y: number): boolean =>
    !onPaving(x - 1, y) || !onPaving(x + 1, y) || !onPaving(x, y - 1) || !onPaving(x, y + 1)
  const RING_OUT = { rx: 60, ry: 28 }
  const RING_IN = { rx: 53, ry: 24 }
  for (let y = Y0; y < Y1; y++) {
    for (let x = X0; x < X1; x++) {
      if (!onPaving(x, y)) {
        // 포장 아래쪽 가장자리 밑 잔디 그림자
        if (onPaving(x, y - 1) && y > 62) S(x, y, C.grassShadow)
        continue
      }
      if (isEdge(x, y)) {
        S(x, y, C.curbOl)
        continue
      }
      if (isEdge(x - 1, y) || isEdge(x + 1, y) || isEdge(x, y - 1) || isEdge(x, y + 1)) {
        S(x, y, C.curb)
        continue
      }
      // 분수 둘레 테라코타 원
      const inOut = inEllipse(x, y, CX, CY, RING_OUT.rx, RING_OUT.ry)
      const inIn = inEllipse(x, y, CX, CY, RING_IN.rx, RING_IN.ry)
      if (inOut && !inIn) {
        const ang = Math.atan2((y + 0.5 - CY) / RING_OUT.ry, (x + 0.5 - CX) / RING_OUT.rx)
        const seg = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 36)
        const segF = ((ang + Math.PI) / (Math.PI * 2)) * 36 - seg
        if (segF < 0.12) S(x, y, C.ringGrout)
        else S(x, y, C.ring[seg % 3])
        continue
      }
      if (inOut !== inEllipse(x, y + 1, CX, CY, RING_OUT.rx, RING_OUT.ry) || inIn !== inEllipse(x, y - 1, CX, CY, RING_IN.rx, RING_IN.ry)) {
        S(x, y, C.ringGrout)
        continue
      }
      // 벽돌 무늬 돌
      const row = Math.floor(y / 5)
      const off = (row & 1) * 5
      const col = Math.floor((x + off) / 10)
      const sx = (((x + off) % 10) + 10) % 10
      const sy = ((y % 5) + 5) % 5
      if (sx === 0 || sy === 0) {
        S(x, y, C.grout)
        continue
      }
      const base = C.stone[Math.floor(hash(row, col) * C.stone.length)]
      if (sy === 4) S(x, y, mix(base, C.grout, 0.35))
      else if (sy === 1 && sx === 1) S(x, y, '#fbf6ec')
      else S(x, y, base)
    }
  }
}

// ───────────────────────── 소품 ─────────────────────────
type TreeKind = 'green' | 'blossom' | 'apple'
const TREE_PAL: Record<TreeKind, { hi: string; lt: string; base: string; sh: string; dk: string; ol: string }> = {
  green: { hi: '#a9ea8a', lt: '#82d667', base: '#5cbf4f', sh: '#47a744', dk: '#368c3a', ol: '#2a6c31' },
  apple: { hi: '#a9ea8a', lt: '#82d667', base: '#5cbf4f', sh: '#47a744', dk: '#368c3a', ol: '#2a6c31' },
  blossom: { hi: '#ffeef4', lt: '#ffd3e3', base: '#ffb5cf', sh: '#f799bb', dk: '#e57ea6', ol: '#b0577e' }
}

export function drawTree(kind: TreeKind, seed: number): { pix: Pix; baseX: number; baseY: number } {
  const W = 54
  const H = 62
  const p = new Pix(W, H)
  const pal = TREE_PAL[kind]
  const bx = 27
  const by = 59
  // 줄기
  for (let y = 36; y <= by; y++) {
    const flare = y >= by - 2 ? 2 : y >= by - 4 ? 1 : 0
    for (let x = bx - 4 - flare; x <= bx + 3 + flare; x++) {
      const rel = x - (bx - 4 - flare)
      const width = 8 + flare * 2
      const c = rel < 2 ? '#c38d5d' : rel >= width - 2 ? '#80532e' : '#a7714a'
      p.set(x, y, c)
    }
  }
  const r = rng(seed)
  for (let i = 0; i < 4; i++) {
    const x = bx - 2 + Math.floor(r() * 4)
    const y = 42 + Math.floor(r() * 12)
    p.set(x, y, '#80532e')
    p.set(x, y + 1, '#80532e')
  }
  // 수관 (덩어리들을 뒤에서 앞으로)
  const clumps: [number, number, number][] = [
    [27, 11, 9],
    [17, 16, 9],
    [37, 16, 9],
    [27, 22, 13],
    [14, 28, 10],
    [40, 28, 10],
    [27, 33, 11]
  ]
  clumps.sort((a, b) => a[1] - b[1])
  for (const [cx, cy, rad] of clumps) {
    for (let y = cy - rad - 1; y <= cy + rad + 1; y++) {
      for (let x = cx - rad - 1; x <= cx + rad + 1; x++) {
        if (!inEllipse(x, y, cx, cy, rad, rad * 0.92)) continue
        const nx = (x + 0.5 - cx) / rad
        const ny = (y + 0.5 - cy) / rad
        const d = Math.sqrt(nx * nx + ny * ny)
        const l = -(nx * 0.55 + ny * 0.83)
        const t = bayer(x, y) * 0.18
        let c = pal.base
        if (d > 0.84 && l < 0.15) c = pal.dk
        else if (l + t > 0.62 && d < 0.75) c = pal.hi
        else if (l + t > 0.28) c = pal.lt
        else if (l - t < -0.42) c = pal.sh
        p.set(x, y, c)
      }
    }
  }
  if (kind === 'apple') {
    for (let i = 0; i < 7; i++) {
      const a = r() * Math.PI * 2
      const d = 6 + r() * 12
      const x = Math.round(27 + Math.cos(a) * d * 1.1)
      const y = Math.round(24 + Math.sin(a) * d * 0.8)
      p.set(x, y, '#ff5f5f')
      p.set(x + 1, y, '#e23d4b')
      p.set(x, y + 1, '#e23d4b')
      p.set(x + 1, y + 1, '#c22a3d')
      p.set(x, y - 1, '#6b3f1f')
    }
  }
  if (kind === 'blossom') {
    for (let i = 0; i < 26; i++) {
      const x = Math.floor(6 + r() * 42)
      const y = Math.floor(4 + r() * 38)
      if (p.opaque(x, y)) p.set(x, y, r() < 0.5 ? '#ffffff' : '#ff8fb8')
    }
  }
  p.outline(pal.ol)
  return { pix: p, baseX: bx, baseY: by + 1 }
}

function drawBush(seed: number): Pix {
  const p = new Pix(26, 18)
  const pal = TREE_PAL.green
  const clumps: [number, number, number][] = [
    [8, 10, 6],
    [17, 9, 7],
    [13, 12, 6]
  ]
  void seed
  for (const [cx, cy, rad] of clumps) {
    for (let y = cy - rad; y <= cy + rad; y++) {
      for (let x = cx - rad; x <= cx + rad; x++) {
        if (y > 16 || !inEllipse(x, y, cx, cy, rad, rad * 0.9)) continue
        const nx = (x + 0.5 - cx) / rad
        const ny = (y + 0.5 - cy) / rad
        const l = -(nx * 0.55 + ny * 0.83)
        const d = Math.sqrt(nx * nx + ny * ny)
        let c = pal.base
        if (d > 0.8 && l < 0.1) c = pal.dk
        else if (l > 0.55 && d < 0.75) c = pal.hi
        else if (l > 0.2) c = pal.lt
        p.set(x, y, c)
      }
    }
  }
  // 작은 꽃
  p.set(9, 7, '#ffffff')
  p.set(18, 6, '#ff9cc2')
  p.set(14, 11, '#ffe066')
  p.outline(pal.ol)
  return p
}

function drawBench(): Pix {
  const p = new Pix(34, 22)
  const wood = '#dc9d60'
  const woodLt = '#f2bf84'
  const woodDk = '#ab6f3b'
  const metal = '#5b6475'
  // 등받이 기둥
  for (const x of [4, 28]) {
    for (let y = 1; y <= 20; y++) {
      p.set(x, y, metal)
      p.set(x + 1, y, '#465061')
    }
  }
  // 등받이 판자 2개
  for (const y0 of [2, 7]) {
    p.hline(1, 32, y0, woodLt)
    p.hline(1, 32, y0 + 1, wood)
    p.hline(1, 32, y0 + 2, wood)
    p.hline(1, 32, y0 + 3, woodDk)
  }
  // 앉는 판
  p.hline(0, 33, 13, woodLt)
  p.hline(0, 33, 14, wood)
  p.hline(0, 33, 15, wood)
  p.hline(0, 33, 16, woodDk)
  p.hline(1, 32, 17, '#8a5530')
  // 나뭇결
  for (const [x, y] of [
    [8, 3],
    [20, 8],
    [14, 14],
    [26, 3],
    [24, 15]
  ]) {
    p.set(x, y, woodDk)
    p.set(x + 1, y, woodDk)
  }
  p.outline('#6a3f1f')
  return p
}

function drawLamp(): Pix {
  const p = new Pix(14, 46)
  const post = '#566173'
  const postLt = '#7c889b'
  const frame = '#3a4252'
  // 받침
  p.rect(3, 41, 8, 3, post)
  p.hline(4, 9, 41, postLt)
  p.rect(4, 39, 6, 2, post)
  // 기둥
  for (let y = 14; y <= 38; y++) {
    p.set(6, y, postLt)
    p.set(7, y, post)
  }
  p.rect(5, 26, 4, 1, frame)
  // 등
  p.rect(5, 13, 4, 1, frame)
  p.set(6, 0, frame)
  p.set(7, 0, frame)
  p.hline(5, 8, 1, frame)
  p.hline(4, 9, 2, frame)
  p.hline(3, 10, 3, frame)
  for (let y = 4; y <= 11; y++) {
    for (let x = 3; x <= 10; x++) {
      const edge = x === 3 || x === 10
      const mid = x === 6 || x === 7
      p.set(x, y, edge ? frame : mid && y > 5 && y < 10 ? '#fff9d6' : y < 6 ? '#ffe98a' : '#fff2a8')
    }
  }
  p.hline(3, 10, 12, frame)
  p.outline('#2a303c')
  return p
}

function drawSign(): Pix {
  const W = 80
  const p = new Pix(W, 32)
  const wood = '#e2aa6a'
  const woodLt = '#f4c98f'
  const woodDk = '#b77d45'
  const ink = '#6a3a18'
  // 기둥
  for (const x of [14, W - 17]) {
    for (let y = 16; y <= 30; y++) {
      p.set(x, y, '#c08548')
      p.set(x + 1, y, '#a46d38')
      p.set(x + 2, y, '#8a5a2c')
    }
  }
  // 판
  for (let y = 2; y <= 20; y++) {
    for (let x = 1; x <= W - 2; x++) {
      const corner = (y === 2 || y === 20) && (x === 1 || x === W - 2)
      if (corner) continue
      let c = wood
      if (y <= 3) c = woodLt
      else if (y >= 19) c = woodDk
      p.set(x, y, c)
    }
  }
  // 나뭇결
  for (const [x, y, w] of [
    [5, 17, 5],
    [60, 16, 6],
    [36, 18, 4],
    [68, 5, 3]
  ]) {
    p.hline(x, x + w, y, '#d39a5b')
  }
  // 글자: Galmuri9 를 임계값으로 잘라 도트로
  const t = document.createElement('canvas')
  t.width = W
  t.height = 16
  const g = t.getContext('2d')!
  g.font = '10px Galmuri9'
  g.textBaseline = 'top'
  const label = '미니미 광장'
  const tw = Math.round(g.measureText(label).width)
  g.fillStyle = '#000'
  g.fillText(label, Math.round((W - tw) / 2), 2)
  const a = g.getImageData(0, 0, W, 16).data
  const on = (x: number, y: number): boolean => y >= 0 && y < 16 && a[(y * W + x) * 4 + 3] > 110
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < W; x++) {
      if (!on(x, y)) continue
      p.set(x, y + 3, ink)
      if (!on(x, y + 1) && y + 4 < 19) p.set(x, y + 4, '#f8d9a8')
    }
  }
  // 양 끝 작은 하트
  for (const hx of [5, W - 9]) {
    p.set(hx, 9, '#ff6fa3')
    p.set(hx + 2, 9, '#ff6fa3')
    p.hline(hx, hx + 2, 10, '#ff6fa3')
    p.set(hx + 1, 11, '#ff6fa3')
    p.set(hx, 9, '#ff9cc2')
  }
  p.outline('#6e4322')
  return p
}

function drawFlowerBed(seed: number): Pix {
  const W = 48
  const H = 26
  const p = new Pix(W, H)
  const cx = 24
  const cy = 15
  const r = rng(seed)
  // 테두리 돌
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!inEllipse(x, y, cx, cy, 22, 9)) continue
      const inner = inEllipse(x, y, cx, cy, 19, 7)
      if (!inner) {
        const seg = Math.floor(Math.atan2(y - cy, (x - cx) * 0.45) * 4)
        p.set(x, y, seg % 2 === 0 ? '#dfe3ea' : '#cdd2db')
        if (y > cy + 5) p.set(x, y, seg % 2 === 0 ? '#c6ccd6' : '#b7bfcb')
      } else {
        p.set(x, y, (x + y) % 7 === 0 ? '#7f5434' : '#9a6a43')
      }
    }
  }
  // 꽃
  const colors = ['#ff7fa8', '#ffd24d', '#ffffff', '#c58cff', '#ff9a4d', '#ff5f7a']
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2
    const d = Math.sqrt(r())
    const x = Math.round(cx + Math.cos(a) * d * 16)
    const y = Math.round(cy + Math.sin(a) * d * 5)
    const c = colors[Math.floor(r() * colors.length)]
    p.set(x, y + 1, '#3e9b45')
    p.set(x - 1, y, '#4caf50')
    p.set(x + 1, y + 1, '#4caf50')
    p.set(x, y - 1, c)
    p.set(x - 1, y - 2, c)
    p.set(x + 1, y - 2, c)
    p.set(x, y - 3, c)
    p.set(x, y - 2, c === '#ffd24d' ? '#ff9a4d' : '#ffe066')
  }
  p.outline('#7d8696')
  return p
}

/** 분수 (애니메이션 프레임 4장) */
function drawFountainFrames(): { frames: HTMLCanvasElement[]; w: number; h: number; cx: number; cy: number } {
  const W = 90
  const H = 72
  const cx = 45
  const cy = 52
  const rxO = 39
  const ryO = 15
  const rxI = 33
  const ryI = 11
  const frames: HTMLCanvasElement[] = []
  const stoneLt = '#eef2f7'
  const stone = '#dfe4ec'
  const stoneSh = '#c3cad7'
  const wall = '#b8c0ce'
  const wallDk = '#9ea7b8'
  const wallBot = '#8b95a8'
  const water = '#5ec4f0'
  const waterDk = '#45ade4'
  const waterLt = '#8fdcff'
  const spray = '#e3f8ff'
  for (let f = 0; f < 4; f++) {
    const p = new Pix(W, H)
    // 앞쪽 벽
    for (let x = cx - rxO; x <= cx + rxO; x++) {
      const dx = (x + 0.5 - cx) / rxO
      if (Math.abs(dx) > 1) continue
      const yEdge = Math.floor(cy + ryO * Math.sqrt(1 - dx * dx))
      for (let y = cy; y <= yEdge + 7; y++) {
        if (y < yEdge - 1) continue
        const ly = y - yEdge
        let c = ly >= 6 ? wallBot : ly === 3 ? wallDk : wall
        if (ly !== 3 && ly < 6 && ((x + (ly > 3 ? 4 : 0)) % 8 === 0)) c = wallDk
        if (dx < -0.6 && ly < 6 && ly !== 3) c = mix(c, '#ffffff', 0.25)
        if (dx > 0.6 && ly < 6) c = mix(c, '#7d879a', 0.2)
        p.set(x, y, c)
      }
    }
    // 테두리 윗면
    for (let y = cy - ryO - 1; y <= cy + ryO + 1; y++) {
      for (let x = cx - rxO - 1; x <= cx + rxO + 1; x++) {
        if (!inEllipse(x, y, cx, cy, rxO, ryO)) continue
        if (inEllipse(x, y, cx, cy, rxI, ryI)) continue
        p.set(x, y, y < cy - 2 ? stone : y > cy + 4 ? stoneLt : mix(stone, stoneLt, 0.5))
      }
    }
    // 안쪽: 뒷벽 그늘 + 물
    for (let y = cy - ryI - 1; y <= cy + ryI + 1; y++) {
      for (let x = cx - rxI - 1; x <= cx + rxI + 1; x++) {
        if (!inEllipse(x, y, cx, cy, rxI, ryI)) continue
        const wet = inEllipse(x, y - 3, cx, cy, rxI, ryI)
        if (!wet) p.set(x, y, stoneSh)
        else p.set(x, y, inEllipse(x, y - 5, cx, cy, rxI, ryI) ? water : waterDk)
      }
    }
    // 물결 (동심원이 퍼진다)
    for (let k = 0; k < 3; k++) {
      const rr = 7 + ((f * 3 + k * 9) % 27)
      const ry = rr * 0.36
      for (let a = 0; a < Math.PI * 2; a += 0.04) {
        const x = Math.round(cx + Math.cos(a) * rr)
        const y = Math.round(cy + 1 + Math.sin(a) * ry)
        if (inEllipse(x, y - 4, cx, cy, rxI, ryI) && inEllipse(x, y, cx, cy, rxI, ryI)) p.set(x, y, waterLt)
      }
    }
    // 반짝임
    const sr = rng(100 + f)
    for (let i = 0; i < 6; i++) {
      const x = Math.round(cx - 26 + sr() * 52)
      const y = Math.round(cy - 4 + sr() * 12)
      if (inEllipse(x, y - 4, cx, cy, rxI, ryI) && inEllipse(x, y, cx, cy, rxI, ryI)) p.set(x, y, '#ffffff')
    }
    // 기둥
    for (let y = cy - 28; y <= cy + 1; y++) {
      for (let x = cx - 3; x <= cx + 2; x++) {
        const c = x <= cx - 2 ? stoneLt : x >= cx + 1 ? stoneSh : stone
        p.set(x, y, c)
      }
    }
    p.hline(cx - 4, cx + 3, cy - 14, wall)
    p.hline(cx - 4, cx + 3, cy - 13, wallDk)
    p.hline(cx - 4, cx + 3, cy, wall)
    // 윗 그릇
    const bcy = cy - 30
    for (let x = cx - 14; x <= cx + 14; x++) {
      const dx = (x + 0.5 - cx) / 14
      if (Math.abs(dx) > 1) continue
      const yEdge = Math.floor(bcy + 4.5 * Math.sqrt(1 - dx * dx))
      for (let y = yEdge - 1; y <= yEdge + 3; y++) p.set(x, y, y >= yEdge + 2 ? wallDk : wall)
    }
    for (let y = bcy - 6; y <= bcy + 6; y++) {
      for (let x = cx - 15; x <= cx + 15; x++) {
        if (!inEllipse(x, y, cx, bcy, 14, 4.5)) continue
        if (inEllipse(x, y, cx, bcy, 11, 3)) p.set(x, y, inEllipse(x, y - 1, cx, bcy, 11, 3) ? water : waterDk)
        else p.set(x, y, y < bcy ? stone : stoneLt)
      }
    }
    // 꼭대기 장식
    for (let y = bcy - 8; y <= bcy; y++) {
      p.set(cx - 1, y, stoneLt)
      p.set(cx, y, stoneSh)
    }
    p.hline(cx - 2, cx + 1, bcy - 9, stone)
    p.hline(cx - 1, cx, bcy - 10, stoneLt)
    p.outline('#6c778a')

    // ── 물줄기 (외곽선 없이) ──
    // 꼭대기에서 솟아 그릇 가장자리로 떨어지는 포물선
    for (const side of [-1, 1]) {
      for (let i = 0; i < 18; i++) {
        const t = ((i + f * 0.5) % 18) / 18
        if (((i + f) & 1) === 1) continue
        const x = Math.round(cx - 0.5 + side * (1 + t * 13))
        const y = Math.round(bcy - 11 - 20 * t * (1 - t) * 1.6 + t * 11)
        p.set(x, y, i % 3 === 0 ? '#ffffff' : spray)
      }
    }
    // 가운데 물기둥
    for (let y = bcy - 18; y <= bcy - 11; y++) {
      if ((y + f) % 3 === 0) continue
      p.set(cx - 1, y, spray)
      p.set(cx, y, '#ffffff')
    }
    // 그릇에서 아래 물로 떨어지는 커튼
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? cx - 14 : cx + 13
      for (let y = bcy + 2; y <= cy - 3; y++) {
        const on = (y + f * 2) % 4 !== 0
        if (on) p.set(x0, y, '#c9f1ff')
        if ((y + f * 2) % 4 === 2) p.set(x0 - side, y, '#ffffff')
      }
      // 물보라
      const sx = x0
      const sy = cy - 2
      const splash = f % 2 === 0
      p.set(sx - 1, sy, '#ffffff')
      p.set(sx + 1, sy, '#ffffff')
      if (splash) {
        p.set(sx - 2, sy - 1, spray)
        p.set(sx + 2, sy - 1, spray)
      } else {
        p.set(sx, sy - 1, spray)
        p.set(sx - 3, sy, spray)
        p.set(sx + 3, sy, spray)
      }
    }
    frames.push(p.commit())
  }
  return { frames, w: W, h: H, cx, cy }
}

// ───────────────────────── 배치 ─────────────────────────
const propShadows: [number, number, number, number][] = []
const obstacles: Obstacle[] = []

const LAYOUT = {
  trees: [
    { x: 40, y: 112, k: 'green' as TreeKind },
    { x: 382, y: 110, k: 'blossom' as TreeKind },
    { x: 30, y: 266, k: 'apple' as TreeKind },
    { x: 394, y: 268, k: 'green' as TreeKind }
  ],
  bushes: [
    { x: 92, y: 90 },
    { x: 336, y: 92 },
    { x: 92, y: 274 },
    { x: 330, y: 276 }
  ],
  benches: [
    { x: 142, y: 120 },
    { x: 278, y: 120 }
  ],
  lamps: [
    { x: 92, y: 150 },
    { x: 328, y: 150 },
    { x: 92, y: 210 },
    { x: 328, y: 210 }
  ],
  beds: [
    { x: 150, y: 272 },
    { x: 270, y: 272 }
  ],
  sign: { x: 152, y: 92 }
}

let builtProps: Prop[] | null = null
let walkMask: Uint8Array | null = null

/** 소품 목록 (처음 호출 시 생성 — 폰트가 로드된 뒤에 부를 것) */
export function getProps(): Prop[] {
  if (builtProps) return builtProps
  const props: Prop[] = []
  propShadows.length = 0
  obstacles.length = 0

  const fountain = drawFountainFrames()
  props.push({ id: 'fountain', frames: fountain.frames, fps: 6, x: CX - fountain.cx, y: CY - fountain.cy, baseline: CY })
  obstacles.push({ kind: 'ellipse', cx: CX, cy: CY + 1, rx: 43, ry: 19 })
  propShadows.push([CX + 2, CY + ryShadow(), 42, 6])

  for (const [i, t] of LAYOUT.trees.entries()) {
    const tree = drawTree(t.k, i * 31 + 5)
    props.push({ id: `tree${i}`, frames: [tree.pix.commit()], fps: 0, x: t.x - tree.baseX, y: t.y - tree.baseY, baseline: t.y })
    obstacles.push({ kind: 'ellipse', cx: t.x, cy: t.y - 1, rx: 8, ry: 4 })
    propShadows.push([t.x + 1, t.y, 18, 5])
  }
  for (const [i, b] of LAYOUT.bushes.entries()) {
    const bush = drawBush(i)
    props.push({ id: `bush${i}`, frames: [bush.commit()], fps: 0, x: b.x - 13, y: b.y - 17, baseline: b.y })
    obstacles.push({ kind: 'ellipse', cx: b.x, cy: b.y - 3, rx: 12, ry: 4 })
    propShadows.push([b.x, b.y - 1, 12, 3])
  }
  for (const [i, b] of LAYOUT.benches.entries()) {
    const bench = drawBench()
    props.push({ id: `bench${i}`, frames: [bench.commit()], fps: 0, x: b.x - 17, y: b.y - 21, baseline: b.y })
    obstacles.push({ kind: 'rect', x: b.x - 17, y: b.y - 7, w: 34, h: 8 })
    propShadows.push([b.x, b.y, 16, 3])
  }
  for (const [i, l] of LAYOUT.lamps.entries()) {
    const lamp = drawLamp()
    props.push({ id: `lamp${i}`, frames: [lamp.commit()], fps: 0, x: l.x - 7, y: l.y - 45, baseline: l.y })
    obstacles.push({ kind: 'ellipse', cx: l.x, cy: l.y - 1, rx: 5, ry: 3 })
    propShadows.push([l.x, l.y, 6, 2])
  }
  for (const [i, b] of LAYOUT.beds.entries()) {
    const bed = drawFlowerBed(40 + i)
    props.push({ id: `bed${i}`, frames: [bed.commit()], fps: 0, x: b.x - 24, y: b.y - 16, baseline: b.y })
    obstacles.push({ kind: 'ellipse', cx: b.x, cy: b.y - 1, rx: 23, ry: 9 })
  }
  {
    const s = LAYOUT.sign
    const sign = drawSign()
    props.push({ id: 'sign', frames: [sign.commit()], fps: 0, x: s.x - 40, y: s.y - 31, baseline: s.y })
    obstacles.push({ kind: 'rect', x: s.x - 28, y: s.y - 4, w: 7, h: 4 })
    obstacles.push({ kind: 'rect', x: s.x + 21, y: s.y - 4, w: 7, h: 4 })
    propShadows.push([s.x - 25, s.y, 4, 1])
    propShadows.push([s.x + 24, s.y, 4, 1])
  }
  builtProps = props
  return props
}

function ryShadow(): number {
  return 16
}

function buildMask(): Uint8Array {
  getProps()
  const m = new Uint8Array(WORLD_W * WORLD_H)
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      let ok = x >= WALK_LEFT && x <= WALK_RIGHT && y >= WALK_TOP && y <= WALK_BOTTOM
      if (ok) {
        for (const o of obstacles) {
          if (o.kind === 'ellipse' ? inEllipse(x, y, o.cx, o.cy, o.rx, o.ry) : x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h) {
            ok = false
            break
          }
        }
      }
      m[y * WORLD_W + x] = ok ? 1 : 0
    }
  }
  return m
}

/** 발 위치(x,y) 에 설 수 있는지 */
export function isWalkable(x: number, y: number): boolean {
  if (!walkMask) walkMask = buildMask()
  const ix = Math.round(x)
  const iy = Math.round(y)
  if (ix < 0 || iy < 0 || ix >= WORLD_W || iy >= WORLD_H) return false
  return walkMask[iy * WORLD_W + ix] === 1
}

/** 주변까지 넉넉하게 비어 있는지 (스폰용) */
export function isClear(x: number, y: number, r = 4): boolean {
  for (let dy = -r; dy <= r; dy += 2) for (let dx = -r; dx <= r; dx += 2) if (!isWalkable(x + dx, y + dy)) return false
  return true
}
