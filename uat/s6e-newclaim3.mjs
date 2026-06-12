import { launch, login, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')
await p.goto(BASE + '/claims/new', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 3000))

// real mouse click on the member search box
const pos = await p.evaluate(() => {
  const span = [...document.querySelectorAll('span')].find(x => x.offsetParent && /Search by name, member number/.test(x.innerText))
  const r = span.getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
})
await p.mouse.click(pos.x, pos.y)
await new Promise(r => setTimeout(r, 1200))
const counts = await p.evaluate(() => ({ inputs: [...document.querySelectorAll('input')].map(i => ({ ph: i.placeholder, vis: !!i.offsetParent })) }))
console.log('after click:', JSON.stringify(counts))
if (counts.inputs.length) {
  await p.keyboard.type('Testmember', { delay: 50 })
  await new Promise(r => setTimeout(r, 3000))
  await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/6.3c-results.png' })
  const t = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 700))
  console.log('PAGE:', t)
  // click first result containing Testmember
  const ok = await p.evaluate(() => {
    const cands = [...document.querySelectorAll('*')].filter(x => x.offsetParent && x.children.length <= 2 && /Testmember/i.test(x.innerText || '') && (x.innerText || '').length < 100)
    const el = cands.sort((a, b) => a.innerText.length - b.innerText.length)[0]
    if (el) { (el.closest('button') || el.closest('li') || el).click(); return el.innerText.slice(0, 60) }
    return null
  })
  console.log('picked:', ok)
  await new Promise(r => setTimeout(r, 1500))
  await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/6.3c-member-picked.png' })
}
await b.close()
console.log('DONE')
