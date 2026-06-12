import { launch, login, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')
await p.goto(BASE + '/claims/cmq9vvmbz000504k3et826zlk', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 2000))

// approve the line item (✓)
await p.evaluate(() => { [...document.querySelectorAll('button')].find(x => x.offsetParent && x.innerText.trim() === '✓')?.click() })
await new Promise(r => setTimeout(r, 2500))
let t = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
console.log('after line ✓:', t.slice(t.indexOf('FINANCIAL'), t.indexOf('FINANCIAL') + 150))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/6.7-line-approved.png' })

// submit decision
await p.evaluate(() => { [...document.querySelectorAll('button')].find(x => x.offsetParent && /submit decision/i.test(x.innerText))?.click() })
await new Promise(r => setTimeout(r, 2000))
// a dialog may appear (decision type, comments)
const dlg = await p.evaluate(() => [...document.querySelectorAll('button,select,textarea,input')].filter(x => x.offsetParent).map(x => ({ tag: x.tagName, t: (x.innerText || x.placeholder || '').trim().slice(0, 40), type: x.type })).filter(x => x.t && !/OVERVIEW|MEMBERSHIP|CLINICAL|FINANCE|INSIGHTS|SUPPORT|REINSTATEMENTS|Log out/.test(x.t)))
console.log('DIALOG ELEMENTS:', JSON.stringify(dlg, null, 1).slice(0, 1200))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/6.7-decision-dialog.png' })

// pick approve option if present then confirm
await p.evaluate(() => {
  const sel = [...document.querySelectorAll('select')].find(x => x.offsetParent && [...x.options].some(o => /approve/i.test(o.text)))
  if (sel) {
    const v = [...sel.options].find(o => /approve/i.test(o.text)).value
    const s = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
    s.call(sel, v); sel.dispatchEvent(new Event('change', { bubbles: true }))
  }
})
await p.evaluate(() => { [...document.querySelectorAll('button')].find(x => x.offsetParent && /^(confirm|submit|approve)$/i.test(x.innerText.trim()))?.click() })
await new Promise(r => setTimeout(r, 5000))
t = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
console.log('\nFINAL:', t.slice(t.indexOf('Claim CLM'), t.indexOf('Claim CLM') + 300))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/6.7-final.png' })
await b.close()
console.log('DONE')
