import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('login →', await login(p, 'medical@medvex.co.ug'))
await p.goto(BASE + '/claims/new', { waitUntil: 'networkidle2' })
await sleep(1800)
const stepNo = () => p.evaluate(() => (document.body.innerText.match(/Step (\d) —/) || [])[1] || '?')
async function clickSmallest(match) {
  const box = await p.evaluate(m => {
    let best = null
    for (const n of document.querySelectorAll('*')) {
      const t = (n.innerText || n.textContent || '').trim()
      if (!t.includes(m)) continue
      const r = n.getBoundingClientRect()
      if (!r.width || !r.height) continue
      const area = r.width * r.height
      if (!best || area < best.area) best = { area, x: r.x + r.width / 2, y: r.y + r.height / 2 }
    }
    return best
  }, match)
  if (!box) return 'not-found: ' + match
  await p.mouse.click(box.x, box.y); return 'clicked ' + match
}
async function comboPick(triggerText, query, optionText) {
  if (!(await clickText(p, 'button', triggerText))) return 'trigger missing'
  await sleep(800); await p.keyboard.type(query, { delay: 50 }); await sleep(1400)
  const r = await clickSmallest(optionText); await sleep(800); return r
}

// STEP 1
console.log(await comboPick('Search by name, member number', 'Ursula', 'MVX-2026-00250'))
console.log(await comboPick('Search by name, type or county', 'LifeCare', 'LifeCare Hospitals (UAT)'))
await clickText(p, 'button', 'Next'); await sleep(1400)

// STEP 2 — by position: select[0]=serviceType DAY_CASE, select[1]=benefit INPATIENT
console.log('step', await stepNo(), await p.evaluate(() => {
  const sels = [...document.querySelectorAll('select')].filter(s => s.getClientRects().length)
  sels[0].value = 'DAY_CASE'; sels[0].dispatchEvent(new Event('change', { bubbles: true }))
  sels[1].value = 'INPATIENT'; sels[1].dispatchEvent(new Event('change', { bubbles: true }))
  const d = [...document.querySelectorAll('input[type="date"]')].find(i => i.getClientRects().length)
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(d, '2026-07-04'); d.dispatchEvent(new Event('input', { bubbles: true })); d.dispatchEvent(new Event('change', { bubbles: true }))
  const doc = [...document.querySelectorAll('input[placeholder="Dr. Name"]')].find(i => i.getClientRects().length)
  if (doc) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(doc, 'Dr. W5 Retest'); doc.dispatchEvent(new Event('input', { bubbles: true })) }
  return 'set DAY_CASE/INPATIENT/2026-07-04'
}))
await clickText(p, 'button', 'Next'); await sleep(1400)

// STEP 3
const di = await p.$('input[placeholder*="ICD" i], input[placeholder*="diagnos" i], input[placeholder*="search" i]')
await di.click(); await p.keyboard.type('K42.9', { delay: 60 }); await sleep(1700)
console.log('diag:', await clickSmallest('Umbilical hernia without obstruction'))
await sleep(800)
await clickText(p, 'button', 'Next'); await sleep(1400)
console.log('step', await stepNo())

// STEP 4 — line 1: Procedure 85,000
console.log(await clickSmallest('Procedure')); await sleep(900)
let f = await p.evaluate(() => [...document.querySelectorAll('input,textarea')].filter(x => x.getClientRects().length).map(x => `${x.type || x.tagName} "${x.placeholder}" val=${x.value}`))
console.log('LINE FIELDS:', JSON.stringify(f, null, 1))
await shot(p, 'w5-13-step4-line1')
// fill description + amount on the newest line
console.log(await p.evaluate(() => {
  const vis = sel => [...document.querySelectorAll(sel)].filter(x => x.getClientRects().length)
  const descs = vis('input[placeholder*="escription" i], input[placeholder*="service" i], textarea')
  const nums = vis('input[type="number"]')
  const setV = (i, v) => { const proto = i.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })) }
  if (descs.length) setV(descs.at(-1), 'Umbilical hernia repair (day case)')
  if (nums.length) setV(nums.at(-1), '85000')
  return `descs=${descs.length} nums=${nums.length}`
}))
await sleep(500)
// line 2: Consultation 1,000
console.log(await clickSmallest('Consultation')); await sleep(900)
console.log(await p.evaluate(() => {
  const vis = sel => [...document.querySelectorAll(sel)].filter(x => x.getClientRects().length)
  const descs = vis('input[placeholder*="escription" i], input[placeholder*="service" i], textarea')
  const nums = vis('input[type="number"]')
  const setV = (i, v) => { const proto = i.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })) }
  if (descs.length) setV(descs.at(-1), 'Post-op review consultation')
  if (nums.length) setV(nums.at(-1), '1000')
  return `descs=${descs.length} nums=${nums.length}`
}))
await sleep(500)
console.log('STEP4 STATE:', await p.evaluate(() => document.body.innerText.match(/Step 4 —[^]*$/)?.[0].replace(/\s+/g, ' ').slice(0, 800)))
await shot(p, 'w5-13-step4-filled')

// SUBMIT
await clickText(p, 'button', 'Submit Claim')
await sleep(3500)
console.log('\nURL:', p.url())
console.log('\n== AFTER SUBMIT ==\n', await bodyText(p, 1600))
await shot(p, 'w5-13-submitted')
await b.close()
console.log('DONE')
