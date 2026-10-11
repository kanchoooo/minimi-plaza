import type { FireworkContent, MinimiConfig, PersistedState, Settings } from '@shared/types'
import { DEFAULT_SETTINGS, DOWNLOAD_PAGE } from '@shared/types'
import { createStore } from './store'
import { PlazaSession, makeRoomCode, newId, normalizeRoomCode, selfId } from '@/net/session'
import type { FwRejectReason, HelloMsg, PeerStatus } from '@/net/session'
import type { AvatarBadge, PlazaView } from '@/plaza/PlazaView'
import { defaultMinimi } from '@/minimi'
import { playChime, playPop, playRing } from '@/ui/sound'

// ───────── 타입 ─────────
export interface Member {
  peerId: string
  uid: string
  name: string
  minimi: MinimiConfig
  joinedAt: number
  status: PeerStatus
}

export interface ChatLine {
  id: string
  kind: 'chat' | 'system'
  peerId?: string
  uid?: string
  name?: string
  self?: boolean
  text: string
  ts: number
}

/** 내가 건 부르기 */
export type OutCallState = 'ringing' | 'answered' | 'noanswer' | 'fired'
export interface OutCall {
  id: string
  startedAt: number
  deadline: number
  state: OutCallState
  changedAt: number
}

/** 내가 받은 부르기 */
export interface InCall {
  id: string
  receivedAt: number
  answered: boolean
  usedForFw: boolean
}

export type View = 'loading' | 'onboarding' | 'lobby' | 'editor' | 'plaza'

export interface ComposerTarget {
  /** null 이면 '내 화면에 연습' 모드 */
  peerId: string | null
}

export interface AppState {
  view: View
  persisted: PersistedState
  room: { code: string } | null
  members: Record<string, Member>
  chat: ChatLine[]
  outCalls: Record<string, OutCall>
  inCalls: Record<string, InCall>
  /** 부르기 받은 팝업을 띄운 상대 */
  callPrompt: string | null
  selected: string | null
  composer: ComposerTarget | null
  settingsOpen: boolean
  toasts: { id: string; text: string }[]
  now: number
}

const emptyPersisted: PersistedState = {
  profile: { id: '', name: '', minimi: null },
  settings: { ...DEFAULT_SETTINGS },
  recentRooms: [],
  lastRoom: null
}

export const app = createStore<AppState>({
  view: 'loading',
  persisted: emptyPersisted,
  room: null,
  members: {},
  chat: [],
  outCalls: {},
  inCalls: {},
  callPrompt: null,
  selected: null,
  composer: null,
  settingsOpen: false,
  toasts: [],
  now: Date.now()
})

export const SELF = selfId

// ───────── 내부 상태 ─────────
let session: PlazaSession | null = null
let view: PlazaView | null = null
let syncTimer: ReturnType<typeof setInterval> | null = null
let lastSent = { x: -1, y: -1, dir: '', moving: false, at: 0 }
const pendingFw = new Map<string, { peerId: string; timer: ReturnType<typeof setTimeout> }>()

const settings = (): Settings => app.get().persisted.settings
const profile = (): PersistedState['profile'] => app.get().persisted.profile
const isBlocked = (uid: string): boolean => settings().blocked.some((b) => b.id === uid)
export const myMinimi = (): MinimiConfig => profile().minimi ?? defaultMinimi()

// ───────── 토스트 ─────────
export function toast(text: string, ms = 3200): void {
  const id = newId()
  app.set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text }] }))
  setTimeout(() => app.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms)
}

function addLine(line: Omit<ChatLine, 'id' | 'ts'>): void {
  const full: ChatLine = { ...line, id: newId(), ts: Date.now() }
  app.set((s) => ({ chat: [...s.chat.slice(-199), full] }))
}

function sys(text: string): void {
  addLine({ kind: 'system', text })
}

function setPersisted(p: PersistedState): void {
  const prev = app.get().persisted
  app.set({ persisted: p })
  const a = prev.settings
  const b = p.settings
  if (a.dnd !== b.dnd || a.receiveFireworks !== b.receiveFireworks || prev.profile.name !== p.profile.name || prev.profile.minimi !== p.profile.minimi) {
    session?.announce()
    view?.updateAvatar(SELF, { name: p.profile.name, minimi: myMinimi() })
  }
  if (a.blocked !== b.blocked) applyBlocks()
  syncBadges()
}

