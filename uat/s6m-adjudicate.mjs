import { launch, login, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')
await p.goto(BASE + '/claims', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1500))

// find the UAT Testmember claim
const href = await p.evaluate(() => {
  const tr = [...document.querySelectorAll('tbody tr')].find(x => /Testmember/i.test(x.innerText))
  return tr?.querySelector('a[href^="/claims/"]')?.getAttribute('href') || null
})
console.log('UAT CLAIM HREF:', href)
if (!href) { console.log('not on page 1 — searching'); }

await p.goto(BASE + href, { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 2000))
const t = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
console.log('DETAIL:', t.slice(t.indexOf('Claim CLM'), t.indexOf('Claim CLM') + 600))
const btns = await p.evaluate(() => [...document.querySelectorAll('button')].filter(x => x.offsetParent).map(x => x.innerText.trim()).filter(x => x && !/OVERVIEW|MEMBERSHIP|CLINICAL|FINANCE|INSIGHTS|SUPPORT|REINSTATEMENTS|Log out/.test(x)))
console.log('ACTIONS:', JSON.stringify(btns))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/6.7-claim-detail.png' })
await b.close()
console.log('DONE')
