import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()

// ── PR-037: broker quote (no census) → bind step 2 must show a friendly banner, NOT crash ──
const uw = await b.newPage()
await login(uw, 'underwriter@medvex.co.ug')
await uw.goto(BASE + '/quotations', { waitUntil: 'networkidle2' }); await sleep(1500)
const qh = await uw.evaluate(() => { const tr = [...document.querySelectorAll('tbody tr')].find(x => /Nakuru/.test(x.innerText)); return [...(tr?.querySelectorAll('a') || [])].map(a => a.getAttribute('href')).find(h => /quot/i.test(h)) })
console.log('quote:', qh)
await uw.goto(BASE + qh + '/bind', { waitUntil: 'networkidle2' }).catch(() => {})
await sleep(1500)
let t = await uw.evaluate(() => document.body.innerText)
console.log('bind page loaded:', /Binding —/.test(t))
console.log('census warning present:', /no census|census lives|no benefit package|no member census/i.test(t))
// try clicking Create Memberships (button should be disabled or show banner)
const btnState = await uw.evaluate(() => { const btn = [...document.querySelectorAll('button')].find(b => /Create Memberships/.test(b.innerText)); return btn ? { disabled: btn.disabled } : 'no-button' })
console.log('Create Memberships button:', JSON.stringify(btnState))
await shot(uw, 'f4-bind-no-census')

// ── PR-027: settlement — LifeCare batch must now pick up stranded 761/762/764/767 ──
const fin = await b.newPage()
await login(fin, 'finance@medvex.co.ug')
await fin.goto(BASE + '/settlement', { waitUntil: 'networkidle2' }); await sleep(1500)
await fin.evaluate(() => {
  const sels = [...document.querySelectorAll('select')].filter(s => s.getClientRects().length)
  const ps = sels.find(s => [...s.options].some(o => /LifeCare/.test(o.text))); ps.value = [...ps.options].find(o => /LifeCare/.test(o.text)).value; ps.dispatchEvent(new Event('change', { bubbles: true }))
  const ms = sels.find(s => s !== ps && [...s.options].some(o => /August/.test(o.text))); if (ms) { ms.value = [...ms.options].find(o => /August/.test(o.text)).value; ms.dispatchEvent(new Event('change', { bubbles: true })) }
})
await sleep(400)
await clickText(fin, 'button', 'Create Batch'); await sleep(3000)
t = await fin.evaluate(() => document.body.innerText)
console.log('\nSETTLEMENT create msg:', JSON.stringify((t.match(/[^\n]*(No unsettled|already exists|no approved)[^\n]*/i) || ['(created OK)'])[0]))
const rows = await fin.evaluate(() => [...document.querySelectorAll('tbody tr')].filter(x => /LifeCare/.test(x.innerText)).map(x => x.innerText.replace(/\s+/g, ' ')).slice(0, 4))
console.log('LifeCare batches:', JSON.stringify(rows, null, 1))
await shot(fin, 'f4-settlement-picked-up')

// ── PR-029: batch detail page (provider statement) renders ──
const bh = await fin.evaluate(() => { const tr = [...document.querySelectorAll('tbody tr')].find(x => /LifeCare/.test(x.innerText) && /MAKER SUBMITTED/.test(x.innerText)); return tr?.querySelector('a')?.getAttribute('href') })
console.log('\nbatch detail href:', bh)
if (bh) {
  await fin.goto(BASE + bh, { waitUntil: 'networkidle2' }); await sleep(1800)
  t = await fin.evaluate(() => document.body.innerText)
  console.log('STATEMENT page:', /Provider statement|remittance/i.test(t))
  console.log('claim rows in statement:', (t.match(/CLM-2026-\d+/g) || []).length)
  console.log('voucher section:', /Payment Voucher/i.test(t), '| JE section:', /Journal Entry/i.test(t))
  console.log('total payable:', (t.match(/Total payable to provider[\s\S]{0,40}/) || [''])[0].replace(/\n+/g, ' '))
  await shot(fin, 'f4-provider-statement')
}
await b.close()
console.log('DONE')
