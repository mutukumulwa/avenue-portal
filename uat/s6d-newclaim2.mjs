import { launch, login, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')
await p.goto(BASE + '/claims/new', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 3000))

async function pickFromSearch(triggerText, query, optionMatch) {
  // click the trigger span/button
  await p.evaluate((t) => {
    const span = [...document.querySelectorAll('span,button,div')].find(x => x.offsetParent && (x.innerText || '').trim().startsWith(t))
    ;(span.closest('button') || span).click()
  }, triggerText)
  await new Promise(r => setTimeout(r, 1000))
  // type into newly appeared input
  const inp = await p.$('input:not([type="hidden"])')
  if (!inp) { console.log('NO INPUT APPEARED for', triggerText); return false }
  await inp.click()
  await p.keyboard.type(query, { delay: 50 })
  await new Promise(r => setTimeout(r, 2500))
  const opts = await p.evaluate((m) =>
    [...document.querySelectorAll('li,[role="option"],button,div')]
      .filter(x => x.offsetParent && new RegExp(m, 'i').test(x.innerText || '') && x.innerText.length < 120 && x.children.length <= 3)
      .map(x => x.innerText.replace(/\s+/g, ' ').slice(0, 70)), optionMatch)
  console.log(`OPTIONS for "${query}":`, JSON.stringify(opts.slice(0, 5)))
  const clicked = await p.evaluate((m) => {
    const el = [...document.querySelectorAll('li,[role="option"],button,div')]
      .filter(x => x.offsetParent && new RegExp(m, 'i').test(x.innerText || '') && x.innerText.length < 120 && x.children.length <= 3)[0]
    if (el) { el.click(); return true }
    return false
  }, optionMatch)
  await new Promise(r => setTimeout(r, 1500))
  return clicked
}

console.log('member picked:', await pickFromSearch('Search by name, member number', 'Testmember', 'Testmember'))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/6.3b-member.png' })
console.log('provider picked:', await pickFromSearch('Search by name, type', 'Parklands', 'Parklands'))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/6.3b-provider.png' })

await p.evaluate(() => { [...document.querySelectorAll('button')].find(x => x.offsetParent && /^next$/i.test(x.innerText.trim()))?.click() })
await new Promise(r => setTimeout(r, 1500))
const t = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
console.log('\nAFTER NEXT:', t.slice(t.indexOf('Step'), t.indexOf('Step') + 400))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/6.3b-step2.png' })
await b.close()
console.log('DONE')
