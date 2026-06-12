import { launch, login, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')
for (const status of ['', '?status=PROSPECT', '?status=PENDING']) {
  await p.goto(BASE + '/groups' + status, { waitUntil: 'networkidle2' })
  await new Promise(r => setTimeout(r, 1500))
  const rows = await p.evaluate(() => [...document.querySelectorAll('tbody tr')].map(tr => tr.innerText.split('\n')[0].replace(/\s+/g, ' ').slice(0, 40)))
  const total = await p.evaluate(() => (document.body.innerText.match(/(\d+) total/) || [])[1])
  console.log(`[${status || 'default'}] total=${total}:`, JSON.stringify(rows))
}
// click the Prospect filter button in UI
await p.goto(BASE + '/groups', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1200))
await p.evaluate(() => { [...document.querySelectorAll('button,a')].find(x => x.offsetParent && x.innerText.trim() === 'Prospect')?.click() })
await new Promise(r => setTimeout(r, 2000))
const rows = await p.evaluate(() => [...document.querySelectorAll('tbody tr')].map(tr => tr.innerText.split('\n')[0].replace(/\s+/g, ' ').slice(0, 40)))
console.log('UI Prospect filter:', JSON.stringify(rows))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/7b-prospect-filter.png' })
await b.close()
console.log('DONE')
