import { launch, login, BASE, sleep, shot } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('finance →', await login(p, 'finance@medvex.co.ug'))
await p.goto(BASE + '/billing/gl', { waitUntil: 'networkidle2' }); await sleep(2200)
let t = await p.evaluate(() => document.body.innerText)
console.log('== /billing/gl ==\n', t.slice(200, 2600).replace(/\n{2,}/g, '\n'))
console.log('\nCLM refs:', JSON.stringify((t.match(/CLM-2026-\d+/g) || []).slice(0, 20)))
await shot(p, 'w5-37-gl')

await p.goto(BASE + '/billing/gl/ledger', { waitUntil: 'networkidle2' }); await sleep(2000)
t = await p.evaluate(() => document.body.innerText)
console.log('\n== /billing/gl/ledger ==\n', t.slice(200, 1600).replace(/\n{2,}/g, '\n'))
await shot(p, 'w5-37-account-ledger')
await b.close()
console.log('DONE')
