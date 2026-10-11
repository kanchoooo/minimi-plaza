import { useEffect, useRef } from 'react'
import type { MinimiConfig } from '@shared/types'
import { MINIMI_H, MINIMI_W, renderMinimi, WALK_CYCLE } from './render'
import type { MinimiDir, MinimiFrame } from './render'

export interface MinimiViewProps {
  config: MinimiConfig
  scale?: number
  /** 가끔 눈 깜빡임 */
  animate?: boolean
  /** 걷기 애니메이션 반복 */
  walking?: boolean
  dir?: MinimiDir
  /** 고정 프레임 (animate/walking 보다 우선) */
  frame?: MinimiFrame
  className?: string
  style?: React.CSSProperties
}

/** 픽셀이 뭉개지지 않게 32x40 캔버스를 CSS 로만 확대해서 보여준다 */
export function MinimiView({ config, scale = 3, animate = false, walking = false, dir = 'front', frame, className, style }: MinimiViewProps): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  const cfgRef = useRef(config)
  cfgRef.current = config

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const g = canvas.getContext('2d')!
    const draw = (f: MinimiFrame): void => {
      g.clearRect(0, 0, MINIMI_W, MINIMI_H)
      g.drawImage(renderMinimi(cfgRef.current, f, dir), 0, 0)
    }
    if (frame) {
      draw(frame)
      return
    }
    let timer = 0
    let step = 0
    if (walking) {
      const tick = (): void => {
        draw(WALK_CYCLE[step++ % WALK_CYCLE.length])
        timer = window.setTimeout(tick, 125)
      }
      tick()
    } else if (animate) {
      const idle = (): void => {
        draw('idle')
        timer = window.setTimeout(blink, 2200 + Math.random() * 2800)
      }
      const blink = (): void => {
        draw('blink')
        timer = window.setTimeout(idle, 130)
      }
      idle()
    } else {
      draw('idle')
    }
    return () => window.clearTimeout(timer)
    // config 변경은 아래 effect 에서 즉시 다시 그린다
  }, [walking, animate, dir, frame])

  // 설정이 바뀌면 현재 상태로 즉시 다시 그리기 (애니메이션 타이머는 유지)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || walking) return
    const g = canvas.getContext('2d')!
    g.clearRect(0, 0, MINIMI_W, MINIMI_H)
    g.drawImage(renderMinimi(config, frame ?? 'idle', dir), 0, 0)
  }, [config, frame, dir, walking])

  return (
    <canvas
      ref={ref}
      width={MINIMI_W}
      height={MINIMI_H}
      className={'pixel ' + (className ?? '')}
      style={{ width: MINIMI_W * scale, height: MINIMI_H * scale, imageRendering: 'pixelated', ...style }}
    />
  )
}