// ───────── 초기화 ─────────
export async function initApp(): Promise<void> {
  const p = await window.api.getState()
  const ready = !!(p.profile.name && p.profile.minimi)
  app.set({ persisted: p, view: ready ? 'lobby' : 'onboarding' })
  // 트레이 상주용: 마지막 광장으로 자동 재입장 (데모용 #join=코드 가 우선)
  const autoJoin = new URLSearchParams(location.hash.slice(1)).get('join')
  if (autoJoin) pendingAutoJoin = autoJoin
  if (ready && (autoJoin || p.lastRoom)) joinRoom((autoJoin || p.lastRoom)!)
  window.api.onStateChanged(setPersisted)
  window.api.onNotificationClick((tag) => {
    if (tag.startsWith('call:')) answerCall(tag.slice(5))
  })
  window.api.onJoinLink(handleJoinLink)
  const link = await window.api.takeJoinLink()
  if (link) handleJoinLink(link)
  window.api.onFireworksEnded(() => {
    /* 재생 끝 — 필요 시 후처리 */
  })
  // 1초마다: 부르기 시간 초과 확인
  setInterval(tick, 500)
  document.addEventListener('visibilitychange', () => session?.announce())
  window.addEventListener('focus', () => session?.announce())
  window.addEventListener('blur', () => session?.announce())
}

function tick(): void {
  const now = Date.now()
  const s = app.get()
  let changed = false
  const outCalls = { ...s.outCalls }
  for (const [peerId, c] of Object.entries(outCalls)) {
    if (c.state === 'ringing' && now >= c.deadline) {
      outCalls[peerId] = { ...c, state: 'noanswer', changedAt: now }
      changed = true
      const m = s.members[peerId]
      if (m) {
        const canFw = m.status.receive && !m.status.dnd
        toast(canFw ? `${m.name}님이 대답이 없어요… 🎆 불꽃을 쏠 수 있어요!` : `${m.name}님이 대답이 없어요.`, 4500)
        sys(`⏰ ${m.name}님이 ${settings().callTimeoutSec}초 동안 대답이 없어요`)
      }
    }
  }
  app.set(changed ? { now, outCalls } : { now })
  if (changed) syncBadges()
}

// ───────── 프로필 ─────────
let pendingAutoJoin: string | null = null

/** 초대 링크로 앱이 열렸을 때: 미니미가 있으면 바로 입장, 없으면 만들고 나서 입장 */
function handleJoinLink(url: string): void {
  const code = normalizeRoomCode(url)
  if (!code) return
  const s = app.get()
  if (s.room?.code === code) return
  if (!(s.persisted.profile.name && s.persisted.profile.minimi)) {
    pendingAutoJoin = code
    toast('미니미를 만들면 친구의 광장으로 바로 갈게요 ✦', 4500)
    return
  }
  joinRoom(code)
  toast(`초대받은 광장 ${code} 에 들어왔어요!`)
}

/** 친구에게 보낼 초대 메시지 (코드 + 다운로드 링크) */
export function inviteText(code: string): string {
  const name = profile().name
  return [
    `✦ ${name ? name + '님이 ' : ''}미니미 광장으로 초대했어요!`,
    `광장 코드: ${code}`,
    '',
    `👉 ${DOWNLOAD_PAGE}?join=${encodeURIComponent(code)}`,
    '(앱이 없으면 링크에서 설치한 뒤, 앱에서 코드를 붙여넣으면 돼요)'
  ].join('\n')
}

export function copyInvite(): void {
  const code = app.get().room?.code
  if (!code) return
  void window.api.copyText(inviteText(code))
  toast('초대 메시지를 복사했어요! 카톡에 붙여넣어 보내주세요 💌', 4000)
}

export function copyCode(): void {
  const code = app.get().room?.code
  if (!code) return
  void window.api.copyText(code)
  toast(`광장 코드 ${code} 를 복사했어요`)
}

export async function saveProfile(name: string, minimi: MinimiConfig): Promise<void> {
  const p = await window.api.setProfile({ name: name.trim().slice(0, 12), minimi })
  setPersisted(p)
  if (pendingAutoJoin && !session) {
    const code = pendingAutoJoin
    pendingAutoJoin = null
    setTimeout(() => joinRoom(code), 0)
  }
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  setPersisted(await window.api.setSettings(patch))
}

export function go(v: View): void {
  app.set({ view: v })
}

