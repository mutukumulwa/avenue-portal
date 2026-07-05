import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('login →', await login(p, 'admin@medvex.co.ug'))
await p.goto(BASE + '/members/cmr617noo0041huvqphul38x2', { waitUntil: 'networkidle2' })
await sleep(1500)
console.log('tab:', await clickText(p, '[role="tab"], button', 'Claims & Pre-Auths'))
await sleep(1500)
const bt = await p.evaluate(() => document.body.innerText)
const i = bt.indexOf('Claims & Pre-Auths')
console.log('\n== CLAIMS & PRE-AUTHS TAB ==\n', bt.slice(i, i + 1200).replace(/\n+/g, ' | '))
await shot(p, 'w5-05-member-claims-tab')

// Also: does the PA list/detail language mention hold/reserved anywhere?
await p.goto(BASE + '/preauth/cmr6djj0i000096vqaae6yvx0', { waitUntil: 'networkidle2' })
await sleep(1200)
const pa = await p.evaluate(() => document.body.innerText)
console.log('\nHOLD/RESERVE mentions on PA detail:', JSON.stringify((pa.match(/[^\n]*(hold|reserv|utilis|utiliz)[^\n]*/gi) || []).slice(0, 10)))
await b.close()
console.log('DONE')
