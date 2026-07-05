import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('login →', await login(p, 'medical@medvex.co.ug'))
await p.goto(BASE + '/claims/new', { waitUntil: 'networkidle2' })
await sleep(1800)

// click element whose innerText contains `match`, by real mouse at its center
async function clickAt(match, { exclude = /$^/ } = {}) {
  const box = await p.evaluate((m, ex) => {
    const walk = [...document.querySelectorAll('div, button, li, span')]
    const el = walk.find(n => {
      const t = (n.innerText || '').trim()
      return t.includes(m) && !new RegExp(ex).test(t) && t.length < 160 && n.getClientRects().length && n.children.length <= 4
    })
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + Math.min(r.height / 2, 20) }
  }, match, exclude.source)
  if (!box) return 'not-found: ' + match
  await p.mouse.click(box.x, box.y)
  return 'clicked ' + match
}

async function comboPick(triggerText, query, optionText) {
  const t = await clickText(p, 'button', triggerText)
  if (!t) return 'trigger missing: ' + triggerText
  await sleep(800)
  await p.keyboard.type(query, { delay: 50 })
  await sleep(1200)
  const r = await clickAt(optionText)
  await sleep(700)
  return r
}

// STEP 1
console.log('member:', await comboPick('Search by name, member number', 'Ursula', 'MVX-2026-00250'))
console.log('provider:', await comboPick('Search by name, type or county', 'LifeCare', 'LifeCare Hospitals (UAT)'))
await shot(p, 'w5-09-step1')
console.log('→ next:', await clickText(p, 'button', 'Next')); await sleep(1400)

// STEP 2 — structure
console.log('\n== STEP 2 ==')
const s2 = await p.evaluate(() => {
  const rows = []
  document.querySelectorAll('select').forEach(s => { if (s.getClientRects().length) rows.push('SELECT name=' + s.name + ' opts=' + [...s.options].map(o => o.value).join(',').slice(0, 140)) })
  document.querySelectorAll('input, textarea').forEach(x => { if (x.getClientRects().length) rows.push(`INPUT[${x.type || x.tagName}] name=${x.name} ph=${x.placeholder} val=${x.value}`) })
  return rows
})
console.log(s2.join('\n'))

// fill: DAY_CASE / INPATIENT / FUTURE DOS first
await p.evaluate(() => {
  const sel = (name, val) => { const s = document.querySelector(`select[name="${name}"]`); if (s) { s.value = val; s.dispatchEvent(new Event('change', { bubbles: true })) } }
  sel('serviceType', 'DAY_CASE'); sel('benefitCategory', 'INPATIENT')
  const d = [...document.querySelectorAll('input[type="date"]')].find(i => i.getClientRects().length)
  if (d) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(d, '2026-07-06'); d.dispatchEvent(new Event('input', { bubbles: true })); d.dispatchEvent(new Event('change', { bubbles: true })) }
})
await sleep(400)
console.log('→ next w/ FUTURE 2026-07-06:', await clickText(p, 'button', 'Next')); await sleep(1200)
let now = await bodyText(p, 500)
const stillStep2 = /Step 2/.test(now)
console.log('still on step 2?', stillStep2)
console.log('errors:', await p.evaluate(() => [...document.querySelectorAll('p, span, div')].filter(e => e.getClientRects().length && /future|cannot|invalid/i.test(e.innerText) && e.innerText.length < 140).map(e => e.innerText.trim()).slice(0, 4)))
await shot(p, 'w5-09-step2-future')

// correct the date to today
await p.evaluate(() => {
  const d = [...document.querySelectorAll('input[type="date"]')].find(i => i.getClientRects().length)
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(d, '2026-07-04'); d.dispatchEvent(new Event('input', { bubbles: true })); d.dispatchEvent(new Event('change', { bubbles: true }))
})
await sleep(300)
console.log('→ next w/ 2026-07-04:', await clickText(p, 'button', 'Next')); await sleep(1400)
now = await bodyText(p, 700)
console.log('\n== STEP 3 ==\n', now.slice(now.indexOf('Step'), now.indexOf('Step') + 500))
await shot(p, 'w5-09-step3')

// STEP 3 — diagnosis search K42.9
const diagInput = await p.$('input[placeholder*="ICD" i], input[placeholder*="diagnos" i], input[placeholder*="Search" i]')
if (diagInput) { await diagInput.click(); await p.keyboard.type('K42.9', { delay: 60 }); await sleep(1500); console.log('diag pick:', await clickAt('K42.9', { exclude: /^K42\.9$/ })) }
else console.log('no diag input found — dumping'), console.log(await p.evaluate(() => [...document.querySelectorAll('input')].filter(i => i.getClientRects().length).map(i => i.placeholder)))
await sleep(700)
await shot(p, 'w5-09-step3-diag')
console.log('→ next:', await clickText(p, 'button', 'Next')); await sleep(1400)

// STEP 4 — services & billing
now = await bodyText(p, 1000)
console.log('\n== STEP 4 ==\n', now.slice(now.indexOf('Step'), now.indexOf('Step') + 700))
const s4 = await p.evaluate(() => {
  const rows = []
  document.querySelectorAll('select').forEach(s => { if (s.getClientRects().length) rows.push('SELECT name=' + s.name + ' opts=' + [...s.options].map(o => o.value).join(',').slice(0, 120)) })
  document.querySelectorAll('input, textarea').forEach(x => { if (x.getClientRects().length) rows.push(`INPUT[${x.type || x.tagName}] name=${x.name} ph=${x.placeholder}`) })
  document.querySelectorAll('button').forEach(x => { const t = x.innerText.trim(); if (x.getClientRects().length && t && t.length < 40 && !/OVERVIEW|MEMBERSHIP|CLINICAL|INSIGHTS|SUPPORT|REINSTATEMENTS|Log out|Dashboard/.test(t)) rows.push('BTN: ' + t) })
  return rows
})
console.log(s4.join('\n'))
await shot(p, 'w5-09-step4')
await b.close()
console.log('PAUSED-AT-STEP4')
