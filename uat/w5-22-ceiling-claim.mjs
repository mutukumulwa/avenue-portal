import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('login →', await login(p, 'medical@medvex.co.ug'))
await p.goto(BASE + '/claims/new', { waitUntil: 'networkidle2' })
await sleep(1800)
const stepNo = () => p.evaluate(() => (document.body.innerText.match(/Step (\d) —/) || [])[1] || '?')
async function clickSmallest(match) {
  const box = await p.evaluate(m => {
    let best = null
    for (const n of document.querySelectorAll('*')) {
      const t = (n.innerText || n.textContent || '').trim()
      if (!t.includes(m)) continue
      const r = n.getBoundingClientRect()
      if (!r.width || !r.height) continue
      const area = r.width * r.height
      if (!best || area < best.area) best = { area, x: r.x + r.width / 2, y: r.y + r.height / 2 }
    }
    return best
  }, match)
  if (!box) return 'not-found: ' + match
  await p.mouse.click(box.x, box.y); return 'clicked ' + match
}
async function comboPick(triggerText, query, optionText) {
  if (!(await clickText(p, 'button', triggerText))) return 'trigger missing'
  await sleep(800); await p.keyboard.type(query, { delay: 50 }); await sleep(1400)
  const r = await clickSmallest(optionText); await sleep(800); return r
}
// Peter UAT-Principal2 MVX-2026-00251, LifeCare, DAY_CASE / SURGICAL
console.log(await comboPick('Search by name, member number', 'Peter', 'MVX-2026-00251'))
console.log(await comboPick('Search by name, type or county', 'LifeCare', 'LifeCare Hospitals (UAT)'))
await clickText(p, 'button', 'Next'); await sleep(1400)
console.log('step', await stepNo(), await p.evaluate(() => {
  const sels = [...document.querySelectorAll('select')].filter(s => s.getClientRects().length)
  sels[0].value = 'DAY_CASE'; sels[0].dispatchEvent(new Event('change', { bubbles: true }))
  sels[1].value = 'SURGICAL'; sels[1].dispatchEvent(new Event('change', { bubbles: true }))
  const d = [...document.querySelectorAll('input[type="date"]')].find(i => i.getClientRects().length)
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(d, '2026-07-04'); d.dispatchEvent(new Event('input', { bubbles: true })); d.dispatchEvent(new Event('change', { bubbles: true }))
  return '→ DAY_CASE/SURGICAL/2026-07-04'
}))
await clickText(p, 'button', 'Next'); await sleep(1400)
const di = await p.$('input[placeholder*="ICD" i], input[placeholder*="diagnos" i], input[placeholder*="search" i]')
await di.click(); await p.keyboard.type('K42.9', { delay: 60 }); await sleep(1700)
console.log('diag:', await clickSmallest('Umbilical hernia without obstruction')); await sleep(800)
await clickText(p, 'button', 'Next'); await sleep(1400)
console.log('step', await stepNo())
console.log(await clickSmallest('Procedure')); await sleep(900)
console.log(await p.evaluate(() => {
  const vis = sel => [...document.querySelectorAll(sel)].filter(x => x.getClientRects().length)
  const setV = (i, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })) }
  setV(vis('input[placeholder*="Type description" i]').at(-1), 'Umbilical hernia repair (day case)')
  setV(vis('input[type="number"]').at(-1), '86000')
  return 'line filled 86000'
}))
await sleep(800); await p.keyboard.press('Escape'); await sleep(400)
console.log('TOTAL:', await p.evaluate(() => (document.body.innerText.match(/TOTAL BILLED AMOUNT[^]*?KES [\d,]+/) || [])[0]?.replace(/\s+/g, ' ')))
await clickText(p, 'button', 'Submit Claim')
await sleep(3500)
const after = await p.evaluate(() => document.body.innerText)
const row = (after.match(/CLM-2026-\d+[^\n]*[\n\t]+[^\n]*Peter[^]*?(RECEIVED|APPROVED|CAPTURED)/) || [])[0]
console.log('URL:', p.url())
console.log('NEW CLAIM ROW:', (after.slice(after.indexOf('Claim No'), after.indexOf('Claim No') + 300)).replace(/\n+/g, ' | '))
await shot(p, 'w5-22-ceiling-claim-submitted')
await b.close()
console.log('DONE')
