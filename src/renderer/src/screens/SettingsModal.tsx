import { useEffect, useState } from 'react'
import { Modal, Switch } from '@/ui/Modal'
import { app, go, openSettings, unblock, updateSettings } from '@/state/app'

export function SettingsModal(): React.JSX.Element {
  const s = app.use((st) => st.persisted.settings)
  const view = app.use((st) => st.view)
  const [version, setVersion] = useState('')
  useEffect(() => {
    void window.api.getVersion().then(setVersion)
  }, [])
  const close = (): void => openSettings(false)

  return (
    <Modal title="⚙ 설정" onClose={close} width={480}>
      <div className="settings">
        <div className="setting">
          <div className="grow">
            <div className="setting-title">🎆 불꽃 받기</div>
            <div className="faint">끄면 친구가 보낸 불꽃이 내 화면에 나오지 않아요.</div>
          </div>
          <Switch on={s.receiveFireworks} onChange={(v) => void updateSettings({ receiveFireworks: v })} label="불꽃 받기" />
        </div>
        <div className="setting">
          <div className="grow">
            <div className="setting-title">🌙 방해금지 모드</div>
            <div className="faint">부르기 알림·소리와 불꽃을 모두 막아요. 친구에게는 방해금지 중으로 보여요.</div>
          </div>
          <Switch on={s.dnd} onChange={(v) => void updateSettings({ dnd: v })} label="방해금지" />
        </div>
        <div className="setting">
          <div className="grow">
            <div className="setting-title">🔔 효과음</div>
            <div className="faint">부르기 알림음, 불꽃 소리</div>
          </div>
          <Switch on={s.sound} onChange={(v) => void updateSettings({ sound: v })} label="효과음" />
        </div>
        <div className="setting">
          <div className="grow">
            <div className="setting-title">⏰ 대답 기다리는 시간</div>
            <div className="faint">친구를 부르고 이 시간 동안 대답이 없으면 불꽃 버튼이 열려요.</div>
          </div>
          <select className="input" value={s.callTimeoutSec} onChange={(e) => void updateSettings({ callTimeoutSec: Number(e.target.value) })}>
            {[5, 10, 15, 20, 30, 60].map((n) => (
              <option key={n} value={n}>
                {n}초
              </option>
            ))}
          </select>
        </div>
        <div className="setting">
          <div className="grow">
            <div className="setting-title">💻 컴퓨터 켜면 자동 실행</div>
            <div className="faint">트레이에 조용히 떠 있어야 부르기와 불꽃을 받을 수 있어요.</div>
          </div>
          <Switch on={s.openAtLogin} onChange={(v) => void updateSettings({ openAtLogin: v })} label="자동 실행" />
        </div>

        <div className="setting col" style={{ alignItems: 'stretch' }}>
          <div className="setting-title">🚫 차단한 친구</div>
          {s.blocked.length === 0 && <div className="faint">아무도 차단하지 않았어요.</div>}
          {s.blocked.map((b) => (
            <div key={b.id} className="row">
              <span className="grow">{b.name}</span>
              <button className="btn btn-sm" onClick={() => void unblock(b.id)}>
                해제
              </button>
            </div>
          ))}
        </div>

        <div className="row settings-foot">
          {view !== 'plaza' && view !== 'onboarding' && (
            <button
              className="btn btn-sm"
              onClick={() => {
                close()
                go('editor')
              }}
            >
              🎨 미니미·이름 바꾸기
            </button>
          )}
          <span className="grow" />
          <span className="faint">불꽃이 나오는 중엔 ESC 로 바로 끌 수 있어요 · v{version}</span>
        </div>
      </div>
    </Modal>
  )
}
