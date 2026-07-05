import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('finance (maker) →', await login(p, 'finance@medvex.co.ug'))
await p.goto(BASE + '/settlement', { waitUntil: 'networkidle2' }); await sleep(1600)

// maker self-approve attempt from the list row button
const selfTry = await p.evaluate(() => {
  const tr = [...document.querySelectorAll('tbody tr')].find(x => /City Eye/.test(x.innerText) && /MAKER SUBMITTED/.test(x.innerText))
  const btn = [...(tr?.querySelectorAll('button') || [])].find(b => /Approve/i.test(b.innerText))
  if (btn) { btn.click(); return 'clicked Approve on own batch' }
  return 'no approve button'
})
console.log('self-approve:', selfTry); await sleep(2800)
let t = await p.evaluate(() => document.body.innerText)
console.log('MSGS:', JSON.stringify((t.match(/[^\n]*(maker|checker|different|cannot|denied|error)[^\n]*/gi) || []).filter(x => x.length < 180 && !/multi-level/.test(x)).slice(0, 4)))
console.log('STATUS:', (t.match(/City Eye[^\n]*?(MAKER SUBMITTED|CHECKER APPROVED)/) || [])[1])
await shot(p, 'w5-42-self-approve')

// checker: admin approves + marks paid
const p2 = await b.newPage()
console.log('\nadmin (checker) →', await login(p2, 'admin@medvex.co.ug'))
await p2.goto(BASE + '/settlement', { waitUntil: 'networkidle2' }); await sleep(1600)
console.log('checker approve:', await p2.evaluate(() => {
  const tr = [...document.querySelectorAll('tbody tr')].find(x => /City Eye/.test(x.innerText) && /MAKER SUBMITTED/.test(x.innerText))
  const btn = [...(tr?.querySelectorAll('button') || [])].find(b => /Approve/i.test(b.innerText))
  if (btn) { btn.click(); return 'clicked' } return 'no button'
}))
await sleep(2800)
t = await p2.evaluate(() => document.body.innerText)
console.log('STATUS:', (t.match(/City Eye[^\n]*?(MAKER SUBMITTED|CHECKER APPROVED|SETTLED)/) || [])[1])
console.log('mark paid:', await p2.evaluate(() => {
  const tr = [...document.querySelectorAll('tbody tr')].find(x => /City Eye/.test(x.innerText))
  const btn = [...(tr?.querySelectorAll('button') || [])].find(b => /Paid|Settle/i.test(b.innerText))
  if (btn) { btn.click(); return 'clicked ' + btn.innerText } return 'no pay button — row: ' + tr?.innerText.replace(/\s+/g, ' ')
}))
await sleep(3000)
t = await p2.evaluate(() => document.body.innerText)
console.log('STATUS AFTER PAY:', (t.match(/City Eye[^\n]*?(CHECKER APPROVED|SETTLED)/) || [])[1])
await shot(p2, 'w5-42-after-pay')

// open batch detail for voucher evidence
const bh = await p2.evaluate(() => {
  const tr = [...document.querySelectorAll('tbody tr')].find(x => /City Eye/.test(x.innerText))
  return tr?.querySelector('a')?.getAttribute('href')
})
if (bh) {
  await p2.goto(BASE + bh, { waitUntil: 'networkidle2' }); await sleep(1800)
  t = await p2.evaluate(() => document.body.innerText)
  console.log('\n== BATCH DETAIL ==\n', t.slice(200, 1800).replace(/\n{2,}/g, '\n'))
  console.log('VOUCHER refs:', JSON.stringify((t.match(/[^\n]*(voucher|PV-|payment ref)[^\n]*/gi) || []).slice(0, 6)))
  await shot(p2, 'w5-42-batch-detail')
}
await b.close()
console.log('DONE')
