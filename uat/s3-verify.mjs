import { launch, login, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')

await p.goto(BASE + '/groups', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1500))
const rows = await p.evaluate(() => [...document.querySelectorAll('tbody tr')].map(tr => tr.innerText.replace(/\s+/g, ' ').slice(0, 90)))
console.log('GROUP ROWS:\n' + rows.join('\n'))

// EABL full text search for fund
await p.goto(BASE + '/groups/cmovmx6dc002x7ouv3mow8517', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1500))
const full = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
const idx = full.search(/self[- ]?funded/i)
console.log('\nEABL self-funded idx:', idx, idx >= 0 ? full.slice(idx, idx + 400) : '(not present)')
const tiersIdx = full.search(/Benefit Tiers/i)
console.log('\nEABL tiers section:', tiersIdx >= 0 ? full.slice(tiersIdx, tiersIdx + 300) : '(not present)')

await b.close()
console.log('DONE')
