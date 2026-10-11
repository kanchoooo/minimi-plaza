// 미니미 모듈 공개 API
import type { MinimiConfig } from '@shared/types'
import { ACCS, BOTTOMS, EYES, HAIRS, MOUTHS, SHOES, TOPS } from './parts'
import { ACC_COLORS, CLOTH_COLORS, DOT_CHARS, HAIR_COLORS, HEX_RE, SHOE_COLORS, SKIN_TONES } from './palette'
import { MINIMI_H, MINIMI_W } from './render'

export { MINIMI_W, MINIMI_H, WALK_CYCLE, renderMinimi, minimiDataUrl, composeMinimi, minimiKey } from './render'
export type { MinimiFrame, MinimiDir } from './render'
export { DOT_PALETTE, DOT_CHARS, SKIN_TONES, HAIR_COLORS, CLOTH_COLORS, SHOE_COLORS, ACC_COLORS } from './palette'
export { HAIRS, EYES, MOUTHS, TOPS, BOTTOMS, SHOES, ACCS } from './parts'

export const EMPTY_DOTS = '.'.repeat(MINIMI_W * MINIMI_H)

export function defaultMinimi(): MinimiConfig {
  return {
    v: 1,
    skin: '#ffe0c7',
    hair: 'bob',
    hairColor: '#4b3128',
    eyes: 'dot',
    mouth: 'smile',
    blush: true,
    top: 'tee',
    topColor: '#8fcdf5',
    bottom: 'pants',
    bottomColor: '#5b8fd9',
    shoes: 'sneakers',
    shoesColor: '#ffffff',
    acc: 'none',
    accColor: '#ff6fa3',
    dots: EMPTY_DOTS
  }
}

/** 0~1 난수 생성기 (seed 를 주면 매번 같은 결과) */
function rng(seed?: number): () => number {
  if (seed === undefined) return Math.random
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 100000) / 100000
  }
}

export function randomMinimi(seed?: number): MinimiConfig {
  const r = rng(seed)
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(r() * list.length) % list.length]
  const top = pick(TOPS)
  const cloth = pick(CLOTH_COLORS)
  // 상·하의 색이 겹치지 않게
  let bottomColor = pick(CLOTH_COLORS)
  if (bottomColor === cloth) bottomColor = CLOTH_COLORS[(CLOTH_COLORS.indexOf(cloth) + 5) % CLOTH_COLORS.length]
  return {
    v: 1,
    skin: pick(SKIN_TONES.slice(0, 5)),
    hair: pick(HAIRS).id,
    hairColor: pick(HAIR_COLORS),
    eyes: pick(EYES).id,
    mouth: pick(MOUTHS).id,
    blush: r() < 0.75,
    top: top.id,
    topColor: cloth,
    bottom: pick(BOTTOMS).id,
    bottomColor,
    shoes: pick(SHOES).id,
    shoesColor: pick(SHOE_COLORS),
    acc: r() < 0.3 ? 'none' : pick(ACCS).id,
    accColor: pick(ACC_COLORS),
    dots: EMPTY_DOTS
  }
}

const DOTS_RE = new RegExp(`^[.${DOT_CHARS}]{${MINIMI_W * MINIMI_H}}$`)

/** 피어에게서 받은 신뢰할 수 없는 데이터를 안전한 설정으로. 절대 throw 하지 않는다. */
export function sanitizeMinimi(x: unknown): MinimiConfig {
  const d = defaultMinimi()
  if (!x || typeof x !== 'object') return d
  const o = x as Record<string, unknown>
  const color = (v: unknown, fb: string): string => (typeof v === 'string' && HEX_RE.test(v) ? v.toLowerCase() : fb)
  const id = (v: unknown, list: readonly { id: string }[], fb: string): string =>
    typeof v === 'string' && list.some((p) => p.id === v) ? v : fb
  return {
    v: 1,
    skin: color(o.skin, d.skin),
    hair: id(o.hair, HAIRS, d.hair),
    hairColor: color(o.hairColor, d.hairColor),
    eyes: id(o.eyes, EYES, d.eyes),
    mouth: id(o.mouth, MOUTHS, d.mouth),
    blush: typeof o.blush === 'boolean' ? o.blush : d.blush,
    top: id(o.top, TOPS, d.top),
    topColor: color(o.topColor, d.topColor),
    bottom: id(o.bottom, BOTTOMS, d.bottom),
    bottomColor: color(o.bottomColor, d.bottomColor),
    shoes: id(o.shoes, SHOES, d.shoes),
    shoesColor: color(o.shoesColor, d.shoesColor),
    acc: id(o.acc, ACCS, d.acc),
    accColor: color(o.accColor, d.accColor),
    dots: typeof o.dots === 'string' && DOTS_RE.test(o.dots) ? o.dots : EMPTY_DOTS
  }
}
