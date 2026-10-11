// 도트 그림을 코드로 그리기 위한 작은 도구들 (외부 이미지 없이 런타임에 생성)

/** 시드 고정 난수 (mulberry32) — 맵이 매번 똑같이 그려지도록 */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** '#rrggbb' 또는 '#rrggbbaa' → [r,g,b,a] */
export function hex(c: string): [number, number, number, number] {
  const n = parseInt(c.slice(1, 7), 16)
  const a = c.length >= 9 ? parseInt(c.slice(7, 9), 16) : 255
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a]
}

/** ImageData 위에서 픽셀 단위로 그리는 캔버스 */
export class Pix {
  readonly canvas: HTMLCanvasElement
  readonly w: number
  readonly h: number
  private img: ImageData
  private d: Uint8ClampedArray
  private cache = new Map<string, [number, number, number, number]>()

  constructor(w: number, h: number) {
    this.w = w
    this.h = h
    this.canvas = document.createElement('canvas')
    this.canvas.width = w
    this.canvas.height = h
    this.img = new ImageData(w, h)
    this.d = this.img.data
  }

  private col(c: string): [number, number, number, number] {
    let v = this.cache.get(c)
    if (!v) {
      v = hex(c)
      this.cache.set(c, v)
    }
    return v
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h
  }

  /** 불투명하게 칠하기 (알파가 있으면 기존 픽셀 위에 섞음) */
  set(x: number, y: number, c: string): void {
    x |= 0
    y |= 0
    if (!this.inside(x, y)) return
    const [r, g, b, a] = this.col(c)
    const i = (y * this.w + x) * 4
    const d = this.d
    if (a === 255) {
      d[i] = r
      d[i + 1] = g
      d[i + 2] = b
      d[i + 3] = 255
    } else {
      const fa = a / 255
      const da = d[i + 3] / 255
      const oa = fa + da * (1 - fa)
      if (oa <= 0) return
      d[i] = (r * fa + d[i] * da * (1 - fa)) / oa
      d[i + 1] = (g * fa + d[i + 1] * da * (1 - fa)) / oa
      d[i + 2] = (b * fa + d[i + 2] * da * (1 - fa)) / oa
      d[i + 3] = oa * 255
    }
  }

  clear(x: number, y: number): void {
    if (!this.inside(x, y)) return
    this.d[(y * this.w + x) * 4 + 3] = 0
  }

  alpha(x: number, y: number): number {
    if (!this.inside(x, y)) return 0
    return this.d[(y * this.w + x) * 4 + 3]
  }

  opaque(x: number, y: number): boolean {
    return this.alpha(x, y) > 0
  }

  rect(x: number, y: number, w: number, h: number, c: string): void {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c)
  }

  hline(x0: number, x1: number, y: number, c: string): void {
    for (let x = x0; x <= x1; x++) this.set(x, y, c)
  }

  vline(x: number, y0: number, y1: number, c: string): void {
    for (let y = y0; y <= y1; y++) this.set(x, y, c)
  }

  /** 꽉 찬 타원 (픽셀 중심 기준) */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: string): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        if (inEllipse(x, y, cx, cy, rx, ry)) this.set(x, y, c)
      }
    }
  }

  /** 문자열 격자 스프라이트 찍기. '.' 와 ' ' 는 투명 */
  grid(rows: string[], ox: number, oy: number, pal: Record<string, string>, flip = false): void {
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y]
      for (let x = 0; x < row.length; x++) {
        const ch = row[flip ? row.length - 1 - x : x]
        if (ch === '.' || ch === ' ') continue
        const c = pal[ch]
        if (c) this.set(ox + x, oy + y, c)
      }
    }
  }

  /** 불투명 영역 바깥 테두리(4방향)에 외곽선 */
  outline(c: string, diagonal = false): void {
    const mark: number[] = []
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.opaque(x, y)) continue
        const n =
          this.opaque(x - 1, y) ||
          this.opaque(x + 1, y) ||
          this.opaque(x, y - 1) ||
          this.opaque(x, y + 1) ||
          (diagonal && (this.opaque(x - 1, y - 1) || this.opaque(x + 1, y - 1) || this.opaque(x - 1, y + 1) || this.opaque(x + 1, y + 1)))
        if (n) mark.push(x, y)
      }
    }
    for (let i = 0; i < mark.length; i += 2) this.set(mark[i], mark[i + 1], c)
  }

  /** 다른 Pix 를 겹쳐 그리기 */
  blit(src: Pix, ox: number, oy: number): void {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const i = (y * src.w + x) * 4
        const a = src.d[i + 3]
        if (!a) continue
        const r = src.d[i]
        const g = src.d[i + 1]
        const b = src.d[i + 2]
        this.set(ox + x, oy + y, rgbHex(r, g, b, a))
      }
    }
  }

  commit(): HTMLCanvasElement {
    this.canvas.getContext('2d')!.putImageData(this.img, 0, 0)
    return this.canvas
  }
}

export function inEllipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number): boolean {
  const dx = (x + 0.5 - cx) / rx
  const dy = (y + 0.5 - cy) / ry
  return dx * dx + dy * dy <= 1
}

function h2(n: number): string {
  return n.toString(16).padStart(2, '0')
}

export function rgbHex(r: number, g: number, b: number, a = 255): string {
  return '#' + h2(r | 0) + h2(g | 0) + h2(b | 0) + (a < 255 ? h2(a | 0) : '')
}

/** 두 색 섞기 */
export function mix(a: string, b: string, t: number): string {
  const A = hex(a)
  const B = hex(b)
  return rgbHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t)
}

/** 4x4 베이어 디더 임계값 (0..1) */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
export function bayer(x: number, y: number): number {
  return (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16
}

/** 부드러운 값 노이즈 (격자 보간) — 잔디 얼룩 등 */
export function valueNoise(seed: number, cell: number): (x: number, y: number) => number {
  const r = rng(seed)
  const N = 64
  const table = Array.from({ length: N * N }, () => r())
  const at = (ix: number, iy: number): number => table[(((iy % N) + N) % N) * N + (((ix % N) + N) % N)]
  const smooth = (t: number): number => t * t * (3 - 2 * t)
  return (x: number, y: number) => {
    const fx = x / cell
    const fy = y / cell
    const ix = Math.floor(fx)
    const iy = Math.floor(fy)
    const tx = smooth(fx - ix)
    const ty = smooth(fy - iy)
    const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * tx
    const b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * tx
    return a + (b - a) * ty
  }
}
