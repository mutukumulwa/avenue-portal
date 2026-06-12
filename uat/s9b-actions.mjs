import { launch, login, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')
const text = () => p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))

// 11.1 resolve complaint
await p.goto(BASE + '/complaints/cmovn0j9y00dz7ouvpz016bnz', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1500))
const acts = await p.evaluate(() => [...document.querySelectorAll('button')].filter(x => x.offsetParent).map(x => x.innerText.trim()).filter(x => x && !/OVERVIEW|MEMBERSHIP|CLINICAL|FINANCE|INSIGHTS|SUPPORT|REINSTATEMENTS|Log out|▸|▾/.test(x)))
console.log('complaint actions:', JSON.stringify(acts))
await p.evaluate(() => { [...document.querySelectorAll('button')].find(x => x.offsetParent && /mark resolved/i.test(x.innerText))?.click() })
await new Promise(r => setTimeout(r, 1500))
// may need a resolution note
const dlgInputs = await p.evaluate(() => [...document.querySelectorAll('textarea,input')].filter(x => x.offsetParent).map(x => ({ tag: x.tagName, ph: x.placeholder })))
console.log('dialog inputs:', JSON.stringify(dlgInputs))
await p.evaluate(() => {
  const ta = [...document.querySelectorAll('textarea')].find(x => x.offsetParent)
  if (ta) {
    const s = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
    s.call(ta, 'UAT: resolved during testing — payment confirmed.'); ta.dispatchEvent(new Event('input', { bubbles: true }))
  }
})
await p.evaluate(() => { [...document.querySelectorAll('button')].find(x => x.offsetParent && /^(confirm|resolve|mark resolved|save)/i.test(x.innerText.trim()))?.click() })
await new Promise(r => setTimeout(r, 4000))
let t = await text()
console.log('complaint after:', t.slice(t.indexOf('Detail'), t.indexOf('Detail') + 150))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/11.1-resolved.png' })

// 12.1 dismiss the UAT claim fraud alert
await p.goto(BASE + '/fraud/cmq9vvnd8000704k31ro4ajyv', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1500))
const facts = await p.evaluate(() => [...document.querySelectorAll('button')].filter(x => x.offsetParent).map(x => x.innerText.trim()).filter(x => x && !/OVERVIEW|MEMBERSHIP|CLINICAL|FINANCE|INSIGHTS|SUPPORT|REINSTATEMENTS|Log out|▸|▾/.test(x)))
console.log('\nfraud actions:', JSON.stringify(facts))
await p.evaluate(() => { [...document.querySelectorAll('button')].find(x => x.offsetParent && /dismiss/i.test(x.innerText))?.click() })
await new Promise(r => setTimeout(r, 1200))
await p.evaluate(() => {
  const ta = [...document.querySelectorAll('textarea')].find(x => x.offsetParent)
  if (ta) {
    const s = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
    s.call(ta, 'UAT test claim — known anomaly, dismissing.'); ta.dispatchEvent(new Event('input', { bubbles: true }))
  }
  ;[...document.querySelectorAll('button')].find(x => x.offsetParent && /^(confirm|dismiss)/i.test(x.innerText.trim()) && x.type !== 'button' || /confirm dismiss/i.test(x.innerText))?.click()
})
await p.evaluate(() => { [...document.querySelectorAll('button')].filter(x => x.offsetParent && /dismiss/i.test(x.innerText)).pop()?.click() })
await new Promise(r => setTimeout(r, 4000))
t = await text()
console.log('fraud after:', t.slice(t.indexOf('Fraud'), t.indexOf('Fraud') + 200))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/12.1-dismissed.png' })

// 9.5 settlement batch
await p.goto(BASE + '/settlement', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1500))
await p.evaluate(() => {
  const sel = [...document.querySelectorAll('select')].find(x => [...x.options].some(o => /parklands/i.test(o.text)))
  const s = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
  s.call(sel, [...sel.options].find(o => /parklands/i.test(o.text)).value)
  sel.dispatchEvent(new Event('change', { bubbles: true }))
})
await new Promise(r => setTimeout(r, 800))
const setlFields = await p.evaluate(() => [...document.querySelectorAll('select,input,button')].filter(x => x.offsetParent).map(x => ({ tag: x.tagName, t: (x.innerText || x.placeholder || '').trim().slice(0, 30), type: x.type })).filter(x => x.t && !/OVERVIEW|MEMBERSHIP|CLINICAL|FINANCE|INSIGHTS|SUPPORT|REINSTATEMENTS|Log out/.test(x.t)))
console.log('\nsettlement controls:', JSON.stringify(setlFields).slice(0, 600))
await p.evaluate(() => { [...document.querySelectorAll('button')].find(x => x.offsetParent && /create settlement batch|create batch/i.test(x.innerText))?.click() })
await new Promise(r => setTimeout(r, 5000))
t = await text()
console.log('settlement after:', t.slice(t.indexOf('Provider Settlements'), t.indexOf('Provider Settlements') + 400))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/9.5-settlement.png' })

await b.close()
console.log('DONE S9B')
