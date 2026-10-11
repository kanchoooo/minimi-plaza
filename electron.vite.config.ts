import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const shared = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: {
    resolve: { alias: shared }
  },
  preload: {
    resolve: { alias: shared },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.ts'),
          overlay: resolve('src/preload/overlay.ts')
        }
      }
    }
  },
  renderer: {
    resolve: { alias: { ...shared, '@': resolve('src/renderer/src') } },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          overlay: resolve('src/renderer/overlay.html')
        }
      }
    }
  }
})
