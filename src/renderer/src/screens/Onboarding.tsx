import { useState } from 'react'
import type { MinimiConfig } from '@shared/types'
import { MinimiEditor } from '@/minimi/MinimiEditor'
import { randomMinimi } from '@/minimi'
import { app, go, myMinimi, saveProfile, toast } from '@/state/app'

/** 첫 실행 / 미니미 꾸미기 공용 화면 */
export function ProfileEditor({ mode }: { mode: 'onboarding' | 'edit' }): React.JSX.Element {
  const profile = app.use((s) => s.persisted.profile)
  const [cfg, setCfg] = useState<MinimiConfig>(() => (profile.minimi ? myMinimi() : randomMinimi()))
  const [name, setName] = useState(profile.name)
  const valid = name.trim().length > 0

  const save = async (): Promise<void> => {
    if (!valid) {
      toast('이름을 적어주세요')
      return
    }
    await saveProfile(name, cfg)
    toast(mode === 'onboarding' ? `반가워요, ${name.trim()}님! ✦` : '미니미를 저장했어요')
    go('lobby')
  }

  return (
    <div className="profile-editor">
      <div className="pe-head">
        <div>
          <h1>{mode === 'onboarding' ? '나만의 미니미를 만들어요' : '미니미 꾸미기'}</h1>
          <p className="muted">광장에서 친구들이 보게 될 내 캐릭터예요. 파츠를 고르고, 도트로 직접 꾸밀 수도 있어요.</p>
        </div>
      </div>
      <div className="pe-editor panel">
        <MinimiEditor value={cfg} onChange={setCfg} />
      </div>
      <div className="pe-foot panel">
        <label className="row">
          <span className="pe-label">내 이름</span>
          <input
            className="input"
            value={name}
            maxLength={12}
            placeholder="광장에서 보일 이름 (12자)"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void save()}
            autoFocus={mode === 'onboarding'}
          />
        </label>
        <div className="grow" />
        {mode === 'edit' && (
          <button className="btn" onClick={() => go('lobby')}>
            취소
          </button>
        )}
        <button className="btn btn-primary btn-lg" disabled={!valid} onClick={() => void save()}>
          {mode === 'onboarding' ? '완성! 광장으로 ✦' : '저장하기'}
        </button>
      </div>
    </div>
  )
}

export function Onboarding(): React.JSX.Element {
  return <ProfileEditor mode="onboarding" />
}
