import { useEffect, useRef, useState } from 'react'
import type { MinimiConfig } from '@shared/types'
import { ACCS, BOTTOMS, EYES, HAIRS, MOUTHS, SHOES, TOPS } from './parts'
import { ACC_COLORS, CLOTH_COLORS, HAIR_COLORS, SHOE_COLORS, SKIN_TONES } from './palette'
import { renderMinimi } from './render'
import type { MinimiDir } from './render'
import { defaultMinimi, randomMinimi } from './index'
import { MinimiView } from './MinimiView'
import { DotEditor } from './DotEditor'
import './minimi.css'

export interface MinimiEditorProps {
  value: MinimiConfig
  onChange: (next: MinimiConfig) => void
}

type Tab = 'face' | 'hair' | 'cloth' | 'acc' | 'dots'

const TABS: { id: Tab; label: string }[] = [
  { id: 'face', label: '얼굴' },
  { id: 'hair', label: '머리' },
  { id: 'cloth', label: '옷' },
  { id: 'acc', label: '소품' },
  { id: 'dots', label: '도트 꾸미기' }
]

interface Region {
  x: number
  y: number
  w: number
  h: number
  scale: number
}

const R_HEAD: Region = { x: 1, y: 0, w: 30, h: 27, scale: 2 }
const R_FACE: Region = { x: 8, y: 15, w: 16, h: 11, scale: 3 }
const R_BODY: Region = { x: 6, y: 26, w: 20, h: 14, scale: 3 }
const R_FEET: Region = { x: 8, y: 33, w: 16, h: 7, scale: 3 }

/** 현재 미니미에 이 파츠를 입혔을 때의 모습을 잘라서 보여주는 썸네일 */
function Thumb({ cfg, region }: { cfg: MinimiConfig; region: Region }): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const g = c.getContext('2d')!
    g.clearRect(0, 0, c.width, c.height)
    g.drawImage(renderMinimi(cfg), region.x, region.y, region.w, region.h, 0, 0, region.w, region.h)
  }, [cfg, region])
  return <canvas ref={ref} width={region.w} height={region.h} style={{ width: region.w * region.scale, height: region.h * region.scale }} />
}

function Options<T extends { id: string; label: string }>({
  list,
  current,
  cfgFor,
  region,
  onPick,
  face
}: {
  list: T[]
  current: string
  cfgFor: (id: string) => MinimiConfig
  region: Region
  onPick: (id: string) => void
  face?: boolean
}): React.JSX.Element {
  return (
    <div className={'mm-options' + (face ? ' face' : '')}>
      {list.map((p) => (
        <button key={p.id} className={'option' + (p.id === current ? ' active' : '')} onClick={() => onPick(p.id)} title={p.label}>
          <Thumb cfg={cfgFor(p.id)} region={region} />
          <span>{p.label}</span>
        </button>
      ))}
    </div>
  )
}

