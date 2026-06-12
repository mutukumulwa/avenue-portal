import { launch, login, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')
await p.goto(BASE + '/members/cmq9udg5o000004k3zr7kpgan', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1500))

// locate the temp password input element handle
const inputs = await p.$$('input')
let target = null
for (const h of inputs) {
  const info = await h.evaluate(el => ({ type: el.type, ctx: el.closest('div')?.parentElement?.innerText?.slice(0, 120) || '' }))
  if (/TEMPORARY PASSWORD/i.test(info.ctx)) {
    const empty = await h.evaluate(el => !el.value && el.type !== 'hidden')
    if (empty) { target = h; console.log('candidate:', JSON.stringify(info)); break }
  }
}
if (!target) { console.log('NO TARGET FOUND'); await b.close(); process.exit(1) }
const box = await target.boundingBox()
await target.evaluate(el => el.scrollIntoView({ block: 'center' }))
await new Promise(r => setTimeout(r, 500))
const box2 = await target.boundingBox()
await p.mouse.click(box2.x + box2.width / 2, box2.y + box2.height / 2)
await p.keyboard.type('UatTemp2026!', { delay: 25 })
const val = await target.evaluate(el => el.value)
console.log('typed value len:', val.length)
const btns = await p.$$('button')
for (const h of btns) {
  const t = await h.evaluate(e => e.innerText.trim())
  if (/create login/i.test(t)) { await h.evaluate(el => el.scrollIntoView({ block: 'center' })); const bb = await h.boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); break }
}
await new Promise(r => setTimeout(r, 6000))
const t = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
const i = t.indexOf('Member Portal Login')
console.log('AFTER:', t.slice(i, i + 350))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/2.8-portal-login3.png' })
await b.close()
console.log('DONE')
