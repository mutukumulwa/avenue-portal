import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('admin login →', await login(p, 'admin@medvex.co.ug'))
await p.goto(BASE + '/settings', { waitUntil: 'networkidle2' })
await sleep(1600)
console.log('== SETTINGS ==\n', (await bodyText(p, 900)).slice(200))
const links = await p.evaluate(() => [...document.querySelectorAll('a, [role="tab"], button')].filter(e => e.getClientRects().length).map(e => (e.innerText || '').trim()).filter(x => x && x.length < 45))
console.log('\nNAV ITEMS:', JSON.stringify([...new Set(links)]))

// find approval matrix
for (const label of ['Approval Matrix', 'Approvals', 'Matrix']) {
  const el = await p.evaluate(l => {
    const e = [...document.querySelectorAll('a, [role="tab"], button')].find(e => e.getClientRects().length && (e.innerText || '').trim().toLowerCase().includes(l.toLowerCase()))
    if (!e) return null
    e.click(); return e.innerText.trim()
  }, label)
  if (el) { console.log('\nclicked:', el); break }
}
await sleep(1800)
let t = await p.evaluate(() => document.body.innerText)
console.log('\n== APPROVAL MATRIX PAGE ==\n', t.slice(t.indexOf('Approval'), t.indexOf('Approval') + 1800).replace(/\n{2,}/g, '\n'))
await shot(p, 'w5-21-approval-matrix')
console.log('URL:', p.url())
await b.close()
console.log('DONE')
