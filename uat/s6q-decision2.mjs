import { launch, login, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
const net = []
p.on('response', r => { if (r.request().method() === 'POST' || r.status() >= 400) net.push({ m: r.request().method(), url: r.url().replace(BASE, '').slice(0, 80), status: r.status() }) })
await login(p, 'admin@avenue.co.ke')
await p.goto(BASE + '/claims/cmq9vvmbz000504k3et826zlk', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 2000))
net.length = 0

const clickBtn = async (re) => {
  const ok = await p.evaluate((re) => {
    const b = [...document.querySelectorAll('button')].find(x => x.offsetParent && new RegExp(re, 'i').test(x.innerText))
    if (b) { b.click(); return b.innerText.trim().slice(0, 40) }
    return null
  }, re)
  await new Promise(r => setTimeout(r, 4000))
  return ok
}

console.log('compute outcome:', await clickBtn('Compute Outcome'))
let t = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
console.log('  fin:', t.slice(t.indexOf('FINANCIAL'), t.indexOf('FINANCIAL') + 130))
console.log('  net:', JSON.stringify(net)); net.length = 0

console.log('submit decision:', await clickBtn('Submit Decision'))
await new Promise(r => setTimeout(r, 3000))
t = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
console.log('  net:', JSON.stringify(net))
console.log('  page:', t.slice(0, 200))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/6.7-decision2.png' })

// reload to see final status
await p.goto(BASE + '/claims/cmq9vvmbz000504k3et826zlk', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 2000))
t = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
const i = t.indexOf('Claim CLM')
console.log('\nFINAL STATE:', t.slice(i, i + 250))
await b.close()
console.log('DONE')
