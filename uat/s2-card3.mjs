import { launch, login, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
const errors = []
p.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
p.on('response', r => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url().slice(0, 120)}`) })
await login(p, 'admin@avenue.co.ke')

const uat = '/members/cmq9udg5o000004k3zr7kpgan'
await p.goto(BASE + uat + '/card', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1200))

// open dialog
const issueBtn = await p.$$eval('button', bs => {
  const b = bs.find(x => /issue card/i.test(x.innerText)); if (b) { b.scrollIntoView(); return true } return false
})
await p.evaluate(() => { [...document.querySelectorAll('button')].find(b => /issue card/i.test(b.innerText))?.click() })
await new Promise(r => setTimeout(r, 1000))

// type into card number with real keyboard
await p.click('input[name="cardNumber"]', { clickCount: 3 })
await p.type('input[name="cardNumber"]', 'AV-UAT-99999', { delay: 30 })
const val = await p.$eval('input[name="cardNumber"]', i => i.value)
console.log('typed value:', val)

// click Confirm via real mouse
const box = await (await p.$$('button')).reduce(async (accP, h) => {
  const acc = await accP; if (acc) return acc
  const t = await h.evaluate(e => e.innerText.trim())
  if (/^confirm$/i.test(t)) return h.boundingBox()
  return null
}, Promise.resolve(null))
console.log('confirm box:', box)
if (box) await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
await new Promise(r => setTimeout(r, 5000))
console.log('after confirm:', await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 300)))
if (errors.length) console.log('ERRORS:', JSON.stringify(errors.slice(-8)))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/2.5-card-retry.png' })
await b.close()
console.log('DONE')
