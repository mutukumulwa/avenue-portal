import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('admin →', await login(p, 'admin@medvex.co.ug'))

// work codes ops count
await p.goto(BASE + '/offline-work-codes', { waitUntil: 'networkidle2' }).catch(() => {})
await sleep(1500)
let t = await p.evaluate(() => document.body.innerText)
console.log('WORK CODE ROW:', JSON.stringify((t.match(/[^\n]*UG7YED[^\n]*/g) || [])))

// claims queues
await p.goto(BASE + '/claims/queues', { waitUntil: 'networkidle2' }).catch(() => {})
await sleep(1500)
console.log('\n== CLAIMS QUEUES ==\n', (await bodyText(p, 900)).slice(200))
await shot(p, 'w5-68-queues')

// exceptions
await p.goto(BASE + '/exceptions', { waitUntil: 'networkidle2' }).catch(() => {})
await sleep(1500)
console.log('\n== EXCEPTIONS ==\n', (await bodyText(p, 700)).slice(200))

// claims search for 1,200
await p.goto(BASE + '/claims', { waitUntil: 'networkidle2' }); await sleep(1600)
const found = await p.evaluate(() => [...document.querySelectorAll('tbody tr')].filter(r => /1,200/.test(r.innerText)).map(r => r.innerText.replace(/\s+/g, ' ')).slice(0, 3))
console.log('\nCLAIMS w/ 1,200:', JSON.stringify(found))
await b.close()
console.log('DONE')
