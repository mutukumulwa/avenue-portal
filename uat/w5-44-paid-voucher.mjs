import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('finance →', await login(p, 'finance@medvex.co.ug'))

// claims filtered by City Eye facility
await p.goto(BASE + '/claims', { waitUntil: 'networkidle2' }); await sleep(2000)
await p.evaluate(() => {
  const sels = [...document.querySelectorAll('select')].filter(s => s.getClientRects().length)
  const fs = sels.find(s => [...s.options].some(o => /City Eye/.test(o.text)))
  if (fs) { fs.value = [...fs.options].find(o => /City Eye/.test(o.text)).value; fs.dispatchEvent(new Event('change', { bubbles: true })) }
})
await sleep(500)
await clickText(p, 'button', 'Filter'); await sleep(2200)
const rows = await p.evaluate(() => [...document.querySelectorAll('tbody tr')].map(r => r.innerText.replace(/\s+/g, ' ')).slice(0, 8))
console.log('CITY EYE CLAIMS:', JSON.stringify(rows, null, 1))
await shot(p, 'w5-44-cityeye-claims')

// settlement batch detail
await p.goto(BASE + '/settlement', { waitUntil: 'networkidle2' }); await sleep(1500)
const links = await p.evaluate(() => [...document.querySelectorAll('tbody a')].map(a => a.getAttribute('href') + ' :: ' + a.innerText.trim()))
console.log('\nSETTLEMENT LINKS:', JSON.stringify(links))
const bh = links.find(l => l.includes('/settlement/'))?.split(' :: ')[0]
if (bh) {
  await p.goto(BASE + bh, { waitUntil: 'networkidle2' }); await sleep(1800)
  const t = await p.evaluate(() => document.body.innerText)
  console.log('\n== BATCH DETAIL ==\n', t.slice(200, 2000).replace(/\n{2,}/g, '\n'))
  console.log('\nVOUCHER refs:', JSON.stringify((t.match(/[^\n]*(voucher|PV-2026|statement)[^\n]*/gi) || []).slice(0, 8)))
  await shot(p, 'w5-44-batch-detail')
}
await b.close()
console.log('DONE')
