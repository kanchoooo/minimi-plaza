// 머리 위 상태 아이콘 · 발밑 그림자 · 선택 링 · 클릭 표시 · 나비 (모두 도트)
import { Pix, inEllipse } from './pixel'

export type BadgeKind = 'calling' | 'called' | 'dnd' | 'answered' | 'away'

/** 흰 말풍선 모양 바탕 (15x14, 아래 꼬리) */
function bubbleBase(p: Pix, fill = '#ffffff', ol = '#4f5d6b'): void {
  // 몸통 x1..13, y1..10 (모서리 깎음) + 꼬리, 바깥 1px 외곽선
  for (let y = 1; y <= 10; y++) {
    for (let x = 1; x <= 13; x++) {
      const cut = (y === 1 || y === 10) && (x === 1 || x === 13)
      if (!cut) p.set(x, y, fill)
    }
  }
  p.set(6, 11, fill)
  p.set(7, 11, fill)
  p.set(8, 11, fill)
  p.set(7, 12, fill)
  p.outline(ol)
}

function megaphone(frame: number): HTMLCanvasElement {
  const p = new Pix(15, 14)
  bubbleBase(p, '#fff7ef', '#b14d06')
  const o = '#b14d06'
  const f = '#ff8a3d'
  const l = '#ffc08f'
  // 원뿔(오른쪽으로 벌어짐) + 입대는 곳 + 손잡이
  const cy = 5
  for (let c = 0; c < 7; c++) {
    const h = c < 2 ? 1 : Math.round(1 + (c - 2) * 0.5)
    for (let r = cy - h; r <= cy + h; r++) {
      const edge = r === cy - h || r === cy + h || c === 0 || c === 6
      p.set(2 + c, r, edge ? o : r === cy - h + 1 && c > 2 && c < 6 ? l : f)
    }
  }
  p.set(5, cy + 2, o)
  p.set(5, cy + 3, o)
  // 소리 물결
  if (frame >= 1) {
    p.set(10, 4, f)
    p.set(10, 5, f)
    p.set(10, 6, f)
  }
  if (frame >= 2) {
    p.set(11, 2, o)
    p.set(12, 3, o)
    p.set(12, 4, o)
    p.set(12, 5, o)
    p.set(12, 6, o)
    p.set(12, 7, o)
    p.set(11, 8, o)
  }
  return p.commit()
}

function called(): HTMLCanvasElement {
  const p = new Pix(15, 15)
  p.grid(
    [
      '....ooooo....',
      '..oo#####oo..',
      '.o###www###o.',
      '.o###www###o.',
      'o####www####o',
      'o####www####o',
      'o#####w#####o',
      'o#####w#####o',
      'o###########o',
      '.o###www###o.',
      '.o###www###o.',
      '..oo#####oo..',
      '....ooooo....'
    ],
    1,
    1,
    { o: '#9c2430', '#': '#ff5a5f', w: '#ffffff' }
  )
  p.set(3, 3, '#ff9a9d')
  p.set(4, 3, '#ff9a9d')
  p.set(3, 4, '#ff9a9d')
  return p.commit()
}

function moon(): HTMLCanvasElement {
  const p = new Pix(15, 15)
  for (let y = 0; y < 15; y++) for (let x = 0; x < 15; x++) if (inEllipse(x, y, 7.5, 7.5, 6.6, 6.6)) p.set(x, y, '#3d4b8c')
  p.outline('#1f2a55')
  p.grid(
    [
      '..yyy..',
      '.yyy...',
      'yyy....',
      'yyy....',
      'yyyy...',
      '.yyyyyy',
      '..yyyy.'
    ],
    3,
    3,
    { y: '#ffd84a' }
  )
  p.set(4, 4, '#fff3b0')
  p.set(10, 4, '#ffffff')
  p.set(11, 8, '#c9d4ff')
  return p.commit()
}

