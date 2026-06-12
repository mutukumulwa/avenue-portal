import { launch, login, checkPage, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
const fails = []
p.on('response', r => { if (r.status() === 404) fails.push(r.url().replace(BASE, '')) })
await login(p, 'member@avenue.co.ke')

// identify 404s on documents
await p.goto(BASE + '/member/documents', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 2000))
console.log('DOC 404s:', JSON.stringify([...new Set(fails)]))

// 18.9 preauth request E2E
await p.goto(BASE + '/member/preauth/new', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 2000))
const fields = await p.evaluate(() => [...document.querySelectorAll('input,select,textarea')].filter(x => x.offsetParent).map(x => ({ tag: x.tagName, type: x.type, name: x.name, options: x.tagName === 'SELECT' ? [...x.options].map(o => o.text).slice(0, 8) : undefined })))
console.log('PREAUTH FIELDS:', JSON.stringify(fields, null, 1).slice(0, 1200))
// pick service + provider via selects, fill date
await p.evaluate(() => {
  const setS = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
  const setI = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  for (const sel of [...document.querySelectorAll('select')].filter(x => x.offsetParent)) {
    const opt = [...sel.options].find(o => o.value && !/select/i.test(o.text))
    if (opt) { setS.call(sel, opt.value); sel.dispatchEvent(new Event('change', { bubbles: true })) }
  }
  const d = [...document.querySelectorAll('input[type="date"]')].find(x => x.offsetParent)
  if (d) { setI.call(d, '2026-06-20'); d.dispatchEvent(new Event('input', { bubbles: true })); d.dispatchEvent(new Event('change', { bubbles: true })) }
  const ta = [...document.querySelectorAll('textarea')].find(x => x.offsetParent)
  if (ta) {
    const setT = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
    setT.call(ta, 'UAT test pre-auth request.'); ta.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const num = [...document.querySelectorAll('input[type="number"]')].find(x => x.offsetParent)
  if (num) { setI.call(num, '10000'); num.dispatchEvent(new Event('input', { bubbles: true })) }
})
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/18.9-filled.png' })
await p.evaluate(() => { [...document.querySelectorAll('button')].find(x => x.offsetParent && /submit|request/i.test(x.innerText) && x.type === 'submit')?.click() })
await new Promise(r => setTimeout(r, 5000))
console.log('\nPREAUTH AFTER:', p.url().replace(BASE, ''), '|', (await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))).slice(0, 300))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/18.9-submitted.png' })

// 18.14 utilization drill-down
await p.goto(BASE + '/member/utilization', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1500))
const claimHref = await p.evaluate(() => [...document.querySelectorAll('a[href*="/member/utilization/"]')][0]?.getAttribute('href'))
console.log('claim drill:', claimHref)
if (claimHref) await checkPage(p, claimHref, '18.14-claim-drill', { textLen: 300 })
await p.close()

// 18.15 wallet demo member
{
  const p2 = await b.newPage()
  await login(p2, 'member.demo.wallet@avenue.co.ke')
  await checkPage(p2, '/member/wallet', '18.15-wallet-demo', { textLen: 500 })
  await p2.close()
}

await b.close()
console.log('DONE S18B')
