import { contextBridge, ipcRenderer } from 'electron'
import type { FireworkShow, OverlayApi } from '@shared/types'

const api: OverlayApi = {
  platform: process.platform,
  onPlay: (cb) => {
    ipcRenderer.on('overlay:play', (_e, show: FireworkShow) => cb(show))
  },
  onStop: (cb) => {
    ipcRenderer.on('overlay:stop', () => cb())
  },
  ended: (id) => ipcRenderer.send('overlay:ended', id),
  setInteractive: (on) => ipcRenderer.send('overlay:interactive', on),
  close: () => ipcRenderer.send('overlay:close'),
  ready: () => ipcRenderer.send('overlay:ready')
}

contextBridge.exposeInMainWorld('overlayApi', api)
