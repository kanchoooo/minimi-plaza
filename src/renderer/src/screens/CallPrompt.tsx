import { MinimiView } from '@/minimi/MinimiView'
import { answerCall, app, dismissCallPrompt } from '@/state/app'

/** 누가 나를 불렀을 때 뜨는 팝업 */
export function CallPrompt(): React.JSX.Element | null {
  const peerId = app.use((s) => s.callPrompt)
  const member = app.use((s) => (s.callPrompt ? s.members[s.callPrompt] : undefined))
  const call = app.use((s) => (s.callPrompt ? s.inCalls[s.callPrompt] : undefined))
  if (!peerId || !member || !call || call.answered) return null
  return (
    <div className="call-prompt panel">
      <div className="call-avatar wiggle">
        <MinimiView config={member.minimi} scale={3} animate />
      </div>
      <div className="call-body">
        <div className="call-title">📣 {member.name}님이 부르고 있어요!</div>
        <div className="muted">{call.usedForFw ? '대답이 없어서 불꽃까지 쐈대요 🎆' : '대답하지 않으면 불꽃이 날아올지도…?'}</div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn btn-primary" onClick={() => answerCall(peerId)}>
            👋 대답하기
          </button>
          <button className="btn" onClick={dismissCallPrompt}>
            나중에
          </button>
        </div>
      </div>
    </div>
  )
}
