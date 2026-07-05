import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('admin login →', await login(p, 'admin@medvex.co.ug'))

// 1) claim 762 detail: status, timeline, over-cover note
await p.goto(BASE + '/claims/cmr6e4jtd000m96vqhfhdwhwx', { waitUntil: 'networkidle2' })
await sleep(2200)
let t = await p.evaluate(() => document.body.innerText)
console.log('STATUS BADGES:', JSON.stringify((t.match(/(APPROVED|CAPTURED|UNDER REVIEW|PENDING[^\n]{0,20})/g) || []).slice(0, 6)))
const ti = t.indexOf('ADJUDICATION TIMELINE')
console.log('\n== TIMELINE ==\n', ti >= 0 ? t.slice(ti, ti + 1200).replace(/\n{2,}/g, '\n') : '(heading not found)')
const wi = t.indexOf('Adjudication Workflow')
console.log('\n== WORKFLOW/OUTCOME ==\n', wi >= 0 ? t.slice(wi, wi + 400).replace(/\n{2,}/g, '\n') : '(not found)')
await shot(p, 'w5-20-762-after')

// 2) PA-2026-00011 state + hold panel
await p.goto(BASE + '/preauth/cmr6e2sel000g96vq1f23z2c6', { waitUntil: 'networkidle2' })
await sleep(1600)
t = await p.evaluate(() => document.body.innerText)
console.log('\nPA-2026-00011 STATUS:', (t.match(/PA-2026-00011[^]*?(UTILISED|APPROVED|ATTACHED|EXPIRED)/) || [])[1])
const hi = t.indexOf('Benefit Balance & Hold')
console.log('HOLD PANEL:', t.slice(hi, hi + 360).replace(/\n+/g, ' | '))
await shot(p, 'w5-20-pa11-after')

// 3) approvals queue
await p.goto(BASE + '/approvals', { waitUntil: 'networkidle2' })
await sleep(1600)
console.log('\n== APPROVALS QUEUE ==\n', (await bodyText(p, 1100)).slice(200))
await shot(p, 'w5-20-approvals-queue')

// 4) member benefits — usage should now be 1,000 + 86,000 = 87,000
await p.goto(BASE + '/members/cmr617noo0041huvqphul38x2', { waitUntil: 'networkidle2' })
await sleep(1500)
t = await p.evaluate(() => document.body.innerText)
console.log('\nMEMBER HEADER:', (t.match(/ANNUAL LIMIT[^]*?TOTAL CLAIMS\s*\d+/) || [])[0]?.replace(/\n+/g, ' | '))
await b.close()
console.log('DONE')
