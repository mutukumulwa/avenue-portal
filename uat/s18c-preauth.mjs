import { launch, login, BASE } from './lib.mjs'
const b = await launch()
const p = await b.newPage()
await login(p, 'member@avenue.co.ke')
await p.goto(BASE + '/member/preauth/new', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 2000))
await p.evaluate(() => {
  const setS = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
  const setI = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  const setT = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  const provider = document.querySelector('select[name="providerId"]')
  setS.call(provider, [...provider.options].find(o => /parklands/i.test(o.text)).value)
  provider.dispatchEvent(new Event('change', { bubbles: true }))
  const proc = document.querySelector('select[name="procedureCode"]')
  setS.call(proc, [...proc.options].find(o => /general consultation/i.test(o.text)).value)
  proc.dispatchEvent(new Event('change', { bubbles: true }))
  const d = document.querySelector('input[name="expectedDateOfService"]')
  setI.call(d, '2026-06-20'); d.dispatchEvent(new Event('input', { bubbles: true })); d.dispatchEvent(new Event('change', { bubbles: true }))
  const diag = document.querySelector('input[name="diagnosis"]')
  setI.call(diag, 'Routine consultation'); diag.dispatchEvent(new Event('input', { bubbles: true }))
  const ta = document.querySelector('textarea[name="clinicalNotes"]')
  if (ta) { setT.call(ta, 'UAT test pre-auth.'); ta.dispatchEvent(new Event('input', { bubbles: true })) }
})
await p.evaluate(() => { [...document.querySelectorAll('button[type="submit"]')].find(x => x.offsetParent)?.click() })
await new Promise(r => setTimeout(r, 6000))
console.log('URL:', p.url().replace(BASE, ''))
const t = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
console.log('TEXT:', t.slice(0, 450))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/18.9-preauth2.png' })
await b.close()
console.log('DONE')
