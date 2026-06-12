import { launch, login, BASE } from './lib.mjs'
const b = await launch()
const p = await b.newPage()
await login(p, 'fund@avenue.co.ke')
await p.goto(BASE + '/fund/cmovmx6dc002x7ouv3mow8517', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1500))
await p.evaluate(() => { [...document.querySelectorAll('button')].find(x => x.offsetParent && /record deposit/i.test(x.innerText))?.click() })
await new Promise(r => setTimeout(r, 1200))
const fields = await p.evaluate(() => [...document.querySelectorAll('input,select,textarea')].filter(x => x.offsetParent).map(x => ({ tag: x.tagName, type: x.type, name: x.name, ph: x.placeholder })))
console.log('DEPOSIT FIELDS:', JSON.stringify(fields))
await p.evaluate(() => {
  const setI = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  const amt = [...document.querySelectorAll('input[type="number"]')].find(x => x.offsetParent)
  if (amt) { setI.call(amt, '1000000'); amt.dispatchEvent(new Event('input', { bubbles: true })) }
  const ref = [...document.querySelectorAll('input[type="text"]')].find(x => x.offsetParent)
  if (ref) { setI.call(ref, 'UAT-DEP-001'); ref.dispatchEvent(new Event('input', { bubbles: true })) }
})
await p.evaluate(() => { [...document.querySelectorAll('button[type="submit"]')].find(x => x.offsetParent)?.click() })
await new Promise(r => setTimeout(r, 5000))
let t = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
console.log('AFTER DEPOSIT:', t.slice(0, 400))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/17.2-deposit.png' })
await b.close()
console.log('DONE')
