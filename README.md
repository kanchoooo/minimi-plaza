# ✦ 미니미 광장

나만의 도트 캐릭터(미니미)를 만들고, 광장 코드로 친구 2~6명이 P2P로 모이는 데스크톱 앱.
불러도 대답 없는 친구에게는 **친구 바탕화면 위에 글자·사진 불꽃놀이**를 쏠 수 있어요.

- 맥 / 윈도우 (Electron 44 + TypeScript + React)
- 불꽃·광장 렌더링: PixiJS 8 (WebGL)
- P2P: Trystero (WebRTC DataChannel, 시그널링은 공개 Nostr 릴레이 — 서버 없음)

## 실행

```bash
npm install
npm run dev        # 개발 모드 (핫 리로드)
npm run dev:two    # 한 컴퓨터에서 미니미 두 명(alice, bob)으로 광장 테스트
npm start          # 빌드 결과 미리보기
```

창을 닫아도 트레이(맥: 메뉴 막대 ✦ / 윈도우: 작업 표시줄 트레이)에 남아 부르기·불꽃을 받습니다.
완전히 끄려면 트레이 메뉴 → 종료 (맥은 ⌘Q).

## 사용 흐름

1. 첫 실행 → 미니미 만들기 (파츠 조합 + 도트 꾸미기) + 이름
2. **광장 만들기** → `STAR-4821` 같은 코드를 친구에게 전달 → 친구는 **코드로 들어가기**
3. 광장: 바닥 클릭(또는 방향키/WASD)으로 이동, 채팅은 머리 위 말풍선
4. 친구 목록에서 **📣 부르기** → 상대에게 소리 + 알림 + 팝업
5. 설정한 시간(기본 15초) 동안 대답이 없으면 **🎆 불꽃** 버튼이 열림 → 글자 / 사진 / 내 미니미 선택 → 발사
6. 상대 화면 전체(투명 오버레이, 클릭 통과, 최상단)에 카운트다운 3·2·1 → 불꽃 → 피날레

로비의 **불꽃놀이 연습**으로 내 화면에 먼저 쏴볼 수 있습니다 (릴스 촬영용).

## 안전장치

| 장치 | 동작 |
|---|---|
| 같은 광장 친구만 | 같은 코드(=암호)로 연결된 피어만 메시지를 주고받음 |
| 무응답일 때만 | 부르기 1회당 불꽃 1회. 받는 쪽도 "대답 안 한 부르기가 있는지"를 직접 확인 후 재생 |
| 불꽃 받기 끄기 / 방해금지 | 설정·트레이 메뉴. 보내는 쪽에 상태가 표시되고 버튼이 잠김 |
| ESC 즉시 닫기 | 불꽃이 나오는 동안 전역 단축키 ESC, 오른쪽 위 닫기 버튼, 트레이 메뉴 |
| 차단 | 친구 목록 ⋯ → 차단. 차단한 사람의 캐릭터·채팅·부르기·불꽃 모두 무시 |
| 속도 제한 | 피어별 채팅/부르기/불꽃 수신 속도 제한, 받는 데이터 크기·형식 검증 |
| 인원 제한 | 최대 6명. 늦게 들어온 사람이 자동으로 나감 |

## 배포

저장소: https://github.com/kanchoooo/minimi-plaza (공개)
다운로드 페이지: https://easyticket.co.kr/apps/minimi-plaza/ (관제 관리자 세션이 운영 · `docs/index.html` 은 참고용 원본이자 GitHub Pages 예비 주소 https://kanchoooo.github.io/minimi-plaza/)

고정 다운로드 주소 (버전이 바뀌어도 그대로 — 윈도우 SmartScreen 평판 유지):
- 맥: `https://github.com/kanchoooo/minimi-plaza/releases/latest/download/MinimiPlaza-mac.dmg`
- 윈도우: `https://github.com/kanchoooo/minimi-plaza/releases/latest/download/MinimiPlaza-Setup.exe`

### 새 버전 배포 (명령 한 줄)

```bash
npm run release            # 0.1.0 → 0.1.1
npm run release -- minor   # 0.1.0 → 0.2.0
```

