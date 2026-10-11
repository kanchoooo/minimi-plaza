import type { PaletteId } from '@shared/types'

export type RGB = [number, number, number] // 0..1

export interface PaletteInfo {
  id: PaletteId
  /** UI 표시 이름 */
  label: string
  /** 입자 색 (CSS hex). 'rainbow' 는 가로 위치에 따라 색상환을 따라간다 */
  colors: string[]
  /** UI 스와치용 CSS background */
  swatch: string
}

export const PALETTES: Record<PaletteId, PaletteInfo> = {
  gold: {
    id: 'gold',
    label: '금빛',
    colors: ['#ffffff', '#fff3d1', '#ffe6a1', '#ffd36b', '#f9bf4f', '#eda63c'],
    swatch: 'linear-gradient(135deg, #fff3d1, #ffd36b 50%, #eda63c)'
  },
  rainbow: {
    id: 'rainbow',
    label: '무지개',
    colors: ['#ff6b6b', '#ffb347', '#ffe66d', '#7ee081', '#5bc0ff', '#9b8cff', '#ff8ad8'],
    swatch: 'linear-gradient(90deg, #ff6b6b, #ffb347, #ffe66d, #7ee081, #5bc0ff, #9b8cff)'
  },
  pink: {
    id: 'pink',
    label: '핑크',
    colors: ['#ffffff', '#ffe0ee', '#ffb3d4', '#ff86b8', '#ff5d9e', '#f2428a'],
    swatch: 'linear-gradient(135deg, #ffe0ee, #ff86b8 50%, #f2428a)'
  },
  sky: {
    id: 'sky',
    label: '하늘',
    colors: ['#ffffff', '#e0f4ff', '#b0e0ff', '#7cc8ff', '#4eaef5', '#2f93e0'],
    swatch: 'linear-gradient(135deg, #e0f4ff, #7cc8ff 50%, #2f93e0)'
  },
  mint: {
    id: 'mint',
    label: '민트',
    colors: ['#ffffff', '#ddfff2', '#b0f5dc', '#7ce9c2', '#4fdaa9', '#2cc492'],
    swatch: 'linear-gradient(135deg, #ddfff2, #7ce9c2 50%, #2cc492)'
  }
}

export const PALETTE_IDS = Object.keys(PALETTES) as PaletteId[]

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  // h: 0..1
  const a = s * Math.min(l, 1 - l)
  const f = (n: number): number => {
    const k = (n + h * 12) % 12
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))
  }
  return [f(0), f(8), f(4)]
}

const cache = new Map<PaletteId, RGB[]>()
export function paletteRgb(id: PaletteId): RGB[] {
  let c = cache.get(id)
  if (!c) {
    c = (PALETTES[id] ?? PALETTES.gold).colors.map(hexToRgb)
    cache.set(id, c)
  }
  return c
}

/** 피날레용 2색 조합 */
export const PEONY_PALETTES: RGB[][] = [
  ['#ffffff', '#ff5a5a', '#ff9a3c'],
  ['#ffffff', '#5bc0ff', '#7af0ff'],
  ['#ffffff', '#ffd36b', '#ffb347'],
  ['#ffffff', '#b98cff', '#ff8ad8'],
  ['#ffffff', '#7ee081', '#d6ff7a'],
  ['#ffffff', '#ff86b8', '#ffe0ee']
].map((p) => p.map(hexToRgb))
