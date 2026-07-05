import { launch, login, BASE, sleep, shot, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('admin →', await login(p, 'admin@medvex.co.ug'))
await p.goto(BASE + '/cases/cmr6fymff001cwmvqa82aes8s', { waitUntil: 'networkidle2' }); await sleep(1600)

// LOU
console.log(await p.evaluate(() => {
  const setV = (n, v) => { const i = document.querySelector(`input[name="${n}"]`); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })) }
  setV('amountCeiling', '4000'); setV('validityDays', '7'); return 'LOU fields set'
}))
console.log('issue:', await clickText(p, 'button', 'Issue')); await sleep(2500)
let t = await p.evaluate(() => document.body.innerText)
console.log('LOU:', (t.match(/LETTERS OF UNDERTAKING[^]*?(?=Close|Cancel)/) || [])[0]?.replace(/\n+/g, ' | ').slice(0, 350))
await shot(p, 'w5-56-lou')

// close & file
console.log('\nclose:', await clickText(p, 'button', 'Close & file claim')); await sleep(3500)
console.log('URL:', p.url())
t = await p.evaluate(() => document.body.innerText)
console.log('AFTER:', t.slice(200, 1300).replace(/\n{2,}/g, '\n'))
await shot(p, 'w5-56-closed')

// claims list top — new case claim?
await p.goto(BASE + '/claims', { waitUntil: 'networkidle2' }); await sleep(1600)
const rows = await p.evaluate(() => [...document.querySelectorAll('tbody tr')].map(r => r.innerText.replace(/\s+/g, ' ')).slice(0, 3))
console.log('\nTOP CLAIMS:', JSON.stringify(rows, null, 1))
await b.close()
console.log('DONE')
