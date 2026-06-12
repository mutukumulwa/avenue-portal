import { launch, login, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')

// 4.4 new rate card
await p.goto(BASE + '/packages/rate-matrix', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1200))
await p.evaluate(() => { [...document.querySelectorAll('button,a')].find(x => /new rate card/i.test(x.innerText))?.click() })
await new Promise(r => setTimeout(r, 2000))
console.log('4.4 after New Rate Card:', p.url().replace(BASE, ''))
const inputs = await p.evaluate(() => [...document.querySelectorAll('input,select,textarea')].filter(e => e.type !== 'hidden').map(e => `${e.tagName}:${e.name || e.placeholder}`))
console.log('   fields:', JSON.stringify(inputs))
const txt = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 400))
console.log('   text:', txt)
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/4.4-new-rate-card.png' })

// fill name if a form appeared
const named = await p.evaluate(() => {
  const i = [...document.querySelectorAll('input')].find(x => x.type !== 'hidden' && /name/i.test(x.name + x.placeholder))
  if (!i) return false
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(i, 'UAT Rate Card 2026'); i.dispatchEvent(new Event('input', { bubbles: true }))
  return true
})
if (named) {
  await p.evaluate(() => { [...document.querySelectorAll('button')].find(x => /create|save/i.test(x.innerText) && x.type === 'submit')?.click() })
  await new Promise(r => setTimeout(r, 4000))
  console.log('   after create:', p.url().replace(BASE, ''), '|', await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 300)))
  await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/4.4-rate-card-created.png' })
}

// 4.5 create pricing model
await p.goto(BASE + '/settings/pricing-models', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1200))
await p.evaluate(() => { [...document.querySelectorAll('button,a')].find(x => /create model/i.test(x.innerText))?.click() })
await new Promise(r => setTimeout(r, 2500))
console.log('\n4.5 after Create Model:', p.url().replace(BASE, ''))
console.log('   text:', await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 400)))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/4.5-create-model.png' })

await b.close()
console.log('DONE S4B')
