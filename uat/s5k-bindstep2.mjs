import { launch, login, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')
await p.goto(BASE + '/quotations/cmq9v5y8q000304k3hevyxek9/bind', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1500))
await p.evaluate(() => { [...document.querySelectorAll('button')].find(x => /create memberships/i.test(x.innerText))?.click() })
await new Promise(r => setTimeout(r, 6000))
console.log('AFTER:', await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 900)))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/5.5-bind-step2.png' })
await b.close()
console.log('DONE')
