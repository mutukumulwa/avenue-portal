import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('underwriter →', await login(p, 'underwriter@medvex.co.ug'))
await p.goto(BASE + '/approvals', { waitUntil: 'networkidle2' }); await sleep(1500)

console.log('L1:', await clickText(p, 'button', 'Approve L1')); await sleep(2500)
let t = await bodyText(p, 900)
console.log('\nAFTER L1:', t.slice(t.indexOf('Approvals')).slice(0, 500))
await shot(p, 'w5-31-after-L1')

// same user tries L2 (expect refusal)
const l2 = await clickText(p, 'button', 'Approve L2')
console.log('\nsame-user L2 click:', l2)
await sleep(2500)
t = await p.evaluate(() => document.body.innerText)
console.log('MSGS:', JSON.stringify((t.match(/[^\n]*(distinct|different|same user|cannot|maker|checker)[^\n]*/gi) || []).filter(x => x.length < 200).slice(0, 5)))
console.log('QUEUE NOW:', t.slice(t.indexOf('Pending multi-level'), t.indexOf('Pending multi-level') + 400).replace(/\n+/g, ' | '))
await shot(p, 'w5-31-same-user-L2')

// admin approves L2
const p2 = await b.newPage()
console.log('\nadmin →', await login(p2, 'admin@medvex.co.ug'))
await p2.goto(BASE + '/approvals', { waitUntil: 'networkidle2' }); await sleep(1500)
t = await p2.evaluate(() => document.body.innerText)
console.log('ADMIN QUEUE:', t.slice(t.indexOf('Pending multi-level'), t.indexOf('Pending multi-level') + 400).replace(/\n+/g, ' | '))
console.log('L2:', await clickText(p2, 'button', 'Approve L2')); await sleep(3000)
console.log('QUEUE AFTER:', (await bodyText(p2, 700)).slice(200))
await shot(p2, 'w5-31-after-L2')

// claim state + member usage
await p2.goto(BASE + '/claims/cmr6ev3cv000mwmvq6vthwjcy', { waitUntil: 'networkidle2' }); await sleep(1800)
t = await p2.evaluate(() => document.body.innerText)
console.log('\n765 STATUS:', (t.match(/(APPROVED|CAPTURED|UNDER REVIEW|PENDING)/g) || []).slice(0, 3))
const ti = t.indexOf('ADJUDICATION TIMELINE')
console.log('TIMELINE:', t.slice(ti, ti + 800).replace(/\n{2,}/g, '\n'))
await shot(p2, 'w5-31-765-final')
await p2.goto(BASE + '/members/cmr617noo0041huvqphul38x2', { waitUntil: 'networkidle2' }); await sleep(1400)
t = await p2.evaluate(() => document.body.innerText)
console.log('\nURSULA HEADER:', (t.match(/ANNUAL LIMIT[^]*?TOTAL CLAIMS\s*\d+/) || [])[0]?.replace(/\n+/g, ' | '))
await b.close()
console.log('DONE')
