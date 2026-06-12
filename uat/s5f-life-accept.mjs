import { launch, login, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')
const q = 'cmq9v5y8q000304k3hevyxek9'

await p.goto(BASE + `/quotations/${q}/assess`, { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1500))

// expand Add Life accordion via real click on its header
const hdr = await p.evaluate(() => {
  const el = [...document.querySelectorAll('button, [role="button"], div, h2, h3')].find(x => x.innerText?.trim() === 'Add Life' || /^\s*Add Life\s*$/.test(x.innerText || ''))
  if (el) { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } }
  return null
})
console.log('accordion header at:', JSON.stringify(hdr))
if (hdr) await p.mouse.click(hdr.x, hdr.y)
await new Promise(r => setTimeout(r, 1000))

// check field visibility now
const vis = await p.evaluate(() => {
  const i = document.querySelector('input[name="firstName"]')
  return i ? { visible: !!i.offsetParent, value: i.value } : null
})
console.log('firstName visible:', JSON.stringify(vis))

if (vis?.visible) {
  await p.click('input[name="firstName"]'); await p.keyboard.type('Lonnie')
  await p.click('input[name="lastName"]'); await p.keyboard.type('Lifetest')
  await p.click('input[name="nationalId"]'); await p.keyboard.type('77665544')
  await p.evaluate(() => {
    const d = document.querySelector('input[name="dateOfBirth"]')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(d, '1992-09-09'); d.dispatchEvent(new Event('input', { bubbles: true })); d.dispatchEvent(new Event('change', { bubbles: true }))
  })
  // find submit button inside the expanded panel
  const btns = await p.evaluate(() => [...document.querySelectorAll('button')].filter(x => x.offsetParent).map(x => x.innerText.trim()))
  console.log('visible buttons:', JSON.stringify(btns))
  await p.evaluate(() => {
    const candidates = [...document.querySelectorAll('button')].filter(x => x.offsetParent && /add/i.test(x.innerText) && !/add life$/i.test(x.innerText.trim()) || x.type === 'submit')
    const submitBtn = [...document.querySelectorAll('button[type="submit"]')].find(x => x.offsetParent)
    ;(submitBtn || candidates[0])?.click()
  })
  await new Promise(r => setTimeout(r, 4000))
  const t1 = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
  const li = t1.indexOf('Lives on Submission')
  console.log('AFTER SUBMIT:', t1.slice(li, li + 300))
  await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/5.2e-life-added.png' })
}

// Accept & Convert
await p.goto(BASE + `/quotations/${q}`, { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1500))
await p.evaluate(() => { [...document.querySelectorAll('button')].find(x => /accept & convert/i.test(x.innerText))?.click() })
await new Promise(r => setTimeout(r, 2000))
// possible confirm dialog
const confirmBtns = await p.evaluate(() => [...document.querySelectorAll('button')].filter(x => x.offsetParent).map(x => x.innerText.trim()))
console.log('\nafter accept click, buttons:', JSON.stringify(confirmBtns.slice(0, 15)))
await p.evaluate(() => { [...document.querySelectorAll('button')].find(x => x.offsetParent && /^(confirm|yes|accept)$/i.test(x.innerText.trim()))?.click() })
await new Promise(r => setTimeout(r, 5000))
console.log('AFTER ACCEPT:', p.url().replace(BASE, ''), '|', await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 300)))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/5.5-accept-convert.png' })

await b.close()
console.log('DONE S5F')
