import { launch, login, checkPage, BASE } from './lib.mjs'

const b = await launch()

// Fund admin: retry with long settle, watch network/console
{
  const p = await b.newPage()
  const errors = []
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)) })
  p.on('pageerror', e => errors.push('PAGEERROR: ' + String(e).slice(0, 300)))
  p.on('requestfailed', r => errors.push('REQFAIL: ' + r.url().slice(0, 150) + ' ' + (r.failure()?.errorText || '')))
  const url = await login(p, 'fund@avenue.co.ke')
  console.log('after login:', url.replace(BASE, ''))
  await new Promise(r => setTimeout(r, 8000))
  console.log('after 8s wait:', p.url().replace(BASE, ''))
  const text = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 400))
  console.log('TEXT:', text || '(blank)')
  const html = await p.evaluate(() => document.body.innerHTML.slice(0, 600))
  console.log('HTML:', html)
  if (errors.length) console.log('ERRORS:', JSON.stringify(errors.slice(0, 8), null, 1))
  await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/1.4-FUND-retry.png' })
  // try direct nav to fund dashboard
  await checkPage(p, '/fund/dashboard', '1.4-FUND-direct')
  await p.close()
}

// 1.6 logout as admin
{
  const p = await b.newPage()
  await login(p, 'admin@avenue.co.ke')
  const clicked = await p.evaluate(() => {
    const els = [...document.querySelectorAll('a,button')]
    const el = els.find(e => /log ?out/i.test(e.innerText))
    if (el) { el.click(); return true }
    return false
  })
  console.log('\n1.6 logout clicked:', clicked)
  await new Promise(r => setTimeout(r, 4000))
  console.log('after logout url:', p.url().replace(BASE, ''))
  await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/1.6-logout.png' })
  // protected page after logout
  await checkPage(p, '/dashboard', '1.6-protected-after-logout')
  await p.close()
}

await b.close()
console.log('\nDONE S1B')
