import { launch, login, checkPage, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')

// §9 finance
await checkPage(p, '/billing', '9.1-billing')
await checkPage(p, '/billing/funds', '9.2-funds')
await checkPage(p, '/billing/gl', '9.3-gl')
await checkPage(p, '/billing/gl/ledger', '9.3-ledger')
await checkPage(p, '/billing/reconciliation', '9.4-reconciliation')
await checkPage(p, '/settlement', '9.5-settlement')

// §10 brokers & providers
await checkPage(p, '/brokers', '10.1-brokers')
const brHref = await p.evaluate(() => {
  const a = [...document.querySelectorAll('a[href^="/brokers/"]')].find(x => /\/brokers\/[a-z0-9]{10,}$/i.test(x.getAttribute('href')))
  return a?.getAttribute('href')
})
if (brHref) { await checkPage(p, brHref, '10.1-broker-detail'); await checkPage(p, brHref + '/edit', '10.1-broker-edit') }
await checkPage(p, '/brokers/new', '10.1-broker-new')
await checkPage(p, '/providers', '10.2-providers')
const prHref = await p.evaluate(() => {
  const a = [...document.querySelectorAll('a[href^="/providers/"]')].find(x => /\/providers\/[a-z0-9]{10,}$/i.test(x.getAttribute('href')))
  return a?.getAttribute('href')
})
if (prHref) await checkPage(p, prHref, '10.2-provider-detail')
await checkPage(p, '/providers/new', '10.2-provider-new')

// §11 service desk
await checkPage(p, '/complaints', '11.1-complaints')
const coHref = await p.evaluate(() => {
  const a = [...document.querySelectorAll('a[href^="/complaints/"]')].find(x => /\/complaints\/[a-z0-9]{10,}$/i.test(x.getAttribute('href')))
  return a?.getAttribute('href')
})
if (coHref) await checkPage(p, coHref, '11.1-complaint-detail')
await checkPage(p, '/service-requests', '11.2-service-requests')
const srHref = await p.evaluate(() => {
  const a = [...document.querySelectorAll('a[href^="/service-requests/"]')].find(x => /\/service-requests\/[a-z0-9]{10,}$/i.test(x.getAttribute('href')))
  return a?.getAttribute('href')
})
if (srHref) await checkPage(p, srHref, '11.2-sr-detail')

// §12 fraud & overrides
await checkPage(p, '/fraud', '12.1-fraud')
const frHref = await p.evaluate(() => {
  const a = [...document.querySelectorAll('a[href^="/fraud/"]')].find(x => /\/fraud\/[a-z0-9]{10,}$/i.test(x.getAttribute('href')))
  return a?.getAttribute('href')
})
if (frHref) await checkPage(p, frHref, '12.1-fraud-detail')
await checkPage(p, '/fraud/check-ins', '12.2-fraud-checkins')
await checkPage(p, '/overrides', '12.3-overrides')
await checkPage(p, '/overrides/patterns', '12.3-patterns')

await b.close()
console.log('\nDONE S9-12 SWEEP')
