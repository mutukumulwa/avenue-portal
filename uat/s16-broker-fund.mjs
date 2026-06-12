import { launch, login, checkPage, BASE } from './lib.mjs'

const b = await launch()

// §16 broker
{
  const p = await b.newPage()
  await login(p, 'broker@kaib.co.ke')
  await checkPage(p, '/broker/dashboard', '16.1-broker-dash', { textLen: 350 })
  await checkPage(p, '/broker/quotations', '16.2-broker-quotes', { textLen: 350 })
  const qHref = await p.evaluate(() => [...document.querySelectorAll('a[href^="/broker/quotations/"]')].map(a => a.getAttribute('href')).find(h => /\/broker\/quotations\/[a-z0-9]{10,}$/i.test(h)))
  if (qHref) await checkPage(p, qHref, '16.3-broker-quote-detail', { textLen: 350 })
  await checkPage(p, '/broker/quotations/new', '16.2-broker-quote-new', { textLen: 300 })
  await checkPage(p, '/broker/groups', '16.4-broker-groups', { textLen: 300 })
  const gHref = await p.evaluate(() => [...document.querySelectorAll('a[href^="/broker/groups/"]')].map(a => a.getAttribute('href')).find(h => /\/broker\/groups\/[a-z0-9]{10,}$/i.test(h)))
  if (gHref) await checkPage(p, gHref, '16.4-broker-group-detail', { textLen: 300 })
  await checkPage(p, '/broker/submissions', '16.5-broker-submissions', { textLen: 300 })
  const sHref = await p.evaluate(() => [...document.querySelectorAll('a[href^="/broker/submissions/"]')].map(a => a.getAttribute('href')).find(h => /\/broker\/submissions\/[a-z0-9]{10,}$/i.test(h)))
  if (sHref) await checkPage(p, sHref, '16.5-broker-submission-detail', { textLen: 300 })
  await checkPage(p, '/broker/renewals', '16.6-broker-renewals', { textLen: 300 })
  await checkPage(p, '/broker/commissions', '16.7-broker-commissions', { textLen: 300 })
  await checkPage(p, '/broker/support', '16.8-broker-support', { textLen: 300 })
  await p.close()
}

// §17 fund
{
  const p = await b.newPage()
  await login(p, 'fund@avenue.co.ke')
  await checkPage(p, '/fund/dashboard', '17.1-fund-dash', { textLen: 400 })
  const gHref = await p.evaluate(() => [...document.querySelectorAll('a[href^="/fund/"]')].map(a => a.getAttribute('href')).find(h => /\/fund\/[a-z0-9]{10,}$/i.test(h)))
  console.log('fund group:', gHref)
  if (gHref) {
    await checkPage(p, gHref, '17.2-fund-group', { textLen: 400 })
    await checkPage(p, gHref + '/claims', '17.3-fund-claims', { textLen: 300 })
    await checkPage(p, gHref + '/statement', '17.4-fund-statement', { textLen: 300 })
    // statement export
    const exp = await p.evaluate(async (g) => {
      const r = await fetch(`/api/fund/${g.split('/').pop()}/statement/export`)
      return { status: r.status, ct: r.headers.get('content-type') }
    }, gHref)
    console.log('statement export:', JSON.stringify(exp))
  }
  await p.close()
}

await b.close()
console.log('DONE S16-17')
