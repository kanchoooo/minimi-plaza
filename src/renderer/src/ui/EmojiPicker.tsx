import { useEffect, useRef, useState } from 'react'
import './emoji.css'

const GROUPS: { name: string; icon: string; emojis: string[] }[] = [
  {
    name: '표정',
    icon: '😊',
    emojis: '😀 😁 😂 🤣 😊 🙂 😍 🥰 😘 😚 😜 🤪 😎 🤩 🥳 😇 🤗 🤭 🫢 🤔 🙄 😏 😴 😪 😅 😆 😋 🤤 😳 🥺 😢 😭 😤 😡 🤯 😱 🫠 🙃 🤓 😈'.split(' ')
  },
  {
    name: '하트',
    icon: '❤️',
    emojis: '❤️ 🧡 💛 💚 💙 💜 🤍 🖤 🩷 💕 💖 💗 💘 💝 💞 💓 💔 ❣️ 💌 💋 🫶 😻 💑 🌹'.split(' ')
  },
  {
    name: '손짓',
    icon: '👋',
    emojis: '👋 👍 👎 👏 🙌 🙏 ✌️ 🤞 👌 🤙 💪 🫡 🤝 ✋ 👉 👈 👆 👇 🤟 🫰'.split(' ')
  },
  {
    name: '축하',
    icon: '🎉',
    emojis: '🎉 🎊 🎆 🎇 ✨ ⭐ 🌟 💫 🔥 🎂 🎁 🎈 🏆 🥇 💯 🎶 🎵 🌈 ☀️ 🌙 ⛄ 🌸 🌷 🍀'.split(' ')
  },
  {
    name: '동물',
    icon: '🐶',
    emojis: '🐶 🐱 🐰 🐻 🐼 🐨 🐯 🦊 🐷 🐸 🐥 🐣 🦄 🐹 🐭 🐧 🐳 🦋 🐾 🐙'.split(' ')
  },
  {
    name: '음식',
    icon: '🍕',
    emojis: '🍕 🍔 🍟 🌭 🍗 🍜 🍣 🍙 🍰 🧁 🍩 🍪 🍦 🍫 🍓 🍑 🍉 ☕ 🧋 🍺'.split(' ')
  }
]

export interface EmojiPickerProps {
  onPick: (emoji: string) => void
}

/** 채팅 입력창 옆 이모지 버튼 + 고르기 창 */
export function EmojiPicker({ onPick }: EmojiPickerProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [group, setGroup] = useState(0)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="emoji-wrap" ref={wrap}>
      <button type="button" className={'btn btn-icon emoji-btn' + (open ? ' on' : '')} title="이모지" aria-label="이모지" onClick={() => setOpen(!open)}>
        😊
      </button>
      {open && (
        <div className="emoji-pop panel">
          <div className="emoji-tabs">
            {GROUPS.map((g, i) => (
              <button key={g.name} type="button" className={'emoji-tab' + (i === group ? ' active' : '')} title={g.name} onClick={() => setGroup(i)}>
                {g.icon}
              </button>
            ))}
          </div>
          <div className="emoji-grid scroll">
            {GROUPS[group].emojis.map((e) => (
              <button key={e} type="button" className="emoji-cell" onClick={() => onPick(e)}>
                {e}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
