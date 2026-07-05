import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('admin →', await login(p, 'admin@medvex.co.ug'))

await p.goto(BASE + '/offline-work-codes', { waitUntil: 'networkidle2' }); await sleep(1600)
let t = await p.evaluate(() => document.body.innerText)
console.log('== OFFLINE WORK CODES ==\n', t.slice(200, 1200).replace(/\n{2,}/g, '\n'))
console.log('UG7YED:', JSON.stringify((t.match(/[^\n]*UG7YED[^\n]*/g) || []).slice(0, 3)))
await shot(p, 'w5-64-work-codes')

await p.goto(BASE + '/offline-capture', { waitUntil: 'networkidle2' }); await sleep(1800)
t = await p.evaluate(() => document.body.innerText)
console.log('\n== OFFLINE CAPTURE ==\n', t.slice(200, 1400).replace(/\n{2,}/g, '\n'))
const fields = await p.evaluate(() => {
  const rows = []
  document.querySelectorAll('select').forEach(s => { if (s.getClientRects().length) rows.push('SELECT ' + (s.name || '?') + '=' + [...s.options].map(o => o.text).slice(0, 8).join('|').slice(0, 100)) })
  document.querySelectorAll('input, textarea').forEach(x => { if (x.getClientRects().length) rows.push(`${x.type || x.tagName} ${x.name || '?'} "${x.placeholder}"`) })
  document.querySelectorAll('button').forEach(x => { const bt = x.innerText.trim(); if (x.getClientRects().length && bt && bt.length < 40 && !/OVERVIEW|MEMBERSHIP|CLINICAL|FINANCE|INSIGHTS|COMPLIANCE|SUPPORT|REINSTATEMENTS|Log out|Dashboard/.test(bt)) rows.push('BTN ' + bt) })
  return rows
})
console.log(fields.join('\n'))
await shot(p, 'w5-64-offline-capture')
await b.close()
console.log('DONE')
