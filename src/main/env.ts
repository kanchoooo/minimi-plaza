import { BrowserWindow } from 'electron'
import { join } from 'path'

/**
 * 개발·테스트용 환경변수
 *  MINIMI_PROFILE=이름     별도 userData 로 실행 (한 컴퓨터에서 두 명 테스트, 단일 인스턴스 잠금 해제)
 *  MINIMI_HEADLESS=1       창을 화면에 띄우지 않고 오프스크린 렌더링 (스크린샷 자동화용)
 *  MINIMI_LAB=이름         메인 창을 #lab=이름 으로 열기 (컴포넌트 단독 확인용)
 *  MINIMI_AUTOJOIN=코드     미니미가 있으면 바로 그 광장에 입장 (데모용)
 *  MINIMI_SIZE=WxH         메인 창 크기
 *  MINIMI_WINPOS=x,y       메인 창 위치
 *  MINIMI_SHOT=경로.png     MINIMI_SHOT_DELAY(ms) 뒤 메인 창 캡처
 *  MINIMI_EVAL=경로.js      메인 창 로드 후 스크립트 실행 (UI 자동 조작)
 *  MINIMI_OVERLAY_TEST=경로.json   시작하자마자 오버레이에서 불꽃 재생
 *  MINIMI_OVERLAY_SHOTS=500,1000   재생 시작 후 해당 ms 에 오버레이 캡처 → MINIMI_SHOT_DIR
 *  MINIMI_QUIT_AFTER=ms     ms 뒤 종료
 */
export const env = process.env

export function isHeadless(): boolean {
  return env.MINIMI_HEADLESS === '1'
}

export function preloadPath(name: 'index' | 'overlay'): string {
  return join(__dirname, `../preload/${name}.js`)
}

export function loadRenderer(win: BrowserWindow, page: 'index' | 'overlay', hash?: string): void {
  const devUrl = env.ELECTRON_RENDERER_URL
  if (devUrl) {
    void win.loadURL(`${devUrl}/${page}.html${hash ? '#' + hash : ''}`)
  } else {
    void win.loadFile(join(__dirname, `../renderer/${page}.html`), hash ? { hash } : undefined)
  }
}
