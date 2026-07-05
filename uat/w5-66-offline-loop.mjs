import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('admin →', await login(p, 'admin@medvex.co.ug'))
await p.goto(BASE + '/offline-capture', { waitUntil: 'networkidle2' }); await sleep(1500)

// unlock with code
await p.evaluate(() => {
  const i = document.querySelector('input[name="workCode"], input[placeholder*="OWA"]')
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'OWA-UG7YED')
  i.dispatchEvent(new Event('input', { bubbles: true }))
})
console.log('unlock:', await clickText(p, 'button', 'Unlock offline work'))
await sleep(4000)
let t = await p.evaluate(() => document.body.innerText)
console.log('\n== AFTER UNLOCK ==\n', t.slice(200, 1500).replace(/\n{2,}/g, '\n'))
const fields = await p.evaluate(() => {
  const rows = []
  document.querySelectorAll('select').forEach(s => { if (s.getClientRects().length) rows.push('SELECT ' + (s.name || '?') + '=' + [...s.options].map(o => o.text).slice(0, 8).join('|').slice(0, 110)) })
  document.querySelectorAll('input, textarea').forEach(x => { if (x.getClientRects().length) rows.push(`${x.type || x.tagName} ${x.name || '?'} "${x.placeholder}"`) })
  document.querySelectorAll('button').forEach(x => { const bt = x.innerText.trim(); if (x.getClientRects().length && bt && bt.length < 45 && !/OVERVIEW|MEMBERSHIP|CLINICAL|FINANCE|INSIGHTS|COMPLIANCE|SUPPORT|REINSTATEMENTS|Log out|Dashboard/.test(bt)) rows.push('BTN ' + bt) })
  return rows
})
console.log(fields.join('\n'))
await shot(p, 'w5-66-unlocked')
await b.close()
console.log('DONE')
