import { useEffect, useRef, useState } from 'react'
import type { FireworkContent, PaletteId } from '@shared/types'
import { Modal } from '@/ui/Modal'
import { minimiDataUrl } from '@/minimi'
import { prepareImageForFirework } from '@/fireworks/content'
import { PALETTES, PALETTE_IDS } from '@/fireworks/palettes'
import { app, closeComposer, fireworkAvailability, myMinimi, previewFirework, sendFirework, toast } from '@/state/app'
import type { ComposerTarget } from '@/state/app'

const TEXT_IDEAS = ['대답해!!', '보고싶어', '뭐해?', '나와라~', '생일축하해', '사랑해 💕']

type Tab = 'text' | 'image' | 'minimi'
const MAX_CHARS = 24

export function Composer({ target }: { target: ComposerTarget }): React.JSX.Element {
  const member = app.use((s) => (target.peerId ? s.members[target.peerId] : undefined))
  const canSend = app.use((s) => (target.peerId ? fireworkAvailability(s, target.peerId).ok : false))
  const [tab, setTab] = useState<Tab>('text')
  const [text, setText] = useState('')
  const [palette, setPalette] = useState<PaletteId>('gold')
  const [image, setImage] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(true)
  const [finale, setFinale] = useState(true)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const practice = target.peerId === null

  const loadFile = async (f: File | undefined | null): Promise<void> => {
    if (!f || !f.type.startsWith('image/')) return
    try {
      // 사진은 촘촘할수록 잘 보인다: 320px → 너무 크면 240 → 170
      let url = await prepareImageForFirework(f, 320)
      if (url.length > 550_000) url = await prepareImageForFirework(f, 240)
      if (url.length > 550_000) url = await prepareImageForFirework(f, 170)
      setImage(url)
      setTab('image')
    } catch {
      toast('이미지를 읽지 못했어요')
    }
  }

  // 붙여넣기(⌘V / Ctrl+V)로 이미지 넣기
  useEffect(() => {
    const onPaste = (e: ClipboardEvent): void => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'))
      if (item) void loadFile(item.getAsFile())
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  const content = (): FireworkContent | null => {
    if (tab === 'text') {
      const t = text.trim()
      return t ? { kind: 'text', text: t, palette } : null
    }
    if (tab === 'image') return image ? { kind: 'image', dataUrl: image } : null
    return { kind: 'image', dataUrl: minimiDataUrl(myMinimi(), 5) }
  }

  const c = content()
  const opts = { countdown, finale }

  const preview = (): void => {
    if (!c) return
    previewFirework(c, opts)
  }

  const send = async (): Promise<void> => {
    if (!c || !target.peerId) return
    setBusy(true)
    const ok = await sendFirework(target.peerId, c, opts)
    setBusy(false)
    if (ok) closeComposer()
  }

  const title = practice ? '🎆 불꽃놀이 연습 (내 화면)' : `🎆 ${member?.name ?? '친구'}님 화면에 불꽃 쏘기`

  return (
    <Modal
      title={title}
      onClose={closeComposer}
      width={560}
      footer={
        <>
          <label className="row check">
            <input type="checkbox" checked={countdown} onChange={(e) => setCountdown(e.target.checked)} /> 3·2·1 카운트다운
          </label>
          <label className="row check">
            <input type="checkbox" checked={finale} onChange={(e) => setFinale(e.target.checked)} /> 마지막 일제 발사
          </label>
          <span className="grow" />
          <button className="btn" disabled={!c} onClick={preview}>
            내 화면에 미리보기
          </button>
          {!practice && (
            <button className="btn btn-primary" disabled={!c || !canSend || busy} onClick={() => void send()}>
              🚀 발사!
            </button>
          )}
        </>
      }
    >
      {!practice && !canSend && <div className="composer-warn">지금은 보낼 수 없어요. 친구를 부르고 대답이 없을 때 열려요.</div>}
      {!practice && canSend && <div className="composer-info">{member?.name}님이 대답이 없어요. 화면 가득 불꽃으로 깨워볼까요?</div>}
      <div className="tabs">
        <button className={'tab' + (tab === 'text' ? ' active' : '')} onClick={() => setTab('text')}>
          ✏️ 글자
        </button>
        <button className={'tab' + (tab === 'image' ? ' active' : '')} onClick={() => setTab('image')}>
          🖼 사진
        </button>
        <button className={'tab' + (tab === 'minimi' ? ' active' : '')} onClick={() => setTab('minimi')}>
          ✦ 내 미니미
        </button>
      </div>
      <div className="tab-body composer-body">
        {tab === 'text' && (
          <div className="col">
            <textarea
              className="input composer-text"
              rows={2}
              value={text}
              autoFocus
              placeholder={'불꽃으로 쓸 글자 (두 줄까지)'}
              onChange={(e) => {
                const v = e.target.value.split('\n').slice(0, 2).join('\n')
                setText([...v].slice(0, MAX_CHARS).join(''))
              }}
            />
            <div className="row wrap">
              {TEXT_IDEAS.map((t) => (
                <button key={t} className="chip" onClick={() => setText(t)}>
                  {t}
                </button>
              ))}
              <span className="grow" />
              <span className="faint">
                {[...text].length}/{MAX_CHARS}
              </span>
            </div>
            <div className="row wrap">
              <span className="muted">색</span>
              {PALETTE_IDS.map((id) => (
                <button key={id} className={'palette-pick' + (palette === id ? ' active' : '')} onClick={() => setPalette(id)}>
                  <span className="palette-bar" style={{ background: PALETTES[id].swatch }} />
                  {PALETTES[id].label}
                </button>
              ))}
            </div>
          </div>
        )}
        {tab === 'image' && (
          <div
            className={'drop' + (image ? ' has' : '')}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              void loadFile(e.dataTransfer.files[0])
            }}
          >
            {image ? (
              <>
                <img src={image} className="drop-preview" />
                <span className="faint">다른 사진으로 바꾸려면 클릭</span>
              </>
            ) : (
              <>
                <div className="drop-icon">🖼</div>
                <div>사진을 끌어다 놓거나 클릭해서 고르세요</div>
                <div className="faint">붙여넣기(⌘V / Ctrl+V)도 돼요 · 배경이 투명한 PNG가 제일 예뻐요</div>
              </>
            )}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => void loadFile(e.target.files?.[0])} />
          </div>
        )}
        {tab === 'minimi' && (
          <div className="drop has">
            <img src={minimiDataUrl(myMinimi(), 4)} className="drop-preview pixel" />
            <span className="faint">내 미니미가 도트 하나하나 불꽃이 되어 터져요</span>
          </div>
        )}
      </div>
    </Modal>
  )
}
