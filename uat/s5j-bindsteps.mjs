import { launch, login, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')

// verify groups after earlier Create Group click
await p.goto(BASE + '/groups', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1200))
const names = await p.evaluate(() => [...document.querySelectorAll('tbody tr')].map(tr => tr.innerText.split('\n')[0].replace(/\s+/g, ' ').slice(0, 40)))
console.log('GROUPS AFTER:', JSON.stringify(names))

// bind workflow controls
await p.goto(BASE + '/quotations/cmq9v5y8q000304k3hevyxek9/bind', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1500))
const controls = await p.evaluate(() => [...document.querySelectorAll('button')].filter(x => x.offsetParent).map(x => ({ t: x.innerText.trim().slice(0, 40), type: x.type })))
console.log('BIND CONTROLS:', JSON.stringify(controls, null, 1))
const full = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 1200))
console.log('BIND FULL:', full)
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/5.5-bind-full.png' })
await b.close()
console.log('DONE')
