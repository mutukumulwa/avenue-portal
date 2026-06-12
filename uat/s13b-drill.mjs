import { launch, login, checkPage, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')

// scheme profitability report → scheme drill-down link
await checkPage(p, '/reports/analytics-scheme-profitability', '13.5-scheme-report', { textLen: 300 })
const schemeHref = await p.evaluate(() => [...document.querySelectorAll('a[href*="/analytics/schemes/"]')][0]?.getAttribute('href'))
console.log('scheme drill:', schemeHref)
if (schemeHref) await checkPage(p, schemeHref, '13.5-scheme-drill', { textLen: 400 })

// provider drill from provider performance report
await checkPage(p, '/reports/analytics-provider-performance', '13.3-provider-report', { textLen: 250 })
const provHref = await p.evaluate(() => [...document.querySelectorAll('a[href*="/analytics/providers/"]')][0]?.getAttribute('href'))
console.log('provider drill:', provHref)
if (provHref) await checkPage(p, provHref, '13.3-provider-drill', { textLen: 400 })

// renewals drill
await p.goto(BASE + '/analytics/renewals', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1500))
const renHref = await p.evaluate(() => [...document.querySelectorAll('a[href*="/analytics/renewals/"]')][0]?.getAttribute('href'))
console.log('renewal drill:', renHref)
if (renHref) await checkPage(p, renHref, '13.4-renewal-drill', { textLen: 400 })

// CSV export on membership report
await p.goto(BASE + '/reports/membership', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1500))
const exportLink = await p.evaluate(() => {
  const a = [...document.querySelectorAll('a,button')].find(x => /export|csv/i.test(x.innerText))
  return a ? (a.getAttribute('href') || 'BUTTON:' + a.innerText.trim()) : null
})
console.log('export control:', exportLink)
if (exportLink?.startsWith('/')) {
  const res = await p.evaluate(async (u) => {
    const r = await fetch(u); const txt = await r.text()
    return { status: r.status, ct: r.headers.get('content-type'), head: txt.slice(0, 150) }
  }, exportLink)
  console.log('export fetch:', JSON.stringify(res))
}

await b.close()
console.log('DONE S13B')
