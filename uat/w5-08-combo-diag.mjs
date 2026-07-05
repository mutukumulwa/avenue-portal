import { launch, login, BASE, sleep, shot } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('login →', await login(p, 'medical@medvex.co.ug'))
await p.goto(BASE + '/claims/new', { waitUntil: 'networkidle2' })
await sleep(1800)

// real click on the member trigger
const trigs = await p.$$('button')
for (const h of trigs) {
  const t = (await h.evaluate(el => el.innerText || '')).trim()
  if (/Search by name, member number/i.test(t)) { await h.click(); console.log('clicked member trigger'); break }
}
await sleep(900)
// what appeared?
const dom = await p.evaluate(() => {
  const out = []
  document.querySelectorAll('[data-radix-popper-content-wrapper], [role="dialog"], [role="listbox"], [cmdk-root], [cmdk-list]').forEach(n => out.push('POPUP: ' + n.tagName + ' role=' + n.getAttribute('role') + ' cls=' + String(n.className).slice(0, 80)))
  document.querySelectorAll('input').forEach(i => { if (i.getClientRects().length) out.push('VIS-INPUT: ph=' + i.placeholder + ' focused=' + (document.activeElement === i)) })
  return out
})
console.log(dom.join('\n'))
await p.keyboard.type('Ursula', { delay: 60 })
await sleep(1400)
const opts = await p.evaluate(() => {
  const out = []
  document.querySelectorAll('[role="option"], [cmdk-item], [data-radix-popper-content-wrapper] *').forEach(n => {
    const t = (n.innerText || '').trim()
    if (t && t.length < 120 && n.children.length <= 3 && n.getClientRects().length) out.push(n.tagName + '.' + String(n.className).slice(0, 40) + ' :: ' + t.replace(/\n/g, ' | '))
  })
  return [...new Set(out)].slice(0, 25)
})
console.log('\nOPTIONS AFTER TYPING:\n' + opts.join('\n'))
await shot(p, 'w5-08-combo-open')
await b.close()
console.log('DONE')
