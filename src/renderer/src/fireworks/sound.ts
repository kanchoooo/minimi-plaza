// 불꽃 효과음 — 파일 없이 WebAudio 로 합성한다

export class Sfx {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noise: AudioBuffer | null = null
  enabled = true

  private ensure(): AudioContext | null {
    if (!this.enabled) return null
    try {
      if (!this.ctx) {
        const ctx = new AudioContext()
        const comp = ctx.createDynamicsCompressor()
        comp.threshold.value = -14
        comp.ratio.value = 6
        const master = ctx.createGain()
        master.gain.value = 0.32
        master.connect(comp)
        comp.connect(ctx.destination)
        const len = ctx.sampleRate * 1.5
        const buf = ctx.createBuffer(1, len, ctx.sampleRate)
        const d = buf.getChannelData(0)
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
        this.ctx = ctx
        this.master = master
        this.noise = buf
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return this.ctx
    } catch {
      return null
    }
  }

  /** 발사: 바람 가르는 소리 + 옅은 휘파람 */
  launch(fuse: number, pan = 0, gain = 1): void {
    const ctx = this.ensure()
    if (!ctx || !this.master || !this.noise) return
    const t = ctx.currentTime
    const out = this.panner(ctx, pan)

    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.playbackRate.value = 0.8 + Math.random() * 0.3
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 1.6
    bp.frequency.setValueAtTime(380, t)
    bp.frequency.exponentialRampToValueAtTime(2200, t + fuse)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.22 * gain, t + 0.06)
    g.gain.exponentialRampToValueAtTime(0.06 * gain, t + fuse * 0.8)
    g.gain.exponentialRampToValueAtTime(0.0001, t + fuse)
    src.connect(bp).connect(g).connect(out)
    src.start(t, Math.random() * 0.3, fuse + 0.1)

    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(1500 + Math.random() * 300, t)
    osc.frequency.exponentialRampToValueAtTime(2900, t + fuse)
    const og = ctx.createGain()
    og.gain.setValueAtTime(0.0001, t)
    og.gain.exponentialRampToValueAtTime(0.02 * gain, t + 0.1)
    og.gain.exponentialRampToValueAtTime(0.0001, t + fuse)
    osc.connect(og).connect(out)
    osc.start(t)
    osc.stop(t + fuse + 0.05)
  }

  /** 폭발: 낮은 쿵 + 터지는 잡음 + 지글지글 */
  burst(power = 1, pan = 0, crackle = 18): void {
    const ctx = this.ensure()
    if (!ctx || !this.master || !this.noise) return
    const t = ctx.currentTime
    const out = this.panner(ctx, pan)

    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(95, t)
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.45)
    const og = ctx.createGain()
    og.gain.setValueAtTime(0.0001, t)
    og.gain.exponentialRampToValueAtTime(0.7 * power, t + 0.012)
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.6)
    osc.connect(og).connect(out)
    osc.start(t)
    osc.stop(t + 0.65)

    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(2600, t)
    lp.frequency.exponentialRampToValueAtTime(240, t + 0.7)
    const ng = ctx.createGain()
    ng.gain.setValueAtTime(0.0001, t)
    ng.gain.exponentialRampToValueAtTime(0.55 * power, t + 0.01)
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.9)
    src.connect(lp).connect(ng).connect(out)
    src.start(t, Math.random() * 0.4, 1)

    for (let i = 0; i < crackle; i++) {
      const at = t + 0.18 + Math.random() * 0.9
      const c = ctx.createBufferSource()
      c.buffer = this.noise
      const hp = ctx.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 2500 + Math.random() * 3000
      const cg = ctx.createGain()
      const v = (0.05 + Math.random() * 0.1) * power
      cg.gain.setValueAtTime(0.0001, at)
      cg.gain.exponentialRampToValueAtTime(v, at + 0.002)
      cg.gain.exponentialRampToValueAtTime(0.0001, at + 0.03)
      c.connect(hp).connect(cg).connect(out)
      c.start(at, Math.random(), 0.04)
    }
  }

  private panner(ctx: AudioContext, pan: number): AudioNode {
    if (!pan || !ctx.createStereoPanner) return this.master!
    const p = ctx.createStereoPanner()
    p.pan.value = Math.max(-1, Math.min(1, pan))
    p.connect(this.master!)
    return p
  }

  close(): void {
    void this.ctx?.close()
    this.ctx = null
  }
}
