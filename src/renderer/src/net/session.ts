import { joinRoom, selfId } from 'trystero'
import type { Room, MessageAction, JsonValue } from 'trystero'
import type { FireworkContent, MinimiConfig, PaletteId } from '@shared/types'
import { MAX_PLAZA } from '@shared/types'
import { sanitizeMinimi } from '@/minimi'

/**
 * P2P 광장 세션.
 * Trystero(WebRTC DataChannel, 시그널링은 공개 Nostr 릴레이)로 "광장 코드" 방에 들어간다.
 * 2~6인이라 전원 직접 연결(풀 메시)이고 서버는 없다.
 */

const APP_ID = 'minimi-plaza.v1.4f9c2a'
const PROTOCOL = 1

export { selfId }

export type Dir = 'front' | 'left' | 'right'

export interface PeerStatus {
  dnd: boolean
  receive: boolean
  away: boolean
}

export interface HelloMsg {
  p: number
  uid: string
  name: string
  minimi: MinimiConfig
  joinedAt: number
  status: PeerStatus
  x: number
  y: number
}

export interface StateMsg {
  x: number
  y: number
  dir: Dir
  moving: boolean
}

export interface FireworkMsg {
  callId: string
  id: string
  content: FireworkContent
  countdown: boolean
  finale: boolean
}

export type FwRejectReason = 'off' | 'dnd' | 'nocall' | 'rate' | 'bad'

export interface SessionEvents {
  hello: (peerId: string, h: HelloMsg) => void
  leave: (peerId: string) => void
  state: (peerId: string, s: StateMsg) => void
  chat: (peerId: string, text: string) => void
  call: (peerId: string, callId: string) => void
  answer: (peerId: string, callId: string) => void
  firework: (peerId: string, fw: FireworkMsg) => void
  fwack: (peerId: string, id: string, ok: boolean, reason?: FwRejectReason) => void
  /** 광장이 가득 차서 내가 나가야 함 */
  full: () => void
  /** 시그널링 문제 */
  error: (msg: string) => void
}

type Handlers = { [K in keyof SessionEvents]: Set<SessionEvents[K]> }

const PALETTES: PaletteId[] = ['gold', 'rainbow', 'pink', 'sky', 'mint']
const DIRS: Dir[] = ['front', 'left', 'right']

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '')
const num = (v: unknown, min: number, max: number, def: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def
const bool = (v: unknown): boolean => v === true

function sanitizeHello(raw: unknown): HelloMsg | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const uid = str(r.uid, 40)
  if (!uid) return null
  const s = (r.status ?? {}) as Record<string, unknown>
  return {
    p: num(r.p, 0, 99, 0),
    uid,
    name: str(r.name, 12).trim() || '이름없음',
    minimi: sanitizeMinimi(r.minimi),
    joinedAt: num(r.joinedAt, 0, Number.MAX_SAFE_INTEGER, Date.now()),
    status: { dnd: bool(s.dnd), receive: s.receive !== false, away: bool(s.away) },
    x: num(r.x, 0, 2000, 200),
    y: num(r.y, 0, 2000, 180)
  }
}

function sanitizeState(raw: unknown): StateMsg | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const dir = DIRS.includes(r.dir as Dir) ? (r.dir as Dir) : 'front'
  return { x: num(r.x, 0, 2000, 0), y: num(r.y, 0, 2000, 0), dir, moving: bool(r.moving) }
}

const IMAGE_PREFIX = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/
const MAX_IMAGE_CHARS = 600_000

export function sanitizeFirework(raw: unknown): FireworkMsg | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const c = (r.content ?? {}) as Record<string, unknown>
  let content: FireworkContent
  if (c.kind === 'text') {
    const text = str(c.text, 40).trim()
    if (!text) return null
    const palette = PALETTES.includes(c.palette as PaletteId) ? (c.palette as PaletteId) : 'gold'
    content = { kind: 'text', text, palette }
  } else if (c.kind === 'image') {
    const dataUrl = typeof c.dataUrl === 'string' ? c.dataUrl : ''
    if (dataUrl.length > MAX_IMAGE_CHARS || !IMAGE_PREFIX.test(dataUrl)) return null
    content = { kind: 'image', dataUrl }
  } else return null
  const callId = str(r.callId, 40)
  const id = str(r.id, 40)
  if (!callId || !id) return null
  return { callId, id, content, countdown: bool(r.countdown), finale: bool(r.finale) }
}

/** 수신 측 간단한 속도 제한 (피어별 토큰 버킷) */
class RateLimiter {
  private buckets = new Map<string, { tokens: number; at: number }>()
  constructor(
    private perSec: number,
    private burst: number
  ) {}
  allow(key: string): boolean {
    const now = performance.now()
    const b = this.buckets.get(key) ?? { tokens: this.burst, at: now }
    b.tokens = Math.min(this.burst, b.tokens + ((now - b.at) / 1000) * this.perSec)
    b.at = now
    const ok = b.tokens >= 1
    if (ok) b.tokens -= 1
    this.buckets.set(key, b)
    return ok
  }
}

