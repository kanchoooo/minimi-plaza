// 새 버전 배포: npm run release            (0.1.0 → 0.1.1)
//              npm run release -- minor   (0.1.0 → 0.2.0)
//
// 1) 버전 올리고 태그 push  → GitHub Actions 가 윈도우 설치파일을 만들어 초안 릴리스에 올림
// 2) 맥북에서 유니버설 빌드 + Developer ID 서명 + 공증 → 같은 초안 릴리스에 올림
// 3) 윈도우 파일까지 올라오면 릴리스 공개 → 설치된 앱들이 자동 업데이트
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const sh = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', ...opts })
const out = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const bump = process.argv[2] ?? 'patch'
const PROFILE = process.env.APPLE_KEYCHAIN_PROFILE ?? 'minimi-notary'

// ── 사전 점검 ──
if (process.platform !== 'darwin') throw new Error('맥북에서 실행해 주세요 (맥 서명·공증은 맥에서만 가능)')
if (out('git status --porcelain')) throw new Error('커밋하지 않은 변경이 있어요. 먼저 커밋해 주세요.')
if (!out('security find-identity -v -p codesigning').includes('Developer ID Application')) {
  throw new Error('키체인에 "Developer ID Application" 인증서가 없어요 (README 참고)')
}
try {
  execSync(`xcrun notarytool history --keychain-profile ${PROFILE}`, { stdio: 'ignore' })
} catch {
  throw new Error(`공증 프로필 "${PROFILE}" 이 없어요. README 의 notarytool store-credentials 를 먼저 실행해 주세요.`)
}
const token = out('gh auth token')

// ── 1. 버전 + 태그 ──
sh(`npm version ${bump} -m "release v%s"`)
const version = JSON.parse(readFileSync('package.json', 'utf8')).version
const tag = `v${version}`
sh('git push --follow-tags')
sh(`gh release create ${tag} --draft --verify-tag --title "${tag}" --generate-notes`)

// ── 2. 맥 빌드·서명·공증·업로드 ──
sh('npx electron-vite build')
sh('npx electron-builder --mac --universal --publish always', {
  env: { ...process.env, GH_TOKEN: token, APPLE_KEYCHAIN_PROFILE: PROFILE }
})

// ── 3. 윈도우 빌드 기다렸다가 공개 ──
console.log('\n윈도우 빌드(GitHub Actions) 기다리는 중…')
const need = ['MinimiPlaza-Setup.exe', 'latest.yml', 'MinimiPlaza-mac.dmg', 'MinimiPlaza-mac.zip', 'latest-mac.yml']
for (let i = 0; ; i++) {
  const assets = JSON.parse(out(`gh release view ${tag} --json assets`)).assets.map((a) => a.name)
  const missing = need.filter((n) => !assets.includes(n))
  if (!missing.length) break
  if (i > 120) throw new Error(`30분이 지나도 안 올라온 파일: ${missing.join(', ')} — Actions 탭을 확인해 주세요`)
  await sleep(15_000)
}
sh(`gh release edit ${tag} --draft=false --latest`)
console.log(`\n✦ ${tag} 배포 완료!`)
console.log('  맥:     https://github.com/kanchoooo/minimi-plaza/releases/latest/download/MinimiPlaza-mac.dmg')
console.log('  윈도우: https://github.com/kanchoooo/minimi-plaza/releases/latest/download/MinimiPlaza-Setup.exe')
