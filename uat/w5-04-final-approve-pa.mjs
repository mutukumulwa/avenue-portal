import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('login →', await login(p, 'medical@medvex.co.ug'))
await p.goto(BASE + '/preauth/cmr6djj0i000096vqaae6yvx0', { waitUntil: 'networkidle2' })
await sleep(1500)

console.log('decision:', await clickText(p, 'button', 'Approve (Full)'))
await sleep(600)
console.log('submit:', await clickText(p, 'button', 'Submit Approval'))
await sleep(3000)
const t = await bodyText(p, 1000)
console.log('\n== PA AFTER APPROVAL ==\n', t)
await shot(p, 'w5-04-pa-approved')

// status badge + validity
const m = t.match(/PA-2026-00010[^]*?(APPROVED|DECLINED|UNDER REVIEW|SUBMITTED)/)
console.log('\nSTATUS MATCH:', m && m[1])

// now as admin, check member benefits for hold
const p2 = await b.newPage()
console.log('\nadmin login →', await login(p2, 'admin@medvex.co.ug'))
await p2.goto(BASE + '/members/cmr617noo0041huvqphul38x2', { waitUntil: 'networkidle2' })
await sleep(1500)
const header = await p2.evaluate(() => document.body.innerText.match(/ANNUAL LIMIT[^]*?TOTAL CLAIMS\s*\d+/)?.[0]?.replace(/\n+/g, ' | '))
console.log('HEADER:', header)
await clickText(p2, '[role="tab"], button', 'Benefits')
await sleep(1500)
const bt = await p2.evaluate(() => document.body.innerText)
const seg = bt.slice(bt.indexOf('Overall Utilisation'), bt.indexOf('Overall Utilisation') + 900)
console.log('\n== BENEFITS TAB ==\n', seg.replace(/\n+/g, ' | '))
await shot(p2, 'w5-04-member-benefits-after-pa')
await b.close()
console.log('DONE')
