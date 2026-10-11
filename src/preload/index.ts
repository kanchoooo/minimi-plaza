import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type { MainApi, PersistedState } from '@shared/types'

function on<T>(channel: string, cb: (v: T) => void): () => void {
  const h = (_e: IpcRendererEvent, v: T): void => cb(v)
  ipcRenderer.on(channel, h)
  return () => ipcRenderer.removeListener(channel, h)
}

const api: MainApi = {
  platform: process.platform,
  getState: () => ipcRenderer.invoke('state:get'),
  setProfile: (patch) => ipcRenderer.invoke('state:setProfile', patch),
  setSettings: (patch) => ipcRenderer.invoke('state:setSettings', patch),
  addRecentRoom: (code) => ipcRenderer.invoke('state:addRecentRoom', code),
  removeRecentRoom: (code) => ipcRenderer.invoke('state:removeRecentRoom', code),
  setLastRoom: (code) => ipcRenderer.invoke('state:setLastRoom', code),
  onStateChanged: (cb) => on<PersistedState>('state:changed', cb),
  showFireworks: (show) => ipcRenderer.invoke('fireworks:show', show),
  stopFireworks: () => ipcRenderer.invoke('fireworks:stop'),
  onFireworksEnded: (cb) => on<string>('fireworks:ended', cb),
  notify: (opts) => ipcRenderer.invoke('app:notify', opts),
  onNotificationClick: (cb) => on<string>('app:notificationClick', cb),
  attention: () => ipcRenderer.invoke('app:attention'),
  focusWindow: () => ipcRenderer.invoke('app:focus'),
  isWindowFocused: () => ipcRenderer.invoke('app:isFocused'),
  setTrayStatus: (s) => ipcRenderer.invoke('app:trayStatus', s),
  copyText: (text) => ipcRenderer.invoke('app:copy', text),
  getVersion: () => ipcRenderer.invoke('app:version'),
  takeJoinLink: () => ipcRenderer.invoke('app:takeJoinLink'),
  onJoinLink: (cb) => on<string>('app:joinLink', cb)
}

contextBridge.exposeInMainWorld('api', api)
