import { launch, login, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')
const href = '/claims/cmq9vvmbz000504k3et826zlk'
await p.goto(BASE + href, { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 2000))

const clickBtn = async (re) => {
  const ok = await p.evaluate((re) => {
    const b = [...document.querySelectorAll('button')].find(x => x.offsetParent && new RegExp(re, 'i').test(x.innerText))
    if (b) { b.click(); return b.innerText.trim().slice(0, 50) }
    return null
  }, re)
  await new Promise(r => setTimeout(r, 4000))
  return ok
}
const actions = () => p.evaluate(() => [...document.querySelectorAll('button')].filter(x => x.offsetParent).map(x => x.innerText.trim()).filter(x => x && !/OVERVIEW|MEMBERSHIP|CLINICAL|FINANCE|INSIGHTS|SUPPORT|REINSTATEMENTS|Log out|▸|▾/.test(x)))

console.log('1 clicked:', await clickBtn('Mark as Captured'))
console.log('  actions now:', JSON.stringify(await actions()))
const t1 = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 250))
console.log('  status text:', t1.slice(t1.indexOf('Claim CLM'), t1.indexOf('Claim CLM') + 120))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/6.7-captured.png' })

// look for approve / adjudicate controls
console.log('2 clicked:', await clickBtn('Approve|Adjudicate|Start Review'))
console.log('  actions now:', JSON.stringify(await actions()))
const t2 = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
console.log('  text:', t2.slice(t2.indexOf('Claim CLM'), t2.indexOf('Claim CLM') + 300))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/6.7-after2.png' })
await b.close()
console.log('DONE')
