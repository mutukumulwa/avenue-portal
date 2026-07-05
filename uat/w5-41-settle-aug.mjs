import { launch, login, BASE, sleep, shot, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('finance →', await login(p, 'finance@medvex.co.ug'))
await p.goto(BASE + '/settlement', { waitUntil: 'networkidle2' }); await sleep(1600)

async function tryBatch(provider, month) {
  await p.evaluate((prov, mon) => {
    const sels = [...document.querySelectorAll('select')].filter(s => s.getClientRects().length)
    const ps = sels.find(s => [...s.options].some(o => o.text.includes(prov)))
    const po = [...ps.options].find(o => o.text.includes(prov)); ps.value = po.value; ps.dispatchEvent(new Event('change', { bubbles: true }))
    const ms = sels.find(s => s !== ps && [...s.options].some(o => o.text.includes(mon)))
    if (ms) { const mo = [...ms.options].find(o => o.text.includes(mon)); ms.value = mo.value; ms.dispatchEvent(new Event('change', { bubbles: true })) }
  }, provider, month)
  await sleep(400)
  await clickText(p, 'button', 'Create Batch'); await sleep(3000)
  const t = await p.evaluate(() => document.body.innerText)
  const msg = (t.match(/[^\n]*(already exists|no approved|created|error|no claims)[^\n]*/gi) || []).filter(x => x.length < 160).slice(0, 3)
  const counts = (t.match(/All \(\d+\)[^]*?SETTLED \(\d+\)/) || [])[0]?.replace(/\n+/g, ' ')
  console.log(`\n${provider} + ${month}: msgs=${JSON.stringify(msg)} | ${counts}`)
  return t
}

let t = await tryBatch('LifeCare', 'August')
await shot(p, 'w5-41-lifecare-aug')
if (!/MAKER SUBMITTED \([1-9]/.test(t)) {
  t = await tryBatch('City Eye', 'July')
  await shot(p, 'w5-41-cityeye-jul')
}
const rows = await p.evaluate(() => [...document.querySelectorAll('tbody tr')].map(r => r.innerText.replace(/\s+/g, ' ')).slice(0, 6))
console.log('\nBATCH ROWS:', JSON.stringify(rows, null, 1))
await b.close()
console.log('DONE')
