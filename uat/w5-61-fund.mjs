import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('fund →', await login(p, 'fund@medvex.co.ug'))
console.log('landing:', p.url())
let t = await p.evaluate(() => document.body.innerText)
console.log('\n== FUND DASHBOARD ==\n', t.slice(100, 1400).replace(/\n{2,}/g, '\n'))
const links = await p.evaluate(() => [...document.querySelectorAll('a')].filter(a => a.getClientRects().length).map(a => a.getAttribute('href') + ' :: ' + (a.innerText || '').trim().replace(/\n.*/s, '')).filter(x => /fund|deposit|statement|claim/i.test(x)))
console.log('\nLINKS:', JSON.stringify([...new Set(links)], null, 1))
await shot(p, 'w5-61-fund-dash')
await b.close()
console.log('DONE')
