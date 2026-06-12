import { launch, login, BASE } from './lib.mjs'
const b = await launch()
const p = await b.newPage()
const fails = []
p.on('response', r => { if (r.status() === 404) fails.push(r.url()) })
await login(p, 'emily.wambui@safaricom.co.ke')
await p.goto(BASE + '/hr/dashboard', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 2000))
console.log('404 RESOURCES:', JSON.stringify([...new Set(fails)], null, 1))
await b.close()
