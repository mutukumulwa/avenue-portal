import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('admin →', await login(p, 'admin@medvex.co.ug'))
await p.goto(BASE + '/cases/cmr6fymff001cwmvqa82aes8s', { waitUntil: 'networkidle2' }); await sleep(1600)
let t = await p.evaluate(() => document.body.innerText)
console.log('CASE STATUS:', (t.match(/CASE-2026-00001[^]*?(OPEN|CLOSED|FILED|CANCELLED)/) || [])[1])
console.log('LOU:', (t.match(/LETTERS OF UNDERTAKING \(\d+\)[^]*?(?=Close|Cancel|$)/) || ['?'])[0].replace(/\n+/g, ' | ').slice(0, 300))
console.log('EDIT CONTROLS STILL PRESENT?', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('button')].filter(x => x.getClientRects().length && /Add|Issue|Close & file|Cancel case/.test(x.innerText)).map(x => x.innerText.trim()))))
await shot(p, 'w5-57-case-readonly')

// C3: endorsements module
await p.goto(BASE + '/endorsements', { waitUntil: 'networkidle2' }); await sleep(1600)
console.log('\n== /endorsements ==\n', (await bodyText(p, 700)).slice(200))
await p.goto(BASE + '/endorsements/new', { waitUntil: 'networkidle2' }); await sleep(1600)
console.log('\n== /endorsements/new ==\n', (await bodyText(p, 900)).slice(200))
const fields = await p.evaluate(() => {
  const rows = []
  document.querySelectorAll('select').forEach(s => { if (s.getClientRects().length) rows.push('SELECT ' + (s.name || '?') + ' = ' + [...s.options].map(o => o.text).slice(0, 12).join('|').slice(0, 140)) })
  document.querySelectorAll('input, textarea').forEach(x => { if (x.getClientRects().length) rows.push(`${x.type || x.tagName} ${x.name || '?'} "${x.placeholder}"`) })
  document.querySelectorAll('button').forEach(x => { const bt = x.innerText.trim(); if (x.getClientRects().length && bt && bt.length < 40 && !/OVERVIEW|MEMBERSHIP|CLINICAL|FINANCE|INSIGHTS|COMPLIANCE|SUPPORT|REINSTATEMENTS|Log out|Dashboard/.test(bt)) rows.push('BTN ' + bt) })
  return rows
})
console.log(fields.join('\n'))
await shot(p, 'w5-57-endorsements-new')
await b.close()
console.log('DONE')
