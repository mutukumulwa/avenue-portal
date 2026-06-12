import { launch, login, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')
await p.goto(BASE + '/claims/new', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 3000))

// member first
let pos = await p.evaluate(() => {
  const span = [...document.querySelectorAll('span')].find(x => x.offsetParent && /Search by name, member number/.test(x.innerText))
  const r = span.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
})
await p.mouse.click(pos.x, pos.y)
await new Promise(r => setTimeout(r, 800))
await p.keyboard.type('Testmember', { delay: 50 })
await new Promise(r => setTimeout(r, 2500))
await p.evaluate(() => {
  const cands = [...document.querySelectorAll('*')].filter(x => x.offsetParent && x.children.length <= 2 && /Testmember/i.test(x.innerText || '') && (x.innerText || '').length < 100)
  const el = cands.sort((a, b) => a.innerText.length - b.innerText.length)[0]
  ;(el.closest('button') || el.closest('li') || el)?.click()
})
await new Promise(r => setTimeout(r, 1500))

// provider
pos = await p.evaluate(() => {
  const span = [...document.querySelectorAll('span')].find(x => x.offsetParent && /Search by name, type or county/.test(x.innerText))
  if (!span) return null
  const r = span.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
})
console.log('provider trigger:', JSON.stringify(pos))
await p.mouse.click(pos.x, pos.y)
await new Promise(r => setTimeout(r, 800))
await p.keyboard.type('Avenue', { delay: 50 })
await new Promise(r => setTimeout(r, 3500))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/6.3e-provider-options.png' })
const visText = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 900))
console.log('PAGE DURING SEARCH:', visText)
// click first option containing Hospital
const picked = await p.evaluate(() => {
  const cands = [...document.querySelectorAll('*')].filter(x => x.offsetParent && x.children.length <= 3 && /Avenue H/i.test(x.innerText || '') && (x.innerText || '').length < 120)
  const el = cands.sort((a, b) => a.innerText.length - b.innerText.length)[0]
  if (el) { (el.closest('button') || el.closest('li') || el).click(); return el.innerText.replace(/\s+/g, ' ').slice(0, 60) }
  return null
})
console.log('picked provider:', picked)
await new Promise(r => setTimeout(r, 1500))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/6.3e-step1-complete.png' })

// Next
await p.evaluate(() => { [...document.querySelectorAll('button')].find(x => x.offsetParent && /^next/i.test(x.innerText.trim()))?.click() })
await new Promise(r => setTimeout(r, 2000))
const t = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
const si = t.indexOf('Step 2')
console.log('\nSTEP2:', si >= 0 ? t.slice(si, si + 450) : '(no step 2) ' + t.slice(400, 800))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/6.3e-step2.png' })
await b.close()
console.log('DONE')
