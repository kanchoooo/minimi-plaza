// 투명 전체화면 오버레이 — 메인 프로세스가 보낸 불꽃을 재생한다
import { FireworksStage } from '../fireworks/engine'
import type { FireworkShow } from '@shared/types'

const api = window.overlayApi
const host = document.getElementById('stage')!
Object.assign(host.style, { position: 'fixed', inset: '0', overflow: 'hidden' })

// 닫기 버튼 (창은 클릭 통과 상태 → 버튼 위에 있을 때만 클릭을 받는다)
const close = document.createElement('button')
close.textContent = '✕ 닫기 (ESC)'
Object.assign(close.style, {
  position: 'fixed',
  top: api.platform === 'darwin' ? '34px' : '14px',
  right: '18px',
  zIndex: '10',
  padding: '7px 14px',
  border: '1px solid rgba(255,255,255,0.28)',
  borderRadius: '999px',
  background: 'rgba(16, 18, 32, 0.55)',
  color: 'rgba(255,255,255,0.92)',
  font: '600 13px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
  cursor: 'pointer',
  opacity: '0',
  transition: 'opacity 0.3s, background 0.15s',
  pointerEvents: 'auto'
} as Partial<CSSStyleDeclaration>)
document.body.appendChild(close)

let hovering = false
function setHover(on: boolean): void {
  if (hovering === on) return
  hovering = on
  api.setInteractive(on)
  close.style.background = on ? 'rgba(229, 72, 77, 0.85)' : 'rgba(16, 18, 32, 0.55)'
}
close.addEventListener('mouseenter', () => setHover(true))
close.addEventListener('mouseleave', () => setHover(false))
close.addEventListener('click', () => {
  current = null
  setHover(false)
  stage?.stop()
  api.close()
})

let stage: FireworksStage | null = null
let current: string | null = null

function showClose(on: boolean): void {
  close.style.opacity = on ? '1' : '0'
  close.style.pointerEvents = on ? 'auto' : 'none'
  if (!on) setHover(false)
}

async function play(show: FireworkShow): Promise<void> {
  if (!stage) {
    api.ended(show.id)
    return
  }
  current = show.id
  showClose(true)
  try {
    await stage.play(show)
  } catch (err) {
    console.error('[overlay] play failed', err)
  }
  // stop() 으로 끊긴 경우엔 메인이 이미 처리했다
  if (current === show.id) {
    current = null
    showClose(false)
    api.ended(show.id)
  }
}

api.onPlay((show) => void play(show))
api.onStop(() => {
  current = null
  showClose(false)
  stage?.stop()
})

FireworksStage.create(host)
  .then((s) => {
    stage = s
    api.ready()
  })
  .catch((err) => {
    console.error('[overlay] init failed', err)
    // 그래도 메인이 기다리지 않게
    api.ready()
  })
