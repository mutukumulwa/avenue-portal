import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('broker →', await login(p, 'broker@kaib.co.ke'))
await p.goto(BASE + '/broker/quotations', { waitUntil: 'networkidle2' }); await sleep(1400)
const qh = await p.evaluate(() => [...document.querySelectorAll('tbody tr a')].find(a => true)?.getAttribute('href'))
console.log('quote href:', qh)
await p.goto(BASE + qh, { waitUntil: 'networkidle2' }); await sleep(1600)
let t = await p.evaluate(() => document.body.innerText)
console.log('== QUOTE DETAIL (broker) ==\n', t.slice(100, 1500).replace(/\n{2,}/g, '\n'))
const btns = () => p.evaluate(() => [...document.querySelectorAll('button')].filter(x => x.getClientRects().length && x.innerText.trim() && x.innerText.length < 45 && !/Log out/.test(x.innerText)).map(x => x.innerText.trim()))
console.log('BTNS:', JSON.stringify(await btns()))
await shot(p, 'w5-76-quote-detail')

// walk available transitions
for (const step of ['Send', 'Submit', 'Mark Sent', 'Present', 'Accept']) {
  const r = await clickText(p, 'button', step)
  if (r) { console.log('clicked:', r); await sleep(2500); console.log('status:', await p.evaluate(() => (document.body.innerText.match(/(DRAFT|SENT|PRESENTED|UNDER REVIEW|ACCEPTED|CONVERTED|EXPIRED)/) || [])[1]), 'BTNS:', JSON.stringify(await btns())) }
}
await shot(p, 'w5-76-after-transitions')
await b.close()
console.log('DONE')
