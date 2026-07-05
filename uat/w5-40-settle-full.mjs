import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('finance →', await login(p, 'finance@medvex.co.ug'))
await p.goto(BASE + '/settlement', { waitUntil: 'networkidle2' }); await sleep(1600)

// create batch: LifeCare + July
console.log(await p.evaluate(() => {
  const sels = [...document.querySelectorAll('select')].filter(s => s.getClientRects().length)
  const prov = sels.find(s => [...s.options].some(o => /LifeCare/.test(o.text)))
  const po = [...prov.options].find(o => /LifeCare/.test(o.text)); prov.value = po.value; prov.dispatchEvent(new Event('change', { bubbles: true }))
  const mon = sels.find(s => [...s.options].some(o => /July/.test(o.text)))
  if (mon && mon !== prov) { const mo = [...mon.options].find(o => /July/.test(o.text)); mon.value = mo.value; mon.dispatchEvent(new Event('change', { bubbles: true })) }
  return 'selected LifeCare + July'
}))
await sleep(400)
console.log('create:', await clickText(p, 'button', 'Create Batch')); await sleep(3000)
let t = await p.evaluate(() => document.body.innerText)
console.log('\nAFTER CREATE:\n', t.slice(t.indexOf('All ('), t.indexOf('All (') + 700).replace(/\n{2,}/g, '\n'))
console.log('MSGS:', JSON.stringify((t.match(/[^\n]*(no approved|nothing|error|already|created)[^\n]*/gi) || []).filter(x => x.length < 160).slice(0, 5)))
await shot(p, 'w5-40-batch-created')

// open the new batch (MAKER SUBMITTED)
const bhref = await p.evaluate(() => {
  const tr = [...document.querySelectorAll('tbody tr')].find(x => /MAKER SUBMITTED/.test(x.innerText))
  return tr?.querySelector('a')?.getAttribute('href')
})
console.log('\nbatch href:', bhref)
if (bhref) {
  await p.goto(BASE + bhref, { waitUntil: 'networkidle2' }); await sleep(1800)
  t = await p.evaluate(() => document.body.innerText)
  console.log('== BATCH DETAIL ==\n', t.slice(200, 1600).replace(/\n{2,}/g, '\n'))
  await shot(p, 'w5-40-batch-detail')
  // maker self-approve attempt
  const ap = await clickText(p, 'button', 'Approve')
  console.log('\nmaker self-approve click:', ap); await sleep(2500)
  t = await p.evaluate(() => document.body.innerText)
  console.log('SELF-APPROVE MSGS:', JSON.stringify((t.match(/[^\n]*(maker|checker|different|cannot|denied)[^\n]*/gi) || []).filter(x => x.length < 180).slice(0, 5)))
  console.log('BATCH STATUS:', (t.match(/(MAKER SUBMITTED|CHECKER APPROVED|SETTLED)/) || [])[1])
  await shot(p, 'w5-40-self-approve')
}
await b.close()
console.log('DONE — checker step next')
