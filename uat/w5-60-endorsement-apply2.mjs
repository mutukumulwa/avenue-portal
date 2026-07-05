import { launch, login, BASE, sleep, shot, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('admin →', await login(p, 'admin@medvex.co.ug'))
await p.goto(BASE + '/endorsements', { waitUntil: 'networkidle2' }); await sleep(1500)
const links = await p.evaluate(() => {
  const tr = [...document.querySelectorAll('tbody tr')].find(x => /END-2026-00007/.test(x.innerText))
  return [...(tr?.querySelectorAll('a') || [])].map(a => a.getAttribute('href') + ' :: ' + a.innerText.trim())
})
console.log('row links:', JSON.stringify(links))
const eh = links.map(l => l.split(' :: ')[0]).find(h => /endorsement/i.test(h))
console.log('using:', eh)
await p.goto(BASE + eh, { waitUntil: 'networkidle2' }); await sleep(1700)
let t = await p.evaluate(() => document.body.innerText)
console.log('\n== DETAIL ==\n', t.slice(200, 1600).replace(/\n{2,}/g, '\n'))
const btns = () => p.evaluate(() => [...document.querySelectorAll('button')].filter(x => x.getClientRects().length && x.innerText.trim() && x.innerText.length < 45 && !/OVERVIEW|MEMBERSHIP|CLINICAL|FINANCE|INSIGHTS|COMPLIANCE|SUPPORT|REINSTATEMENTS|Log out|Dashboard/.test(x.innerText)).map(x => x.innerText.trim()))
console.log('BTNS:', JSON.stringify(await btns()))
await shot(p, 'w5-60-end-detail')

for (const step of ['Start Review', 'Begin Review', 'Approve', 'Apply']) {
  const r = await clickText(p, 'button', step)
  if (r) {
    console.log(`\nclicked: ${r}`); await sleep(2600)
    console.log('status:', await p.evaluate(() => (document.body.innerText.match(/(SUBMITTED|UNDER REVIEW|APPROVED|APPLIED|REJECTED)/) || [])[1]), '| BTNS:', JSON.stringify(await btns()))
  }
}
await shot(p, 'w5-60-end-final')

// roster: Wanjiku materialised?
await p.goto(BASE + '/members', { waitUntil: 'networkidle2' }); await sleep(1500)
const si = await p.$('input[placeholder*="earch" i]')
if (si) { await si.type('Wanjiku', { delay: 40 }); await sleep(2000) }
console.log('\nROSTER:', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('tbody tr')].map(r => r.innerText.replace(/\s+/g, ' ')).slice(0, 4))))
await shot(p, 'w5-60-roster')
await b.close()
console.log('DONE')