// ───────── 광장 입장/퇴장 ─────────
function hello(): Omit<HelloMsg, 'p' | 'joinedAt'> {
  const st = view?.getSelfState() ?? { x: 200, y: 180 }
  return {
    uid: profile().id,
    name: profile().name || '나',
    minimi: myMinimi(),
    status: { dnd: settings().dnd, receive: settings().receiveFireworks, away: document.hidden },
    x: st.x,
    y: st.y
  }
}

export function createRoom(): void {
  joinRoom(makeRoomCode())
}

export function joinRoom(code: string): void {
  if (session) void leaveRoom(true)
  const s = new PlazaSession({ code, hello })
  session = s
  app.set({ room: { code }, members: {}, chat: [], outCalls: {}, inCalls: {}, callPrompt: null, selected: null, view: 'plaza' })
  void window.api.addRecentRoom(code).then(setPersisted)
  void window.api.setLastRoom(code)
  sys(`🌱 광장 ${code} 에 들어왔어요. 💌 초대하기로 친구를 불러보세요!`)
  updateTray()

  s.on('hello', onHello)
  s.on('leave', onLeave)
  s.on('state', (peerId, st) => {
    const m = app.get().members[peerId]
    if (m && !isBlocked(m.uid)) view?.pushRemoteState(peerId, st)
  })
  s.on('chat', onChat)
  s.on('call', onCall)
  s.on('answer', onAnswer)
  s.on('firework', onFirework)
  s.on('fwack', onFwAck)
  s.on('full', () => {
    toast('광장이 가득 찼어요 (최대 6명)', 4500)
    void leaveRoom()
  })
  s.on('error', (msg) => console.warn('[session]', msg))

  if (syncTimer) clearInterval(syncTimer)
  syncTimer = setInterval(syncSelf, 125)
}

export async function leaveRoom(silent = false): Promise<void> {
  const s = session
  session = null
  if (syncTimer) clearInterval(syncTimer)
  syncTimer = null
  for (const p of pendingFw.values()) clearTimeout(p.timer)
  pendingFw.clear()
  for (const id of Object.keys(app.get().members)) view?.removeAvatar(id)
  app.set({ room: null, members: {}, outCalls: {}, inCalls: {}, callPrompt: null, selected: null, composer: null, view: silent ? app.get().view : 'lobby' })
  if (!silent) void window.api.setLastRoom(null)
  updateTray()
  await s?.leave()
}

function updateTray(): void {
  const s = app.get()
  void window.api.setTrayStatus({ room: s.room?.code ?? null, peers: Object.keys(s.members).length })
}

/** 내 위치를 초당 8회 확인해서 바뀌었을 때만 보낸다 (+2초마다 생존 신호) */
function syncSelf(): void {
  if (!session || !view) return
  const st = view.getSelfState()
  const now = performance.now()
  const moved = Math.abs(st.x - lastSent.x) > 0.3 || Math.abs(st.y - lastSent.y) > 0.3
  if (moved || st.dir !== lastSent.dir || st.moving !== lastSent.moving || now - lastSent.at > 2000) {
    session.sendState(st)
    lastSent = { ...st, at: now }
  }
}

// ───────── 광장 화면 연결 ─────────
export function attachView(v: PlazaView): void {
  view = v
  const spawn = v.randomSpawn()
  v.addAvatar({ id: SELF, name: profile().name || '나', minimi: myMinimi(), isSelf: true, x: spawn.x, y: spawn.y, dir: 'front', moving: false })
  for (const m of Object.values(app.get().members)) {
    if (!isBlocked(m.uid)) v.addAvatar({ id: m.peerId, name: m.name, minimi: m.minimi, isSelf: false, x: spawn.x, y: spawn.y, dir: 'front', moving: false })
  }
  syncBadges()
  session?.announce()
}

export function detachView(v: PlazaView): void {
  if (view === v) view = null
}

export function selectMember(peerId: string | null): void {
  app.set({ selected: peerId })
  view?.setSelected(peerId)
}

