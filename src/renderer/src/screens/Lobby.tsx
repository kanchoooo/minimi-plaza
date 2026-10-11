import { useState } from 'react'
import { MinimiView } from '@/minimi/MinimiView'
import { normalizeRoomCode } from '@/net/session'
import { app, createRoom, go, joinRoom, myMinimi, openComposer, openSettings, toast } from '@/state/app'

const MORE_APPS_URL = 'https://easyticket.co.kr/apps/'

function timeAgo(ts: number): string {
  const m = Math.floor((Date.now() - ts) / 60000)
  if (m < 1) return '방금'
  if (m < 60) return `${m}분 전`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}시간 전`
  return `${Math.floor(h / 24)}일 전`
}

export function Lobby(): React.JSX.Element {
  const profile = app.use((s) => s.persisted.profile)
  const settings = app.use((s) => s.persisted.settings)
  const recent = app.use((s) => s.persisted.recentRooms)
  const [code, setCode] = useState('')

  const enter = (): void => {
    const c = normalizeRoomCode(code)
    if (!c) {
      toast('코드 형식이 달라요 (예: STAR-4821)')
      return
    }
    joinRoom(c)
  }

  return (
    <div className="lobby">
      <section className="panel lobby-me">
        <div className="panel-head">
          <span>✦ 내 미니미</span>
        </div>
        <div className="lobby-me-body">
          <div className="lobby-stage">
            <div className="lobby-stage-floor" />
            <MinimiView config={myMinimi()} scale={5} animate />
          </div>
          <div className="lobby-name">{profile.name}</div>
          <button className="btn" onClick={() => go('editor')}>
            🎨 미니미 꾸미기
          </button>
          <div className="lobby-status">
            <button className={'chip' + (settings.receiveFireworks ? ' on' : '')} onClick={() => openSettings(true)}>
              🎆 불꽃 받기 {settings.receiveFireworks ? 'ON' : 'OFF'}
            </button>
            <button className={'chip' + (settings.dnd ? ' on' : '')} onClick={() => openSettings(true)}>
              🌙 방해금지 {settings.dnd ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
      </section>

      <div className="lobby-right">
        <section className="panel lobby-card lobby-create">
          <div className="lobby-card-text">
            <h2>새 광장 만들기</h2>
            <p className="muted">광장을 만들고 코드를 친구에게 보내주세요. 최대 6명까지 모일 수 있어요.</p>
          </div>
          <button className="btn btn-primary btn-lg" onClick={createRoom}>
            ✦ 광장 만들기
          </button>
        </section>

        <section className="panel lobby-card">
          <div className="lobby-card-text">
            <h2>코드로 들어가기</h2>
            <p className="muted">친구에게 받은 광장 코드를 입력하세요.</p>
          </div>
          <div className="row">
            <input
              className="input code-input"
              placeholder="STAR-4821"
              value={code}
              maxLength={16}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && enter()}
            />
            <button className="btn btn-sky" onClick={enter} disabled={!code.trim()}>
              입장
            </button>
          </div>
        </section>

        {recent.length > 0 && (
          <section className="panel lobby-recent">
            <div className="panel-head">
              <span>최근 들어간 광장</span>
            </div>
            <div className="recent-list">
              {recent.slice(0, 5).map((r) => (
                <button key={r.code} className="recent-item" onClick={() => joinRoom(r.code)}>
                  <span className="room-code">{r.code}</span>
                  <span className="faint">{timeAgo(r.lastJoined)}</span>
                  <span className="grow" />
                  <span className="recent-go">들어가기 →</span>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="panel lobby-card lobby-practice">
          <div className="lobby-card-text">
            <h2>🎆 불꽃놀이 연습</h2>
            <p className="muted">글자나 사진을 불꽃으로 만들어 내 화면에 먼저 쏴볼 수 있어요.</p>
          </div>
          <button className="btn" onClick={() => openComposer(null)}>
            내 화면에 쏴보기
          </button>
        </section>

        <div className="lobby-how">
          <span>📣 친구 부르기</span>
          <span className="faint">→</span>
          <span>{settings.callTimeoutSec}초 동안 대답이 없으면</span>
          <span className="faint">→</span>
          <span>🎆 친구 화면에 불꽃 쏘기</span>
        </div>

        <a className="btn lobby-more-apps" href={MORE_APPS_URL} target="_blank" rel="noreferrer">
          🧩 개발자의 다른 앱 보기
        </a>
      </div>
    </div>
  )
}
