import { launch, login, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
const net = []
p.on('response', r => { if (r.request().method() === 'POST') net.push({ url: r.url().replace(BASE, ''), status: r.status() }) })
await login(p, 'admin@avenue.co.ke')

// check groups list first
await p.goto(BASE + '/groups', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1200))
const names = await p.evaluate(() => [...document.querySelectorAll('tbody tr')].map(tr => tr.innerText.split('\n')[0].replace(/\s+/g, ' ').slice(0, 40)))
console.log('GROUPS NOW:', JSON.stringify(names))

// click Create Group on quote with network capture
await p.goto(BASE + '/quotations/cmq9v5y8q000304k3hevyxek9', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1500))
net.length = 0
await p.evaluate(() => { [...document.querySelectorAll('button')].find(x => /create group/i.test(x.innerText))?.click() })
await new Promise(r => setTimeout(r, 7000))
console.log('POSTs:', JSON.stringify(net))
console.log('URL:', p.url().replace(BASE, ''))
const t = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 350))
console.log('TEXT:', t)
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/5.5-create-group2.png' })

// check Bind Membership too
await p.evaluate(() => { [...document.querySelectorAll('button,a')].find(x => /bind membership/i.test(x.innerText))?.click() })
await new Promise(r => setTimeout(r, 3000))
console.log('\nBIND URL:', p.url().replace(BASE, ''))
console.log('BIND TEXT:', await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 400)))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/5.5-bind-membership.png' })

await b.close()
console.log('DONE')
