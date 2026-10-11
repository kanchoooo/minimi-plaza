// 앱 효과음 (WebAudio 합성 — 별도 음원 파일 없음)
let ctx: AudioContext | null = null

function ac(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function tone(freq: number, start: number, dur: number, vol = 0.12, type: OscillatorType = 'triangle'): void {
  const a = ac()
  const o = a.createOscillator()
  const g = a.createGain()
  o.type = type
  o.frequency.value = freq
  g.gain.setValueAtTime(0, a.currentTime + start)
  g.gain.linearRampToValueAtTime(vol, a.currentTime + start + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur)
  o.connect(g).connect(a.destination)
  o.start(a.currentTime + start)
  o.stop(a.currentTime + start + dur + 0.05)
}

/** 부르기 알림: 띠-리-링 */
export function playRing(): void {
  try {
    const notes = [880, 1175, 1568, 1175, 1568]
    notes.forEach((f, i) => tone(f, i * 0.11, 0.22, 0.1))
  } catch {
    /* 오디오 장치 없음 */
  }
}

/** 채팅 수신: 뽁 */
export function playPop(): void {
  try {
    tone(1320, 0, 0.08, 0.06, 'sine')
  } catch {
    /* 무시 */
  }
}

/** 대답 도착: 도-미 */
export function playChime(): void {
  try {
    tone(1047, 0, 0.18, 0.08)
    tone(1319, 0.1, 0.25, 0.08)
  } catch {
    /* 무시 */
  }
}
