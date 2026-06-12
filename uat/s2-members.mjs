import { launch, login, checkPage, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')

// 2.1 members list
const list = await checkPage(p, '/members', '2.1-members-list')

// grab first member detail link from the list via the UI
const memberHref = await p.evaluate(() => {
  const a = [...document.querySelectorAll('a[href^="/members/"]')]
    .find(x => /\/members\/[a-z0-9]{10,}$/i.test(x.getAttribute('href')))
  return a ? a.getAttribute('href') : null
})
console.log('\nFIRST MEMBER HREF:', memberHref)

// 2.1b search: type into search box if present
const hasSearch = await p.evaluate(() => {
  const i = document.querySelector('input[type="search"], input[placeholder*="earch"]')
  if (!i) return false
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(i, 'Wairimu')
  i.dispatchEvent(new Event('input', { bubbles: true }))
  return true
})
await new Promise(r => setTimeout(r, 2500))
const searchText = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 400))
console.log('\n2.1b SEARCH (hasSearch=' + hasSearch + '):', searchText.slice(0, 350))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/2.1b-members-search.png' })

if (memberHref) {
  await checkPage(p, memberHref, '2.2-member-detail', { textLen: 700 })
  for (const [sub, name] of [['/edit', '2.4-edit'], ['/card', '2.5-card'], ['/letters', '2.6-letters'], ['/onboarding', '2.7-onboarding'], ['/portal', '2.8-portal'], ['/transfer', '2.9-transfer'], ['/webauthn', '2.x-webauthn']]) {
    await checkPage(p, memberHref + sub, name)
  }
}

await checkPage(p, '/members/new', '2.3-new-member-form')
await checkPage(p, '/members/import', '2.10-import')
await checkPage(p, '/members/reinstatement', '2.11-reinstatement')

await b.close()
console.log('\nDONE S2 SWEEP')
