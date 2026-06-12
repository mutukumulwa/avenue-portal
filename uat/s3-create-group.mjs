import { launch, login, checkPage, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')

// 3.3 create corporate group
await p.goto(BASE + '/groups/new', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1200))
await p.type('input[name="name"]', 'UAT Test Co Ltd')
await p.type('input[name="industry"]', 'Software QA')
await p.type('input[name="registrationNumber"]', 'PVT-UAT-2026')
await p.type('input[name="contactPersonName"]', 'Una Tester')
await p.type('input[name="contactPersonPhone"]', '+254700888777')
await p.type('input[name="contactPersonEmail"]', 'una.tester@uattestco.example.com')
await p.select('select[name="packageId"]', await p.evaluate(() => {
  const s = document.querySelector('select[name="packageId"]')
  return [...s.options].find(o => /essential/i.test(o.text)).value
}))
await p.evaluate(() => {
  const d = document.querySelector('input[name="effectiveDate"]')
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(d, '2026-07-01')
  d.dispatchEvent(new Event('input', { bubbles: true })); d.dispatchEvent(new Event('change', { bubbles: true }))
})
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/3.3-filled.png' })
await Promise.all([
  p.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}),
  p.evaluate(() => { [...document.querySelectorAll('button')].find(b => /enroll|create|save|register/i.test(b.innerText) && b.type === 'submit')?.click() || document.querySelector('button[type="submit"]')?.click() }),
])
await new Promise(r => setTimeout(r, 2500))
console.log('3.3 AFTER SUBMIT:', p.url().replace(BASE, ''))
console.log('   ', await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 400)))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/3.3-after-submit.png' })

// 3.7 self-funded panel on EABL group detail
await p.goto(BASE + '/groups', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1200))
const eabl = await p.evaluate(() => {
  const rows = [...document.querySelectorAll('a[href^="/groups/"]')]
  const a = rows.find(x => /breweries/i.test(x.closest('tr')?.innerText || x.innerText))
  return a?.getAttribute('href')
})
console.log('\nEABL href:', eabl)
if (eabl) {
  const r = await checkPage(p, eabl, '3.7-eabl-detail', { textLen: 900 })
  const sf = r.text.match(/self[- ]funded[\s\S]{0,200}/i)
  console.log('SELF-FUNDED SECTION:', sf ? sf[0].slice(0, 200) : 'NOT FOUND IN FIRST 700 CHARS')
}

await b.close()
console.log('DONE')
