import { launch, login, checkPage, BASE } from './lib.mjs'

const b = await launch()

// 2.8 verification: new member portal login works
{
  const p = await b.newPage()
  const url = await login(p, 'uat.testmember@example.com', 'UatTemp2026!')
  console.log('### 2.8-verify member login ->', url.replace(BASE, ''))
  console.log('   ', await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 200)))
  await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/2.8-member-login-verify.png' })
  await p.close()
}

const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')

// 3.1 groups list
await checkPage(p, '/groups', '3.1-groups-list')
const groupHref = await p.evaluate(() => {
  const a = [...document.querySelectorAll('a[href^="/groups/"]')].find(x => /\/groups\/[a-z0-9]{10,}$/i.test(x.getAttribute('href')) && /safaricom/i.test(x.closest('tr')?.innerText || x.innerText || ''))
  const any = [...document.querySelectorAll('a[href^="/groups/"]')].find(x => /\/groups\/[a-z0-9]{10,}$/i.test(x.getAttribute('href')))
  return (a || any)?.getAttribute('href')
})
console.log('\nGROUP HREF:', groupHref)

// 3.2 group detail
if (groupHref) {
  await checkPage(p, groupHref, '3.2-group-detail', { textLen: 700 })
  for (const [sub, name] of [['/edit', '3.5-group-edit'], ['/reprice', '3.6-reprice'], ['/self-funded', '3.7-self-funded'], ['/tiers', '3.8-tiers']]) {
    await checkPage(p, groupHref + sub, name)
  }
}

// 3.3 new group form + 3.4 individual
await checkPage(p, '/groups/new', '3.3-new-group')
const fields = await p.evaluate(() =>
  [...document.querySelectorAll('input, select, textarea')].filter(e => e.type !== 'hidden').map(e => ({
    tag: e.tagName, type: e.type, name: e.name,
    options: e.tagName === 'SELECT' ? [...e.options].map(o => o.text).slice(0, 8) : undefined,
  }))
)
console.log('\nNEW GROUP FIELDS:', JSON.stringify(fields))
await checkPage(p, '/groups/new/individual', '3.4-new-individual')

await b.close()
console.log('\nDONE S3 SWEEP')
