import { launch, login, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')
await p.goto(BASE + '/members/cmq9udg5o000004k3zr7kpgan', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1500))
// fill temporary password (the input near TEMPORARY PASSWORD label)
const ok = await p.evaluate(() => {
  const labels = [...document.querySelectorAll('label, div')].find(e => e.innerText?.trim() === 'TEMPORARY PASSWORD')
  let input = labels?.parentElement?.querySelector('input') || labels?.nextElementSibling?.querySelector?.('input')
  if (!input) input = [...document.querySelectorAll('input[type="password"], input[type="text"]')].find(i => !i.value && i.closest('div')?.innerText.includes('TEMPORARY'))
  if (!input) return false
  input.focus(); return true
})
console.log('found pw input:', ok)
await p.keyboard.type('UatTemp2026!', { delay: 20 })
await p.evaluate(() => { [...document.querySelectorAll('button')].find(b => /create login/i.test(b.innerText))?.click() })
await new Promise(r => setTimeout(r, 5000))
const t = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
const i = t.indexOf('Member Portal Login')
console.log('AFTER:', t.slice(i, i + 350))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/2.8-portal-login2.png' })
await b.close()
console.log('DONE')
