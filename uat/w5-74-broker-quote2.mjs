import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('broker →', await login(p, 'broker@kaib.co.ke'))
await p.goto(BASE + '/broker/quotations', { waitUntil: 'networkidle2' }); await sleep(1800)
let t = await p.evaluate(() => document.body.innerText)
console.log('== BROKER QUOTATIONS ==\n', t.slice(100, 1100).replace(/\n{2,}/g, '\n'))
const btns = await p.evaluate(() => [...document.querySelectorAll('button, a')].filter(x => x.getClientRects().length && /new|create|request|quote/i.test(x.innerText) && x.innerText.length < 40).map(x => (x.getAttribute?.('href') || 'BTN') + ' :: ' + x.innerText.trim()))
console.log('CTA:', JSON.stringify([...new Set(btns)]))
await shot(p, 'w5-74-broker-quotes')

// open new quote form
const nq = await p.evaluate(() => { const a = [...document.querySelectorAll('a, button')].find(x => x.getClientRects().length && /new quot|create quot|request quot/i.test(x.innerText)); if (a) { a.click(); return a.innerText.trim() } return null })
console.log('clicked:', nq); await sleep(2000)
console.log('URL:', p.url())
const fields = await p.evaluate(() => {
  const rows = []
  document.querySelectorAll('select').forEach(s => { if (s.getClientRects().length) rows.push('SELECT ' + (s.name || '?') + '=' + [...s.options].map(o => o.text).slice(0, 8).join('|').slice(0, 110)) })
  document.querySelectorAll('input, textarea').forEach(x => { if (x.getClientRects().length) rows.push(`${x.type || x.tagName} ${x.name || '?'} "${x.placeholder}"`) })
  document.querySelectorAll('button').forEach(x => { const bt = x.innerText.trim(); if (x.getClientRects().length && bt && bt.length < 45) rows.push('BTN ' + bt) })
  return rows
})
console.log(fields.join('\n').slice(0, 2500))
await shot(p, 'w5-74-quote-form')
await b.close()
console.log('DONE')
