import { launch, login, checkPage, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')

// 3.4 individual enrolment end-to-end
await p.goto(BASE + '/groups/new/individual', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1200))
const f = await p.evaluate(() =>
  [...document.querySelectorAll('input, select')].filter(e => e.type !== 'hidden').map(e => ({
    tag: e.tagName, type: e.type, name: e.name,
    options: e.tagName === 'SELECT' ? [...e.options].map(o => o.text).slice(0, 6) : undefined,
  }))
)
console.log('3.4 FIELDS:', JSON.stringify(f))

const set = async (name, val) => p.evaluate(({ name, val }) => {
  const el = document.querySelector(`[name="${name}"]`)
  if (!el) return false
  const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
  setter.call(el, val)
  el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }))
  return true
}, { name, val })

await p.type('input[name="firstName"]', 'Ursula')
await p.type('input[name="lastName"]', 'Uattest')
await set('idNumber', '88776655')
await set('dateOfBirth', '1985-03-20')
await p.evaluate(() => {
  const s = [...document.querySelectorAll('select')].find(x => [...x.options].some(o => /female/i.test(o.text)))
  const v = [...s.options].find(o => /female/i.test(o.text)).value
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
  setter.call(s, v); s.dispatchEvent(new Event('change', { bubbles: true }))
})
await set('phone', '+254700777666')
await set('email', 'ursula.uattest@example.com')
await p.evaluate(() => {
  const s = [...document.querySelectorAll('select')].find(x => [...x.options].some(o => /essential|premier|executive/i.test(o.text)))
  const v = [...s.options].find(o => /essential/i.test(o.text)).value
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
  setter.call(s, v); s.dispatchEvent(new Event('change', { bubbles: true }))
})
// effective date if present
await set('effectiveDate', '2026-07-01')
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/3.4-filled.png' })
const btn = await p.$('button[type="submit"]')
await Promise.all([
  p.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}),
  btn.click(),
])
await new Promise(r => setTimeout(r, 2500))
console.log('3.4 AFTER:', p.url().replace(BASE, ''), '|', await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 250)))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/3.4-after.png' })

// §4 packages
await checkPage(p, '/packages', '4.1-packages')
const pkgHref = await p.evaluate(() => {
  const a = [...document.querySelectorAll('a[href^="/packages/"]')].find(x => /\/packages\/[a-z0-9]{10,}$/i.test(x.getAttribute('href')))
  return a?.getAttribute('href')
})
console.log('\nPKG HREF:', pkgHref)
if (pkgHref) {
  await checkPage(p, pkgHref, '4.2-package-detail')
  await checkPage(p, pkgHref + '/edit', '4.2-package-edit')
}
await checkPage(p, '/packages/builder', '4.3-builder')
await checkPage(p, '/packages/rate-matrix', '4.4-rate-matrix')
const rcHref = await p.evaluate(() => {
  const a = [...document.querySelectorAll('a[href*="/packages/rate-matrix/"]')].find(x => /rate-matrix\/[a-z0-9]{10,}/i.test(x.getAttribute('href')))
  return a?.getAttribute('href')
})
if (rcHref) await checkPage(p, rcHref, '4.4-rate-card')
await checkPage(p, '/settings/pricing-models', '4.5-pricing-models')
const pmHref = await p.evaluate(() => {
  const a = [...document.querySelectorAll('a[href*="/settings/pricing-models/"]')].find(x => /pricing-models\/[a-z0-9]{10,}/i.test(x.getAttribute('href')))
  return a?.getAttribute('href')
})
if (pmHref) await checkPage(p, pmHref, '4.5-pricing-model-detail')

await b.close()
console.log('\nDONE S4')
