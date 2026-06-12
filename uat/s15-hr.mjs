import { launch, login, checkPage, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'emily.wambui@safaricom.co.ke')

await checkPage(p, '/hr/dashboard', '15.1-hr-dashboard', { textLen: 400 })
await checkPage(p, '/hr/roster', '15.2-roster', { textLen: 400 })
const memHref = await p.evaluate(() => {
  const a = [...document.querySelectorAll('a[href^="/hr/roster/"]')].find(x => /\/hr\/roster\/[a-z0-9]{10,}$/i.test(x.getAttribute('href')))
  return a?.getAttribute('href')
})
console.log('roster member:', memHref)
if (memHref) await checkPage(p, memHref, '15.2-roster-member', { textLen: 400 })
await checkPage(p, '/hr/roster/new', '15.3-roster-new', { textLen: 300 })
await checkPage(p, '/hr/roster/import', '15.4-roster-import', { textLen: 250 })
await checkPage(p, '/hr/endorsements', '15.5-hr-endorsements', { textLen: 300 })
const enHref = await p.evaluate(() => {
  const a = [...document.querySelectorAll('a[href^="/hr/endorsements/"]')].find(x => /\/hr\/endorsements\/[a-z0-9]{10,}$/i.test(x.getAttribute('href')))
  return a?.getAttribute('href')
})
if (enHref) await checkPage(p, enHref, '15.5-hr-endorsement-detail', { textLen: 300 })
await checkPage(p, '/hr/invoices', '15.6-hr-invoices', { textLen: 300 })
await checkPage(p, '/hr/utilization', '15.7-hr-utilization', { textLen: 300 })
await checkPage(p, '/hr/support', '15.8-hr-support', { textLen: 250 })
await checkPage(p, '/hr/support/new', '15.8-hr-support-new', { textLen: 250 })
await checkPage(p, '/hr/profile', '15.9-hr-profile', { textLen: 250 })

// raise a support request E2E
await p.goto(BASE + '/hr/support/new', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1500))
const fields = await p.evaluate(() => [...document.querySelectorAll('input,select,textarea')].filter(e => e.type !== 'hidden').map(e => ({ tag: e.tagName, type: e.type, name: e.name, options: e.tagName === 'SELECT' ? [...e.options].map(o => o.text).slice(0, 6) : undefined })))
console.log('SUPPORT FIELDS:', JSON.stringify(fields))
await p.evaluate(() => {
  const setI = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  const setT = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  const subj = [...document.querySelectorAll('input[type="text"]')].find(x => x.offsetParent)
  if (subj) { setI.call(subj, 'UAT: test service request'); subj.dispatchEvent(new Event('input', { bubbles: true })) }
  const ta = [...document.querySelectorAll('textarea')].find(x => x.offsetParent)
  if (ta) { setT.call(ta, 'UAT test request raised during end-to-end testing. Please ignore/close.'); ta.dispatchEvent(new Event('input', { bubbles: true })) }
})
await Promise.all([
  p.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {}),
  p.evaluate(() => { document.querySelector('button[type="submit"]')?.click() }),
])
await new Promise(r => setTimeout(r, 2500))
console.log('after submit:', p.url().replace(BASE, ''))
console.log('text:', await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 300)))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/15.8-sr-submitted.png' })

await b.close()
console.log('DONE S15')
