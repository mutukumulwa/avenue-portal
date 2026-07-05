import { launch, login, BASE, sleep, shot, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('login →', await login(p, 'medical@medvex.co.ug'))
await p.goto(BASE + '/claims/cmr6e4jtd000m96vqhfhdwhwx', { waitUntil: 'networkidle2' })
await sleep(2000)

// full lower half text
const t = await p.evaluate(() => document.body.innerText)
const si = t.indexOf('Service Line Items')
console.log('== LOWER SECTION ==\n', t.slice(si, si + 2200).replace(/\n{2,}/g, '\n'))
const btns = await p.evaluate(() => [...document.querySelectorAll('button')].filter(x => x.getClientRects().length && x.innerText.trim() && x.innerText.length < 50 && !/OVERVIEW|MEMBERSHIP|CLINICAL|INSIGHTS|SUPPORT|REINSTATEMENTS|Log out|Dashboard/.test(x.innerText)).map(x => x.innerText.trim()))
console.log('\nACTIONS:', JSON.stringify(btns))
const inputs = await p.evaluate(() => [...document.querySelectorAll('input,select,textarea')].filter(x => x.getClientRects().length).map(x => `${x.tagName}[${x.type || ''}] name=${x.name} ph=${x.placeholder} val=${x.value}`))
console.log('INPUTS:', JSON.stringify(inputs, null, 1))
await shot(p, 'w5-18-762-before-decision')
await b.close()
console.log('DONE')