export interface JoinOptions {
  code: string
  hello: () => Omit<HelloMsg, 'p' | 'joinedAt'>
  turn?: { urls: string; username?: string; credential?: string }[]
}

export class PlazaSession {
  readonly code: string
  readonly joinedAt = Date.now()
  private room: Room
  private handlers = Object.fromEntries(
    ['hello', 'leave', 'state', 'chat', 'call', 'answer', 'firework', 'fwack', 'full', 'error'].map((k) => [k, new Set()])
  ) as unknown as Handlers
  private aHello: MessageAction<JsonValue>
  private aState: MessageAction<JsonValue>
  private aChat: MessageAction<JsonValue>
  private aCall: MessageAction<JsonValue>
  private aAnswer: MessageAction<JsonValue>
  private aFw: MessageAction<JsonValue>
  private aFwAck: MessageAction<JsonValue>
  private known = new Map<string, HelloMsg>()
  private chatLimit = new RateLimiter(2, 6)
  private stateLimit = new RateLimiter(20, 30)
  private callLimit = new RateLimiter(0.2, 2)
  private fwLimit = new RateLimiter(0.05, 1)
  private left = false
  private fullTimer: ReturnType<typeof setTimeout> | null = null
  private getHello: JoinOptions['hello']

  constructor(opts: JoinOptions) {
    this.code = opts.code
    this.getHello = opts.hello
    this.room = joinRoom(
      {
        appId: APP_ID,
        password: 'plaza:' + opts.code,
        maxReceiveBytes: 1_500_000,
        relayConfig: { redundancy: 5 },
        rtcConfig: {
          iceServers: [
            { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
            { urls: 'stun:stun.cloudflare.com:3478' }
          ]
        },
        ...(opts.turn?.length ? { turnConfig: opts.turn } : {})
      },
      'plaza-' + opts.code,
      {
        onJoinError: (d) => this.emit('error', d.error)
      }
    )

    this.aHello = this.room.makeAction<JsonValue>('hello')
    this.aState = this.room.makeAction<JsonValue>('st')
    this.aChat = this.room.makeAction<JsonValue>('chat')
    this.aCall = this.room.makeAction<JsonValue>('call')
    this.aAnswer = this.room.makeAction<JsonValue>('ans')
    this.aFw = this.room.makeAction<JsonValue>('fw')
    this.aFwAck = this.room.makeAction<JsonValue>('fwack')

    this.room.onPeerJoin = (peerId) => {
      void this.aHello.send(this.helloPayload(), { target: peerId })
    }
    this.room.onPeerLeave = (peerId) => {
      if (this.known.delete(peerId)) this.emit('leave', peerId)
    }

    this.aHello.onMessage = (raw, { peerId }) => {
      const h = sanitizeHello(raw)
      if (!h) return
      const isNew = !this.known.has(peerId)
      this.known.set(peerId, h)
      this.emit('hello', peerId, h)
      if (isNew) this.scheduleFullCheck()
    }
    this.aState.onMessage = (raw, { peerId }) => {
      if (!this.known.has(peerId) || !this.stateLimit.allow(peerId)) return
      const s = sanitizeState(raw)
      if (s) this.emit('state', peerId, s)
    }
    this.aChat.onMessage = (raw, { peerId }) => {
      if (!this.known.has(peerId) || !this.chatLimit.allow(peerId)) return
      const text = str((raw as Record<string, unknown>)?.text, 200).trim()
      if (text) this.emit('chat', peerId, text)
    }
    this.aCall.onMessage = (raw, { peerId }) => {
      if (!this.known.has(peerId) || !this.callLimit.allow(peerId)) return
      const id = str((raw as Record<string, unknown>)?.id, 40)
      if (id) this.emit('call', peerId, id)
    }
    this.aAnswer.onMessage = (raw, { peerId }) => {
      if (!this.known.has(peerId)) return
      const id = str((raw as Record<string, unknown>)?.callId, 40)
      if (id) this.emit('answer', peerId, id)
    }
    this.aFw.onMessage = (raw, { peerId }) => {
      if (!this.known.has(peerId)) return
      const fw = sanitizeFirework(raw)
      const id = str((raw as Record<string, unknown>)?.id, 40)
      if (!fw) {
        if (id) this.ackFirework(peerId, id, false, 'bad')
        return
      }
      if (!this.fwLimit.allow(peerId)) {
        this.ackFirework(peerId, fw.id, false, 'rate')
        return
      }
      this.emit('firework', peerId, fw)
    }
    // 이미지 불꽃이 아니면 큰 메시지는 받지 않는다
    this.aChat.onReceive = (ctx) => ctx.byteLength < 4096
    this.aHello.onReceive = (ctx) => ctx.byteLength < 16_384
    this.aState.onReceive = (ctx) => ctx.byteLength < 512
    this.aFw.onReceive = (ctx) => ctx.byteLength < MAX_IMAGE_CHARS + 4096 && this.known.has(ctx.peerId)
    this.aFwAck.onMessage = (raw, { peerId }) => {
      const r = (raw ?? {}) as Record<string, unknown>
      const id = str(r.id, 40)
      const reasons: FwRejectReason[] = ['off', 'dnd', 'nocall', 'rate', 'bad']
      const reason = reasons.includes(r.reason as FwRejectReason) ? (r.reason as FwRejectReason) : undefined
      if (id) this.emit('fwack', peerId, id, r.ok === true, reason)
    }
  }

  on<K extends keyof SessionEvents>(event: K, fn: SessionEvents[K]): () => void {
    ;(this.handlers[event] as Set<SessionEvents[K]>).add(fn)
    return () => (this.handlers[event] as Set<SessionEvents[K]>).delete(fn)
  }

  private emit<K extends keyof SessionEvents>(event: K, ...args: Parameters<SessionEvents[K]>): void {
    for (const fn of this.handlers[event] as Set<(...a: unknown[]) => void>) {
      try {
        fn(...args)
      } catch (err) {
        console.error('[session] handler error', event, err)
      }
    }
  }

  private helloPayload(): JsonValue {
    return { ...this.getHello(), p: PROTOCOL, joinedAt: this.joinedAt } as unknown as JsonValue
  }

  /** 프로필·상태가 바뀌면 다시 알린다 */
  announce(): void {
    if (this.left) return
    void this.aHello.send(this.helloPayload())
  }

  sendState(s: StateMsg): void {
    if (this.left || this.known.size === 0) return
    void this.aState.send({ x: Math.round(s.x * 10) / 10, y: Math.round(s.y * 10) / 10, dir: s.dir, moving: s.moving })
  }

  sendChat(text: string): void {
    void this.aChat.send({ text: text.slice(0, 200) })
  }

  call(peerId: string, id: string): void {
    void this.aCall.send({ id }, { target: peerId })
  }

  answer(peerId: string, callId: string): void {
    void this.aAnswer.send({ callId }, { target: peerId })
  }

  sendFirework(peerId: string, fw: FireworkMsg): Promise<void> {
    return this.aFw.send(fw as unknown as JsonValue, { target: peerId })
  }

  ackFirework(peerId: string, id: string, ok: boolean, reason?: FwRejectReason): void {
    void this.aFwAck.send({ id, ok, ...(reason ? { reason } : {}) }, { target: peerId })
  }

  peerCount(): number {
    return this.known.size
  }

  /**
   * 최대 6명: 들어온 순서(joinedAt, peerId)로 줄을 세워 7번째부터는 스스로 나간다.
   * 모두가 같은 규칙을 쓰므로 서버 없이도 결과가 일치한다.
   */
  private scheduleFullCheck(): void {
    if (this.fullTimer) clearTimeout(this.fullTimer)
    this.fullTimer = setTimeout(() => {
      const order = this.rankOf(selfId)
      if (order >= MAX_PLAZA) this.emit('full')
    }, 1200)
  }

  rankOf(peerId: string): number {
    const all: [number, string][] = [[this.joinedAt, selfId]]
    for (const [id, h] of this.known) all.push([h.joinedAt, id])
    all.sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : 1))
    return all.findIndex(([, id]) => id === peerId)
  }

  async leave(): Promise<void> {
    if (this.left) return
    this.left = true
    if (this.fullTimer) clearTimeout(this.fullTimer)
    try {
      await this.room.leave()
    } catch {
      /* 무시 */
    }
  }
}

const CODE_WORDS = [
  'STAR', 'MOON', 'SODA', 'MINT', 'PEACH', 'LUCKY', 'CANDY', 'CLOUD', 'BERRY', 'HONEY',
  'MANGO', 'LEMON', 'PIXEL', 'TOAST', 'COCOA', 'BUBBLE', 'MOCHI', 'TULIP', 'OCEAN', 'SUNNY'
]

/** 예: STAR-4821 */
export function makeRoomCode(): string {
  const w = CODE_WORDS[Math.floor(Math.random() * CODE_WORDS.length)]
  const n = String(Math.floor(1000 + Math.random() * 9000))
  return `${w}-${n}`
}

/** 입력한 코드를 정규화. 형식이 아니면 null */
export function normalizeRoomCode(input: string): string | null {
  const s = input.toUpperCase().replace(/\s+/g, '').replace(/_/g, '-')
  const m = s.match(/^([A-Z]{2,10})-?(\d{3,6})$/)
  return m ? `${m[1]}-${m[2]}` : null
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}
