// 맥 유니버설 빌드 + Developer ID 서명 + 공증
// 사용법: node scripts/build-mac.mjs [--publish]   (npm run dist:mac / npm run release 에서 사용)
//
// 서명: ~/.minimi-signing/DeveloperID_Application.p12 (+ p12-password)
//   빌드 전용 임시 키체인에 넣어서 서명 → 키체인 "허용" 창이 뜨지 않는다.
//   (electron-builder 26 의 CSC_LINK 임시 키체인은 set-key-partition-list 에 p12 비밀번호를 넘기는 버그가 있어 직접 만든다)
// 공증: 키체인 프로필 "minimi-notary" (xcrun notarytool store-credentials 로 한 번 저장)
import { execFileSync, execSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const dir = process.env.MINIMI_SIGNING_DIR ?? join(homedir(), '.minimi-signing')
const p12 = join(dir, 'DeveloperID_Application.p12')
const pwFile = join(dir, 'p12-password')
const profile = process.env.APPLE_KEYCHAIN_PROFILE ?? 'minimi-notary'
const publish = process.argv.includes('--publish')

if (!existsSync(p12) || !existsSync(pwFile)) {
  throw new Error(`서명 인증서가 없어요: ${p12} (README "맥 서명·공증 준비" 참고)`)
}
let notarize = true
try {
  execSync(`xcrun notarytool history --keychain-profile ${profile}`, { stdio: 'ignore' })
} catch {
  notarize = false
}
if (!notarize && publish) throw new Error(`공증 프로필 "${profile}" 이 없어요. 배포 전에 공증 설정이 필요해요.`)
if (!notarize) console.warn(`⚠ 공증 프로필 "${profile}" 이 없어 서명만 하고 공증은 건너뜁니다.`)

const IDENTITY = 'KWANGJO KIM (GQJXPJX34S)'
const keychain = join(dir, 'build.keychain-db')
const kcPass = randomBytes(24).toString('hex')
const security = (...args) => execFileSync('/usr/bin/security', args, { encoding: 'utf8' })
const userKeychains = () =>
  security('list-keychains', '-d', 'user')
    .split('\n')
    .map((l) => l.trim().replace(/^"|"$/g, ''))
    .filter(Boolean)
const original = userKeychains().filter((k) => k !== keychain)

try {
  try {
    security('delete-keychain', keychain)
  } catch {
    /* 없으면 무시 */
  }
  security('create-keychain', '-p', kcPass, keychain)
  security('set-keychain-settings', '-lut', '7200', keychain)
  security('unlock-keychain', '-p', kcPass, keychain)
  security('import', p12, '-k', keychain, '-P', readFileSync(pwFile, 'utf8').trim(), '-T', '/usr/bin/codesign', '-T', '/usr/bin/productbuild')
  security('set-key-partition-list', '-S', 'apple-tool:,apple:,codesign:', '-s', '-k', kcPass, keychain)
  security('list-keychains', '-d', 'user', '-s', keychain, ...original)

  const env = {
    ...process.env,
    CSC_KEYCHAIN: keychain,
    CSC_NAME: IDENTITY,
    ...(notarize ? { APPLE_KEYCHAIN_PROFILE: profile } : {})
  }
  delete env.CSC_LINK
  delete env.CSC_KEY_PASSWORD
  if (publish) env.GH_TOKEN = process.env.GH_TOKEN ?? execSync('gh auth token', { encoding: 'utf8' }).trim()

  execSync('npx electron-vite build', { stdio: 'inherit' })
  execSync(`npx electron-builder --mac --universal --publish ${publish ? 'always' : 'never'}`, { stdio: 'inherit', env })
} finally {
  // 키체인 검색 목록 원래대로 + 임시 키체인 삭제
  try {
    security('list-keychains', '-d', 'user', '-s', ...original)
  } catch (e) {
    console.warn('키체인 목록 복구 실패', e)
  }
  try {
    security('delete-keychain', keychain)
  } catch {
    /* 무시 */
  }
}
