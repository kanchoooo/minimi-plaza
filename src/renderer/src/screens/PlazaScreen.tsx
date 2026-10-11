import { useEffect, useRef, useState } from 'react'
import { PlazaView } from '@/plaza/PlazaView'
import { MinimiView } from '@/minimi/MinimiView'
import {
  app,
  attachView,
  blockMember,
  callPeer,
  detachView,
  fireworkAvailability,
  myMinimi,
  openComposer,
  selectMember,
  sendChat,
  toast,
  unblock
} from '@/state/app'
import type { AppState, Member } from '@/state/app'
import { EmojiPicker } from '@/ui/EmojiPicker'

export function PlazaScreen(): React.JSX.Element {
  return (
    <div className="plaza">
      <div className="plaza-map panel">
        <PlazaCanvas />
        <AloneHint />
        <SelectedBar />
      </div>
      <aside className="plaza-side">
        <MemberList />
        <ChatPanel />
      </aside>
    </div>
  )
}

function PlazaCanvas(): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let v: PlazaView | null = null
    let dead = false
    void PlazaView.create(host.current!, {
      onAvatarClick: (id) => selectMember(id)
    }).then((pv) => {
      if (dead) {
        pv.destroy()
        return
      }
      v = pv
      attachView(pv)
    })
    return () => {
      dead = true
      if (v) {
        detachView(v)
        v.destroy()
      }
    }
  }, [])
  return <div className="plaza-canvas" ref={host} />
}

function AloneHint(): React.JSX.Element | null {
  const alone = app.use((s) => Object.keys(s.members).length === 0)
  const code = app.use((s) => s.room?.code ?? '')
  if (!alone) return null
  return (
    <div className="alone-hint">
      <div className="alone-card">
        <div className="alone-title">아직 광장에 아무도 없어요</div>
        <div className="muted">친구에게 광장 코드를 보내주세요</div>
        <div className="row" style={{ justifyContent: 'center', marginTop: 6 }}>
          <b className="room-code big">{code}</b>
          <button
            className="btn btn-sm btn-primary"
            onClick={() => {
              void window.api.copyText(code)
              toast('복사했어요! 친구에게 보내주세요')
            }}
          >
            복사
          </button>
        </div>
        <div className="faint" style={{ marginTop: 6 }}>
          바닥을 클릭하면 미니미가 걸어가요
        </div>
      </div>
    </div>
  )
}

/** 맵에서 친구를 클릭하면 아래에 뜨는 액션 바 */
function SelectedBar(): React.JSX.Element | null {
  const s = app.use((st) => st)
  const m = s.selected ? s.members[s.selected] : undefined
  if (!m || s.persisted.settings.blocked.some((b) => b.id === m.uid)) return null
  const fw = fireworkAvailability(s, m.peerId)
  const ringing = s.outCalls[m.peerId]?.state === 'ringing'
  return (
    <div className="selected-bar panel">
      <div className="member-thumb">
        <MinimiView config={m.minimi} scale={1} />
      </div>
      <div className="grow">
        <div className="member-name">{m.name}</div>
        <div className="member-sub">{statusText(s, m)}</div>
      </div>
      <button className="btn" disabled={ringing} onClick={() => callPeer(m.peerId)}>
        📣 {ringing ? '부르는 중' : '부르기'}
      </button>
      <button className={'btn' + (fw.ok ? ' btn-primary pulse' : '')} disabled={!fw.ok} onClick={() => openComposer(m.peerId)}>
        🎆 불꽃 쏘기{!fw.ok && fw.reason === 'ringing' ? ` (${fw.secondsLeft})` : ''}
      </button>
      <button className="btn btn-ghost btn-icon" onClick={() => selectMember(null)} aria-label="닫기">
        ✕
      </button>
    </div>
  )
}

function MemberList(): React.JSX.Element {
  const members = app.use((s) => s.members)
  const blocked = app.use((s) => s.persisted.settings.blocked)
  const name = app.use((s) => s.persisted.profile.name)
  const dnd = app.use((s) => s.persisted.settings.dnd)
  const list = Object.values(members).sort((a, b) => a.joinedAt - b.joinedAt)
  const isBlocked = (m: Member): boolean => blocked.some((b) => b.id === m.uid)
  return (
    <section className="panel members">
      <div className="panel-head">
        <span>광장 친구들</span>
        <span className="spacer" />
        <span className="faint">{list.length + 1} / 6</span>
      </div>
      <div className="member-list scroll">
        <div className="member me">
          <div className="member-thumb">
            <MinimiView config={myMinimi()} scale={1} />
          </div>
          <div className="member-info">
            <div className="member-name">
              {name} <span className="chip">나</span>
            </div>
            <div className="member-sub faint">{dnd ? '🌙 방해금지 중' : '광장에 있어요'}</div>
          </div>
        </div>
        {list.map((m) => (isBlocked(m) ? <BlockedRow key={m.peerId} m={m} /> : <MemberRow key={m.peerId} m={m} />))}
        {list.length === 0 && <div className="member-empty faint">친구를 기다리는 중…</div>}
      </div>
    </section>
  )
}

