import { launch, login, checkPage, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')

// accepted KPLC quote detail + bind
await checkPage(p, '/quotations/cmovn082p00cl7ouv7byuee0t', '5.5-kplc-detail', { textLen: 800 })
const pdfLink = await p.evaluate(() => {
  const a = [...document.querySelectorAll('a,button')].find(x => /pdf|download/i.test(x.innerText))
  return a ? (a.getAttribute?.('href') || a.innerText) : null
})
console.log('PDF control:', pdfLink)
await checkPage(p, '/quotations/cmovn082p00cl7ouv7byuee0t/bind', '5.5-kplc-bind', { textLen: 700 })

// 5.2 create new intake end-to-end
await p.goto(BASE + '/quotations/new', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1200))
await p.type('input[name="legalName"]', 'UAT Prospect Ltd')
await p.type('input[name="prospectIndustry"]', 'Testing')
await p.type('input[name="headcount"]', '120')
await p.type('input[name="kraPinCorporate"]', 'P051999888X')
await p.type('input[name="billingContactEmail"]', 'finance@uatprospect.example.com')
await p.type('input[name="prospectContact"]', 'Quentin Quoter')
await p.type('input[name="prospectEmail"]', 'quentin@uatprospect.example.com')
await p.evaluate(() => {
  const d = document.querySelector('input[name="requestedCoverStart"]')
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(d, '2026-08-01'); d.dispatchEvent(new Event('input', { bubbles: true })); d.dispatchEvent(new Event('change', { bubbles: true }))
})
await p.select('select[name="packageId"]', await p.evaluate(() => {
  const s = document.querySelector('select[name="packageId"]')
  return [...s.options].find(o => /premier/i.test(o.text)).value
}))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/5.2-intake-filled.png' })
const btn = await p.$('button[type="submit"]')
await Promise.all([
  p.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}),
  btn.click(),
])
await new Promise(r => setTimeout(r, 3000))
console.log('\n5.2 AFTER SUBMIT:', p.url().replace(BASE, ''))
console.log('   ', await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 400)))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/5.2-intake-created.png' })

await b.close()
console.log('DONE S5C')
