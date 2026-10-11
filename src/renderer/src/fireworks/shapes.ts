// 글자·이미지를 입자 목표점으로 바꾸는 샘플러

export interface ShapePoints {
  /** 중심 기준 좌표 (x0,y0,x1,y1,...) — CSS px */
  pts: Float32Array
  /** 이미지일 때 픽셀 색 (r,g,b 0..1) */
  colors?: Float32Array
  count: number
  width: number
  height: number
  /** 점 간격(px) — 입자 크기 기준 */
  cell: number
}

export const MESSAGE_FONT = '"Apple SD Gothic Neo", "Malgun Gothic", "맑은 고딕", "Noto Sans KR", "Helvetica Neue", Arial, sans-serif'
export const DIGIT_FONT = '"Arial Black", "Helvetica Neue", "Apple SD Gothic Neo", "Malgun Gothic", Arial, sans-serif'

export interface TextShapeOptions {
  maxW: number
  maxH: number
  /** 한 줄 최대 높이 (px) */
  maxLineH: number
  targetCount: number
  font?: string
  weight?: number
  /** 획을 두껍게 (글자 크기 대비) */
  stroke?: number
}

/** 긴 한 줄은 2줄로 나눈다 (공백 우선, 없으면 가운데) */
export function wrapText(text: string, maxLines = 2): string[] {
  const clean = text.replace(/\r/g, '').trim()
  let lines = clean
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length === 0) return ['']
  if (lines.length > maxLines) lines = [lines.slice(0, maxLines - 1).join(' '), lines.slice(maxLines - 1).join(' ')]
  if (lines.length === 1 && maxLines >= 2 && [...lines[0]].length > 7) {
    const chars = [...lines[0]]
    const mid = chars.length / 2
    let best = -1
    chars.forEach((c, i) => {
      if (c === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i
    })
    if (best > 0 && Math.abs(best - mid) <= chars.length * 0.3) {
      lines = [chars.slice(0, best).join('').trim(), chars.slice(best + 1).join('').trim()]
    } else if (chars.length > 9) {
      const cut = Math.ceil(mid)
      lines = [chars.slice(0, cut).join(''), chars.slice(cut).join('')]
    }
  }
  return lines
}

const scratch = document.createElement('canvas')
const sctx = scratch.getContext('2d', { willReadFrequently: true })!

/** 글자 → 목표점. 지터 격자로 고르게 뿌린다 */
export function textShape(text: string, opt: TextShapeOptions): ShapePoints {
  const lines = wrapText(text)
  const weight = opt.weight ?? 800
  const family = opt.font ?? MESSAGE_FONT
  // 1) 크기 맞추기: 기준 100px 로 재고 비율로 키운다
  const probe = 100
  sctx.font = `${weight} ${probe}px ${family}`
  const widths = lines.map((l) => sctx.measureText(l).width || probe)
  const maxWidth = Math.max(...widths)
  const lineGap = 1.12
  let size = Math.min(opt.maxLineH, (opt.maxW / maxWidth) * probe, opt.maxH / (lines.length * lineGap))
  size = Math.max(24, size)

  // 2) 샘플용으로 절반 해상도에 그린다 (좌표는 다시 2배)
  const ss = 0.5
  const fs = size * ss
  sctx.font = `${weight} ${fs}px ${family}`
  const lw = lines.map((l) => sctx.measureText(l).width)
  const cw = Math.ceil(Math.max(...lw) + fs * 0.4)
  const lineH = fs * lineGap
  const ch = Math.ceil(lineH * lines.length + fs * 0.3)
  scratch.width = cw
  scratch.height = ch
  sctx.clearRect(0, 0, cw, ch)
  sctx.font = `${weight} ${fs}px ${family}`
  sctx.textAlign = 'center'
  sctx.textBaseline = 'middle'
  sctx.fillStyle = '#fff'
  sctx.strokeStyle = '#fff'
  sctx.lineJoin = 'round'
  sctx.lineWidth = fs * (opt.stroke ?? 0.05)
  lines.forEach((l, i) => {
    const y = ch / 2 + (i - (lines.length - 1) / 2) * lineH
    sctx.fillText(l, cw / 2, y)
    if (sctx.lineWidth > 0) sctx.strokeText(l, cw / 2, y)
  })
  const data = sctx.getImageData(0, 0, cw, ch).data

  // 3) 실제 잉크 영역과 면적
  let minX = cw,
    minY = ch,
    maxX = 0,
    maxY = 0,
    ink = 0
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      if (data[(y * cw + x) * 4 + 3] > 127) {
        ink++
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (ink === 0) return { pts: new Float32Array(0), count: 0, width: 0, height: 0, cell: 3 }
  const inkArea = ink / (ss * ss)
  const step = Math.max(2.1, Math.min(7, Math.sqrt(inkArea / opt.targetCount)))
  const cx = (minX + maxX) / 2 / ss
  const cy = (minY + maxY) / 2 / ss
  const W = cw / ss
  const H = ch / ss
  const out: number[] = []
  for (let gy = 0; gy < H; gy += step) {
    for (let gx = 0; gx < W; gx += step) {
      const x = gx + Math.random() * step
      const y = gy + Math.random() * step
      const sx = Math.min(cw - 1, (x * ss) | 0)
      const sy = Math.min(ch - 1, (y * ss) | 0)
      if (data[(sy * cw + sx) * 4 + 3] > 127) out.push(x - cx, y - cy)
    }
  }
  return {
    pts: Float32Array.from(out),
    count: out.length / 2,
    width: (maxX - minX) / ss,
    height: (maxY - minY) / ss,
    cell: step
  }
}

export interface ImageShapeOptions {
  maxW: number
  maxH: number
  maxCount: number
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    img.src = src
  })
}

