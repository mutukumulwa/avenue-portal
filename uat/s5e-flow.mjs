import { launch, login, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')
const q = 'cmq9v5y8q000304k3hevyxek9'

// confirm PDF 500 on seeded quote too
const pdf2 = await p.evaluate(async () => {
  const r = await fetch('/api/quotations/cmovn082p00cl7ouv7byuee0t/pdf')
  return { status: r.status, body: (await r.text()).slice(0, 150) }
})
console.log('KPLC PDF:', JSON.stringify(pdf2))

// Add Life on UAT quote
await p.goto(BASE + `/quotations/${q}/assess`, { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1500))
await p.type('input[name="firstName"]', 'Lonnie')
await p.type('input[name="lastName"]', 'Lifetest')
await p.type('input[name="nationalId"]', '77665544')
await p.evaluate(() => {
  const d = document.querySelector('input[name="dateOfBirth"]')
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(d, '1992-09-09'); d.dispatchEvent(new Event('input', { bubbles: true })); d.dispatchEvent(new Event('change', { bubbles: true }))
})
await p.evaluate(() => { [...document.querySelectorAll('button')].find(x => /add life/i.test(x.innerText))?.click() })
await new Promise(r => setTimeout(r, 4000))
const t1 = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
const li = t1.indexOf('Lives on Submission')
console.log('\nADD LIFE RESULT:', t1.slice(li, li + 250))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/5.2c-life-added.png' })

// underwriting decision controls?
const uw = await p.evaluate(() => [...document.querySelectorAll('button')].map(x => x.innerText.trim()).filter(Boolean).slice(0, 20))
console.log('BUTTONS ON ASSESS:', JSON.stringify(uw))

// Send to Client from detail
await p.goto(BASE + `/quotations/${q}`, { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1500))
const btns0 = await p.evaluate(() => [...document.querySelectorAll('button,a')].map(x => x.innerText.trim()).filter(Boolean).slice(0, 25))
console.log('\nDETAIL CONTROLS:', JSON.stringify(btns0))
await p.evaluate(() => { [...document.querySelectorAll('button')].find(x => /send to client/i.test(x.innerText))?.click() })
await new Promise(r => setTimeout(r, 4000))
console.log('AFTER SEND:', await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 300)))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/5.2d-sent.png' })

// 5.3 calculator wizard steps
await p.goto(BASE + '/quotations/calculator', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1500))
const calcFields = await p.evaluate(() =>
  [...document.querySelectorAll('input,select')].filter(e => e.type !== 'hidden').map(e => `${e.tagName}:${e.name || e.placeholder}`)
)
console.log('\nCALC STEP1 FIELDS:', JSON.stringify(calcFields))
await b.close()
console.log('DONE S5E')
