import { launch, login, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')
await p.goto(BASE + '/claims/new', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 3000))

// member (known-good flow)
let pos = await p.evaluate(() => {
  const span = [...document.querySelectorAll('span')].find(x => x.offsetParent && /Search by name, member number/.test(x.innerText))
  const r = span.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
})
await p.mouse.click(pos.x, pos.y)
await new Promise(r => setTimeout(r, 1000))
await p.keyboard.type('Testmember', { delay: 50 })
await new Promise(r => setTimeout(r, 2500))
await p.keyboard.press('ArrowDown')
await p.keyboard.press('Enter')
await new Promise(r => setTimeout(r, 1500))
let st = await p.evaluate(() => document.body.innerText.includes('Group: Safaricom PLC'))
console.log('member selected:', st)

// provider: click directly on the box (fixed coords from screenshot)
await p.mouse.click(840, 468)
await new Promise(r => setTimeout(r, 1500))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/6.3g-after-click.png' })
let inputInfo = await p.evaluate(() => [...document.querySelectorAll('input')].filter(x => x.offsetParent).map(x => x.placeholder))
console.log('visible inputs after provider click:', JSON.stringify(inputInfo))
if (inputInfo.length === 0) {
  // try keyboard: Tab from member to provider then Enter
  await p.keyboard.press('Tab')
  await p.keyboard.press('Enter')
  await new Promise(r => setTimeout(r, 1200))
  inputInfo = await p.evaluate(() => [...document.querySelectorAll('input')].filter(x => x.offsetParent).map(x => x.placeholder))
  console.log('after Tab+Enter:', JSON.stringify(inputInfo))
}
if (inputInfo.length) {
  await p.keyboard.type('Avenue', { delay: 50 })
  await new Promise(r => setTimeout(r, 3000))
  await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/6.3g-provider-results.png' })
  await p.keyboard.press('ArrowDown')
  await p.keyboard.press('Enter')
  await new Promise(r => setTimeout(r, 1500))
}
const t0 = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
console.log('step1 state:', t0.slice(t0.indexOf('PROVIDER'), t0.indexOf('PROVIDER') + 150))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/6.3g-step1.png' })

// Next
await p.evaluate(() => { [...document.querySelectorAll('button')].find(x => x.offsetParent && /^next/i.test(x.innerText.trim()))?.click() })
await new Promise(r => setTimeout(r, 2000))
const t = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
const si = t.indexOf('Step 2')
console.log('STEP2:', si >= 0 ? t.slice(si, si + 400) : 'NOT REACHED')
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/6.3g-step2.png' })
await b.close()
console.log('DONE')
