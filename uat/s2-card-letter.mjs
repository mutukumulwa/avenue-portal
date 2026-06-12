import { launch, login, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')

const uat = '/members/cmq9udg5o000004k3zr7kpgan'
const patricia = '/members/cmovn0vl600fs7ouv3d1y67ty'

// 2.5 issue card for UAT member
await p.goto(BASE + uat + '/card', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1200))
await p.evaluate(() => { [...document.querySelectorAll('button')].find(b => /issue card/i.test(b.innerText))?.click() })
await new Promise(r => setTimeout(r, 4000))
console.log('2.5 after Issue Card:', await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 350)))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/2.5-card-issued.png' })

// 2.6 letter on seeded member (Patricia) — does it crash too?
await p.goto(BASE + patricia + '/letters', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1200))
await p.evaluate(() => { [...document.querySelectorAll('button')].find(b => /generate/i.test(b.innerText))?.click() })
await new Promise(r => setTimeout(r, 5000))
console.log('\n2.6 Patricia letter result:', await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 300)))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/2.6-letter-patricia.png' })

await b.close()
console.log('DONE')