function Colors({ value, colors, onPick }: { value: string; colors: string[]; onPick: (c: string) => void }): React.JSX.Element {
  const v = value.toLowerCase()
  const custom = !colors.some((c) => c.toLowerCase() === v)
  return (
    <div className="mm-swatches">
      {colors.map((c) => (
        <button key={c} className={'swatch' + (c.toLowerCase() === v ? ' active' : '')} style={{ background: c }} onClick={() => onPick(c)} title={c} />
      ))}
      <label className={'mm-custom' + (custom ? ' active' : '')} title="직접 고르기" style={custom ? { background: value } : undefined}>
        <input type="color" value={value} onChange={(e) => onPick(e.target.value)} />
      </label>
    </div>
  )
}

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="mm-group">
      <div className="mm-group-title">
        {title}
        {hint && <span className="hint">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

export function MinimiEditor({ value, onChange }: MinimiEditorProps): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('face')
  const [dir, setDir] = useState<MinimiDir>('front')
  const [walking, setWalking] = useState(false)
  const [undoCfg, setUndoCfg] = useState<MinimiConfig | null>(null)

  const set = <K extends keyof MinimiConfig>(key: K, v: MinimiConfig[K]): void => onChange({ ...value, [key]: v })
  const variant = (key: keyof MinimiConfig) => (id: string): MinimiConfig => ({ ...value, [key]: id })
  const top = TOPS.find((t) => t.id === value.top)

  const randomize = (): void => {
    setUndoCfg(value)
    // 직접 그린 도트는 남겨 둔다
    onChange({ ...randomMinimi(), dots: value.dots })
  }
  const reset = (): void => {
    setUndoCfg(value)
    onChange(defaultMinimi())
  }

  return (
    <div className="mm-editor">
      <div className="mm-preview">
        <div className="mm-stage">
          <span className="mm-stage-label">미리보기</span>
          <div className="mm-stage-inner">
            <MinimiView config={value} scale={6} animate walking={walking} dir={dir} />
            <div className="mm-shadow" />
          </div>
        </div>
        <div className="mm-controls">
          <div className="mm-chips">
            {(
              [
                ['front', '정면'],
                ['left', '왼쪽'],
                ['right', '오른쪽']
              ] as [MinimiDir, string][]
            ).map(([d, label]) => (
              <span key={d} className={'chip' + (dir === d ? ' on' : '')} onClick={() => setDir(d)}>
                {label}
              </span>
            ))}
            <span className={'chip' + (walking ? ' on' : '')} onClick={() => setWalking((w) => !w)}>
              🚶 걷기
            </span>
          </div>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn btn-sm" onClick={randomize}>
              🎲 랜덤
            </button>
            <button className="btn btn-sm" onClick={reset}>
              초기화
            </button>
            <button
              className="btn btn-sm btn-icon"
              onClick={() => {
                if (undoCfg) onChange(undoCfg)
                setUndoCfg(null)
              }}
              disabled={!undoCfg}
              title="랜덤/초기화 되돌리기"
            >
              ↶
            </button>
          </div>
        </div>
      </div>

      <div className="mm-side">
        <div className="tabs">
          {TABS.map((t) => (
            <div key={t.id} className={'tab' + (tab === t.id ? ' active' : '')} onClick={() => setTab(t.id)}>
              {t.label}
            </div>
          ))}
        </div>
        <div className="tab-body scroll" style={tab === 'dots' ? { overflow: 'hidden' } : undefined}>
          {tab === 'face' && (
            <>
              <Group title="피부색">
                <Colors value={value.skin} colors={SKIN_TONES} onPick={(c) => set('skin', c)} />
              </Group>
              <Group title="눈">
                <Options list={EYES} current={value.eyes} cfgFor={variant('eyes')} region={R_FACE} onPick={(id) => set('eyes', id)} face />
              </Group>
              <Group title="입">
                <Options list={MOUTHS} current={value.mouth} cfgFor={variant('mouth')} region={R_FACE} onPick={(id) => set('mouth', id)} face />
              </Group>
              <Group title="볼터치">
                <label className="mm-toggle-row">
                  <span className={'switch' + (value.blush ? ' on' : '')} onClick={() => set('blush', !value.blush)} />
                  {value.blush ? '발그레 ♥' : '없음'}
                </label>
              </Group>
            </>
          )}

          {tab === 'hair' && (
            <>
              <Group title="머리 모양">
                <Options list={HAIRS} current={value.hair} cfgFor={variant('hair')} region={R_HEAD} onPick={(id) => set('hair', id)} />
              </Group>
              <Group title="머리 색">
                <Colors value={value.hairColor} colors={HAIR_COLORS} onPick={(c) => set('hairColor', c)} />
              </Group>
            </>
          )}

          {tab === 'cloth' && (
            <>
              <Group title="상의">
                <Options list={TOPS} current={value.top} cfgFor={variant('top')} region={R_BODY} onPick={(id) => set('top', id)} />
                <div style={{ height: 6 }} />
                <Colors value={value.topColor} colors={CLOTH_COLORS} onPick={(c) => set('topColor', c)} />
              </Group>
              <Group title="하의" hint={top?.hidesBottom ? `${top.label}에는 하의가 가려져요` : undefined}>
                <div style={top?.hidesBottom ? { opacity: 0.45 } : undefined}>
                  <Options list={BOTTOMS} current={value.bottom} cfgFor={variant('bottom')} region={R_BODY} onPick={(id) => set('bottom', id)} />
                  <div style={{ height: 6 }} />
                  <Colors value={value.bottomColor} colors={CLOTH_COLORS} onPick={(c) => set('bottomColor', c)} />
                </div>
              </Group>
              <Group title="신발">
                <Options list={SHOES} current={value.shoes} cfgFor={variant('shoes')} region={R_FEET} onPick={(id) => set('shoes', id)} />
                <div style={{ height: 6 }} />
                <Colors value={value.shoesColor} colors={SHOE_COLORS} onPick={(c) => set('shoesColor', c)} />
              </Group>
            </>
          )}

          {tab === 'acc' && (
            <>
              <Group title="소품">
                <Options list={ACCS} current={value.acc} cfgFor={variant('acc')} region={R_HEAD} onPick={(id) => set('acc', id)} />
              </Group>
              {value.acc !== 'none' && (
                <Group title="소품 색">
                  <Colors value={value.accColor} colors={ACC_COLORS} onPick={(c) => set('accColor', c)} />
                </Group>
              )}
            </>
          )}

          {tab === 'dots' && <DotEditor value={value} onChange={onChange} />}
        </div>
      </div>
    </div>
  )
}
