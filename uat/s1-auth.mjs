import { launch, login, checkPage, BASE } from './lib.mjs'

const roles = [
  ['admin@avenue.co.ke', 'SUPER_ADMIN'],
  ['claims@avenue.co.ke', 'CLAIMS_OFFICER'],
  ['finance@avenue.co.ke', 'FINANCE_OFFICER'],
  ['underwriter@avenue.co.ke', 'UNDERWRITER'],
  ['cs@avenue.co.ke', 'CUSTOMER_SERVICE'],
  ['medical@avenue.co.ke', 'MEDICAL_OFFICER'],
  ['fund@avenue.co.ke', 'FUND_ADMINISTRATOR'],
  ['broker@kaib.co.ke', 'BROKER_USER'],
  ['emily.wambui@safaricom.co.ke', 'HR_MANAGER'],
  ['member@avenue.co.ke', 'MEMBER_USER'],
]

const b = await launch()

// 1.2 invalid credentials
{
  const p = await b.newPage()
  const url = await login(p, 'admin@avenue.co.ke', 'WrongPassword1!')
  const text = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 300))
  console.log('\n### 1.2 invalid-creds ->', url.replace(BASE, ''), '|', text)
  await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/1.2-invalid-login.png' })
  await p.close()
}

// 1.3/1.4 every role login + landing
for (const [email, role] of roles) {
  const p = await b.newPage()
  try {
    const url = await login(p, email)
    const text = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 200))
    console.log(`\n### LOGIN ${role} (${email}) -> ${url.replace(BASE, '')}`)
    console.log('   ', text)
    await p.screenshot({ path: `C:/Coding/avenue-portal/uat/screenshots/1.4-${role}.png` })
  } catch (e) { console.log(`\n### LOGIN ${role} FAILED:`, e.message) }
  await p.close()
}

// 1.5 role separation: member -> admin dashboard; hr -> member dashboard
{
  const p = await b.newPage()
  await login(p, 'member@avenue.co.ke')
  await checkPage(p, '/dashboard', '1.5-member-to-admin')
  await p.close()
}
{
  const p = await b.newPage()
  await login(p, 'emily.wambui@safaricom.co.ke')
  await checkPage(p, '/member/dashboard', '1.5-hr-to-member')
  await p.close()
}

await b.close()
console.log('\nDONE S1')
