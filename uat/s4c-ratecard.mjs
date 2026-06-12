import { launch, login, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')
await p.goto(BASE + '/packages/rate-matrix', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1200))
const inp = await p.$('input[name="name"]')
await inp.click()
await p.keyboard.type('UAT Rate Card 2026', { delay: 20 })
const btns = await p.$$('button')
for (const h of btns) {
  if (/new rate card/i.test(await h.evaluate(e => e.innerText))) { await h.click(); console.log('clicked New Rate Card'); break }
}
await new Promise(r => setTimeout(r, 5000))
console.log('url:', p.url().replace(BASE, ''))
console.log('text:', await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 500)))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/4.4-rate-card2.png' })
await b.close()
console.log('DONE')
