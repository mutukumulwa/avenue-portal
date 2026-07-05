import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('login →', await login(p, 'admin@medvex.co.ug'))

// 1) 763 current status + timeline
await p.goto(BASE + '/claims/cmr6e4jtd000m96vqhfhdwhwx'.replace('cmr6e4jtd000m96vqhfhdwhwx',''), { waitUntil: 'networkidle2' }).catch(()=>{})
await p.goto(BASE + '/claims', { waitUntil: 'networkidle2' }); await sleep(1400)
const row763 = await p.evaluate(() => {
  const tr = [...document.querySelectorAll('tbody tr')].find(x => /CLM-2026-00763/.test(x.innerText))
  return { text: tr?.innerText.replace(/\s+/g, ' '), href: tr?.querySelector('a')?.getAttribute('href') }
})
console.log('763 LIST ROW:', row763.text)
await p.goto(BASE + row763.href, { waitUntil: 'networkidle2' }); await sleep(1800)
let t = await p.evaluate(() => document.body.innerText)
const ti = t.indexOf('ADJUDICATION TIMELINE')
console.log('\n== 763 TIMELINE ==\n', t.slice(ti, ti + 900).replace(/\n{2,}/g, '\n'))
console.log('FIN SUMMARY:', (t.match(/FINANCIAL SUMMARY[^]*?Copay[^\n]*\n[^\n]*/) || [])[0]?.replace(/\n+/g, ' | '))
await shot(p, 'w5-25-763-status')

// 2) contract PC-2026-003 detail: services + pricing rules
await p.goto(BASE + '/contracts', { waitUntil: 'networkidle2' }); await sleep(1500)
const chref = await p.evaluate(() => {
  const tr = [...document.querySelectorAll('tbody tr, a')].find(x => /PC-2026-003/.test(x.innerText))
  return tr?.matches('a') ? tr.getAttribute('href') : tr?.querySelector('a')?.getAttribute('href')
})
console.log('\ncontract href:', chref)
await p.goto(BASE + chref, { waitUntil: 'networkidle2' }); await sleep(1800)
t = await p.evaluate(() => document.body.innerText)
console.log('\n== PC-2026-003 (first 2500 chars from title) ==')
const ci = t.indexOf('PC-2026-003')
console.log(t.slice(ci, ci + 2500).replace(/\n{2,}/g, '\n'))
await shot(p, 'w5-25-contract-003')
await b.close()
console.log('DONE')
