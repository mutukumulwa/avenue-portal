import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('admin →', await login(p, 'admin@medvex.co.ug'))
await p.goto(BASE + '/endorsements', { waitUntil: 'networkidle2' }); await sleep(1500)
const eh = await p.evaluate(() => {
  const tr = [...document.querySelectorAll('tbody tr')].find(x => /END-2026-00007/.test(x.innerText))
  return tr?.querySelector('a')?.getAttribute('href')
})
console.log('href:', eh)
await p.goto(BASE + eh, { waitUntil: 'networkidle2' }); await sleep(1700)
let t = await p.evaluate(() => document.body.innerText)
console.log('== DETAIL ==\n', t.slice(200, 1500).replace(/\n{2,}/g, '\n'))
const btns = () => p.evaluate(() => [...document.querySelectorAll('button')].filter(x => x.getClientRects().length && x.innerText.trim() && x.innerText.length < 40 && !/OVERVIEW|MEMBERSHIP|CLINICAL|FINANCE|INSIGHTS|COMPLIANCE|SUPPORT|REINSTATEMENTS|Log out|Dashboard/.test(x.innerText)).map(x => x.innerText.trim()))
console.log('BTNS:', JSON.stringify(await btns()))
await shot(p, 'w5-59-end-detail')

// walk the flow: start review → approve → apply
for (const step of ['Review', 'Start Review', 'Approve', 'Apply']) {
  const r = await clickText(p, 'button', step)
  if (r) { console.log(`clicked: ${r}`); await sleep(2500); console.log('status:', await p.evaluate(() => (document.body.innerText.match(/(DRAFT|SUBMITTED|UNDER REVIEW|APPROVED|APPLIED|REJECTED)/) || [])[1]), '| BTNS:', JSON.stringify(await btns())) }
}
await shot(p, 'w5-59-end-final')

// roster check
await p.goto(BASE + '/members?search=Wanjiku', { waitUntil: 'networkidle2' }); await sleep(1600)
t = await p.evaluate(() => document.body.innerText)
const found = await p.evaluate(() => [...document.querySelectorAll('tbody tr')].filter(r => /Wanjiku UAT-Endorsement|UAT-Endorsement/.test(r.innerText)).map(r => r.innerText.replace(/\s+/g, ' ')))
console.log('\nROSTER SEARCH:', JSON.stringify(found))
if (!found.length) {
  // maybe search param not supported; use the members page search input
  await p.goto(BASE + '/members', { waitUntil: 'networkidle2' }); await sleep(1400)
  const si = await p.$('input[placeholder*="earch" i]')
  if (si) { await si.type('UAT-Endorsement', { delay: 40 }); await sleep(1800) }
  console.log('ROSTER SEARCH 2:', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('tbody tr')].map(r => r.innerText.replace(/\s+/g, ' ')).slice(0, 4))))
}
await shot(p, 'w5-59-roster')
await b.close()
console.log('DONE')
