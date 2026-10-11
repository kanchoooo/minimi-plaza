import { app, BrowserWindow, clipboard, ipcMain, Menu, Notification, shell, Tray } from 'electron'
import { readFileSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { FireworkShow, NotifyOptions, Profile, Settings, TrayStatus } from '@shared/types'
import { APP_PROTOCOL } from '@shared/types'
import { Store } from './store'
import { OverlayManager } from './overlay'
import { trayIcon } from './icons'
import { env, isHeadless, loadRenderer, preloadPath } from './env'
import { setupUpdater } from './updater'

// ───────── 개발용 별도 프로필 ─────────
const devProfile = env.MINIMI_PROFILE
if (devProfile) {
  app.setPath('userData', join(app.getPath('appData'), `minimi-plaza-dev-${devProfile}`))
}
if (process.platform === 'win32') app.setAppUserModelId('com.minimiplaza.app')

// 한 번만 실행 (개발용 프로필은 예외)
if (!devProfile && !isHeadless() && !app.requestSingleInstanceLock()) {
  app.quit()
}

// ───────── 초대 링크 (minimiplaza://join/코드) ─────────
let pendingLink: string | null = null
const findLink = (argv: string[]): string | null => argv.find((a) => a.startsWith(APP_PROTOCOL + '://')) ?? null

function handleLink(url: string): void {
  const link = String(url).slice(0, 300)
  if (mainWin && !mainWin.isDestroyed() && !mainWin.webContents.isLoading()) {
    showMain()
    mainWin.webContents.send('app:joinLink', link)
  } else {
    pendingLink = link
  }
}

// 맥: 링크로 열면 open-url (앱이 뜨기 전에도 올 수 있다)
app.on('open-url', (e, url) => {
  e.preventDefault()
  handleLink(url)
})
// 윈도우: 처음 실행할 때 인자로 들어온다
pendingLink = findLink(process.argv)

let mainWin: BrowserWindow | null = null
let tray: Tray | null = null
let store: Store
let overlay: OverlayManager
let quitting = false
let trayStatus: TrayStatus = { room: null, peers: 0 }
let toldAboutTray = false
const startHidden = process.argv.includes('--hidden') || (process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin)
const liveNotifications = new Set<Notification>()

function showMain(): void {
  if (!mainWin || mainWin.isDestroyed()) createMainWindow()
  if (!mainWin) return
  if (mainWin.isMinimized()) mainWin.restore()
  mainWin.show()
  mainWin.focus()
}

function createMainWindow(): void {
  const isMac = process.platform === 'darwin'
  const headless = isHeadless()
  const [w, h] = (env.MINIMI_SIZE ?? '1180x760').split('x').map(Number)
  const pos = env.MINIMI_WINPOS?.split(',').map(Number)
  const win = new BrowserWindow({
    width: w,
    height: h,
    ...(pos && pos.length === 2 ? { x: pos[0], y: pos[1] } : {}),
    minWidth: 980,
    minHeight: 640,
    show: false,
    title: '미니미 광장',
    backgroundColor: '#dfeef8',
    autoHideMenuBar: true,
    ...(isMac ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 14 } } : {}),
    webPreferences: {
      preload: preloadPath('index'),
      sandbox: true,
      contextIsolation: true,
      // 트레이에 숨어 있어도 P2P·타이머가 멈추지 않게
      backgroundThrottling: false,
      offscreen: headless
    }
  })
  win.once('ready-to-show', () => {
    // 로그인 시 자동 실행이면 창 없이 트레이로 시작
    if (!headless && !startHidden) win.show()
  })
  win.on('close', (e) => {
    if (quitting) return
    // 닫아도 트레이에 남아 있어야 부르기·불꽃을 받을 수 있다
    e.preventDefault()
    win.hide()
    if (!toldAboutTray && process.platform !== 'darwin') {
      toldAboutTray = true
      notify({ title: '미니미 광장은 계속 실행 중이에요', body: '트레이 아이콘에서 다시 열거나 종료할 수 있어요.' })
    }
  })
  win.on('focus', () => win.flashFrame(false))
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('console-message', (e) => {
    if (env.MINIMI_LOG === '1') console.log(`[renderer:${e.level}] ${e.message}`)
  })
  const hash = env.MINIMI_LAB ? `lab=${env.MINIMI_LAB}` : env.MINIMI_AUTOJOIN ? `join=${env.MINIMI_AUTOJOIN}` : undefined
  loadRenderer(win, 'index', hash)
  mainWin = win
}

