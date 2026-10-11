import { app, leaveRoom, openSettings, toast } from '@/state/app'

export function TopBar(): React.JSX.Element {
  const room = app.use((s) => s.room)
  const view = app.use((s) => s.view)
  const count = app.use((s) => Object.keys(s.members).length + 1)
  const dnd = app.use((s) => s.persisted.settings.dnd)
  const receive = app.use((s) => s.persisted.settings.receiveFireworks)

  const copy = (): void => {
    if (!room) return
    void window.api.copyText(room.code)
    toast(`광장 코드 ${room.code} 를 복사했어요`)
  }

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
          <b className="room-code">{room.code}</b>
          <button className="btn btn-sm" onClick={copy}>
            복사
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
