import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('admin →', await login(p, 'admin@medvex.co.ug'))

// 0) provider edit control?
await p.goto(BASE + '/providers/cmr6fpc4i0017wmvq5gxcppyz', { waitUntil: 'networkidle2' }); await sleep(1400)
console.log('provider action buttons:', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('button, a')].filter(x => x.getClientRects().length && x.innerText.trim() && x.innerText.length < 30).map(x => x.innerText.trim()).filter(x => !/OVERVIEW|MEMBERSHIP|CLINICAL|FINANCE|INSIGHTS|COMPLIANCE|SUPPORT|REINSTATEMENTS|Log out|Dashboard|Setup|▸|▾|\+|−/.test(x)))))

// 1) contract PC-2026-001 DRAFT header editability
await p.goto(BASE + '/contracts', { waitUntil: 'networkidle2' }); await sleep(1600)
const ch = await p.evaluate(() => {
  const tr = [...document.querySelectorAll('tbody tr, a')].find(x => /PC-2026-001/.test(x.innerText))
  return tr?.matches?.('a') ? tr.getAttribute('href') : tr?.querySelector('a')?.getAttribute('href')
})
console.log('\nPC-2026-001 href:', ch)
await p.goto(BASE + ch, { waitUntil: 'networkidle2' }); await sleep(1800)
let t = await p.evaluate(() => document.body.innerText)
console.log('STATUS:', (t.match(/(DRAFT|PENDING_APPROVAL|ACTIVE|VOIDED)/) || [])[1])
console.log('HEADER EDIT CONTROLS:', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('button, a')].filter(x => x.getClientRects().length && /edit|amend|header/i.test(x.innerText) && x.innerText.length < 40).map(x => x.innerText.trim()))))
const editableHeader = await p.evaluate(() => [...document.querySelectorAll('input, select')].filter(i => i.getClientRects().length).map(i => `${i.name || i.placeholder || i.type}`).slice(0, 15))
console.log('VISIBLE INPUTS:', JSON.stringify(editableHeader))
await shot(p, 'w5-51-contract-001')

// 2) HR dashboard (PR-019)
const p2 = await b.newPage()
console.log('\nhr →', await login(p2, 'emily.wambui@safaricom.co.ke'))
await sleep(800)
console.log('post-login URL:', p2.url())
await p2.goto(BASE + '/hr/dashboard', { waitUntil: 'networkidle2' }); await sleep(1800)
console.log('/hr/dashboard →', p2.url())
console.log('HR DASH TOP:', (await bodyText(p2, 500)).slice(0, 400))
await shot(p2, 'w5-51-hr-dashboard')

// 3) brand scan (PR-004) on a few pages
for (const [pg, path] of [['login', '/login'], ['hr-dash', '/hr/dashboard']]) {
  const hits = await p2.evaluate(() => (document.body.innerText.match(/AiCare|Avenue/gi) || []).length)
  console.log(`brand scan ${pg}: AiCare/Avenue hits = ${hits}`)
  if (pg === 'login') await p2.goto(BASE + '/login', { waitUntil: 'networkidle2' }).catch(() => {})
}
await b.close()
console.log('DONE')