function onHello(peerId: string, h: HelloMsg): void {
  const s = app.get()
  const prev = s.members[peerId]
  const sameLook = !!prev && JSON.stringify(prev.minimi) === JSON.stringify(h.minimi)
  const m: Member = { peerId, uid: h.uid, name: h.name, minimi: sameLook ? prev.minimi : h.minimi, joinedAt: h.joinedAt, status: h.status }
  app.set({ members: { ...s.members, [peerId]: m } })
  if (!prev) {
    // 6명 초과분(늦게 온 사람)은 보여주지 않는다 — 그쪽이 스스로 나간다
    if (session && session.rankOf(peerId) >= 6) return
    if (!isBlocked(h.uid)) {
      view?.addAvatar({ id: peerId, name: h.name, minimi: h.minimi, isSelf: false, x: h.x, y: h.y, dir: 'front', moving: false })
      sys(`👋 ${h.name}님이 광장에 왔어요`)
      playChime()
    }
    // 새로 온 친구에게 내 정보를 한 번 더
    session?.announce()
  } else if (prev.name !== h.name || !sameLook) {
    view?.updateAvatar(peerId, { name: h.name, minimi: h.minimi })
  }
  updateTray()
  syncBadges()
}

function onLeave(peerId: string): void {
  const s = app.get()
  const m = s.members[peerId]
  if (!m) return
  const members = { ...s.members }
  delete members[peerId]
  const outCalls = { ...s.outCalls }
  delete outCalls[peerId]
  const inCalls = { ...s.inCalls }
  delete inCalls[peerId]
  app.set({
    members,
    outCalls,
    inCalls,
    callPrompt: s.callPrompt === peerId ? null : s.callPrompt,
    selected: s.selected === peerId ? null : s.selected,
    composer: s.composer?.peerId === peerId ? null : s.composer
  })
  view?.removeAvatar(peerId)
  if (!isBlocked(m.uid)) sys(`🚪 ${m.name}님이 나갔어요`)
  updateTray()
}

// ───────── 채팅 ─────────
export function sendChat(text: string): void {
  const t = text.trim().slice(0, 200)
  if (!t || !session) return
  session.sendChat(t)
  addLine({ kind: 'chat', self: true, name: profile().name, text: t, peerId: SELF })
  view?.showBubble(SELF, t)
  // 채팅을 치면 받은 부르기에 대답한 것으로 본다
  for (const [peerId, c] of Object.entries(app.get().inCalls)) {
    if (!c.answered) answerCall(peerId, true)
  }
}

function onChat(peerId: string, text: string): void {
  const m = app.get().members[peerId]
  if (!m || isBlocked(m.uid)) return
  addLine({ kind: 'chat', peerId, uid: m.uid, name: m.name, text })
  view?.showBubble(peerId, text)
  if (settings().sound && !settings().dnd) playPop()
}

// ───────── 부르기 ─────────
export function callPeer(peerId: string): void {
  const s = app.get()
  const m = s.members[peerId]
  if (!m || !session) return
  const prev = s.outCalls[peerId]
  if (prev && prev.state === 'ringing') return
  const now = Date.now()
  const id = newId()
  const call: OutCall = { id, startedAt: now, deadline: now + settings().callTimeoutSec * 1000, state: 'ringing', changedAt: now }
  app.set({ outCalls: { ...s.outCalls, [peerId]: call } })
  session.call(peerId, id)
  view?.showBubble(SELF, `${m.name}~! 📣`)
  sys(`📣 ${m.name}님을 불렀어요`)
  if (m.status.dnd) toast(`${m.name}님은 방해금지 중이라 알림이 가지 않아요`)
  syncBadges()
}

function onCall(peerId: string, callId: string): void {
  const s = app.get()
  const m = s.members[peerId]
  if (!m || isBlocked(m.uid)) return
  app.set({ inCalls: { ...s.inCalls, [peerId]: { id: callId, receivedAt: Date.now(), answered: false, usedForFw: false } } })
  sys(`📣 ${m.name}님이 나를 부르고 있어요!`)
  syncBadges()
  if (settings().dnd) return
  app.set({ callPrompt: peerId })
  if (settings().sound) playRing()
  void window.api.isWindowFocused().then((focused) => {
    if (!focused) {
      void window.api.notify({ title: `📣 ${m.name}님이 부르고 있어요!`, body: '눌러서 대답하기', tag: 'call:' + peerId })
      void window.api.attention()
    }
  })
}

export function answerCall(peerId: string, quiet = false): void {
  const s = app.get()
  const c = s.inCalls[peerId]
  const m = s.members[peerId]
  if (!c || !session) {
    if (s.callPrompt === peerId) app.set({ callPrompt: null })
    return
  }
  if (!c.answered) {
    session.answer(peerId, c.id)
    if (!quiet && m) view?.showBubble(SELF, '응! 나 여기 있어 👋')
    if (m) sys(`👋 ${m.name}님에게 대답했어요`)
  }
  app.set({ inCalls: { ...s.inCalls, [peerId]: { ...c, answered: true } }, callPrompt: s.callPrompt === peerId ? null : s.callPrompt })
  syncBadges()
}