function notify(opts: NotifyOptions): void {
  if (!Notification.isSupported()) return
  const n = new Notification({ title: opts.title, body: opts.body, silent: true })
  liveNotifications.add(n)
  n.on('click', () => {
    showMain()
    if (opts.tag) mainWin?.webContents.send('app:notificationClick', opts.tag)
    liveNotifications.delete(n)
  })
  n.on('close', () => liveNotifications.delete(n))
  n.show()
  setTimeout(() => liveNotifications.delete(n), 60_000)
}

function buildTrayMenu(): void {
  if (!tray) return
  const s = store.state.settings
  const roomLine = trayStatus.room ? `광장 ${trayStatus.room} · ${trayStatus.peers + 1}명` : '광장에 들어가 있지 않아요'
  const menu = Menu.buildFromTemplate([
    { label: '미니미 광장 열기', click: showMain },
    { label: roomLine, enabled: false },
    { type: 'separator' },
    {
      label: '불꽃 받기',
      type: 'checkbox',
      checked: s.receiveFireworks,
      click: (item) => store.setSettings({ receiveFireworks: item.checked })
    },
    {
      label: '방해금지 모드',
      type: 'checkbox',
      checked: s.dnd,
      click: (item) => store.setSettings({ dnd: item.checked })
    },
    {
      label: '효과음',
      type: 'checkbox',
      checked: s.sound,
      click: (item) => store.setSettings({ sound: item.checked })
    },
    { type: 'separator' },
    { label: '지금 나오는 불꽃 끄기 (ESC)', enabled: overlay?.isPlaying ?? false, click: () => overlay.stopAll() },
    { type: 'separator' },
    {
      label: '종료',
      click: () => {
        quitting = true
        app.quit()
      }
    }
  ])
  tray.setContextMenu(menu)
  tray.setToolTip(`미니미 광장${trayStatus.room ? ` — ${roomLine}` : ''}${s.dnd ? ' (방해금지)' : ''}`)
}

function createTray(): void {
  tray = new Tray(trayIcon())
  tray.on('click', () => {
    // 윈도우: 왼쪽 클릭으로 열기 / 맥: 메뉴가 뜬다
    if (process.platform !== 'darwin') showMain()
  })
  tray.on('double-click', showMain)
  buildTrayMenu()
}

function registerIpc(): void {
  ipcMain.handle('state:get', () => store.state)
  ipcMain.handle('state:setProfile', (_e, patch: Partial<Profile>) => store.setProfile(patch))
  ipcMain.handle('state:setSettings', (_e, patch: Partial<Settings>) => store.setSettings(patch))
  ipcMain.handle('state:addRecentRoom', (_e, code: string) => store.addRecentRoom(code))
  ipcMain.handle('state:removeRecentRoom', (_e, code: string) => store.removeRecentRoom(code))
  ipcMain.handle('state:setLastRoom', (_e, code: string | null) => store.setLastRoom(code))

  ipcMain.handle('fireworks:show', (_e, show: FireworkShow) => {
    overlay.play({ ...show, sound: show.sound && store.state.settings.sound })
    buildTrayMenu()
  })
  ipcMain.handle('fireworks:stop', () => overlay.stopAll())

  ipcMain.handle('app:notify', (_e, opts: NotifyOptions) => notify(opts))
  ipcMain.handle('app:attention', () => {
    if (!mainWin) return
    if (process.platform === 'darwin') app.dock?.bounce('informational')
    else if (!mainWin.isFocused()) mainWin.flashFrame(true)
  })
  ipcMain.handle('app:focus', () => showMain())
  ipcMain.handle('app:isFocused', () => !!mainWin && mainWin.isVisible() && mainWin.isFocused())
  ipcMain.handle('app:trayStatus', (_e, s: TrayStatus) => {
    trayStatus = s
    buildTrayMenu()
  })
  ipcMain.handle('app:copy', (_e, text: string) => clipboard.writeText(String(text)))
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('app:takeJoinLink', () => {
    const l = pendingLink
    pendingLink = null
    return l
  })
}

