import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('admin →', await login(p, 'admin@medvex.co.ug'))
// find the nav href for Offline Work Codes
await clickText(p, 'button', 'CLINICAL').catch(() => {})
await sleep(500)
const href = await p.evaluate(() => [...document.querySelectorAll('a')].find(a => /Offline Work Codes/.test(a.innerText))?.getAttribute('href'))
console.log('nav href:', href)
await p.goto(BASE + (href || '/offline-work-codes'), { waitUntil: 'networkidle2' }); await sleep(2200)
let t = await p.evaluate(() => document.body.innerText)
const oi = t.indexOf('Offline Work Codes')
console.log('== PAGE ==\n', t.slice(oi, oi + 1500).replace(/\n{2,}/g, '\n'))
console.log('UG7YED rows:', JSON.stringify((t.match(/[^\n]*UG7YED[^\n]*/g) || [])))
const fields = await p.evaluate(() => {
  const rows = []
  document.querySelectorAll('select').forEach(s => { if (s.getClientRects().length) rows.push('SELECT ' + (s.name || '?') + '=' + [...s.options].map(o => o.text).slice(0, 10).join('|').slice(0, 120)) })
  document.querySelectorAll('input').forEach(x => { if (x.getClientRects().length) rows.push(`${x.type} ${x.name || '?'} "${x.placeholder}"`) })
  document.querySelectorAll('button').forEach(x => { const bt = x.innerText.trim(); if (x.getClientRects().length && bt && bt.length < 45 && !/OVERVIEW|MEMBERSHIP|CLINICAL|FINANCE|INSIGHTS|COMPLIANCE|SUPPORT|REINSTATEMENTS|Log out|Dashboard/.test(bt)) rows.push('BTN ' + bt) })
  return rows
})
console.log(fields.join('\n'))
await shot(p, 'w5-65-workcodes')
await b.close()
console.log('DONE')
