import type { MainApi, OverlayApi } from '@shared/types'

declare global {
  interface Window {
    api: MainApi
    overlayApi: OverlayApi
  }
}

export {}
