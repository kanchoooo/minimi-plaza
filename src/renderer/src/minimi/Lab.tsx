// 개발용: index.html#lab=minimi(&view=gallery|editor|parts)
import { useState } from 'react'
import type { MinimiConfig } from '@shared/types'
import { ACCS, BOTTOMS, defaultMinimi, EYES, HAIRS, MOUTHS, randomMinimi, SHOES, TOPS } from './index'
import type { MinimiDir, MinimiFrame } from './index'
import { MinimiView } from './MinimiView'
import { MinimiEditor } from './MinimiEditor'
import './minimi.css'

const view = new URLSearchParams(location.hash.slice(1)).get('view') ?? 'all'

function Cell({ cfg, label, scale = 3, frame, dir }: { cfg: MinimiConfig; label?: string; scale?: number; frame?: MinimiFrame; dir?: MinimiDir }): React.JSX.Element {
  return (
    <div className="lab-cell">
      <MinimiView config={cfg} scale={scale} frame={frame} dir={dir} />
      {label && <span>{label}</span>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="panel lab-section">
      <div className="panel-head">{title}</div>
      <div className="lab-grid">{children}</div>
    </div>
  )
}

export default function MinimiLab(): React.JSX.Element {
  const [cfg, setCfg] = useState<MinimiConfig>(() => ({ ...defaultMinimi(), acc: 'ribbon' }))
  const base = defaultMinimi()
  const randoms = Array.from({ length: 14 }, (_, i) => randomMinimi(i * 7919 + 13))
  const showGallery = view === 'all' || view === 'gallery'
  const showParts = view === 'all' || view === 'parts'
  const showEditor = view === 'all' || view === 'editor'
  const showAcc = view === 'acc'
  const showZoom = view === 'zoom'
  const showHair = view === 'hair'
  return (
    <div className="lab-root scroll">
      {showEditor && (
        <div className="lab-editor panel">
          <MinimiEditor value={cfg} onChange={setCfg} />
        </div>
      )}
      {showGallery && (
        <>
          <Section title="랜덤 미니미">
            {randoms.map((c, i) => (
              <Cell key={i} cfg={c} />
            ))}
          </Section>
          <Section title="프레임 / 방향">
            {(['front', 'left', 'right'] as MinimiDir[]).flatMap((dir) =>
              (['idle', 'blink', 'walk1', 'walk2'] as MinimiFrame[]).map((frame) => (
                <Cell key={dir + frame} cfg={randoms[3]} frame={frame} dir={dir} label={`${dir} ${frame}`} scale={3} />
              ))
            )}
          </Section>
        </>
      )}
      {showZoom && (
        <Section title="확대">
          <Cell cfg={base} scale={8} />
          <Cell cfg={{ ...base, hair: 'long', top: 'dress', topColor: '#ff9cbc', acc: 'ribbon', eyes: 'round', shoes: 'flats', shoesColor: '#3a3d4a' }} scale={8} />
          <Cell cfg={{ ...base, hair: 'short', top: 'hoodie', topColor: '#a6e3a1', eyes: 'smile', mouth: 'open', bottom: 'shorts', acc: 'cap', accColor: '#5b8fd9' }} scale={8} />
          <Cell cfg={{ ...base, hair: 'twin', hairColor: '#e7c06c', top: 'sailor', topColor: '#5b6fd9', bottom: 'pleats', bottomColor: '#5b6fd9', eyes: 'sparkle', acc: 'catears', shoes: 'boots', shoesColor: '#8a5a3c' }} scale={8} />
        </Section>
      )}
      {showHair && (
        <Section title="머리 확대">
          {HAIRS.map((h) => (
            <Cell key={h.id} cfg={{ ...base, hair: h.id, hairColor: h.id === 'curly' ? '#e7c06c' : base.hairColor }} label={h.label} scale={5} />
          ))}
        </Section>
      )}
      {showAcc && (
        <>
          <Section title="소품 (단발)">
            {ACCS.map((a) => (
              <Cell key={a.id} cfg={{ ...base, acc: a.id }} label={a.label} scale={4} />
            ))}
          </Section>
          <Section title="소품 (숏컷 · 뽀글)">
            {ACCS.map((a, i) => (
              <Cell key={a.id} cfg={{ ...base, hair: i % 2 ? 'curly' : 'short', hairColor: '#e7c06c', acc: a.id, accColor: '#7cc2f0' }} label={a.label} scale={4} />
            ))}
          </Section>
        </>
      )}
      {showParts && (
        <>
          <Section title="머리">
            {HAIRS.map((h) => (
              <Cell key={h.id} cfg={{ ...base, hair: h.id }} label={h.label} />
            ))}
          </Section>
          <Section title="눈 · 입">
            {EYES.map((e) => (
              <Cell key={e.id} cfg={{ ...base, eyes: e.id, hair: 'short' }} label={e.label} />
            ))}
            {MOUTHS.map((m) => (
              <Cell key={m.id} cfg={{ ...base, mouth: m.id, hair: 'short' }} label={m.label} />
            ))}
          </Section>
          <Section title="상의 · 하의 · 신발">
            {TOPS.map((t) => (
              <Cell key={t.id} cfg={{ ...base, top: t.id, topColor: '#ff9cbc' }} label={t.label} />
            ))}
            {BOTTOMS.map((b) => (
              <Cell key={b.id} cfg={{ ...base, bottom: b.id }} label={b.label} />
            ))}
            {SHOES.map((s) => (
              <Cell key={s.id} cfg={{ ...base, shoes: s.id, shoesColor: '#ff6f8e' }} label={s.label} />
            ))}
          </Section>
          <Section title="소품">
            {ACCS.map((a) => (
              <Cell key={a.id} cfg={{ ...base, acc: a.id }} label={a.label} />
            ))}
          </Section>
        </>
      )}
    </div>
  )
}