export function dismissCallPrompt(): void {
  app.set({ callPrompt: null })
}

function onAnswer(peerId: string, callId: string): void {
  const s = app.get()
  const c = s.outCalls[peerId]
  const m = s.members[peerId]
  if (!c || c.id !== callId || !m) return
  if (c.state === 'answered') return
  app.set({ outCalls: { ...s.outCalls, [peerId]: { ...c, state: 'answered', changedAt: Date.now() } } })
  toast(`👋 ${m.name}님이 대답했어요!`)
  view?.showBubble(peerId, '응! 👋')
  if (settings().sound) playChime()
  syncBadges()
  setTimeout(syncBadges, 4200)
}

// ───────── 불꽃 ─────────
export type FwAvailability =
  | { ok: true }
  | { ok: false; reason: 'nocall' | 'ringing' | 'answered' | 'fired' | 'off' | 'dnd' | 'gone'; secondsLeft?: number }

/** 이 친구에게 지금 불꽃을 쏠 수 있는지 (무응답일 때만 열림) */
export function fireworkAvailability(s: AppState, peerId: string): FwAvailability {
  const m = s.members[peerId]
  if (!m) return { ok: false, reason: 'gone' }
  if (!m.status.receive) return { ok: false, reason: 'off' }
  if (m.status.dnd) return { ok: false, reason: 'dnd' }
  const c = s.outCalls[peerId]
  if (!c) return { ok: false, reason: 'nocall' }
  if (c.state === 'ringing') return { ok: false, reason: 'ringing', secondsLeft: Math.max(0, Math.ceil((c.deadline - s.now) / 1000)) }
  if (c.state === 'answered') return { ok: false, reason: 'answered' }
  if (c.state === 'fired') return { ok: false, reason: 'fired' }
  return { ok: true }
}

export function openComposer(peerId: string | null): void {
  app.set({ composer: { peerId } })
}

export function closeComposer(): void {
  app.set({ composer: null })
}

export interface FwOptions {
  countdown: boolean
  finale: boolean
}

export function previewFirework(content: FireworkContent, opts: FwOptions): void {
  void window.api.showFireworks({ id: newId(), content, ...opts, sound: settings().sound })
}

export async function sendFirework(peerId: string, content: FireworkContent, opts: FwOptions): Promise<boolean> {
  const s = app.get()
  const m = s.members[peerId]
  const c = s.outCalls[peerId]
  if (!session || !m || !c || !fireworkAvailability(s, peerId).ok) return false
  const id = newId()
  app.set({ outCalls: { ...s.outCalls, [peerId]: { ...c, state: 'fired', changedAt: Date.now() } } })
  syncBadges()
  const timer = setTimeout(() => {
    if (pendingFw.delete(id)) toast(`${m.name}님에게 전달됐는지 확인하지 못했어요`)
  }, 20_000)
  pendingFw.set(id, { peerId, timer })
  try {
    await session.sendFirework(peerId, { callId: c.id, id, content, countdown: opts.countdown, finale: opts.finale })
  } catch (err) {
    console.warn('[fw] send failed', err)
    clearTimeout(timer)
    pendingFw.delete(id)
    revertFired(peerId)
    toast('불꽃을 보내지 못했어요 😢')
    return false
  }
  toast(`🚀 ${m.name}님에게 불꽃 발사!`)
  sys(`🎆 ${m.name}님에게 불꽃을 쐈어요`)
  return true
}

function revertFired(peerId: string): void {
  const s = app.get()
  const c = s.outCalls[peerId]
  if (c && c.state === 'fired') app.set({ outCalls: { ...s.outCalls, [peerId]: { ...c, state: 'noanswer' } } })
  syncBadges()
}

const REJECT_TEXT: Record<FwRejectReason, string> = {
  off: '상대가 불꽃 받기를 꺼두었어요',
  dnd: '상대가 방해금지 모드예요',
  nocall: '부르기에 대답이 없을 때만 보낼 수 있어요',
  rate: '조금 뒤에 다시 보내주세요',
  bad: '불꽃 내용을 보낼 수 없어요'
}

