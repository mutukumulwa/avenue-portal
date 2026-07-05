import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const admin = await b.newPage()
await login(admin, 'admin@medvex.co.ug')
await admin.goto(BASE + '/approvals', { waitUntil: 'networkidle2' }); await sleep(1500)
console.log('queue before L2:', (await bodyText(admin, 700)).slice(200, 500).replace(/\n+/g, ' | '))
console.log('L2:', await clickText(admin, 'button', 'Approve L2')); await sleep(4000)
console.log('queue after:', (await bodyText(admin, 300)).includes('No approvals awaiting') ? 'EMPTY' : 'has items')

// find CLM-2026-00770 and confirm it's now APPROVED at 250,000
await admin.goto(BASE + '/claims', { waitUntil: 'networkidle2' }); await sleep(1500)
const row = await admin.evaluate(() => {
  const tr = [...document.querySelectorAll('tbody tr')].find(x => /CLM-2026-00770/.test(x.innerText))
  return tr ? { text: tr.innerText.replace(/\s+/g, ' '), href: tr.querySelector('a')?.getAttribute('href') } : null
})
console.log('\n770 LIST ROW:', row?.text)
await admin.goto(BASE + row.href, { waitUntil: 'networkidle2' }); await sleep(1800)
const t = await admin.evaluate(() => document.body.innerText)
console.log('Net approved:', (t.match(/Net approved:[^\n]*/) || ['(none)'])[0])
console.log('Financial summary:', (t.match(/FINANCIAL SUMMARY[\s\S]{0,90}/) || [''])[0].replace(/\n+/g, ' '))
const ti = t.indexOf('ADJUDICATION TIMELINE')
console.log('TIMELINE:', t.slice(ti, ti + 320).replace(/\n+/g, ' | '))
await shot(admin, 'f3e-770-approved')

// PR-022 partial PA
await admin.goto(BASE + '/preauth', { waitUntil: 'networkidle2' }); await sleep(1400)
const paHref = await admin.evaluate(() => [...document.querySelectorAll('tbody tr')].find(x => /Nairobi Hospital/.test(x.innerText) && /300,000/.test(x.innerText))?.querySelector('a')?.getAttribute('href'))
await admin.goto(BASE + paHref, { waitUntil: 'networkidle2' }); await sleep(1500)
const pt = await admin.evaluate(() => document.body.innerText)
const hi = pt.indexOf('Benefit Balance & Hold')
console.log('\nPA HOLD:', pt.slice(hi, hi + 340).replace(/\n+/g, ' | '))
console.log('PA STATUS:', (pt.match(/Review and decide[\s\S]*?(APPROVED|UTILISED|ATTACHED)/) || [])[1])
console.log('PA utilised note:', (pt.match(/Utilised[^\n]*/i) || ['(n/a)'])[0])
await shot(admin, 'f3e-pa-partial')
await b.close()
console.log('DONE')
