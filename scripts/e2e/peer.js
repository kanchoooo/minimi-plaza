// 사용법: 앞에 window.__cfg = { name, code, role } 를 붙여 주입
;(async () => {
  const { sleep, setInput, click, waitFor, log } = window.__e2e
  const cfg = window.__cfg
  await sleep(500)
  const nameInput = document.querySelector('.pe-foot input')
  if (nameInput) {
    setInput(nameInput, cfg.name)
    await sleep(100)
    await click('완성')
  }
  await waitFor(() => document.querySelector('.code-input'))
  setInput(document.querySelector('.code-input'), cfg.code)
  await sleep(100)
  await click('입장')
  const tJoin = Date.now(); log(cfg.name, 'joined', cfg.code)
  const ok = await waitFor(() => document.querySelectorAll('.member:not(.me)').length > 0, 45000)
  log(cfg.name, 'peer visible:', ok, 'after', Date.now() - tJoin, 'ms')
  if (!ok) return
  await sleep(1000)
  const input = document.querySelector('.chat-input input')
  setInput(input, `안녕! 나는 ${cfg.name}`)
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  if (cfg.role === 'caller') {
    await sleep(1500)
    await click('부르기', '.member-actions button')
    log('called')
    const unlocked = await waitFor(() => { const b = [...document.querySelectorAll('.member-actions button')].find(x => x.textContent.includes('불꽃')); return b && !b.disabled }, 20000)
    log('fw unlocked:', unlocked)
    if (unlocked) {
      await click('불꽃', '.member-actions button')
      await sleep(400)
      setInput(document.querySelector('.composer-text'), '대답해!!')
      await sleep(200)
      await click('발사')
      log('fired')
    }
  }
  await sleep(6000)
  log(cfg.name, 'chat:', [...document.querySelectorAll('.chat-list > div')].map((d) => d.textContent).join(' | '))
  log(cfg.name, 'toasts:', [...document.querySelectorAll('.toast')].map((d) => d.textContent).join(' | '))
})()
