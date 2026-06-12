import puppeteer from 'puppeteer'
import { login, BASE } from './lib.mjs'

// mobile viewport
const b = await puppeteer.launch({ headless: 'new', defaultViewport: { width: 390, height: 844, isMobile: true, hasTouch: true } })
const p = await b.newPage()
await login(p, 'member@avenue.co.ke')
await p.goto(BASE + '/member/dashboard', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 2000))
const overflow = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 5)
console.log('mobile horizontal overflow:', overflow)
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/19.3-mobile-dashboard.png' })
await p.goto(BASE + '/member/benefits', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1500))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/19.3-mobile-benefits.png' })

// bad URLs
for (const u of ['/member/nonexistent', '/totally-bogus-page']) {
  const resp = await p.goto(BASE + u, { waitUntil: 'networkidle2' })
  const t = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 120))
  console.log(`${u} -> [${resp.status()}] ${t}`)
}
await b.close()
console.log('DONE S19')
