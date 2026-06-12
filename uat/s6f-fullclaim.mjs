import { launch, login, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')
await p.goto(BASE + '/claims/new', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 3000))

const shot = n => p.screenshot({ path: `C:/Coding/avenue-portal/uat/screenshots/${n}.png` })
const text = () => p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))

async function clickText(re) {
  return p.evaluate((re) => {
    const rx = new RegExp(re, 'i')
    const el = [...document.querySelectorAll('button')].find(x => x.offsetParent && rx.test(x.innerText.trim()))
    if (el) { el.click(); return el.innerText.trim().slice(0, 40) }
    return null
  }, re)
}

async function popoverPick(triggerRe, query, optionRe) {
  const pos = await p.evaluate((re) => {
    const rx = new RegExp(re)
    const span = [...document.querySelectorAll('span,div')].find(x => x.offsetParent && rx.test(x.innerText || '') && x.children.length === 0)
    if (!span) return null
    const r = span.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, triggerRe)
  if (!pos) { console.log('no trigger for', triggerRe); return false }
  await p.mouse.click(pos.x, pos.y)
  await new Promise(r => setTimeout(r, 1000))
  await p.keyboard.type(query, { delay: 50 })
  await new Promise(r => setTimeout(r, 3000))
  const picked = await p.evaluate((re) => {
    const rx = new RegExp(re, 'i')
    const cands = [...document.querySelectorAll('*')].filter(x => x.offsetParent && x.children.length <= 3 && rx.test(x.innerText || '') && (x.innerText || '').length < 120)
    const el = cands.sort((a, b) => a.innerText.length - b.innerText.length)[0]
    if (el) { (el.closest('button') || el.closest('li') || el).click(); return el.innerText.replace(/\s+/g, ' ').slice(0, 60) }
    return null
  }, optionRe)
  await new Promise(r => setTimeout(r, 1500))
  console.log(`picked [${query}]:`, picked)
  return !!picked
}

// STEP 1
await popoverPick('Search by name, member number', 'Testmember', 'Testmember')
await popoverPick('Search by name, type', 'Parklands', 'Parklands')
await shot('6.3d-step1')
console.log('next:', await clickText('^next$'))
await new Promise(r => setTimeout(r, 1500))

// STEP 2 — encounter details
let t = await text()
console.log('\nSTEP2:', t.slice(t.indexOf('Step 2'), t.indexOf('Step 2') + 450))
const step2Fields = await p.evaluate(() => [...document.querySelectorAll('input,select')].filter(e => e.offsetParent).map(e => ({ tag: e.tagName, type: e.type, name: e.name, options: e.tagName === 'SELECT' ? [...e.options].map(o => o.text).slice(0, 8) : undefined })))
console.log('STEP2 FIELDS:', JSON.stringify(step2Fields))
// fill date if present
await p.evaluate(() => {
  const d = [...document.querySelectorAll('input[type="date"]')].find(x => x.offsetParent)
  if (d) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(d, '2026-06-10'); d.dispatchEvent(new Event('input', { bubbles: true })); d.dispatchEvent(new Event('change', { bubbles: true }))
  }
})
await shot('6.3d-step2')
console.log('next:', await clickText('^next$'))
await new Promise(r => setTimeout(r, 1500))

// STEP 3 — diagnoses
t = await text()
console.log('\nSTEP3:', t.slice(t.indexOf('Step 3'), t.indexOf('Step 3') + 400))
await shot('6.3d-step3-before')
await popoverPick('Search ICD|Search by code|diagnos', 'malaria', 'malaria')
await shot('6.3d-step3')
console.log('next:', await clickText('^next$'))
await new Promise(r => setTimeout(r, 1500))

// STEP 4 — services & billing
t = await text()
console.log('\nSTEP4:', t.slice(t.indexOf('Step 4'), t.indexOf('Step 4') + 500))
const step4Fields = await p.evaluate(() => [...document.querySelectorAll('input,select')].filter(e => e.offsetParent).map(e => ({ tag: e.tagName, type: e.type, name: e.name, ph: e.placeholder })))
console.log('STEP4 FIELDS:', JSON.stringify(step4Fields))
await shot('6.3d-step4')

await b.close()
console.log('DONE S6F')
