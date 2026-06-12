import { launch, login, checkPage, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')

// §7 preauth
await checkPage(p, '/preauth', '7.1-preauth-list')
const paHref = await p.evaluate(() => {
  const a = [...document.querySelectorAll('a[href^="/preauth/"]')].find(x => /\/preauth\/[a-z0-9]{10,}$/i.test(x.getAttribute('href')))
  return a?.getAttribute('href')
})
console.log('PA HREF:', paHref)
if (paHref) await checkPage(p, paHref, '7.3-preauth-detail', { textLen: 700 })
await checkPage(p, '/preauth/new', '7.2-preauth-new')

// §7 check-ins
await checkPage(p, '/check-ins', '7.4-checkins-list')
const ciHref = await p.evaluate(() => {
  const a = [...document.querySelectorAll('a[href^="/check-ins/"]')].find(x => /\/check-ins\/[a-z0-9]{10,}$/i.test(x.getAttribute('href')))
  return a?.getAttribute('href')
})
console.log('CI HREF:', ciHref)
if (ciHref) await checkPage(p, ciHref, '7.4-checkin-detail')
const visitHref = await p.evaluate(() => {
  const a = [...document.querySelectorAll('a[href*="/check-ins/visit/"]')]
  return a[0]?.getAttribute('href')
})
if (visitHref) await checkPage(p, visitHref, '7.5-visit-detail')

// §8 endorsements
await checkPage(p, '/endorsements', '8.1-endorsements-list')
const enHref = await p.evaluate(() => {
  const a = [...document.querySelectorAll('a[href^="/endorsements/"]')].find(x => /\/endorsements\/[a-z0-9]{10,}$/i.test(x.getAttribute('href')))
  return a?.getAttribute('href')
})
console.log('EN HREF:', enHref)
if (enHref) await checkPage(p, enHref, '8.3-endorsement-detail', { textLen: 700 })
await checkPage(p, '/endorsements/new', '8.2-endorsement-new')
const enFields = await p.evaluate(() =>
  [...document.querySelectorAll('input,select,textarea')].filter(e => e.type !== 'hidden').map(e => ({
    tag: e.tagName, type: e.type, name: e.name,
    options: e.tagName === 'SELECT' ? [...e.options].map(o => o.text).slice(0, 8) : undefined,
  }))
)
console.log('ENDORSEMENT FIELDS:', JSON.stringify(enFields).slice(0, 900))

await b.close()
console.log('\nDONE S7-8 SWEEP')
