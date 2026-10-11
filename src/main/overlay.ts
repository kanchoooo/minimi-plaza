import { BrowserWindow, globalShortcut, ipcMain, screen } from 'electron'
import type { FireworkShow } from '@shared/types'
import { loadRenderer, preloadPath, isHeadless } from './env'

/**
 * 바탕화면 위에 덮는 투명 전체화면 창.
 * 클릭은 아래로 통과(setIgnoreMouseEvents)하고, 항상 최상단(screen-saver 레벨)에 뜬다.
 * 불꽃 요청은 큐에 쌓아 하나씩 재생한다.
 */
export class OverlayManager {
  win: BrowserWindow | null = null
  private queue: FireworkShow[] = []
  private playing: FireworkShow | null = null
  private ready = false
  private safety: NodeJS.Timeout | null = null
  private escRegistered = false
  /** 테스트 자동화용: 재생 시작 알림 */
  onStart: ((show: FireworkShow) => void) | null = null

  constructor(private onEnded: (id: string) => void) {
    ipcMain.on('overlay:ready', () => {
      this.ready = true
      if (this.queue.length && !this.playing) this.next()
    })
    ipcMain.on('overlay:ended', (_e, id: string) => this.finish(id))
    ipcMain.on('overlay:close', () => this.stopAll())
    ipcMain.on('overlay:interactive', (_e, on: boolean) => {
      if (!this.win || this.win.isDestroyed()) return
      // 닫기 버튼 위에서만 클릭을 받는다. forward 로 마우스 이동은 계속 전달된다.
      if (on) this.win.setIgnoreMouseEvents(false)
      else this.win.setIgnoreMouseEvents(true, { forward: true })
    })
  }

  create(): void {
    const isMac = process.platform === 'darwin'
    const headless = isHeadless()
    const win = new BrowserWindow({
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: false,
      alwaysOnTop: true,
      enableLargerThanScreen: true,
      roundedCorners: false,
      ...(isMac ? { type: 'panel' } : { type: 'toolbar' }),
      ...(headless ? { width: 1440, height: 900 } : {}),
      webPreferences: {
        preload: preloadPath('overlay'),
        sandbox: true,
        contextIsolation: true,
        backgroundThrottling: false,
        offscreen: headless
      }
    })
    win.setIgnoreMouseEvents(true, { forward: true })
    win.setAlwaysOnTop(true, 'screen-saver')
    if (isMac) {
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
    }
    win.on('closed', () => {
      this.win = null
      this.ready = false
    })
    win.webContents.on('console-message', (e) => {
      if (process.env.MINIMI_LOG === '1') console.log(`[overlay:${e.level}] ${e.message}`)
    })
    loadRenderer(win, 'overlay')
    this.win = win
  }

  play(show: FireworkShow): void {
    if (!this.win || this.win.isDestroyed()) this.create()
    this.queue.push(show)
    if (this.queue.length > 5) this.queue.splice(0, this.queue.length - 5)
    if (!this.playing && this.ready) this.next()
  }

  get isPlaying(): boolean {
    return this.playing !== null
  }

  private next(): void {
    const win = this.win
    const show = this.queue.shift()
    if (!win || !show) {
      this.hide()
      return
    }
    this.playing = show
    if (!isHeadless()) {
      const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
      win.setBounds(display.bounds)
      win.showInactive()
      win.setAlwaysOnTop(true, 'screen-saver')
      win.moveTop()
    } else {
      win.showInactive()
    }
    win.setIgnoreMouseEvents(true, { forward: true })
    this.registerEsc()
    if (process.env.MINIMI_LOG === '1') {
      console.log('[overlay] show', JSON.stringify({ bounds: win.getBounds(), onTop: win.isAlwaysOnTop(), visible: win.isVisible(), esc: this.escRegistered }))
    }
    win.webContents.send('overlay:play', show)
    this.onStart?.(show)
    // 재생이 비정상적으로 끝나지 않으면 강제로 닫는다
    if (this.safety) clearTimeout(this.safety)
    this.safety = setTimeout(() => this.finish(show.id), 45_000)
  }

  private finish(id: string): void {
    if (!this.playing || this.playing.id !== id) return
    if (this.safety) clearTimeout(this.safety)
    this.safety = null
    this.playing = null
    this.onEnded(id)
    if (this.queue.length) this.next()
    else this.hide()
  }

  /** ESC / 닫기 버튼: 즉시 전부 닫기 */
  stopAll(): void {
    const id = this.playing?.id
    this.queue = []
    this.playing = null
    if (this.safety) clearTimeout(this.safety)
    this.safety = null
    this.win?.webContents.send('overlay:stop')
    this.hide()
    if (id) this.onEnded(id)
  }

  private hide(): void {
    this.unregisterEsc()
    if (this.win && !this.win.isDestroyed()) {
      this.win.setIgnoreMouseEvents(true, { forward: true })
      this.win.hide()
    }
  }

  private registerEsc(): void {
    if (this.escRegistered) return
    try {
      this.escRegistered = globalShortcut.register('Escape', () => this.stopAll())
    } catch {
      this.escRegistered = false
    }
  }

  private unregisterEsc(): void {
    if (!this.escRegistered) return
    globalShortcut.unregister('Escape')
    this.escRegistered = false
  }
}
