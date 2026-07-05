import { launch, login, BASE, sleep, shot, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('login →', await login(p, 'admin@medvex.co.ug'))
await p.goto(BASE + '/claims', { waitUntil: 'networkidle2' })
await sleep(1500)
const href = await p.evaluate(() => {
  const tr = [...document.querySelectorAll('tbody tr')].find(x => /CLM-2026-00761/.test(x.innerText))
  return tr?.querySelector('a')?.getAttribute('href')
})
console.log('href:', href)
await p.goto(BASE + href, { waitUntil: 'networkidle2' })
await sleep(2000)
const t = await p.evaluate(() => document.body.innerText)
console.log('\n== CLAIM 761 DETAIL (full) ==\n', t.replace(/\n{2,}/g, '\n').slice(t.indexOf('Claims'), t.indexOf('Claims') + 3500))
await shot(p, 'w5-14-claim-761')

// PA state
await p.goto(BASE + '/preauth/cmr6djj0i000096vqaae6yvx0', { waitUntil: 'networkidle2' })
await sleep(1500)
const pa = await p.evaluate(() => document.body.innerText)
console.log('\n== PA-2026-00010 STATUS ==\n', pa.slice(pa.indexOf('PA-2026-00010'), pa.indexOf('PA-2026-00010') + 400).replace(/\n+/g, ' | '))
const hi = pa.indexOf('Benefit Balance & Hold')
console.log('\nHOLD PANEL NOW:', pa.slice(hi, hi + 400).replace(/\n+/g, ' | '))
await shot(p, 'w5-14-pa-after-761')
await b.close()
console.log('DONE')
