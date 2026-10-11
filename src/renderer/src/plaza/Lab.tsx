// 개발용: 광장 씬 단독 확인 (index.html#lab=plaza)
import { useEffect, useRef } from 'react'
import { defaultMinimi, randomMinimi } from '@/minimi'
import { PlazaView, type AvatarBadge, type Dir } from './PlazaView'
import { isWalkable } from './map'

export default function PlazaLab(): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let view: PlazaView | null = null
    let alive = true
    const timers: number[] = []
    void PlazaView.create(host.current!, {
      onAvatarClick: (id) => {
        view?.setSelected(id)
        view?.jump(id)
      },
      onSelfMove: () => view?.setSelected(null)
    }).then((v) => {
      if (!alive) {
        v.destroy()
        return
      }
      view = v
      ;(window as unknown as { __plaza: PlazaView }).__plaza = v
      const me = { x: 210, y: 236 }
      v.addAvatar({ id: 'me', name: '나', minimi: defaultMinimi(), isSelf: true, ...me, dir: 'front', moving: false })

      const names = ['민지', '하준', '서연', '도윤', '지우']
      const badges: AvatarBadge[] = ['calling', 'called', 'dnd', 'answered', 'away']
      const fakes = names.map((name, i) => {
        const p = v.randomSpawn()
        const id = 'f' + i
        v.addAvatar({ id, name, minimi: randomMinimi(), isSelf: false, ...p, dir: 'front', moving: false })
        v.setBadge(id, badges[i])
        return { id, x: p.x, y: p.y, tx: p.x, ty: p.y, wait: Math.random() * 1500, dir: 'front' as Dir, moving: false }
      })
      v.setSelected('f1')

      // 가짜 원격 피어: 125ms 마다 위치 전송 (보간 확인)
      let last = performance.now()
      timers.push(
        window.setInterval(() => {
          const now = performance.now()
          const dt = (now - last) / 1000
          last = now
          for (const f of fakes) {
            if (f.id === 'f4') continue // 한 명은 가만히(자는 중)
            if (f.wait > 0) {
              f.wait -= dt * 1000
              f.moving = false
            } else {
              const dx = f.tx - f.x
              const dy = f.ty - f.y
              const d = Math.hypot(dx, dy)
              if (d < 2) {
                f.wait = 800 + Math.random() * 2500
                for (let k = 0; k < 50; k++) {
                  const tx = f.x + (Math.random() - 0.5) * 160
                  const ty = f.y + (Math.random() - 0.5) * 90
                  if (isWalkable(tx, ty)) {
                    f.tx = tx
                    f.ty = ty
                    break
                  }
                }
              } else {
                const st = Math.min(d, 60 * dt)
                const nx = f.x + (dx / d) * st
                const ny = f.y + (dy / d) * st
                if (isWalkable(nx, ny)) {
                  f.x = nx
                  f.y = ny
                  f.moving = true
                  f.dir = Math.abs(dx) > Math.abs(dy) * 0.45 ? (dx < 0 ? 'left' : 'right') : 'front'
                } else {
                  f.tx = f.x
                  f.ty = f.y
                }
              }
            }
            v.pushRemoteState(f.id, { x: f.x, y: f.y, dir: f.dir, moving: f.moving })
          }
        }, 125)
      )

      const lines: [string, string, number][] = [
        ['f0', '야 대답 좀 해봐!!', 300],
        ['f2', '안녕 ㅎㅎ', 500],
        ['me', '오늘 저녁 뭐 먹을래? 나는 떡볶이 먹고 싶은데 다들 어때?', 700],
        ['f3', '광장 분수 너무 예쁘다 💦', 900],
        ['f1', '응?', 1100]
      ]
      for (const [id, text, at] of lines) timers.push(window.setTimeout(() => v.showBubble(id, text), at))
      timers.push(window.setTimeout(() => v.walkSelfTo(150, 205), 400))
    })
    return () => {
      alive = false
      timers.forEach((t) => {
        clearInterval(t)
        clearTimeout(t)
      })
      view?.destroy()
    }
  }, [])

  // #lab=plaza&w=680 처럼 폭을 줄여 카메라 따라가기 확인
  const w = Number(new URLSearchParams(location.hash.slice(1)).get('w')) || 0
  return <div ref={host} style={{ position: 'fixed', left: 0, top: 0, bottom: 0, right: w ? 'auto' : 0, width: w || undefined }} />
}
