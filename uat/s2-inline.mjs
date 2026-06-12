import { launch, login, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')
const uat = '/members/cmq9udg5o000004k3zr7kpgan'
await p.goto(BASE + uat, { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1500))

// 2.8 portal login creation
const before = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
console.log('LOGIN SECTION BEFORE:', before.slice(before.indexOf('Member Portal Login'), before.indexOf('Member Portal Login') + 250))
await p.evaluate(() => { [...document.querySelectorAll('button')].find(b => /create login/i.test(b.innerText))?.click() })
await new Promise(r => setTimeout(r, 5000))
const after = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
console.log('\nLOGIN SECTION AFTER:', after.slice(after.indexOf('Member Portal Login'), after.indexOf('Member Portal Login') + 300))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/2.8-portal-login.png' })

// 2.9 transfer section
const idx = after.indexOf('Transfer')
console.log('\nTRANSFER SECTION:', after.slice(idx, idx + 250))
await p.evaluate(() => { [...document.querySelectorAll('button,a')].find(b => /transfer to another scheme/i.test(b.innerText))?.click() })
await new Promise(r => setTimeout(r, 3000))
console.log('\nAFTER TRANSFER CLICK url:', p.url().replace(BASE, ''))
const t2 = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
const ti = t2.indexOf('Transfer')
console.log('TRANSFER UI:', t2.slice(ti, ti + 400))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/2.9-transfer.png' })

await b.close()
console.log('DONE')
