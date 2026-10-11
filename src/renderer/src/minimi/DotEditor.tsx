// 도트 꾸미기: 합성된 미니미 위에 자유 도트 레이어를 그린다
import { useCallback, useEffect, useRef, useState } from 'react'
import type { MinimiConfig } from '@shared/types'
import { composeMinimi, MINIMI_H, MINIMI_W, renderMinimi } from './render'
import { DOT_CHARS, DOT_PALETTE, hexToRgb } from './palette'

type Tool = 'pen' | 'eraser' | 'fill' | 'picker'

const TOOLS: { id: Tool; label: string; key: string }[] = [
  { id: 'pen', label: '✏️ 연필', key: 'b' },
  { id: 'eraser', label: '🧽 지우개', key: 'e' },
  { id: 'fill', label: '🪣 채우기', key: 'g' },
  { id: 'picker', label: '💧 스포이드', key: 'i' }
]

const EMPTY = '.'.repeat(MINIMI_W * MINIMI_H)
const PALETTE_RGB = DOT_PALETTE.map(hexToRgb)

function nearestDot(r: number, g: number, b: number): number {
  let best = 0
  let bestD = Infinity
  PALETTE_RGB.forEach(([pr, pg, pb], i) => {
    const d = (pr - r) ** 2 * 0.3 + (pg - g) ** 2 * 0.59 + (pb - b) ** 2 * 0.11
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return best
}

export interface DotEditorProps {
  value: MinimiConfig
  onChange: (next: MinimiConfig) => void
}

export function DotEditor({ value, onChange }: DotEditorProps): React.JSX.Element {
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState(17)
  const [zoom, setZoom] = useState(11)
  const [grid, setGrid] = useState(true)
  const [mirror, setMirror] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const [, bump] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const valueRef = useRef(value)
  valueRef.current = value
  const undo = useRef<string[]>([])
  const redo = useRef<string[]>([])
  const stroke = useRef<{ before: string; last: number | null } | null>(null)
  // 획을 긋는 동안에는 렌더를 기다리지 않고 바로 반영되는 작업용 도트
  const dotsRef = useRef(value.dots)
  if (!stroke.current) dotsRef.current = value.dots

  const setDots = useCallback(
    (dots: string) => {
      if (dots === dotsRef.current && dots === valueRef.current.dots) return
      dotsRef.current = dots
      onChange({ ...valueRef.current, dots })
    },
    [onChange]
  )

  const pushHistory = (before: string): void => {
    undo.current.push(before)
    if (undo.current.length > 100) undo.current.shift()
    redo.current = []
    bump((n) => n + 1)
  }

  const doUndo = useCallback(() => {
    const prev = undo.current.pop()
    if (prev === undefined) return
    redo.current.push(dotsRef.current)
    setDots(prev)
    bump((n) => n + 1)
  }, [setDots])

  const doRedo = useCallback(() => {
    const next = redo.current.pop()
    if (next === undefined) return
    undo.current.push(dotsRef.current)
    setDots(next)
    bump((n) => n + 1)
  }, [setDots])

  // ───────── 그리기 ─────────
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const g = c.getContext('2d')!
    g.imageSmoothingEnabled = false
    g.clearRect(0, 0, c.width, c.height)
    g.globalAlpha = 0.42
    g.drawImage(renderMinimi({ ...value, dots: EMPTY }), 0, 0, MINIMI_W * zoom, MINIMI_H * zoom)
    g.globalAlpha = 1
    for (let i = 0; i < value.dots.length; i++) {
      const ch = value.dots[i]
      if (ch === '.') continue
      const k = DOT_CHARS.indexOf(ch)
      if (k < 0) continue
      g.fillStyle = DOT_PALETTE[k]
      g.fillRect((i % MINIMI_W) * zoom, Math.floor(i / MINIMI_W) * zoom, zoom, zoom)
    }
    if (grid) {
      g.beginPath()
      for (let x = 0; x <= MINIMI_W; x++) {
        g.moveTo(x * zoom + 0.5, 0)
        g.lineTo(x * zoom + 0.5, MINIMI_H * zoom)
      }
      for (let y = 0; y <= MINIMI_H; y++) {
        g.moveTo(0, y * zoom + 0.5)
        g.lineTo(MINIMI_W * zoom, y * zoom + 0.5)
      }
      g.strokeStyle = 'rgba(47, 74, 98, 0.10)'
      g.lineWidth = 1
      g.stroke()
      // 가운데 기준선
      g.beginPath()
      g.moveTo((MINIMI_W / 2) * zoom + 0.5, 0)
      g.lineTo((MINIMI_W / 2) * zoom + 0.5, MINIMI_H * zoom)
      g.strokeStyle = 'rgba(47, 155, 224, 0.28)'
      g.stroke()
    }
    if (hover !== null) {
      const cells = mirror ? [hover, mirrorIdx(hover)] : [hover]
      g.strokeStyle = tool === 'eraser' ? 'rgba(229,72,77,0.9)' : 'rgba(255,127,42,0.95)'
      g.lineWidth = 2
      for (const h of cells) g.strokeRect((h % MINIMI_W) * zoom + 1, Math.floor(h / MINIMI_W) * zoom + 1, zoom - 2, zoom - 2)
    }
  }, [value, zoom, grid, hover, mirror, tool])

  // 처음 열 때 칸 크기를 영역에 맞춘다
  useEffect(() => {
    const w = wrapRef.current
    if (!w) return
    const fit = Math.floor(Math.min((w.clientWidth - 12) / MINIMI_W, (w.clientHeight - 12) / MINIMI_H))
    if (fit > 0) setZoom(Math.max(6, Math.min(18, fit)))
  }, [])

  // ───────── 단축키 ─────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const el = document.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) doRedo()
        else doUndo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        doRedo()
        return
      }
      if (mod || e.altKey) return
      const t = TOOLS.find((x) => x.key === e.key.toLowerCase())
      if (t) setTool(t.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doUndo, doRedo])

  const cellAt = (e: React.PointerEvent): number | null => {
    const c = canvasRef.current!
    const r = c.getBoundingClientRect()
    const x = Math.floor(((e.clientX - r.left) / r.width) * MINIMI_W)
    const y = Math.floor(((e.clientY - r.top) / r.height) * MINIMI_H)
    if (x < 0 || y < 0 || x >= MINIMI_W || y >= MINIMI_H) return null
    return y * MINIMI_W + x
  }

  const paintCells = (dots: string[], idx: number, ch: string): void => {
    dots[idx] = ch
    if (mirror) dots[mirrorIdx(idx)] = ch
  }

  const applyAt = (idx: number, from: number | null): void => {
    const cur = { ...valueRef.current, dots: dotsRef.current }
    if (tool === 'picker') {
      const ch = cur.dots[idx]
      if (ch !== '.') setColor(DOT_CHARS.indexOf(ch))
      else {
        const px = composeMinimi(cur)
        if (px[idx * 4 + 3] > 0) setColor(nearestDot(px[idx * 4], px[idx * 4 + 1], px[idx * 4 + 2]))
      }
      setTool('pen')
      return
    }
    if (tool === 'fill') {
      setDots(floodFill(cur, idx, DOT_CHARS[color], mirror))
      return
    }
    const ch = tool === 'eraser' ? '.' : DOT_CHARS[color]
    const dots = cur.dots.split('')
    for (const i of line(from ?? idx, idx)) paintCells(dots, i, ch)
    setDots(dots.join(''))
  }

  const onDown = (e: React.PointerEvent): void => {
    if (e.button !== 0) return
    const idx = cellAt(e)
    if (idx === null) return
    try {
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      /* 합성 이벤트 등 */
    }
    stroke.current = { before: dotsRef.current, last: idx }
    applyAt(idx, null)
    if (tool === 'fill' || tool === 'picker') endStroke()
  }

  const onMove = (e: React.PointerEvent): void => {
    const idx = cellAt(e)
    setHover(idx)
    const s = stroke.current
    if (!s || idx === null || idx === s.last) return
    applyAt(idx, s.last)
    s.last = idx
  }

  const endStroke = (): void => {
    const s = stroke.current
    stroke.current = null
    if (s && s.before !== dotsRef.current) pushHistory(s.before)
  }

  const clearAll = (): void => {
    if (dotsRef.current === EMPTY) return
    pushHistory(dotsRef.current)
    setDots(EMPTY)
  }

  const used = value.dots !== EMPTY

  return (
    <div className="dot-editor">
      <div className="dot-canvas-wrap scroll" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          width={MINIMI_W * zoom}
          height={MINIMI_H * zoom}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onPointerLeave={() => setHover(null)}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>
      <div className="dot-tools">
        <div className="dot-toolset">
          {TOOLS.map((t) => (
            <button key={t.id} className={'btn btn-sm' + (tool === t.id ? ' active' : '')} onClick={() => setTool(t.id)} title={`단축키 ${t.key.toUpperCase()}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="dot-current">
          <span className="swatch" style={{ background: DOT_PALETTE[color] }} />
          지금 색
        </div>
        <div className="dot-palette">
          {DOT_PALETTE.map((c, i) => (
            <button
              key={c}
              className={'swatch' + (i === color ? ' active' : '')}
              style={{ background: c }}
              onClick={() => {
                setColor(i)
                if (tool === 'eraser' || tool === 'picker') setTool('pen')
              }}
              title={c}
            />
          ))}
        </div>
        <div className="dot-toolset">
          <button className="btn btn-sm" onClick={doUndo} disabled={!undo.current.length} title="Ctrl/⌘+Z">
            ↶ 취소
          </button>
          <button className="btn btn-sm" onClick={doRedo} disabled={!redo.current.length} title="Shift+Ctrl/⌘+Z">
            ↷ 다시
          </button>
        </div>
        <label className="mm-toggle-row">
          <span className={'switch' + (mirror ? ' on' : '')} onClick={() => setMirror((v) => !v)} />
          좌우 대칭
        </label>
        <label className="mm-toggle-row">
          <span className={'switch' + (grid ? ' on' : '')} onClick={() => setGrid((v) => !v)} />
          격자
        </label>
        <div className="dot-zoom">
          <button className="btn btn-sm btn-icon" onClick={() => setZoom((z) => Math.max(6, z - 1))} title="축소">
            −
          </button>
          <span>확대 {zoom}</span>
          <button className="btn btn-sm btn-icon" onClick={() => setZoom((z) => Math.min(18, z + 1))} title="확대">
            +
          </button>
        </div>
        <button className="btn btn-sm btn-danger" onClick={clearAll} disabled={!used}>
          도트 전부 지우기
        </button>
        <p className="faint" style={{ margin: 0, fontSize: 11 }}>
          옷·머리 위에 마음대로 그려요. 채우기는 같은 색 영역을 칠해요.
        </p>
      </div>
    </div>
  )
}

function mirrorIdx(idx: number): number {
  const x = idx % MINIMI_W
  const y = Math.floor(idx / MINIMI_W)
  return y * MINIMI_W + (MINIMI_W - 1 - x)
}

/** 두 칸 사이를 빈틈없이 잇는 칸 목록 (브레젠험) */
function line(a: number, b: number): number[] {
  let x0 = a % MINIMI_W
  let y0 = Math.floor(a / MINIMI_W)
  const x1 = b % MINIMI_W
  const y1 = Math.floor(b / MINIMI_W)
  const out: number[] = []
  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  for (;;) {
    out.push(y0 * MINIMI_W + x0)
    if (x0 === x1 && y0 === y1) break
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x0 += sx
    }
    if (e2 <= dx) {
      err += dx
      y0 += sy
    }
  }
  return out
}

/** 보이는 색(밑그림+도트)이 같은 이어진 영역을 도트로 칠한다 */
function floodFill(cfg: MinimiConfig, start: number, ch: string, mirror: boolean): string {
  const px = composeMinimi(cfg)
  const key = (i: number): number => (px[i * 4 + 3] < 8 ? -1 : (px[i * 4] << 16) | (px[i * 4 + 1] << 8) | px[i * 4 + 2])
  const target = key(start)
  // 빈 배경은 칠하지 않는다 (캐릭터가 네모 판이 되지 않게)
  if (target === -1) return cfg.dots
  const dots = cfg.dots.split('')
  const seen = new Uint8Array(MINIMI_W * MINIMI_H)
  const stack = [start]
  while (stack.length) {
    const i = stack.pop()!
    if (seen[i]) continue
    seen[i] = 1
    if (key(i) !== target) continue
    dots[i] = ch
    if (mirror) dots[mirrorIdx(i)] = ch
    const x = i % MINIMI_W
    const y = Math.floor(i / MINIMI_W)
    if (x > 0) stack.push(i - 1)
    if (x < MINIMI_W - 1) stack.push(i + 1)
    if (y > 0) stack.push(i - MINIMI_W)
    if (y < MINIMI_H - 1) stack.push(i + MINIMI_W)
  }
  return dots.join('')
}
