import { launch, login, checkPage, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')

// §13 analytics
await checkPage(p, '/analytics', '13.1-analytics')
for (const [path, name] of [
  ['/analytics/alerts', '13.2-alerts'],
  ['/analytics/board-pack', '13.2-board-pack'],
  ['/analytics/parity', '13.2-parity'],
  ['/analytics/risk', '13.2-risk'],
  ['/analytics/providers', '13.3-providers'],
  ['/analytics/renewals', '13.4-renewals'],
  ['/analytics/schemes', '13.5-schemes'],
]) await checkPage(p, path, name, { textLen: 300 })

// drill-downs
const provDrill = await p.evaluate(() => null)
await checkPage(p, '/analytics/schemes', null, { textLen: 100 })
const schemeHref = await p.evaluate(() => {
  const a = [...document.querySelectorAll('a[href*="/analytics/schemes/"]')]
  return a[0]?.getAttribute('href')
})
if (schemeHref) await checkPage(p, schemeHref, '13.5-scheme-drill', { textLen: 300 })

// §13.6 reports
await checkPage(p, '/reports', '13.6-reports-hub')
const reportLinks = await p.evaluate(() => [...document.querySelectorAll('a[href^="/reports/"]')].map(a => a.getAttribute('href')).filter((v, i, s) => s.indexOf(v) === i))
console.log('REPORT TYPES:', JSON.stringify(reportLinks))
for (const r of reportLinks.slice(0, 6)) await checkPage(p, r, '13.6-' + r.split('/').pop(), { textLen: 250 })

// §14 settings
await checkPage(p, '/settings', '14.1-settings')
await checkPage(p, '/settings/approval-matrix', '14.2-approval-matrix', { textLen: 300 })
await checkPage(p, '/settings/audit-log', '14.3-audit-log', { textLen: 300 })
await checkPage(p, '/settings/exceptions', '14.4-exceptions', { textLen: 300 })

await b.close()
console.log('\nDONE S13-14')
