import { launch, login, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')
await p.goto(BASE + '/members/new', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1200))

await p.select('select[name="groupId"]', await p.evaluate(() => {
  const s = document.querySelector('select[name="groupId"]')
  return [...s.options].find(o => o.text === 'Safaricom PLC').value
}))
await p.select('select[name="relationship"]', await p.evaluate(() => {
  const s = document.querySelector('select[name="relationship"]')
  return [...s.options].find(o => /principal/i.test(o.text)).value
}))
await p.type('input[name="firstName"]', 'UAT')
await p.type('input[name="lastName"]', 'Testmember')
await p.evaluate(() => {
  const d = document.querySelector('input[name="dateOfBirth"]')
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(d, '1990-05-15')
  d.dispatchEvent(new Event('input', { bubbles: true }))
  d.dispatchEvent(new Event('change', { bubbles: true }))
})
await p.select('select[name="gender"]', await p.evaluate(() => {
  const s = document.querySelector('select[name="gender"]')
  return [...s.options].find(o => /female/i.test(o.text)).value
}))
await p.type('input[name="idNumber"]', '99887766')
await p.type('input[name="phone"]', '+254700999111')
await p.type('input[name="email"]', 'uat.testmember@example.com')
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/2.3-filled.png' })

await Promise.all([
  p.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(e => console.log('nav:', e.message)),
  p.click('button[type="submit"]'),
])
await new Promise(r => setTimeout(r, 2500))
console.log('AFTER SUBMIT URL:', p.url().replace(BASE, ''))
const text = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 600))
console.log('TEXT:', text)
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/2.3-after-submit.png' })

await b.close()
console.log('DONE')
