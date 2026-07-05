import { launch, login, BASE, sleep, shot, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('admin →', await login(p, 'admin@medvex.co.ug'))
await p.goto(BASE + '/providers/cmr6fpc4i0017wmvq5gxcppyz', { waitUntil: 'networkidle2' }); await sleep(1600)

// fill activation reason then Activate
console.log(await p.evaluate(() => {
  const r = [...document.querySelectorAll('input')].find(i => /Activation reason/i.test(i.placeholder))
  if (!r) return 'no reason input visible'
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(r, 'W5 re-test: activating provider after registration (PR-006 verification)')
  r.dispatchEvent(new Event('input', { bubbles: true }))
  return 'reason filled'
}))
await sleep(300)
console.log('activate:', await clickText(p, 'button', 'Activate')); await sleep(2500)
let t = await p.evaluate(() => document.body.innerText)
console.log('STATUS NOW:', (t.match(/(PENDING|ACTIVE|INACTIVE)/) || [])[1])
console.log('errors:', JSON.stringify((t.match(/[^\n]*(reason|required|error)[^\n]*/gi) || []).filter(x => x.length < 120).slice(0, 3)))

// branch: fill name + code + county, then submit via the form's submit button
console.log('\nopen add branch:', await clickText(p, 'button', 'Add branch')); await sleep(900)
console.log(await p.evaluate(() => {
  const setV = (i, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })) }
  const vis = [...document.querySelectorAll('input')].filter(i => i.getClientRects().length)
  const name = vis.find(i => /Branch name/i.test(i.placeholder)); if (name) setV(name, 'Westlands Annex')
  const code = vis.find(i => /^Code$/i.test(i.placeholder)); if (code) setV(code, 'WLA')
  const county = vis.find(i => /County/i.test(i.placeholder) && !i.value); if (county) setV(county, 'Nairobi')
  return `filled: name=${!!name} code=${!!code} county=${!!county}`
}))
await sleep(300)
// find a save/confirm button that is INSIDE/near the branch form (not the toggle)
console.log('save:', await p.evaluate(() => {
  const bs = [...document.querySelectorAll('button')].filter(x => x.getClientRects().length)
  const save = bs.find(x => /^(Save|Save branch|Add|Create|Confirm|✓)$/i.test(x.innerText.trim()))
  if (save) { save.click(); return 'clicked: ' + save.innerText.trim() }
  const brs = bs.filter(x => /branch/i.test(x.innerText)); const last = brs.at(-1)
  if (last) { last.click(); return 'clicked last branch btn: ' + last.innerText.trim() }
  return 'none'
}))
await sleep(2500)
t = await p.evaluate(() => document.body.innerText)
const bi = t.indexOf('Branches')
console.log('BRANCHES NOW:', t.slice(bi, bi + 260).replace(/\n+/g, ' | '))
await shot(p, 'w5-50-activate-branch')
await b.close()
console.log('DONE')