/** 이미지 → 픽셀마다 입자 1개 (색 그대로). 너무 많으면 성기게 고른다 */
export async function imageShape(dataUrl: string, opt: ImageShapeOptions): Promise<ShapePoints> {
  const img = await loadImage(dataUrl)
  let w = img.naturalWidth || img.width
  let h = img.naturalHeight || img.height
  // 안전장치: 아주 큰 이미지가 와도 240px 로 줄여서 샘플
  const cap = 240 / Math.max(w, h)
  if (cap < 1) {
    w = Math.max(1, Math.round(w * cap))
    h = Math.max(1, Math.round(h * cap))
  }
  scratch.width = w
  scratch.height = h
  sctx.clearRect(0, 0, w, h)
  sctx.imageSmoothingEnabled = true
  sctx.drawImage(img, 0, 0, w, h)
  const data = sctx.getImageData(0, 0, w, h).data

  // 쓸 픽셀 세기
  let usable = 0
  for (let i = 0; i < w * h; i++) {
    const a = data[i * 4 + 3]
    if (a < 40) continue
    const lum = (data[i * 4] * 0.3 + data[i * 4 + 1] * 0.59 + data[i * 4 + 2] * 0.11) * (a / 255)
    if (lum < 22) continue // 거의 검정 → 가산 혼합에선 안 보이므로 생략 (윤곽선이 '빈칸'으로 남는다)
    usable++
  }
  const stride = usable > opt.maxCount ? Math.sqrt(usable / opt.maxCount) : 1
  const cell = Math.min(opt.maxW / w, opt.maxH / h)
  // 작은 도트 그림은 픽셀 하나를 여러 입자로 쪼갠다 (안 그러면 듬성듬성해 보임)
  let sub = 1
  if (stride === 1) {
    sub = Math.max(1, Math.min(5, Math.round(cell / 2.6)))
    while (sub > 1 && usable * sub * sub > opt.maxCount) sub--
  }
  const pts: number[] = []
  const cols: number[] = []
  for (let fy = 0; fy < h; fy += stride) {
    for (let fx = 0; fx < w; fx += stride) {
      const x = Math.min(w - 1, fx | 0)
      const y = Math.min(h - 1, fy | 0)
      const i = (y * w + x) * 4
      const a = data[i + 3]
      if (a < 40) continue
      const af = a / 255
      const r = data[i] / 255
      const g = data[i + 1] / 255
      const b = data[i + 2] / 255
      const lum = (r * 0.3 + g * 0.59 + b * 0.11) * af
      if (lum < 22 / 255) continue
      for (let sy = 0; sy < sub; sy++) {
        for (let sx = 0; sx < sub; sx++) {
          const jx = (Math.random() - 0.5) * 0.3
          const jy = (Math.random() - 0.5) * 0.3
          const px = sub === 1 ? fx + 0.5 + jx : fx + (sx + 0.5 + jx) / sub
          const py = sub === 1 ? fy + 0.5 + jy : fy + (sy + 0.5 + jy) / sub
          pts.push((px - w / 2) * cell, (py - h / 2) * cell)
          cols.push(r * af, g * af, b * af)
        }
      }
    }
  }
  return {
    pts: Float32Array.from(pts),
    colors: Float32Array.from(cols),
    count: pts.length / 2,
    width: w * cell,
    height: h * cell,
    cell: (cell * stride) / sub
  }
}
