import { launch, login, BASE, sleep, shot, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('admin →', await login(p, 'admin@medvex.co.ug'))
await p.goto(BASE + '/offline-capture', { waitUntil: 'networkidle2' }); await sleep(1800)
let t = await p.evaluate(() => document.body.innerText)
if (/Offline work is locked/.test(t)) {
  await p.evaluate(() => { const i = document.querySelector('input[name="workCode"], input[placeholder*="OWA"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'OWA-UG7YED'); i.dispatchEvent(new Event('input', { bubbles: true })) })
  await clickText(p, 'button', 'Unlock offline work'); await sleep(4000)
}
// capture entry
console.log(await p.evaluate(() => {
  const setV = (sel, v) => { const i = document.querySelector(sel); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })) }
  setV('input[name="memberNumber"]', 'MVX-2026-00250')
  setV('input[name="providerCode"]', 'LIFECARE-UAT')
  const s = document.querySelector('select'); s.value = 'OUTPATIENT'; s.dispatchEvent(new Event('change', { bubbles: true }))
  setV('input[name="description"]', 'Offline GP consultation (W5 E8)')
  setV('input[name="quantity"]', '1')
  setV('input[name="unitCost"]', '1200')
  return 'capture form filled'
}))
console.log('capture:', await clickText(p, 'button', 'Capture (offline-safe)')); await sleep(2000)
t = await p.evaluate(() => document.body.innerText)
console.log('OUTBOX:', (t.match(/OUTBOX[^\n]*/) || [])[0])
console.log('ROWS:', JSON.stringify((t.match(/CAPTURED\tENTITY[^]*?(?=$)/) || [t.slice(t.indexOf('CAPTURED'), t.indexOf('CAPTURED') + 300)])[0]?.replace(/\n+/g, ' | ').slice(0, 300)))
await shot(p, 'w5-67-captured')

// duplicate capture (idempotency test): capture same entry again
console.log('\ncapture again (dup):', await clickText(p, 'button', 'Capture (offline-safe)')); await sleep(1500)
t = await p.evaluate(() => document.body.innerText)
console.log('OUTBOX after dup:', (t.match(/OUTBOX[^\n]*/) || [])[0])

// sync
console.log('\nsync:', await clickText(p, 'button', 'Sync now')); await sleep(5000)
t = await p.evaluate(() => document.body.innerText)
console.log('OUTBOX after sync:', (t.match(/OUTBOX[^\n]*/) || [])[0])
const ci = t.indexOf('CAPTURED')
console.log('STATES:', t.slice(ci, ci + 400).replace(/\n+/g, ' | '))
await shot(p, 'w5-67-synced')

// verify: claims list + work code ops count
await p.goto(BASE + '/claims', { waitUntil: 'networkidle2' }); await sleep(1600)
console.log('\nTOP CLAIM:', await p.evaluate(() => [...document.querySelectorAll('tbody tr')][0]?.innerText.replace(/\s+/g, ' ')))
await p.goto(BASE + '/settings', { waitUntil: 'domcontentloaded' }).catch(() => {})
await b.close()
console.log('DONE')
