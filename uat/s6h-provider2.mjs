import { launch, login, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')
await p.goto(BASE + '/claims/new', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 3000))

async function openAndType(spanRe, query) {
  const pos = await p.evaluate((re) => {
    const rx = new RegExp(re)
    const span = [...document.querySelectorAll('span')].find(x => x.offsetParent && rx.test(x.innerText))
    if (!span) return null
    const r = span.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, spanRe)
  if (!pos) return 'no trigger'
  await p.mouse.click(pos.x, pos.y)
  await new Promise(r => setTimeout(r, 1200))
  const hasInput = await p.evaluate(() => {
    const i = [...document.querySelectorAll('input')].find(x => x.offsetParent)
    if (i) { i.focus(); return i.placeholder }
    return null
  })
  if (!hasInput) return 'no input opened'
  await p.keyboard.type(query, { delay: 50 })
  await new Promise(r => setTimeout(r, 3000))
  return 'typed into ' + hasInput
}

// member
console.log('member:', await openAndType('Search by name, member number', 'Testmember'))
const m = await p.evaluate(() => {
  const cands = [...document.querySelectorAll('li,[role="option"]')].filter(x => x.offsetParent && /Testmember/i.test(x.innerText))
  if (cands[0]) { cands[0].click(); return cands[0].innerText.replace(/\s+/g, ' ').slice(0, 50) }
  // fallback: any small clickable element in a popover
  const alt = [...document.querySelectorAll('div,button')].filter(x => x.offsetParent && /AVH-2026-00250/.test(x.innerText) && x.innerText.length < 120)
  const el = alt.sort((a, b) => a.innerText.length - b.innerText.length)[0]
  if (el) { el.click(); return 'alt:' + el.innerText.replace(/\s+/g, ' ').slice(0, 50) }
  return null
})
console.log('member picked:', m)
await new Promise(r => setTimeout(r, 1500))

// provider
console.log('provider:', await openAndType('Search by name, type or county', 'Avenue'))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/6.3f-provider-open.png' })
// list popover options precisely
const opts = await p.evaluate(() => {
  const lis = [...document.querySelectorAll('li,[role="option"]')].filter(x => x.offsetParent)
  return lis.map(x => x.innerText.replace(/\s+/g, ' ').slice(0, 70))
})
console.log('LI OPTIONS:', JSON.stringify(opts.slice(0, 10)))
const pv = await p.evaluate(() => {
  const lis = [...document.querySelectorAll('li,[role="option"]')].filter(x => x.offsetParent && /hospital|clinic|avenue/i.test(x.innerText))
  if (lis[0]) { lis[0].click(); return lis[0].innerText.replace(/\s+/g, ' ').slice(0, 50) }
  return null
})
console.log('provider picked:', pv)
await new Promise(r => setTimeout(r, 1500))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/6.3f-step1-done.png' })

// Next → step 2
await p.evaluate(() => { [...document.querySelectorAll('button')].find(x => x.offsetParent && /^next/i.test(x.innerText.trim()))?.click() })
await new Promise(r => setTimeout(r, 2000))
const t = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
const si = t.indexOf('Step 2')
console.log('\nSTEP2:', si >= 0 ? t.slice(si, si + 400) : 'NOT REACHED')
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/6.3f-step2.png' })
await b.close()
console.log('DONE')
