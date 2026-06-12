import { launch, login, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')
const text = () => p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))

// complaint status
await p.goto(BASE + '/complaints/cmovn0j9y00dz7ouvpz016bnz', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1500))
let t = await text()
const ci = t.indexOf('Claim reimbursement')
console.log('complaint:', t.slice(ci, ci + 150))

// settlement: provider Parklands + June
await p.goto(BASE + '/settlement', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1500))
const setSel = async (matchRe) => p.evaluate((re) => {
  const rx = new RegExp(re, 'i')
  const sel = [...document.querySelectorAll('select')].find(x => x.offsetParent && [...x.options].some(o => rx.test(o.text)))
  if (!sel) return null
  const v = [...sel.options].find(o => rx.test(o.text)).value
  const s = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
  s.call(sel, v); sel.dispatchEvent(new Event('change', { bubbles: true }))
  return sel.value
}, matchRe)
console.log('provider set:', await setSel('Parklands'))
console.log('month set:', await setSel('^June$'))
await new Promise(r => setTimeout(r, 800))
await p.evaluate(() => { [...document.querySelectorAll('button')].find(x => x.offsetParent && /create batch/i.test(x.innerText))?.click() })
await new Promise(r => setTimeout(r, 6000))
t = await text()
const si = t.indexOf('All (')
console.log('batches:', t.slice(si - 100, si + 300))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/9.5-batch2.png' })
await b.close()
console.log('DONE')
