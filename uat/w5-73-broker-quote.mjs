import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('broker →', await login(p, 'broker@kaib.co.ke'))
console.log('landing:', p.url())
let t = await p.evaluate(() => document.body.innerText)
console.log('== BROKER DASH ==\n', t.slice(100, 900).replace(/\n{2,}/g, '\n'))
const links = await p.evaluate(() => [...document.querySelectorAll('a')].filter(a => a.getClientRects().length).map(a => a.getAttribute('href') + ' :: ' + (a.innerText || '').trim().replace(/\n.*/s, '')))
console.log('LINKS:', JSON.stringify([...new Set(links)].filter(x => x.startsWith('/')), null, 1))
await shot(p, 'w5-73-broker-dash')
await b.close()
console.log('DONE')
