import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('admin →', await login(p, 'admin@medvex.co.ug'))

// exceptions full
await p.goto(BASE + '/exceptions', { waitUntil: 'networkidle2' }); await sleep(2200)
let t = await p.evaluate(() => document.body.innerText)
const ei = t.indexOf('Exceptions')
console.log('== EXCEPTIONS ==\n', t.slice(ei, ei + 1200).replace(/\n{2,}/g, '\n'))
await shot(p, 'w5-69-exceptions')

// work codes via nav link
const href = await p.evaluate(() => [...document.querySelectorAll('a')].find(a => /Offline Work Codes/.test(a.innerText))?.getAttribute('href'))
await p.goto(BASE + href, { waitUntil: 'networkidle2' }); await sleep(2000)
t = await p.evaluate(() => document.body.innerText)
console.log('\nWORK CODE ROW:', JSON.stringify((t.match(/[^\n]*UG7YED[^\n]*/g) || [])))

// offline capture page: outbox row state detail
await p.goto(BASE + '/offline-capture', { waitUntil: 'networkidle2' }); await sleep(2000)
t = await p.evaluate(() => document.body.innerText)
const ci = t.indexOf('OUTBOX')
console.log('\nOUTBOX AREA:', t.slice(ci, ci + 400).replace(/\n+/g, ' | '))
// click the synced row for detail if clickable
await b.close()
console.log('DONE')
