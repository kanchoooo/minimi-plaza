// 한 컴퓨터에서 미니미 두 명으로 광장 테스트: 빌드 후 프로필 2개로 실행
// 사용법: npm run dev:two
import { spawn, execSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const electron = require('electron')

execSync('npx electron-vite build', { stdio: 'inherit' })
// 두 창이 같은 광장으로 바로 들어가도록 고정 코드 사용
const code = process.env.MINIMI_AUTOJOIN ?? `DEMO-${Math.floor(1000 + Math.random() * 9000)}`
console.log('광장 코드:', code)
for (const profile of ['alice', 'bob']) {
  const p = spawn(electron, ['out/main/index.js'], {
    stdio: 'inherit',
    env: { ...process.env, MINIMI_PROFILE: profile, MINIMI_AUTOJOIN: code }
  })
  p.on('exit', (code) => console.log(`[${profile}] exited`, code))
}
