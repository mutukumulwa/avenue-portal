import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('admin →', await login(p, 'admin@medvex.co.ug'))
await p.goto(BASE + '/cases', { waitUntil: 'networkidle2' }); await sleep(1500)
const ch = await p.evaluate(() => {
  const a = [...document.querySelectorAll('a')].find(a => /CASE-2026-00001/.test(a.innerText) || /cases\/cmr/.test(a.getAttribute('href') || ''))
  return a?.getAttribute('href')
})
console.log('case href:', ch)
await p.goto(BASE + ch, { waitUntil: 'networkidle2' }); await sleep(1600)

// add service entry helper
async function addService(cat, desc, amt) {
  const r = await p.evaluate((cat, desc, amt) => {
    const setV = (i, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })) }
    const vis = sel => [...document.querySelectorAll(sel)].filter(x => x.getClientRects().length)
    const dateI = vis('input[type="date"]')[0]; if (dateI) setV(dateI, '2026-07-04')
    const catS = vis('select').find(s => [...s.options].some(o => /CONSULTATION/.test(o.text))); if (catS) { catS.value = [...catS.options].find(o => o.text.includes(cat)).value; catS.dispatchEvent(new Event('change', { bubbles: true })) }
    const descI = vis('input').find(i => /description/i.test(i.placeholder) || i.name === 'description') || vis('input[type="text"]')[0]
    if (descI) setV(descI, desc)
    const amtI = vis('input[type="number"]').at(-1); if (amtI) setV(amtI, String(amt))
    return `date=${!!dateI} cat=${!!catS} desc=${descI?.placeholder || descI?.name} amt=${!!amtI}`
  }, cat, desc, amt)
  console.log('fill:', r)
  await clickText(p, 'button', 'Add'); await sleep(2000)
}
await addService('CONSULTATION', 'GP consultation', 2500)
await addService('PHARMACY', 'Antibiotics dispensed', 1500)
let t = await p.evaluate(() => document.body.innerText)
console.log('\nSERVICES NOW:', (t.match(/SERVICE ENTRIES \(\d+\)[^]*?(?=PRE-AUTH)/) || [])[0]?.replace(/\n+/g, ' | ').slice(0, 500))
console.log('ACCRUED:', (t.match(/ACCRUED[^\n]*\n[^\n]*/) || [])[0]?.replace(/\n/g, ' '))
await shot(p, 'w5-54-services-added')

// issue LOU: ceiling 4000, 7 days
console.log(await p.evaluate(() => {
  const vis = sel => [...document.querySelectorAll(sel)].filter(x => x.getClientRects().length)
  const setV = (i, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })) }
  const nums = vis('input[type="number"]')
  const lou = nums.find(i => /ceiling|amount/i.test(i.placeholder + (i.name || ''))) || nums.at(-2)
  const days = nums.at(-1)
  if (lou) setV(lou, '4000'); if (days) setV(days, '7')
  return 'LOU inputs set'
}))
console.log('issue LOU:', await clickText(p, 'button', 'Issue')); await sleep(2200)
t = await p.evaluate(() => document.body.innerText)
console.log('LOU SECTION:', (t.match(/LETTERS OF UNDERTAKING[^]*?(?=Close|Cancel)/) || [])[0]?.replace(/\n+/g, ' | ').slice(0, 400))

// close & file
console.log('\nclose:', await clickText(p, 'button', 'Close & file claim')); await sleep(3500)
console.log('URL:', p.url())
t = await p.evaluate(() => document.body.innerText)
console.log('AFTER CLOSE:', t.slice(200, 1100).replace(/\n{2,}/g, '\n'))
await shot(p, 'w5-54-case-closed')
await b.close()
console.log('DONE')
