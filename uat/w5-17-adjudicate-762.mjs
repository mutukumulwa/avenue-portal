import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('login →', await login(p, 'medical@medvex.co.ug'))
await p.goto(BASE + '/claims', { waitUntil: 'networkidle2' })
await sleep(1500)
const href = await p.evaluate(() => {
  const tr = [...document.querySelectorAll('tbody tr')].find(x => /CLM-2026-00762/.test(x.innerText))
  return tr?.querySelector('a')?.getAttribute('href')
})
console.log('href:', href)
await p.goto(BASE + href, { waitUntil: 'networkidle2' })
await sleep(2000)
const t = await p.evaluate(() => document.body.innerText)

// PA attach + engine verdict + duplicate messages
console.log('PA ATTACH:', (t.match(/PRE-AUTHORIZATIONS[^]*?cover/) || ['none'])[0].replace(/\n+/g, ' | '))
const ei = t.indexOf('Adjudicating under')
console.log('\nENGINE:', t.slice(ei, ei + 700).replace(/\n+/g, ' | '))
console.log('\nDUP/TIMELINE MSGS:', JSON.stringify((t.match(/[^\n]*(duplicate|double|already exists)[^\n]*/gi) || []).slice(0, 6)))
const btns = await p.evaluate(() => [...document.querySelectorAll('button')].filter(x => x.getClientRects().length && x.innerText.trim() && x.innerText.length < 45 && !/OVERVIEW|MEMBERSHIP|CLINICAL|INSIGHTS|SUPPORT|REINSTATEMENTS|Log out|Dashboard/.test(x.innerText)).map(x => x.innerText.trim()))
console.log('\nACTIONS:', JSON.stringify(btns))
await shot(p, 'w5-17-762-detail')

// Mark as Captured
console.log('\ncapture:', await clickText(p, 'button', 'Captured'))
await sleep(2500)
const t2 = await p.evaluate(() => document.body.innerText)
console.log('status now:', (t2.match(/CLM-2026-00762[^]*?(RECEIVED|CAPTURED|UNDER REVIEW)/) || [])[1])
const btns2 = await p.evaluate(() => [...document.querySelectorAll('button')].filter(x => x.getClientRects().length && x.innerText.trim() && x.innerText.length < 45 && !/OVERVIEW|MEMBERSHIP|CLINICAL|INSIGHTS|SUPPORT|REINSTATEMENTS|Log out|Dashboard/.test(x.innerText)).map(x => x.innerText.trim()))
console.log('ACTIONS:', JSON.stringify(btns2))

// approve the line (✓) then compute outcome
const approved = await p.evaluate(() => {
  const cands = [...document.querySelectorAll('button')].filter(x => x.getClientRects().length && /^(✓|Approve)$/.test(x.innerText.trim()))
  cands.forEach(c => c.click())
  return cands.length + ' line-approve buttons clicked'
})
console.log(approved)
await sleep(1200)
console.log('compute:', await clickText(p, 'button', 'Compute Outcome'))
await sleep(2500)
const t3 = await p.evaluate(() => document.body.innerText)
const oi = t3.indexOf('Adjudication Workflow')
console.log('\n== WORKFLOW PANEL ==\n', t3.slice(oi, oi + 900).replace(/\n{2,}/g, '\n'))
await shot(p, 'w5-17-762-outcome')
await b.close()
console.log('PAUSED-BEFORE-FINALIZE')
