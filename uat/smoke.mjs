import puppeteer from 'puppeteer'
const b = await puppeteer.launch({ headless: 'new' })
const p = await b.newPage()
const resp = await p.goto('https://avenue-portal.vercel.app/', { waitUntil: 'networkidle2', timeout: 60000 })
console.log('STATUS:', resp.status(), 'URL:', p.url())
console.log('TITLE:', await p.title())
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/00-landing.png' })
await b.close()