function onFwAck(peerId: string, id: string, ok: boolean, reason?: FwRejectReason): void {
  const p = pendingFw.get(id)
  if (!p || p.peerId !== peerId) return
  clearTimeout(p.timer)
  pendingFw.delete(id)
  const m = app.get().members[peerId]
  if (ok) toast(`🎆 ${m?.name ?? '친구'}님 화면에 불꽃이 터졌어요!`, 4000)
  else {
    toast(REJECT_TEXT[reason ?? 'bad'], 4000)
    if (reason === 'rate' || reason === 'bad') revertFired(peerId)
  }
}

function onFirework(peerId: string, fw: import('@/net/session').FireworkMsg): void {
  const s = app.get()
  const m = s.members[peerId]
  if (!m || !session) return
  const ack = (ok: boolean, reason?: FwRejectReason): void => session?.ackFirework(peerId, fw.id, ok, reason)
  const st = settings()
  // 안전장치: 차단 / 불꽃 받기 꺼짐 / 방해금지 / 무응답 부르기가 없으면 거절
  if (isBlocked(m.uid) || !st.receiveFireworks) return ack(false, 'off')
  if (st.dnd) return ack(false, 'dnd')
  const c = s.inCalls[peerId]
  if (!c || c.id !== fw.callId || c.answered || c.usedForFw || Date.now() - c.receivedAt < 4500) return ack(false, 'nocall')
  app.set({ inCalls: { ...s.inCalls, [peerId]: { ...c, usedForFw: true } }, callPrompt: peerId })
  syncBadges()
  void window.api.showFireworks({
    id: fw.id,
    fromName: m.name,
    content: fw.content,
    countdown: fw.countdown,
    finale: fw.finale,
    sound: st.sound
  })
  ack(true)
  sys(`🎆 ${m.name}님이 불꽃을 보냈어요!`)
}

// ───────── 차단 ─────────
export async function blockMember(peerId: string): Promise<void> {
  const m = app.get().members[peerId]
  if (!m) return
  const blocked = [...settings().blocked.filter((b) => b.id !== m.uid), { id: m.uid, name: m.name }]
  await updateSettings({ blocked })
  toast(`${m.name}님을 차단했어요`)
}

export async function unblock(uid: string): Promise<void> {
  await updateSettings({ blocked: settings().blocked.filter((b) => b.id !== uid) })
}

function applyBlocks(): void {
  const s = app.get()
  const inCalls = { ...s.inCalls }
  const outCalls = { ...s.outCalls }
  for (const m of Object.values(s.members)) {
    if (isBlocked(m.uid)) {
      view?.removeAvatar(m.peerId)
      delete inCalls[m.peerId]
      delete outCalls[m.peerId]
    } else if (view) {
      // 차단 해제 → 다시 보이기 (이미 있으면 업데이트만)
      view.removeAvatar(m.peerId)
      const sp = view.randomSpawn()
      view.addAvatar({ id: m.peerId, name: m.name, minimi: m.minimi, isSelf: false, x: sp.x, y: sp.y, dir: 'front', moving: false })
    }
  }
  const prompt = s.callPrompt && s.members[s.callPrompt] && isBlocked(s.members[s.callPrompt].uid) ? null : s.callPrompt
  app.set({ inCalls, outCalls, callPrompt: prompt })
  syncBadges()
}

// ───────── 머리 위 아이콘 ─────────
function syncBadges(): void {
  if (!view) return
  const s = app.get()
  const now = Date.now()
  let selfBadge: AvatarBadge = null
  for (const m of Object.values(s.members)) {
    if (isBlocked(m.uid)) continue
    const inc = s.inCalls[m.peerId]
    const out = s.outCalls[m.peerId]
    let b: AvatarBadge = null
    if (inc && !inc.answered) b = 'calling'
    else if (out && (out.state === 'ringing' || out.state === 'noanswer')) b = 'called'
    else if (out && out.state === 'answered' && now - out.changedAt < 4000) b = 'answered'
    else if (m.status.dnd) b = 'dnd'
    else if (m.status.away) b = 'away'
    view.setBadge(m.peerId, b)
    if (out && out.state === 'ringing') selfBadge = 'calling'
  }
  if (!selfBadge && settings().dnd) selfBadge = 'dnd'
  view.setBadge(SELF, selfBadge)
}

export function openSettings(open: boolean): void {
  app.set({ settingsOpen: open })
}
