import { launch, login, checkPage, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'member@avenue.co.ke')

const pages = [
  ['/member/dashboard', '18.1-dash', 400],
  ['/member/benefits', '18.2-benefits', 350],
  ['/member/check-in', '18.3-checkin', 350],
  ['/member/dependents', '18.4-dependents', 300],
  ['/member/documents', '18.5-documents', 300],
  ['/member/facilities', '18.6-facilities', 300],
  ['/member/health-vault', '18.7-vault', 300],
  ['/member/notifications', '18.8-notifications', 300],
  ['/member/preauth', '18.9-preauth', 300],
  ['/member/preauth/new', '18.9-preauth-new', 300],
  ['/member/profile', '18.10-profile', 300],
  ['/member/reinstatement', '18.11-reinstatement', 300],
  ['/member/security', '18.12-security', 300],
  ['/member/support', '18.13-support', 300],
  ['/member/utilization', '18.14-utilization', 300],
  ['/member/wallet', '18.15-wallet', 300],
]
for (const [path, name, len] of pages) await checkPage(p, path, name, { textLen: len })

await b.close()
console.log('DONE S18 SWEEP')
