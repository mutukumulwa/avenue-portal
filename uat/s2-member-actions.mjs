import { launch, login, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')

// find UAT Testmember href
await p.goto(BASE + '/members?search=Testmember', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1500))
let href = await p.evaluate(() => {
  const a = [...document.querySelectorAll('a[href^="/members/"]')].find(x => /\/members\/[a-z0-9]{10,}$/i.test(x.getAttribute('href')))
  return a?.getAttribute('href')
})
if (!href) { // fallback: search box
  await p.goto(BASE + '/members', { waitUntil: 'networkidle2' })
  await p.evaluate(() => {
    const i = document.querySelector('input[type="search"], input[placeholder*="earch"]')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(i, 'Testmember'); i.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await new Promise(r => setTimeout(r, 2500))
  href = await p.evaluate(() => {
    const a = [...document.querySelectorAll('a[href^="/members/"]')].find(x => /\/members\/[a-z0-9]{10,}$/i.test(x.getAttribute('href')))
    return a?.getAttribute('href')
  })
}
console.log('UAT MEMBER HREF:', href)

// 2.4 edit: change phone and save
await p.goto(BASE + href + '/edit', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1200))
await p.evaluate(() => {
  const i = document.querySelector('input[name="phone"]')
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(i, '+254700999222'); i.dispatchEvent(new Event('input', { bubbles: true }))
})
await Promise.all([
  p.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {}),
  p.evaluate(() => { [...document.querySelectorAll('button')].find(b => /save|update/i.test(b.innerText))?.click() }),
])
await new Promise(r => setTimeout(r, 2000))
console.log('\n2.4 after edit save URL:', p.url().replace(BASE, ''))
console.log('   text:', await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 250)))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/2.4-after-edit.png' })

// verify persisted
await p.goto(BASE + href + '/edit', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1200))
const phone = await p.evaluate(() => document.querySelector('input[name="phone"]')?.value)
console.log('2.4 phone persisted:', phone)

// 2.6 letters: generate welcome letter
await p.goto(BASE + href + '/letters', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1200))
const genClicked = await p.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => /generate/i.test(b.innerText))
  if (btn) { btn.click(); return btn.innerText }
  return null
})
await new Promise(r => setTimeout(r, 4000))
console.log('\n2.6 generate clicked:', genClicked)
console.log('   text:', await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 500)))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/2.6-letter-generated.png' })

// 2.7 onboarding: start onboarding
await p.goto(BASE + href + '/onboarding', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1200))
const obClicked = await p.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => /start onboarding/i.test(b.innerText))
  if (btn) { btn.click(); return true }
  return false
})
await new Promise(r => setTimeout(r, 4000))
console.log('\n2.7 start onboarding clicked:', obClicked)
console.log('   text:', await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 500)))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/2.7-onboarding-started.png' })

// 2.5 card: re-issue
await p.goto(BASE + href + '/card', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1200))
const cardText0 = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 400))
console.log('\n2.5 card page before:', cardText0)
const reClicked = await p.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => /re-?issue/i.test(b.innerText))
  if (btn) { btn.click(); return true }
  return false
})
await new Promise(r => setTimeout(r, 4000))
console.log('2.5 re-issue clicked:', reClicked)
console.log('   after:', await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 400)))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/2.5-card-reissued.png' })

await b.close()
console.log('\nDONE S2 ACTIONS')
