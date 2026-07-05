import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('admin →', await login(p, 'admin@medvex.co.ug'))
await p.goto(BASE + '/providers/cmr6fpc4i0017wmvq5gxcppyz', { waitUntil: 'networkidle2' }); await sleep(1600)

// Activate
console.log('activate:', await clickText(p, 'button', 'Activate')); await sleep(2500)
let t = await p.evaluate(() => document.body.innerText)
console.log('STATUS NOW:', (t.match(/(PENDING|ACTIVE|INACTIVE)/) || [])[1])
console.log('NEW ACTIONS:', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('button')].filter(x => x.getClientRects().length && x.innerText.trim() && x.innerText.length < 30 && /edit|suspend|deactiv|branch|alias/i.test(x.innerText)).map(x => x.innerText.trim()))))

// Add branch
console.log('\nadd branch:', await clickText(p, 'button', 'Add branch')); await sleep(1200)
const binputs = await p.evaluate(() => [...document.querySelectorAll('input')].filter(i => i.getClientRects().length && !i.value).map(i => `${i.name || '?'} ph="${i.placeholder}"`))
console.log('BRANCH INPUTS:', JSON.stringify(binputs))
console.log(await p.evaluate(() => {
  const vis = [...document.querySelectorAll('input')].filter(i => i.getClientRects().length)
  const name = vis.find(i => /name|branch/i.test(i.placeholder + i.name)) || vis.at(-2)
  const setV = (i, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })) }
  if (name) { setV(name, 'Westlands Annex'); return 'branch name set on ' + (name.name || name.placeholder) }
  return 'no input'
}))
await sleep(300)
console.log('save branch:', (await clickText(p, 'button', 'Save')) || (await clickText(p, 'button', 'Add')) || 'no save btn')
await sleep(2200)
t = await p.evaluate(() => document.body.innerText)
const bi = t.indexOf('Branches')
console.log('BRANCHES NOW:', t.slice(bi, bi + 250).replace(/\n+/g, ' | '))
await shot(p, 'w5-49-branch-added')

// Audit log
await p.goto(BASE + '/settings/audit-log', { waitUntil: 'networkidle2' }).catch(() => {})
if (!/audit/i.test(p.url())) { await p.goto(BASE + '/settings', { waitUntil: 'networkidle2' }); await sleep(1000); await clickText(p, 'a', 'Audit Log'); await sleep(1500) }
await sleep(1500)
t = await p.evaluate(() => document.body.innerText)
console.log('\n== AUDIT LOG (top rows) ==')
const rows = await p.evaluate(() => [...document.querySelectorAll('tbody tr')].map(r => r.innerText.replace(/\s+/g, ' ')).slice(0, 25))
console.log(rows.join('\n'))
await shot(p, 'w5-49-audit-log')
await b.close()
console.log('DONE')