`scripts/release.mjs` 가 순서대로 처리합니다.
1. 버전을 올리고 태그를 push → GitHub Actions 가 윈도우 설치파일을 만들어 초안 릴리스에 올림
2. 맥북에서 유니버설(애플 실리콘 + 인텔) 빌드 → Developer ID 서명 → 애플 공증 → 같은 초안에 올림
3. 맥·윈도우 파일이 다 모이면 릴리스 공개

공개되면 이미 설치된 앱들은 자동으로 확인(시작 10초 후, 이후 6시간마다)해서 받아두고, 앱을 종료할 때 설치됩니다.

### 맥 서명·공증 준비 (한 번만)

1. **Developer ID 인증서** — 완료 (Developer ID Application: KWANGJO KIM (GQJXPJX34S), 2031-09 만료)
   - 서명 파일: `~/.minimi-signing/DeveloperID_Application.p12` (+ 비밀번호 `p12-password`)
   - 빌드할 때 electron-builder 가 임시 키체인에 넣어 서명하므로 키체인 "허용" 창이 뜨지 않습니다
   - ⚠ 이 폴더는 **꼭 백업** (분실하면 인증서를 새로 만들어야 하고, 유출되면 남이 내 이름으로 서명 가능)
2. **앱 암호**: https://account.apple.com → 로그인 및 보안 → 앱 암호 → 생성 (이름 예: minimi-notary)
3. **공증 정보를 키체인에 저장** (맥 터미널에서, 앱 암호는 입력해도 화면에 안 보임):
   ```bash
   xcrun notarytool store-credentials minimi-notary --apple-id "<애플 계정 이메일>" --team-id GQJXPJX34S
   ```

확인용 빌드만 하려면 `npm run dist:mac` (서명 + 공증, 업로드 없음 — 공증 프로필이 없으면 서명만) / `npm run dist:mac:local` (서명 없이 내 맥용 .app).

### 윈도우

- 태그가 올라오면 `.github/workflows/release.yml` 이 `windows-latest` 에서 빌드합니다 (공개 저장소라 무료)
- 맥에서 직접 만들 수도 있음: `npm run dist:win`
- 초기에는 서명 없이 배포 → 설치 시 "Windows의 PC 보호" → **추가 정보 → 실행**. 반응이 오면 OV 코드서명 인증서 구매

## 한계

- 상대 앱이 꺼져 있으면 전달 불가 (트레이 상주 + 로그인 시 자동 실행 옵션으로 보완)
- 회사·학교 네트워크 등에서는 P2P 연결이 실패할 수 있음 → TURN 서버를 붙이면 해결 (`src/renderer/src/net/session.ts` 의 `turn` 옵션)
- 시그널링은 공개 Nostr 릴레이를 사용하므로 릴레이 상태에 따라 입장 후 연결까지 몇 초 걸릴 수 있음

## 개발 메모

```
src/main/          메인 프로세스: 창, 트레이, 오버레이(투명·클릭통과·최상단), 저장소, 업데이트
src/preload/       contextBridge API (window.api / window.overlayApi)
src/shared/        공용 타입
src/renderer/src/
  minimi/          미니미 파츠 도트 데이터·렌더러·에디터
  fireworks/       불꽃 엔진 (PixiJS 입자) · 효과음
  overlay/         오버레이 창 엔트리
  plaza/           광장 맵·씬 (PixiJS)
  net/             P2P 세션 (Trystero)
  state/           앱 상태·흐름 (부르기 → 무응답 → 불꽃)
  screens/         화면
```

테스트 자동화용 환경변수는 `src/main/env.ts` 참고 (`MINIMI_HEADLESS`, `MINIMI_SHOT`, `MINIMI_EVAL` …).
`scripts/e2e/` 에 두 인스턴스 P2P 흐름 테스트 스크립트가 있습니다.

## 저작권

- 모든 도트 그림은 오리지널. 싸이월드 이름·로고·에셋은 사용하지 않습니다.
- 글꼴: [갈무리(Galmuri)](https://github.com/quiple/galmuri) — SIL Open Font License 1.1 (`src/renderer/src/assets/fonts/ofl.md`)
