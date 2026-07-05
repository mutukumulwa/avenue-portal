import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('admin →', await login(p, 'admin@medvex.co.ug'))

// case list + new form structure
await p.goto(BASE + '/cases', { waitUntil: 'networkidle2' }); await sleep(1800)
console.log('== /cases ==\n', (await bodyText(p, 800)).slice(200))
await p.goto(BASE + '/cases/new', { waitUntil: 'networkidle2' }); await sleep(1800)
console.log('\n== /cases/new ==\n', (await bodyText(p, 900)).slice(200))
const fields = await p.evaluate(() => {
  const rows = []
  document.querySelectorAll('select').forEach(s => { if (s.getClientRects().length) rows.push('SELECT ' + (s.name || '?') + ' = ' + [...s.options].map(o => o.text).slice(0, 12).join('|').slice(0, 150)) })
  document.querySelectorAll('input, textarea').forEach(x => { if (x.getClientRects().length) rows.push(`${x.type || x.tagName} ${x.name || '?'} "${x.placeholder}"`) })
  document.querySelectorAll('button').forEach(x => { const t = x.innerText.trim(); if (x.getClientRects().length && t && t.length < 40 && !/OVERVIEW|MEMBERSHIP|CLINICAL|FINANCE|INSIGHTS|COMPLIANCE|SUPPORT|REINSTATEMENTS|Log out|Dashboard/.test(t)) rows.push('BTN ' + t) })
  return rows
})
console.log(fields.join('\n'))
await shot(p, 'w5-52-cases-new')
await b.close()
console.log('DONE')
