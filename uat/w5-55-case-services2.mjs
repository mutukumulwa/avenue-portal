import { launch, login, BASE, sleep, shot, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('admin →', await login(p, 'admin@medvex.co.ug'))
await p.goto(BASE + '/cases/cmr6fymff001cwmvqa82aes8s', { waitUntil: 'networkidle2' }); await sleep(1600)

// dump every visible input in order with name/placeholder
const dump = await p.evaluate(() => [...document.querySelectorAll('input, select')].filter(x => x.getClientRects().length).map((x, i) => `${i}: ${x.tagName}[${x.type || ''}] name=${x.name} ph="${x.placeholder}" val="${x.value}"`))
console.log(dump.join('\n'))

async function addService(cat, desc, amt) {
  const r = await p.evaluate((cat, desc, amt) => {
    const vis = [...document.querySelectorAll('input, select')].filter(x => x.getClientRects().length)
    const setV = (i, v) => { Object.getOwnPropertyDescriptor(i.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })) }
    const out = []
    for (const x of vis) {
      if (x.type === 'date' && !x.value) { setV(x, '2026-07-04'); out.push('date') }
      else if (x.tagName === 'SELECT' && [...x.options].some(o => o.text === 'CONSULTATION')) { const o = [...x.options].find(o => o.text === cat); setV(x, o.value); out.push('cat=' + cat) }
      else if (x.name === 'description' || /description|service/i.test(x.placeholder)) { setV(x, desc); out.push('desc') }
      else if (x.name === 'quantity' || /qty/i.test(x.name + x.placeholder)) { setV(x, '1'); out.push('qty') }
      else if (x.name === 'unitAmount' || /unit/i.test(x.name + x.placeholder)) { setV(x, String(amt)); out.push('amt=' + x.name) }
    }
    return out.join(',')
  }, cat, desc, amt)
  console.log('filled:', r)
  await sleep(300)
  // click the Add button that sits inside the service form (first "Add" exact)
  await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(b => b.getClientRects().length && b.innerText.trim() === 'Add'); b?.click() })
  await sleep(2200)
  const n = await p.evaluate(() => (document.body.innerText.match(/SERVICE ENTRIES \((\d+)\)/) || [])[1])
  console.log('service entries now:', n)
}
await addService('CONSULTATION', 'GP consultation', 2500)
await addService('PHARMACY', 'Antibiotics dispensed', 1500)
let t = await p.evaluate(() => document.body.innerText)
console.log('\nACCRUED:', (t.match(/ACCRUED[^]*?est\.[^\n]*/) || [])[0]?.replace(/\n+/g, ' '))
await shot(p, 'w5-55-services')
await b.close()
console.log('DONE')
