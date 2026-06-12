import { launch, login, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')
await p.goto(BASE + '/claims/new', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 3000))

const text = () => p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
const shot = n => p.screenshot({ path: `C:/Coding/avenue-portal/uat/screenshots/${n}.png` })
const next = async () => { await p.evaluate(() => { [...document.querySelectorAll('button')].find(x => x.offsetParent && /^next/i.test(x.innerText.trim()))?.click() }); await new Promise(r => setTimeout(r, 1500)) }

async function searchSelect(ph, q, re) {
  await p.evaluate((ph) => { [...document.querySelectorAll('button')].find(x => x.offsetParent && x.innerText.includes(ph))?.click() }, ph)
  await new Promise(r => setTimeout(r, 600))
  await p.evaluate((q) => {
    const i = [...document.querySelectorAll('input[placeholder="Type to filter…"]')].find(x => x.offsetParent)
    const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    s.call(i, q); i.dispatchEvent(new Event('input', { bubbles: true }))
  }, q)
  await new Promise(r => setTimeout(r, 800))
  const picked = await p.evaluate((re) => {
    const rx = new RegExp(re, 'i')
    const o = [...document.querySelectorAll('button')].find(x => x.offsetParent && rx.test(x.innerText) && !x.innerText.includes('Type to filter'))
    if (!o) return null
    o.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); return o.innerText.replace(/\s+/g, ' ').slice(0, 40)
  }, re)
  await new Promise(r => setTimeout(r, 800))
  return picked
}

console.log('member:', await searchSelect('Search by name, member number', 'Testmember', 'Testmember'))
console.log('provider:', await searchSelect('Search by name, type or county', 'Parklands', 'Parklands'))
await next()
await p.evaluate(() => {
  const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  const d = [...document.querySelectorAll('input[type="date"]')].find(x => x.offsetParent)
  if (d) { s.call(d, '2026-06-10'); d.dispatchEvent(new Event('input', { bubbles: true })); d.dispatchEvent(new Event('change', { bubbles: true })) }
})
await next()
await p.evaluate(() => {
  const i = [...document.querySelectorAll('input')].find(x => x.offsetParent && /ICD-10/i.test(x.placeholder))
  const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  s.call(i, 'B54'); i.dispatchEvent(new Event('input', { bubbles: true }))
})
await new Promise(r => setTimeout(r, 3000))
console.log('icd:', await p.evaluate(() => {
  const o = [...document.querySelectorAll('button')].find(x => x.offsetParent && /B54/i.test(x.innerText) && x.innerText.length < 120)
  if (!o) return null
  o.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); o.click(); return o.innerText.replace(/\s+/g, ' ').slice(0, 50)
}))
await new Promise(r => setTimeout(r, 1200))
await next()
console.log('step4:', (await text()).includes('Step 4'))

// add consultation line
await p.evaluate(() => { [...document.querySelectorAll('button')].find(x => x.offsetParent && x.innerText.trim() === 'Consultation')?.click() })
await new Promise(r => setTimeout(r, 1500))
const lineFields = await p.evaluate(() => [...document.querySelectorAll('input,select')].filter(e => e.offsetParent).map(e => ({ tag: e.tagName, type: e.type, ph: e.placeholder, val: e.value })))
console.log('LINE FIELDS:', JSON.stringify(lineFields))
await shot('6.3j-line-added')
// fill any empty numeric/text fields in the line (cpt search or amount)
await p.evaluate(() => {
  const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  const nums = [...document.querySelectorAll('input[type="number"]')].filter(x => x.offsetParent && !x.value)
  nums.forEach(n => { s.call(n, '5000'); n.dispatchEvent(new Event('input', { bubbles: true })) })
  const txts = [...document.querySelectorAll('input[type="text"]')].filter(x => x.offsetParent && !x.value && /desc/i.test(x.placeholder || ''))
  txts.forEach(n => { s.call(n, 'UAT consultation'); n.dispatchEvent(new Event('input', { bubbles: true })) })
})
await new Promise(r => setTimeout(r, 800))
await shot('6.3j-line-filled')

// submit
await p.evaluate(() => { [...document.querySelectorAll('button')].find(x => x.offsetParent && /submit claim/i.test(x.innerText))?.click() })
await new Promise(r => setTimeout(r, 6000))
console.log('AFTER SUBMIT URL:', p.url().replace(BASE, ''))
console.log('TEXT:', (await text()).slice(0, 400))
await shot('6.3j-submitted')
await b.close()
console.log('DONE S6L')