function statusText(s: AppState, m: Member): string {
  const out = s.outCalls[m.peerId]
  const inc = s.inCalls[m.peerId]
  if (inc && !inc.answered) return '📣 나를 부르고 있어요!'
  if (out?.state === 'ringing') return `📣 부르는 중… ${Math.max(0, Math.ceil((out.deadline - s.now) / 1000))}초`
  if (out?.state === 'noanswer') return '😶 대답이 없어요'
  if (out?.state === 'answered' && s.now - out.changedAt < 8000) return '👋 대답했어요!'
  if (out?.state === 'fired' && s.now - out.changedAt < 8000) return '🎆 불꽃을 보냈어요'
  if (m.status.dnd) return '🌙 방해금지 중'
  if (m.status.away) return '💤 자리 비움 (트레이)'
  return '광장에 있어요'
}

function MemberRow({ m }: { m: Member }): React.JSX.Element {
  const s = app.use((st) => st)
  const selected = s.selected === m.peerId
  const out = s.outCalls[m.peerId]
  const fw = fireworkAvailability(s, m.peerId)
  const [menu, setMenu] = useState(false)
  const ringing = out?.state === 'ringing'

  let fwTitle = '부르기에 대답이 없을 때 열려요'
  if (!fw.ok) {
    if (fw.reason === 'ringing') fwTitle = `${fw.secondsLeft}초 뒤에 열려요`
    else if (fw.reason === 'off') fwTitle = '친구가 불꽃 받기를 꺼뒀어요'
    else if (fw.reason === 'dnd') fwTitle = '친구가 방해금지 중이에요'
    else if (fw.reason === 'answered') fwTitle = '친구가 대답했어요'
    else if (fw.reason === 'fired') fwTitle = '이미 보냈어요. 다시 불러보세요'
  } else fwTitle = '대답이 없어요! 불꽃을 쏴서 깨워보세요'

  return (
    <div className={'member' + (selected ? ' selected' : '') + (fw.ok ? ' fw-ready' : '')} onClick={() => selectMember(selected ? null : m.peerId)}>
      <div className="member-thumb">
        <MinimiView config={m.minimi} scale={1} />
      </div>
      <div className="member-info">
        <div className="member-name">{m.name}</div>
        <div className="member-sub">{statusText(s, m)}</div>
        <div className="member-actions" onClick={(e) => e.stopPropagation()}>
          <button className="btn btn-sm" disabled={ringing} onClick={() => callPeer(m.peerId)}>
            📣 {ringing ? '부르는 중' : '부르기'}
          </button>
          <button className={'btn btn-sm' + (fw.ok ? ' btn-primary pulse' : '')} disabled={!fw.ok} title={fwTitle} onClick={() => openComposer(m.peerId)}>
            🎆 불꽃{!fw.ok && fw.reason === 'ringing' ? ` ${fw.secondsLeft}` : ''}
          </button>
          <div className="menu-wrap">
            <button className="btn btn-sm btn-ghost" onClick={() => setMenu(!menu)} aria-label="더보기">
              ⋯
            </button>
            {menu && (
              <div className="menu panel" onMouseLeave={() => setMenu(false)}>
                <button
                  className="menu-item btn-danger"
                  onClick={() => {
                    setMenu(false)
                    void blockMember(m.peerId)
                  }}
                >
                  🚫 차단하기
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function BlockedRow({ m }: { m: Member }): React.JSX.Element {
  return (
    <div className="member blocked">
      <div className="member-info">
        <div className="member-name faint">🚫 {m.name} (차단됨)</div>
      </div>
      <button className="btn btn-sm" onClick={() => void unblock(m.uid)}>
        차단 해제
      </button>
    </div>
  )
}

function ChatPanel(): React.JSX.Element {
  const chat = app.use((s) => s.chat)
  const blocked = app.use((s) => s.persisted.settings.blocked)
  const [text, setText] = useState('')
  const list = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  // 커서 자리에 이모지 넣기
  const insertEmoji = (emoji: string): void => {
    const el = input.current
    const start = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? text.length
    const next = (text.slice(0, start) + emoji + text.slice(end)).slice(0, 200)
    setText(next)
    requestAnimationFrame(() => {
      if (!el) return
      el.focus()
      const pos = Math.min(next.length, start + emoji.length)
      el.setSelectionRange(pos, pos)
    })
  }
  const visible = chat.filter((l) => !l.uid || !blocked.some((b) => b.id === l.uid))

  useEffect(() => {
    const el = list.current
    if (el) el.scrollTop = el.scrollHeight
  }, [visible.length])

  const send = (): void => {
    if (!text.trim()) return
    sendChat(text)
    setText('')
  }

  return (
    <section className="panel chat">
      <div className="panel-head">
        <span>광장 채팅</span>
      </div>
      <div className="chat-list scroll" ref={list}>
        {visible.map((l) =>
          l.kind === 'system' ? (
            <div key={l.id} className="chat-sys">
              {l.text}
            </div>
          ) : (
            <div key={l.id} className={'chat-line' + (l.self ? ' self' : '')}>
              <span className="chat-name">{l.name}</span>
              <span className="chat-text">{l.text}</span>
            </div>
          )
        )}
      </div>
      <div className="chat-input">
        <EmojiPicker onPick={insertEmoji} />
        <input
          ref={input}
          className="input grow"
          value={text}
          maxLength={200}
          placeholder="말풍선으로 말하기… (Enter)"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) send()
          }}
        />
        <button className="btn btn-sky" onClick={() => send()}>
          보내기
        </button>
      </div>
    </section>
  )
}
