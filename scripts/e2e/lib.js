// UI 자동 조작 도우미 (MINIMI_EVAL 로 주입)
window.__e2e = (() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const setInput = (el, value) => {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const byText = (text, sel = 'button') => [...document.querySelectorAll(sel)].find((b) => b.textContent.includes(text))
  const click = async (text, sel) => {
    for (let i = 0; i < 100; i++) {
      const b = byText(text, sel)
      if (b && !b.disabled) { b.click(); return true }
      await sleep(200)
    }
    console.log('[e2e] not found: ' + text)
    return false
  }
  const waitFor = async (fn, ms = 30000) => {
    const t0 = Date.now()
    while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(250) }
    return false
  }
  const log = (...a) => console.log('[e2e]', ...a)
  return { sleep, setInput, byText, click, waitFor, log }
})()
