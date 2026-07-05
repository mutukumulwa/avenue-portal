import { launch, login, BASE, sleep, shot, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('finance →', await login(p, 'finance@medvex.co.ug'))

// 2010 ledger — expect debits reversing claims payable on settlement
await p.goto(BASE + '/billing/gl/ledger', { waitUntil: 'networkidle2' }); await sleep(1600)
async function ledger(code, name) {
  await p.evaluate(c => {
    const s = [...document.querySelectorAll('select')].find(s => s.getClientRects().length)
    const o = [...s.options].find(o => o.text.startsWith(c)); s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true }))
  }, code)
  await sleep(500)
  await p.evaluate(() => [...document.querySelectorAll('button')].find(b => /View Ledger/i.test(b.innerText))?.click())
  await sleep(2200)
  const t = await p.evaluate(() => document.body.innerText)
  const i = t.indexOf('CLOSING BALANCE')
  console.log(`\n== ${code} ${name} ==\n`, t.slice(i, i + 1500).replace(/\n{2,}/g, '\n'))
  return t
}
await ledger('2010', 'Claims Payable')
await shot(p, 'w5-43-2010-after-settle')
await ledger('1010', 'Cash at Bank')
await shot(p, 'w5-43-1010-after-settle')

// claims now PAID?
await p.goto(BASE + '/claims', { waitUntil: 'networkidle2' }); await sleep(1600)
const rows = await p.evaluate(() => [...document.querySelectorAll('tbody tr')].filter(r => /City Eye/.test(r.innerText)).map(r => r.innerText.replace(/\s+/g, ' ')).slice(0, 5))
console.log('\nCITY EYE CLAIMS:', JSON.stringify(rows, null, 1))
await b.close()
console.log('DONE')
