import { app, copyCode, copyInvite, leaveRoom, openSettings } from '@/state/app'

export function TopBar(): React.JSX.Element {
  const room = app.use((s) => s.room)
  const view = app.use((s) => s.view)
  const count = app.use((s) => Object.keys(s.members).length + 1)
  const dnd = app.use((s) => s.persisted.settings.dnd)
  const receive = app.use((s) => s.persisted.settings.receiveFireworks)

  return (
    <header className="topbar drag">
      <div className="brand">
        <span className="brand-spark" aria-hidden>
          ✦
        </span>
        <span className="brand-name">미니미 광장</span>
      </div>
      {view === 'plaza' && room && (
        <div className="room-chip no-drag">
          <span className="faint">광장 코드</span>
          <b className="room-code" title="눌러서 코드만 복사" onClick={copyCode}>
            {room.code}
          </b>
          <button className="btn btn-sm btn-primary" onClick={copyInvite} title="코드 + 다운로드 링크를 함께 복사">
            💌 초대하기
          </button>
          <span className="chip">{count} / 6명</span>
        </div>
      )}
      <div className="topbar-spacer" />
      <div className="topbar-right">
        {dnd && <span className="chip on">🌙 방해금지</span>}
        {!receive && !dnd && <span className="chip">불꽃 받기 꺼짐</span>}
        {view === 'plaza' && (
          <button className="btn btn-sm" onClick={() => void leaveRoom()}>
            광장 나가기
          </button>
        )}
        {view !== 'onboarding' && (
          <button className="btn btn-sm btn-icon" title="설정" onClick={() => openSettings(true)}>
            ⚙
          </button>
        )}
      </div>
    </header>
  )
}
