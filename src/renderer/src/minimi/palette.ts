// 색 유틸 + 파츠별 추천 색 팔레트 + 도트 팔레트

export type RGBA = [number, number, number, number]

export const HEX_RE = /^#[0-9a-f]{6}$/i

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number): string => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return [h * 60, s, l]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360
  s = Math.max(0, Math.min(1, s))
  l = Math.max(0, Math.min(1, l))
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}

const rgba = (rgb: [number, number, number], a = 255): RGBA => [Math.round(rgb[0]), Math.round(rgb[1]), Math.round(rgb[2]), a]

export function mixHex(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a)
  const [r2, g2, b2] = hexToRgb(b)
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t)
}

/** 한 색에서 파생되는 도트용 색 묶음 */
export interface ShadeSet {
  /** 기본 */
  a: RGBA
  /** 그림자 */
  b: RGBA
  /** 하이라이트 */
  c: RGBA
  /** 진한 그림자 */
  d: RGBA
  /** 옅은 틴트(줄무늬 등) */
  e: RGBA
  /** 외곽선 */
  o: RGBA
}

const shadeCache = new Map<string, ShadeSet>()

export function shadesOf(hex: string): ShadeSet {
  const key = hex.toLowerCase()
  const hit = shadeCache.get(key)
  if (hit) return hit
  const [r, g, b] = hexToRgb(key)
  const [h, s, l] = rgbToHsl(r, g, b)
  // 채도가 거의 없는 색(흰색·회색·검정)은 푸른 회색 외곽선
  const chroma = (Math.max(r, g, b) - Math.min(r, g, b)) / 255
  const gray = chroma < 0.1
  // 외곽선: 같은 계열로 아주 진하게. 무채색은 푸른 회색 계열.
  const oh = gray ? 222 : h
  const os = gray ? 0.16 : Math.min(0.62, s * 0.9 + 0.08)
  const ol = l > 0.3 ? Math.max(0.16, l * 0.42) : l * 0.5
  const set: ShadeSet = {
    a: rgba([r, g, b]),
    b: rgba(hslToRgb(gray ? oh : h + (l > 0.5 ? -4 : 0), gray ? 0.06 : Math.min(1, s * 1.04), l > 0.25 ? l - 0.11 : l - 0.05)),
    c: rgba(hslToRgb(h, s * 0.92, l < 0.25 ? l + 0.14 : Math.min(0.97, l + 0.11))),
    d: rgba(hslToRgb(oh, os, l > 0.3 ? l * 0.62 : l * 0.75)),
    e: rgba(hexToRgb(mixHex(key, '#ffffff', 0.72))),
    o: rgba(hslToRgb(oh, os, ol))
  }
  shadeCache.set(key, set)
  return set
}

// ───────── 추천 색 팔레트 ─────────

export const SKIN_TONES = ['#fff0e3', '#ffe0c7', '#f9d0ad', '#efbd94', '#dca277', '#be8358', '#93603f']

export const HAIR_COLORS = [
  '#2b2730', // 흑발
  '#4b3128', // 진갈색
  '#7a4b33', // 갈색
  '#a8693f', // 밤색
  '#e7c06c', // 금발
  '#f3e0b8', // 플래티넘
  '#ff93b9', // 핑크
  '#ff9a52', // 오렌지
  '#d85a5a', // 레드
  '#b69ae8', // 라벤더
  '#7cc2f0', // 하늘
  '#7fd4b4', // 민트
  '#b9bac6' // 그레이
]

export const CLOTH_COLORS = [
  '#ffffff',
  '#f6efe0',
  '#ff9cbc',
  '#ff6f8e',
  '#ffb36b',
  '#ffe17a',
  '#a6e3a1',
  '#7fd4c4',
  '#8fcdf5',
  '#5b8fd9',
  '#b49ae8',
  '#6b5b95',
  '#8a8f9c',
  '#3a3d4a'
]

export const SHOE_COLORS = ['#ffffff', '#3a3d4a', '#8a5a3c', '#ff6f8e', '#ffb36b', '#ffe17a', '#7fd4c4', '#5b8fd9', '#b49ae8', '#e5484d']

export const ACC_COLORS = ['#ff6fa3', '#ff9cbc', '#e5484d', '#ffb36b', '#f6c445', '#fff3a8', '#8be09a', '#7fd4c4', '#7cc2f0', '#5b6fd9', '#b49ae8', '#ffffff', '#3a3d4a']

// ───────── 도트 에디터 팔레트 (32색) ─────────

export const DOT_CHARS = '0123456789abcdefghijklmnopqrstuv'

export const DOT_PALETTE: string[] = [
  '#1a1c2c',
  '#5d275d',
  '#b13e53',
  '#ef7d57',
  '#ffcd75',
  '#a7f070',
  '#38b764',
  '#257179',
  '#29366f',
  '#3b5dc9',
  '#41a6f6',
  '#73eff7',
  '#f4f4f4',
  '#94b0c2',
  '#566c86',
  '#333c57',
  '#ffb3c8',
  '#ff6f9c',
  '#ffe0ea',
  '#c9a6ff',
  '#8e5cd9',
  '#fff1b8',
  '#ffb36b',
  '#c8763a',
  '#7a4a32',
  '#ffe0c7',
  '#e8b48f',
  '#bff0dc',
  '#5fd3c3',
  '#d9f4ff',
  '#ffd23f',
  '#e5484d'
]
