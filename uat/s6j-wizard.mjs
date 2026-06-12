import { launch, login, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')
await p.goto(BASE + '/claims/new', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 3000))

const text = () => p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
const shot = n => p.screenshot({ path: `C:/Coding/avenue-portal/uat/screenshots/${n}.png` })

async function searchSelect(placeholderText, query, optionRe) {
  const opened = await p.evaluate((ph) => {
    const btn = [...document.querySelectorAll('button')].find(x => x.offsetParent && x.innerText.includes(ph))
    if (!btn) return false
    btn.click(); return true
  }, placeholderText)
  if (!opened) { console.log('TRIGGER NOT FOUND:', placeholderText); return false }
  await new Promise(r => setTimeout(r, 600))
  await p.evaluate((q) => {
    const i = [...document.querySelectorAll('input[placeholder="Type to filter…"]')].find(x => x.offsetParent)
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(i, q); i.dispatchEvent(new Event('input', { bubbles: true }))
  }, query)
  await new Promise(r => setTimeout(r, 800))
  const picked = await p.evaluate((re) => {
    const rx = new RegExp(re, 'i')
    const opt = [...document.querySelectorAll('button')].find(x => x.offsetParent && rx.test(x.innerText) && !x.innerText.includes('Type to filter'))
    if (!opt) return null
    opt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    return opt.innerText.replace(/\s+/g, ' ').slice(0, 60)
  }, optionRe)
  await new Promise(r => setTimeout(r, 800))
  return picked
}

const next = async () => { await p.evaluate(() => { [...document.querySelectorAll('button')].find(x => x.offsetParent && /^next/i.test(x.innerText.trim()))?.click() }); await new Promise(r => setTimeout(r, 1500)) }

// STEP 1
console.log('member:', await searchSelect('Search by name, member number', 'Testmember', 'Testmember'))
console.log('provider:', await searchSelect('Search by name, type or county', 'Parklands', 'Parklands'))
await shot('6.3h-step1')
await next()

// STEP 2 — encounter details
let t = await text()
console.log('\nSTEP2 reached:', t.includes('Step 2'))
const s2 = await p.evaluate(() => [...document.querySelectorAll('input,select,textarea')].filter(e => e.offsetParent).map(e => ({ tag: e.tagName, type: e.type, name: e.name, options: e.tagName === 'SELECT' ? [...e.options].map(o => o.text).slice(0, 10) : undefined })))
console.log('S2 FIELDS:', JSON.stringify(s2))
// set date + invoice number if present
await p.evaluate(() => {
  const setI = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  const d = [...document.querySelectorAll('input[type="date"]')].find(x => x.offsetParent)
  if (d) { setI.call(d, '2026-06-10'); d.dispatchEvent(new Event('input', { bubbles: true })); d.dispatchEvent(new Event('change', { bubbles: true })) }
  const inv = [...document.querySelectorAll('input[type="text"]')].filter(x => x.offsetParent)
  inv.forEach((x, idx) => { setI.call(x, x.placeholder?.includes('INV') || /invoice/i.test(x.name) ? 'INV-UAT-001' : x.value || 'UAT-' + idx); x.dispatchEvent(new Event('input', { bubbles: true })) })
})
await shot('6.3h-step2')
await next()

// STEP 3 — diagnoses
t = await text()
console.log('\nSTEP3 reached:', t.includes('Step 3'), '|', t.slice(t.indexOf('Step 3'), t.indexOf('Step 3') + 250))
// the diagnosis search may also be a SearchSelect or async search input
const diagPicked = await searchSelect('Search', 'A00', 'A00|cholera')
console.log('diagnosis picked:', diagPicked)
await shot('6.3h-step3')
await next()

// STEP 4 — services
t = await text()
console.log('\nSTEP4 reached:', t.includes('Step 4'), '|', t.slice(t.indexOf('Step 4'), t.indexOf('Step 4') + 350))
const s4 = await p.evaluate(() => [...document.querySelectorAll('input,select,textarea')].filter(e => e.offsetParent).map(e => ({ tag: e.tagName, type: e.type, name: e.name, ph: e.placeholder })))
console.log('S4 FIELDS:', JSON.stringify(s4))
await shot('6.3h-step4')

await b.close()
console.log('DONE S6J')
