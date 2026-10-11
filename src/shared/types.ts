// 메인 프로세스 · 프리로드 · 렌더러 · 피어 간에 오가는 공용 타입

/** 미니미(캐릭터) 설정. 피어에게 그대로 전송되므로 작게 유지한다. */
export interface MinimiConfig {
  v: 1
  skin: string // 피부색 hex
  hair: string // 머리 스타일 id
  hairColor: string
  eyes: string // 눈 스타일 id
  mouth: string // 입 스타일 id
  blush: boolean // 볼터치
  top: string // 상의 스타일 id
  topColor: string
  bottom: string // 하의 스타일 id
  bottomColor: string
  shoes: string // 신발 스타일 id
  shoesColor: string
  acc: string // 소품 id ('none' 가능)
  accColor: string
  /** 도트 에디터 레이어. MINIMI_W*MINIMI_H 글자, '.' = 빈칸, 나머지는 DOT_PALETTE 인덱스(0-9a-v) */
  dots: string
}

export type PaletteId = 'gold' | 'rainbow' | 'pink' | 'sky' | 'mint'

export type FireworkContent =
  | { kind: 'text'; text: string; palette: PaletteId }
  /** dataUrl 은 보내는 쪽에서 최대 220px 로 축소된 PNG */
  | { kind: 'image'; dataUrl: string }

export interface FireworkShow {
  id: string
  fromName?: string
  content: FireworkContent
  /** 3 → 2 → 1 카운트다운 */
  countdown: boolean
  /** 마지막 일제 발사(발사대 9개) */
  finale: boolean
  /** 효과음 (받는 쪽 설정으로 덮어씀) */
  sound: boolean
}

export interface BlockedUser {
  id: string
  name: string
}

export interface Settings {
  /** 불꽃 받기 */
  receiveFireworks: boolean
  /** 방해금지 모드: 불꽃·부르기 알림 모두 끔 */
  dnd: boolean
  /** 효과음 */
  sound: boolean
  /** 부른 뒤 몇 초 동안 대답이 없으면 불꽃 버튼이 열리는지 */
  callTimeoutSec: number
  blocked: BlockedUser[]
  openAtLogin: boolean
}

export interface Profile {
  /** 기기마다 한 번 만들어지는 고정 id (피어 id 와 별개, 차단에 사용) */
  id: string
  name: string
  minimi: MinimiConfig | null
}

export interface RecentRoom {
  code: string
  lastJoined: number
}

export interface PersistedState {
  profile: Profile
  settings: Settings
  recentRooms: RecentRoom[]
  /** 마지막으로 머물던 광장 (직접 나가면 null) — 다시 켜면 자동 입장 */
  lastRoom: string | null
}

export interface NotifyOptions {
  title: string
  body: string
  /** 클릭 시 렌더러로 돌려줄 태그 */
  tag?: string
}

export interface TrayStatus {
  room: string | null
  peers: number
}

/** 메인 창 preload 가 window.api 로 노출하는 API */
export interface MainApi {
  platform: string
  getState(): Promise<PersistedState>
  setProfile(patch: Partial<Profile>): Promise<PersistedState>
  setSettings(patch: Partial<Settings>): Promise<PersistedState>
  addRecentRoom(code: string): Promise<PersistedState>
  removeRecentRoom(code: string): Promise<PersistedState>
  setLastRoom(code: string | null): Promise<PersistedState>
  onStateChanged(cb: (s: PersistedState) => void): () => void
  /** 내 화면(오버레이)에 불꽃놀이 재생 */
  showFireworks(show: FireworkShow): Promise<void>
  stopFireworks(): Promise<void>
  onFireworksEnded(cb: (id: string) => void): () => void
  notify(opts: NotifyOptions): Promise<void>
  onNotificationClick(cb: (tag: string) => void): () => void
  /** 작업표시줄 깜빡임 / 독 아이콘 튀기기 */
  attention(): Promise<void>
  focusWindow(): Promise<void>
  isWindowFocused(): Promise<boolean>
  setTrayStatus(s: TrayStatus): Promise<void>
  copyText(text: string): Promise<void>
  getVersion(): Promise<string>
}

/** 오버레이 preload 가 window.overlayApi 로 노출하는 API */
export interface OverlayApi {
  platform: string
  onPlay(cb: (show: FireworkShow) => void): void
  onStop(cb: () => void): void
  /** 재생이 끝났음 → 메인이 창을 숨김 */
  ended(id: string): void
  /** 닫기 버튼 위에 마우스가 올라가면 true (클릭 통과 해제) */
  setInteractive(on: boolean): void
  /** 사용자가 닫기 버튼을 눌렀음 */
  close(): void
  ready(): void
}

export const DEFAULT_SETTINGS: Settings = {
  receiveFireworks: true,
  dnd: false,
  sound: true,
  callTimeoutSec: 15,
  blocked: [],
  openAtLogin: false
}

export const MAX_PLAZA = 6
