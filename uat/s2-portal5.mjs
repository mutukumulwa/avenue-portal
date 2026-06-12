import { launch, login, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')
await p.goto(BASE + '/members/cmq9udg5o000004k3zr7kpgan', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1500))
const h = await p.$('input[name="password"]')
await h.evaluate(el => el.scrollIntoView({ block: 'center' }))
await new Promise(r => setTimeout(r, 400))
const bb = await h.boundingBox()
await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2)
await p.keyboard.type('UatTemp2026!', { delay: 25 })
console.log('value len:', await h.evaluate(el => el.value.length))
const btns = await p.$$('button')
for (const bt of btns) {
  const t = await bt.evaluate(e => e.innerText.trim())
  if (/create login/i.test(t)) { const b2 = await bt.boundingBox(); await p.mouse.click(b2.x + b2.width / 2, b2.y + b2.height / 2); console.log('clicked create login'); break }
}
await new Promise(r => setTimeout(r, 6000))
const t = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
const i = t.indexOf('Member Portal Login')
console.log('AFTER:', t.slice(i, i + 300))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/2.8-portal-final.png' })
await b.close()
console.log('DONE')
