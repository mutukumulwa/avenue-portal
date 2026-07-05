import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('finance →', await login(p, 'finance@medvex.co.ug'))
await p.goto(BASE + '/settlement', { waitUntil: 'networkidle2' }); await sleep(1800)
let t = await p.evaluate(() => document.body.innerText)
console.log('== /settlement ==\n', t.slice(200, 1400).replace(/\n{2,}/g, '\n'))
const btns = await p.evaluate(() => [...document.querySelectorAll('button')].filter(x => x.getClientRects().length && x.innerText.trim() && x.innerText.length < 45).map(x => x.innerText.trim()))
console.log('BTNS:', JSON.stringify(btns.filter(x => !/OVERVIEW|FINANCE|INSIGHTS|Log out|Dashboard|▸|▾/.test(x))))
await shot(p, 'w5-39-settlement-page')
await b.close()
console.log('DONE')
