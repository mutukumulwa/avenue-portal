import { launch, login, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')
const uat = '/members/cmq9udg5o000004k3zr7kpgan'
await p.goto(BASE + uat + '/card', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1200))
await p.evaluate(() => { [...document.querySelectorAll('button')].find(b => /issue card/i.test(b.innerText))?.click() })
await new Promise(r => setTimeout(r, 800))
await p.click('input[name="cardNumber"]')
await p.type('input[name="cardNumber"]', 'AV-UAT-99999', { delay: 20 })
const handles = await p.$$('button')
for (const h of handles) {
  const t = await h.evaluate(e => e.innerText.trim())
  if (/confirm issuance/i.test(t)) { await h.click(); console.log('clicked:', t); break }
}
await new Promise(r => setTimeout(r, 5000))
console.log('after:', await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 350)))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/2.5-card-final.png' })
await b.close()
console.log('DONE')
