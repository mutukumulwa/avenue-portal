import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('finance →', await login(p, 'finance@medvex.co.ug'))
// expand FINANCE menu
await clickText(p, 'button', 'FINANCE'); await sleep(800)
const nav = await p.evaluate(() => [...document.querySelectorAll('nav a, aside a, a')].filter(e => e.getClientRects().length).map(e => e.getAttribute('href') + ' :: ' + (e.innerText || '').trim()).filter(x => x.length < 90))
console.log('NAV LINKS:\n' + [...new Set(nav)].join('\n'))
await shot(p, 'w5-34-finance-nav')
await b.close()
console.log('DONE')