// ───────── 테스트 자동화 훅 (환경변수로만 동작) ─────────
function runAutomation(): void {
  const win = mainWin
  if (!win) return
  const after = (ms: number, fn: () => void): void => {
    setTimeout(fn, ms)
  }
  win.webContents.once('did-finish-load', () => {
    if (env.MINIMI_EVAL) {
      const code = readFileSync(env.MINIMI_EVAL, 'utf8')
      after(Number(env.MINIMI_EVAL_DELAY ?? 800), () => {
        win.webContents.executeJavaScript(code).catch((err) => console.error('[eval]', err))
      })
    }
    if (env.MINIMI_SHOT) {
      // MINIMI_SHOT_DELAY=2500 또는 2500,6000,9000 (여러 장이면 -0, -1 … 붙임)
      const delays = (env.MINIMI_SHOT_DELAY ?? '2500').split(',').map(Number)
      delays.forEach((ms, i) => {
        after(ms, async () => {
          const file = delays.length > 1 ? env.MINIMI_SHOT!.replace(/\.png$/, `-${i}.png`) : env.MINIMI_SHOT!
          const img = await win.webContents.capturePage()
          writeFileSync(file, img.toPNG())
          console.log('[shot] saved', file)
        })
      })
    }
  })
  // 오버레이 재생이 시작될 때마다 지정한 시점에 캡처
  const times = (env.MINIMI_OVERLAY_SHOTS ?? '').split(',').filter(Boolean).map(Number)
  if (times.length) {
    const dir = env.MINIMI_SHOT_DIR ?? '.'
    mkdirSync(dir, { recursive: true })
    let n = 0
    overlay.onStart = () => {
      const t0 = Date.now()
      const tag = n++ ? `-${n}` : ''
      for (const t of times) {
        after(t, async () => {
          const ow = overlay.win
          if (!ow) return
          const img = await ow.webContents.capturePage()
          const file = join(dir, `overlay${tag}-${String(t).padStart(5, '0')}.png`)
          writeFileSync(file, img.toPNG())
          console.log('[shot] overlay', t, 'actual', Date.now() - t0, file)
        })
      }
    }
  }
  if (env.MINIMI_OVERLAY_TEST) {
    const show = JSON.parse(readFileSync(env.MINIMI_OVERLAY_TEST, 'utf8')) as FireworkShow
    after(Number(env.MINIMI_OVERLAY_DELAY ?? 1500), () => overlay.play(show))
  }
  if (env.MINIMI_QUIT_AFTER) {
    after(Number(env.MINIMI_QUIT_AFTER), () => {
      quitting = true
      app.quit()
    })
  }
}

// 윈도우: 이미 켜져 있으면 두 번째 실행의 인자로 들어온다
app.on('second-instance', (_e, argv) => {
  showMain()
  const link = findLink(argv)
  if (link) handleLink(link)
})

app.whenReady().then(() => {
  // 초대 링크로 앱이 열리도록 등록 (개발용 프로필 제외)
  if (app.isPackaged && !devProfile) app.setAsDefaultProtocolClient(APP_PROTOCOL)
  store = new Store()
  overlay = new OverlayManager((id) => {
    mainWin?.webContents.send('fireworks:ended', id)
    buildTrayMenu()
  })
  registerIpc()
  createMainWindow()
  overlay.create()
  if (!isHeadless()) createTray()

  store.onChange((s) => {
    mainWin?.webContents.send('state:changed', s)
    buildTrayMenu()
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: s.settings.openAtLogin, args: ['--hidden'] })
  })

  runAutomation()
  setupUpdater()

  app.on('activate', showMain)
})

app.on('before-quit', () => {
  quitting = true
})

// 창을 모두 닫아도 트레이에 상주
app.on('window-all-closed', () => {
  if (isHeadless()) app.quit()
})
