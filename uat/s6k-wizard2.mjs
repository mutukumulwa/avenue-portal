import { launch, login, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')
await p.goto(BASE + '/claims/new', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 3000))

const text = () => p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
const shot = n => p.screenshot({ path: `C:/Coding/avenue-portal/uat/screenshots/${n}.png` })
const next = async () => { await p.evaluate(() => { [...document.querySelectorAll('button')].find(x => x.offsetParent && /^next/i.test(x.innerText.trim()))?.click() }); await new Promise(r => setTimeout(r, 1500)) }

async function searchSelect(placeholderText, query, optionRe) {
  await p.evaluate((ph) => { [...document.querySelectorAll('button')].find(x => x.offsetParent && x.innerText.includes(ph))?.click() }, placeholderText)
  await new Promise(r => setTimeout(r, 600))
  await p.evaluate((q) => {
    const i = [...document.querySelectorAll('input[placeholder="Type to filter…"]')].find(x => x.offsetParent)
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(i, q); i.dispatchEvent(new Event('input', { bubbles: true }))
  }, query)
  await new Promise(r => setTimeout(r, 800))
  const picked = await p.evaluate((re) => {
    const rx = new RegExp(re, 'i')
    const opt = [...document.querySelectorAll('button')].find(x => x.offsetParent && rx.test(x.innerText) && !x.innerText.includes('Type to filter'))
    if (!opt) return null
    opt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    return opt.innerText.replace(/\s+/g, ' ').slice(0, 50)
  }, optionRe)
  await new Promise(r => setTimeout(r, 800))
  return picked
}

console.log('member:', await searchSelect('Search by name, member number', 'Testmember', 'Testmember'))
console.log('provider:', await searchSelect('Search by name, type or county', 'Parklands', 'Parklands'))
await next()
// step 2: keep defaults (Outpatient), set date
await p.evaluate(() => {
  const setI = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  const d = [...document.querySelectorAll('input[type="date"]')].find(x => x.offsetParent)
  if (d) { setI.call(d, '2026-06-10'); d.dispatchEvent(new Event('input', { bubbles: true })); d.dispatchEvent(new Event('change', { bubbles: true })) }
})
await next()
console.log('step3 reached:', (await text()).includes('Step 3'))

// step 3: ICD-10 search
await p.evaluate(() => {
  const i = [...document.querySelectorAll('input')].find(x => x.offsetParent && /ICD-10/i.test(x.placeholder))
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(i, 'malaria'); i.dispatchEvent(new Event('input', { bubbles: true })); i.focus()
})
await new Promise(r => setTimeout(r, 3500))
await shot('6.3i-icd-results')
const icdOpts = await p.evaluate(() => [...document.querySelectorAll('button,li,[role="option"]')].filter(x => x.offsetParent && /malaria|B5[0-4]/i.test(x.innerText)).map(x => ({ tag: x.tagName, t: x.innerText.replace(/\s+/g, ' ').slice(0, 60) })))
console.log('ICD OPTIONS:', JSON.stringify(icdOpts.slice(0, 5)))
const icdPicked = await p.evaluate(() => {
  const opt = [...document.querySelectorAll('button,li')].find(x => x.offsetParent && /malaria/i.test(x.innerText) && x.innerText.length < 120)
  if (!opt) return null
  opt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); opt.click()
  return opt.innerText.replace(/\s+/g, ' ').slice(0, 60)
})
console.log('ICD picked:', icdPicked)
await new Promise(r => setTimeout(r, 1500))
await shot('6.3i-step3-done')
await next()
let t = await text()
console.log('step4 reached:', t.includes('Step 4'), '|', t.slice(t.indexOf('Step 4'), t.indexOf('Step 4') + 400))

// step 4: services & billing
const s4 = await p.evaluate(() => [...document.querySelectorAll('input,select,textarea,button')].filter(e => e.offsetParent).map(e => ({ tag: e.tagName, type: e.type, name: e.name, ph: e.placeholder, t: e.tagName === 'BUTTON' ? e.innerText.trim().slice(0, 30) : undefined, options: e.tagName === 'SELECT' ? [...e.options].map(o => o.text).slice(0, 8) : undefined })))
console.log('S4 ELEMENTS:', JSON.stringify(s4, null, 1).slice(0, 2500))
await shot('6.3i-step4')
await b.close()
console.log('DONE S6K')
