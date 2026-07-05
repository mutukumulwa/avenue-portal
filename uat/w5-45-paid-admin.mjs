import { launch, login, BASE, sleep, shot, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('admin →', await login(p, 'admin@medvex.co.ug'))

// claims filtered to City Eye
await p.goto(BASE + '/claims', { waitUntil: 'networkidle2' }); await sleep(2000)
await p.evaluate(() => {
  const sels = [...document.querySelectorAll('select')].filter(s => s.getClientRects().length)
  const fs = sels.find(s => [...s.options].some(o => /City Eye/.test(o.text)))
  fs.value = [...fs.options].find(o => /City Eye/.test(o.text)).value; fs.dispatchEvent(new Event('change', { bubbles: true }))
})
await sleep(400); await clickText(p, 'button', 'Filter'); await sleep(2200)
console.log('CITY EYE CLAIMS:', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('tbody tr')].map(r => r.innerText.replace(/\s+/g, ' ')).slice(0, 8)), null, 1))
await shot(p, 'w5-45-cityeye-claims-admin')

// billing page — vouchers?
await p.goto(BASE + '/billing', { waitUntil: 'networkidle2' }); await sleep(2000)
let t = await p.evaluate(() => document.body.innerText)
console.log('\n== /billing (top) ==\n', t.slice(200, 1400).replace(/\n{2,}/g, '\n'))
console.log('PV refs:', JSON.stringify((t.match(/PV-2026-\d+/g) || []).slice(0, 5)))
const tabs = await p.evaluate(() => [...document.querySelectorAll('[role="tab"], a, button')].filter(e => e.getClientRects().length).map(e => (e.innerText || '').trim()).filter(x => /voucher|payment|statement/i.test(x)).slice(0, 8))
console.log('voucher-ish controls:', JSON.stringify(tabs))
await shot(p, 'w5-45-billing')
await b.close()
console.log('DONE')