function heart(): HTMLCanvasElement {
  const p = new Pix(15, 14)
  bubbleBase(p, '#fff5f9', '#c2185b')
  p.grid(
    [
      '.hh.hh.',
      'hwhhhhh',
      'hhhhhhh',
      '.hhhhh.',
      '..hhh..',
      '...h...'
    ],
    4,
    3,
    { h: '#ff4f8b', w: '#ffd0e2' }
  )
  return p.commit()
}

function zzz(frame: number): HTMLCanvasElement {
  const p = new Pix(16, 16)
  const z = (ox: number, oy: number, big: boolean): void => {
    const rows = big ? ['zzzz', '..z.', '.z..', 'zzzz'] : ['zzz', '.z.', 'zzz']
    p.grid(rows, ox, oy, { z: '#ffffff' })
  }
  if (frame >= 0) z(1, 10, false)
  if (frame >= 1) z(6, 5, true)
  if (frame >= 2) z(11, 0, true)
  p.outline('#5b6b9a')
  return p.commit()
}

export function badgeFrames(kind: BadgeKind): HTMLCanvasElement[] {
  switch (kind) {
    case 'calling':
      return [megaphone(0), megaphone(1), megaphone(2)]
    case 'called':
      return [called()]
    case 'dnd':
      return [moon()]
    case 'answered':
      return [heart()]
    case 'away':
      return [zzz(0), zzz(1), zzz(2)]
  }
}

/** 발밑 그림자 */
export function shadowCanvas(): HTMLCanvasElement {
  const p = new Pix(21, 7)
  for (let y = 0; y < 7; y++) for (let x = 0; x < 21; x++) if (inEllipse(x, y, 10.5, 3.5, 10, 3.2)) p.set(x, y, '#13301628')
  for (let y = 0; y < 7; y++) for (let x = 0; x < 21; x++) if (inEllipse(x, y, 10.5, 3.5, 7, 2.2)) p.set(x, y, '#13301618')
  return p.commit()
}

/** 선택 링 (점선이 돌아간다) */
export function ringFrames(): HTMLCanvasElement[] {
  const frames: HTMLCanvasElement[] = []
  const W = 31
  const H = 11
  const pts: [number, number][] = []
  for (let a = 0; a < Math.PI * 2; a += 0.01) {
    const x = Math.round(15 + Math.cos(a) * 14)
    const y = Math.round(5 + Math.sin(a) * 4.6)
    if (!pts.length || pts[pts.length - 1][0] !== x || pts[pts.length - 1][1] !== y) pts.push([x, y])
  }
  for (let f = 0; f < 4; f++) {
    const p = new Pix(W, H)
    pts.forEach(([x, y], i) => {
      const on = ((i + f * 2) % 8) < 5
      p.set(x, y, on ? '#ff7f2a' : '#ffd2a8')
    })
    frames.push(p.commit())
  }
  return frames
}

/** 클릭한 곳 표시 (퍼지며 사라지는 링) */
export function markerFrames(): HTMLCanvasElement[] {
  const frames: HTMLCanvasElement[] = []
  for (let f = 0; f < 6; f++) {
    const p = new Pix(25, 11)
    const rx = 3 + f * 1.8
    const ry = rx * 0.4
    for (let a = 0; a < Math.PI * 2; a += 0.02) {
      const x = Math.round(12 + Math.cos(a) * rx)
      const y = Math.round(5 + Math.sin(a) * ry)
      p.set(x, y, f < 3 ? '#ffffff' : '#ffffffaa')
    }
    if (f < 2) {
      p.set(12, 5, '#ff7f2a')
      p.set(11, 5, '#ff7f2a')
      p.set(13, 5, '#ff7f2a')
    }
    frames.push(p.commit())
  }
  return frames
}

/** 나비 (날갯짓 2프레임) */
export function butterflyFrames(color: string, dark: string): HTMLCanvasElement[] {
  const open = ['w.w', 'wbw', '.b.']
  const shut = ['...', '.w.', '.b.']
  return [open, shut].map((rows) => {
    const p = new Pix(5, 5)
    p.grid(rows, 1, 1, { w: color, b: '#4a3a3a' })
    if (rows === open) {
      p.set(1, 1, dark)
      p.set(3, 1, dark)
    }
    return p.commit()
  })
}
