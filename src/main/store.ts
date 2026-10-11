import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { randomBytes } from 'crypto'
import type { PersistedState, Profile, Settings } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'

type Listener = (s: PersistedState) => void

/** userData/state.json 에 저장되는 아주 작은 JSON 저장소 */
export class Store {
  private file: string
  private listeners = new Set<Listener>()
  state: PersistedState

  constructor() {
    this.file = join(app.getPath('userData'), 'state.json')
    this.state = this.load()
  }

  private load(): PersistedState {
    const fresh: PersistedState = {
      profile: { id: randomBytes(8).toString('hex'), name: '', minimi: null },
      settings: { ...DEFAULT_SETTINGS },
      recentRooms: [],
      lastRoom: null
    }
    try {
      if (!existsSync(this.file)) return fresh
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<PersistedState>
      return {
        profile: { ...fresh.profile, ...(raw.profile ?? {}) },
        settings: { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) },
        recentRooms: Array.isArray(raw.recentRooms) ? raw.recentRooms.slice(0, 8) : [],
        lastRoom: typeof raw.lastRoom === 'string' ? raw.lastRoom : null
      }
    } catch (err) {
      console.error('[store] load failed, starting fresh', err)
      return fresh
    }
  }

  private save(): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      const tmp = this.file + '.tmp'
      writeFileSync(tmp, JSON.stringify(this.state, null, 2))
      renameSync(tmp, this.file)
    } catch (err) {
      console.error('[store] save failed', err)
    }
  }

  onChange(l: Listener): () => void {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }

  private commit(next: PersistedState): PersistedState {
    this.state = next
    this.save()
    for (const l of this.listeners) l(next)
    return next
  }

  setProfile(patch: Partial<Profile>): PersistedState {
    // id 는 바꿀 수 없다
    const { id: _ignored, ...rest } = patch
    return this.commit({ ...this.state, profile: { ...this.state.profile, ...rest } })
  }

  setSettings(patch: Partial<Settings>): PersistedState {
    const settings = { ...this.state.settings, ...patch }
    settings.callTimeoutSec = Math.max(5, Math.min(120, Math.round(settings.callTimeoutSec || 15)))
    return this.commit({ ...this.state, settings })
  }

  addRecentRoom(code: string): PersistedState {
    const rest = this.state.recentRooms.filter((r) => r.code !== code)
    const recentRooms = [{ code, lastJoined: Date.now() }, ...rest].slice(0, 8)
    return this.commit({ ...this.state, recentRooms })
  }

  setLastRoom(code: string | null): PersistedState {
    return this.commit({ ...this.state, lastRoom: code })
  }

  removeRecentRoom(code: string): PersistedState {
    return this.commit({
      ...this.state,
      recentRooms: this.state.recentRooms.filter((r) => r.code !== code)
    })
  }
}
