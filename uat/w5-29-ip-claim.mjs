import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('admin →', await login(p, 'admin@medvex.co.ug'))

// 1) auto-adjudication settings
await p.goto(BASE + '/settings/auto-adjudication', { waitUntil: 'networkidle2' }).catch(() => {})
await sleep(1500)
let t = await p.evaluate(() => document.body.innerText)
const ai = t.indexOf('Auto-Adjudication')
console.log('== AUTO-ADJUDICATION SETTINGS ==\n', t.slice(ai, ai + 1200).replace(/\n{2,}/g, '\n'))
await shot(p, 'w5-29-skip1')

// 2) Peter's PA-2026-00012 phantom hold (SURGICAL not in package)
await p.goto(BASE + '/preauth/cmr6eep36000z96vqzp9bkj1o', { waitUntil: 'networkidle2' }); await sleep(1500)
t = await p.evaluate(() => document.body.innerText)
const hi = t.indexOf('Benefit Balance & Hold')
console.log('\nPETER PA HOLD PANEL:', hi >= 0 ? t.slice(hi, hi + 360).replace(/\n+/g, ' | ') : '(no hold panel)')
await shot(p, 'w5-29-skip2')

// 3) OUTPATIENT claim for Peter (5,000 consultation)
const p2 = await b.newPage()
console.log('\nmedical →', await login(p2, 'medical@medvex.co.ug'))
await p2.goto(BASE + '/claims/new', { waitUntil: 'networkidle2' }); await sleep(1800)
async function clickSmallest(match) {
  const box = await p2.evaluate(m => {
    let best = null
    for (const n of document.querySelectorAll('*')) {
      const tx = (n.innerText || n.textContent || '').trim()
      if (!tx.includes(m)) continue
      const r = n.getBoundingClientRect()
      if (!r.width || !r.height) continue
      const area = r.width * r.height
      if (!best || area < best.area) best = { area, x: r.x + r.width / 2, y: r.y + r.height / 2 }
    }
    return best
  }, match)
  if (!box) return 'not-found: ' + match
  await p2.mouse.click(box.x, box.y); return 'clicked ' + match
}
async function comboPick(triggerText, query, optionText) {
  if (!(await clickText(p2, 'button', triggerText))) return 'trigger missing'
  await sleep(800); await p2.keyboard.type(query, { delay: 50 }); await sleep(1400)
  const r = await clickSmallest(optionText); await sleep(800); return r
}
console.log(await comboPick('Search by name, member number', 'Ursula', 'MVX-2026-00250'))
console.log(await comboPick('Search by name, type or county', 'LifeCare', 'LifeCare Hospitals (UAT)'))
await clickText(p2, 'button', 'Next'); await sleep(1400)
console.log(await p2.evaluate(() => {
  const sels = [...document.querySelectorAll('select')].filter(s => s.getClientRects().length)
  sels[0].value = 'INPATIENT'; sels[0].dispatchEvent(new Event('change', { bubbles: true }))
  sels[1].value = 'INPATIENT'; sels[1].dispatchEvent(new Event('change', { bubbles: true }))
  const d = [...document.querySelectorAll('input[type="date"]')].find(i => i.getClientRects().length)
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(d, '2026-07-04'); d.dispatchEvent(new Event('input', { bubbles: true })); d.dispatchEvent(new Event('change', { bubbles: true }))
  return '→ INPATIENT/INPATIENT/2026-07-04'
}))
await clickText(p2, 'button', 'Next'); await sleep(1400)
const di = await p2.$('input[placeholder*="ICD" i], input[placeholder*="diagnos" i], input[placeholder*="search" i]')
await di.click(); await p2.keyboard.type('J06.9', { delay: 60 }); await sleep(1700)
console.log('diag:', await clickSmallest('J06.9')); await sleep(800)
await clickText(p2, 'button', 'Next'); await sleep(1400)
console.log(await clickSmallest('Consultation')); await sleep(900)
console.log(await p2.evaluate(() => {
  const vis = sel => [...document.querySelectorAll(sel)].filter(x => x.getClientRects().length)
  const setV = (i, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })) }
  setV(vis('input[placeholder*="Type description" i]').at(-1), 'Inpatient observation - 1 night')
  setV(vis('input[type="number"]').at(-1), '10000')
  return 'line 10000'
}))
await sleep(800); await p2.keyboard.press('Escape'); await sleep(400)
await clickText(p2, 'button', 'Submit Claim')
await sleep(3500)
console.log('URL:', p2.url())
const after = await p2.evaluate(() => document.body.innerText)
console.log('TOP ROWS:', after.slice(after.indexOf('Claim No'), after.indexOf('Claim No') + 300).replace(/\n+/g, ' | '))
await shot(p2, 'w5-29-ip-claim-submitted')
await b.close()
console.log('DONE')
