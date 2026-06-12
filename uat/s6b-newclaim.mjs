import { launch, login, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')
await p.goto(BASE + '/claims/new', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 3000))

// dump structure after hydration
const dump = await p.evaluate(() =>
  [...document.querySelectorAll('input, [contenteditable], [role="combobox"]')].map(e => ({
    tag: e.tagName, type: e.type || '', name: e.name || '', ph: e.placeholder || '', vis: !!e.offsetParent,
  }))
)
console.log('INPUTS:', JSON.stringify(dump, null, 1))

// member search
const memberInput = await p.$('input[placeholder*="member number"], input[placeholder*="Search by name"]')
if (memberInput) {
  await memberInput.click()
  await p.keyboard.type('Testmember', { delay: 40 })
  await new Promise(r => setTimeout(r, 2500))
  await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/6.3-member-search.png' })
  const opts = await p.evaluate(() => [...document.querySelectorAll('li, [role="option"], button')].filter(x => x.offsetParent && /testmember/i.test(x.innerText)).map(x => x.innerText.replace(/\s+/g, ' ').slice(0, 60)))
  console.log('MEMBER OPTIONS:', JSON.stringify(opts))
  await p.evaluate(() => { [...document.querySelectorAll('li, [role="option"], button')].find(x => x.offsetParent && /testmember/i.test(x.innerText))?.click() })
  await new Promise(r => setTimeout(r, 1500))
}

// provider search
const provInput = await p.evaluate(() => {
  const inputs = [...document.querySelectorAll('input')].filter(x => x.offsetParent && /provider|facility|type/i.test(x.placeholder))
  return inputs.map(x => x.placeholder)
})
console.log('PROVIDER INPUTS:', JSON.stringify(provInput))
const provHandle = (await p.$$('input')).filter(async h => true)
// click the input whose placeholder mentions search by name, type
const allInputs = await p.$$('input')
for (const h of allInputs) {
  const ph = await h.evaluate(e => e.placeholder)
  const vis = await h.evaluate(e => !!e.offsetParent)
  if (vis && /type/i.test(ph) && /search/i.test(ph)) {
    await h.click(); await p.keyboard.type('Avenue', { delay: 40 }); break
  }
}
await new Promise(r => setTimeout(r, 2500))
const provOpts = await p.evaluate(() => [...document.querySelectorAll('li, [role="option"], button')].filter(x => x.offsetParent && /avenue hospital/i.test(x.innerText)).map(x => x.innerText.replace(/\s+/g, ' ').slice(0, 60)))
console.log('PROVIDER OPTIONS:', JSON.stringify(provOpts))
await p.evaluate(() => { [...document.querySelectorAll('li, [role="option"], button')].find(x => x.offsetParent && /avenue hospital/i.test(x.innerText))?.click() })
await new Promise(r => setTimeout(r, 1500))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/6.3-step1-done.png' })

// next step
await p.evaluate(() => { [...document.querySelectorAll('button')].find(x => x.offsetParent && /next/i.test(x.innerText))?.click() })
await new Promise(r => setTimeout(r, 1500))
console.log('\nSTEP2 TEXT:', await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(300, 800)))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/6.3-step2.png' })

await b.close()
console.log('DONE S6B')
