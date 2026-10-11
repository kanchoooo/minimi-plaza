// 첫 실행 → 로비 → 불꽃 연습(내 미니미) 둘러보기
;(async () => {
  const { sleep, setInput, click, waitFor, log } = window.__e2e
  await waitFor(() => document.querySelector('.pe-foot input'))
  await sleep(2500) // 0: 첫 실행 화면 캡처
  setInput(document.querySelector('.pe-foot input'), '혜정')
  await sleep(100)
  await click('완성')
  await sleep(2500) // 1: 로비 캡처
  await click('내 화면에 쏴보기')
  await sleep(400)
  await click('내 미니미', '.tab')
  await sleep(2000) // 2: 컴포저 캡처
  await click('미리보기')
  log('preview fired')
})()
