// RB series — role-based access sweep (2026-07 engagement, localhost build 1cd23a8)
// UAT test harness only — not application code. Run: node uat/06_Test_Results/rb-sweep.mjs
import puppeteer from 'puppeteer'
import fs from 'node:fs'

const BASE = 'http://localhost:3000'
const PW = 'MedvexAdmin2024!'
const SHOTS = new URL('../04_Evidence/Screenshots/', import.meta.url).pathname
fs.mkdirSync(SHOTS, { recursive: true })

const ROLES = [
  ['SUPER_ADMIN',        'admin@medvex.co.ug'],
  ['CLAIMS_OFFICER',     'claims@medvex.co.ug'],
  ['FINANCE_OFFICER',    'finance@medvex.co.ug'],
  ['UNDERWRITER',        'underwriter@medvex.co.ug'],
  ['CUSTOMER_SERVICE',   'cs@medvex.co.ug'],
  ['MEDICAL_OFFICER',    'medical@medvex.co.ug'],
  ['REPORTS_VIEWER',     'uat.reports@medvex.co.ug'],
  ['FUND_ADMINISTRATOR', 'fund@medvex.co.ug'],
  ['BROKER_USER',        'broker@kaib.co.ke'],
  ['HR_MANAGER',         'emily.wambui@safaricom.co.ke'],
  ['MEMBER_USER',        'member@medvex.co.ug'],
]

const PROBES = ['/dashboard','/members','/claims','/billing','/billing/gl','/settlement','/contracts','/clients','/providers','/settings','/reports','/analytics','/member/dashboard','/hr/dashboard','/broker/dashboard','/fund/dashboard']

const out = []
const browser = await puppeteer.launch({ headless: 'new', executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined, defaultViewport: { width: 1440, height: 900 } })

for (const [role, email] of ROLES) {
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  const rec = { role, email, landing: null, probes: {} }
  try {
    await page.goto(BASE + '/login', { waitUntil: 'networkidle2', timeout: 45000 })
    await page.type('input[type="email"]', email)
    await page.type('input[type="password"]', PW)
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ])
    await new Promise(r => setTimeout(r, 2500))
    // follow post-login redirect chain
    if (page.url().includes('/post-login')) await new Promise(r => setTimeout(r, 3000))
    rec.landing = page.url().replace(BASE, '')
    await page.screenshot({ path: `${SHOTS}/rb-${role}.png` })
    for (const probe of PROBES) {
      try {
        await page.goto(BASE + probe, { waitUntil: 'domcontentloaded', timeout: 30000 })
        await new Promise(r => setTimeout(r, 1200))
        const final = page.url().replace(BASE, '')
        rec.probes[probe] = final === probe ? 'OK' : `→ ${final}`
      } catch (e) { rec.probes[probe] = 'ERR ' + e.message.slice(0, 60) }
    }
  } catch (e) { rec.error = e.message.slice(0, 200) }
  out.push(rec)
  console.log(JSON.stringify(rec))
  await ctx.close()
}
await browser.close()
fs.writeFileSync(new URL('./rb-sweep-results.json', import.meta.url), JSON.stringify(out, null, 2))
console.log('DONE')
