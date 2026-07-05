import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('uw →', await login(p, 'underwriter@medvex.co.ug'))
await p.goto(BASE + '/quotations', { waitUntil: 'networkidle2' }); await sleep(1800)
let t = await p.evaluate(() => document.body.innerText)
console.log('== /quotations (UW) ==\n', t.slice(100, 1200).replace(/\n{2,}/g, '\n'))
const row = await p.evaluate(() => {
  const tr = [...document.querySelectorAll('tbody tr')].find(x => /QUO-2026-00004|Nakuru/.test(x.innerText))
  return tr ? { text: tr.innerText.replace(/\s+/g, ' '), links: [...tr.querySelectorAll('a')].map(a => a.getAttribute('href') + '::' + a.innerText.trim()) } : null
})
console.log('ROW:', JSON.stringify(row))
await shot(p, 'w5-77-uw-quotations')
if (row) {
  const href = row.links.map(l => l.split('::')[0]).find(h => /quot/i.test(h))
  await p.goto(BASE + href, { waitUntil: 'networkidle2' }); await sleep(1700)
  t = await p.evaluate(() => document.body.innerText)
  console.log('\n== QUOTE DETAIL (UW) ==\n', t.slice(100, 1600).replace(/\n{2,}/g, '\n'))
  console.log('BTNS:', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('button')].filter(x => x.getClientRects().length && x.innerText.trim() && x.innerText.length < 45 && !/Log out/.test(x.innerText)).map(x => x.innerText.trim()))))
  await shot(p, 'w5-77-uw-quote-detail')
}
await b.close()
console.log('DONE')
