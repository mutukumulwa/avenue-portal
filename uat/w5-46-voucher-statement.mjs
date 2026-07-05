import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('admin →', await login(p, 'admin@medvex.co.ug'))
await p.goto(BASE + '/providers', { waitUntil: 'networkidle2' }); await sleep(1800)
const ph = await p.evaluate(() => {
  const tr = [...document.querySelectorAll('tbody tr, a')].find(x => /City Eye/.test(x.innerText))
  return tr?.matches('a') ? tr.getAttribute('href') : tr?.querySelector('a')?.getAttribute('href')
})
console.log('provider href:', ph)
if (ph) {
  await p.goto(BASE + ph, { waitUntil: 'networkidle2' }); await sleep(1800)
  const t = await p.evaluate(() => document.body.innerText)
  console.log('== PROVIDER DETAIL (City Eye) ==\n', t.slice(200, 1600).replace(/\n{2,}/g, '\n'))
  console.log('\nstatement/voucher refs:', JSON.stringify((t.match(/[^\n]*(statement|voucher|PV-2026|settle)[^\n]*/gi) || []).slice(0, 8)))
  await shot(p, 'w5-46-provider-detail')
}
await b.close()
console.log('DONE')
