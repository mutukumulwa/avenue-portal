import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p2 = await b.newPage()
console.log('medical login →', await login(p2, 'medical@medvex.co.ug'))
await p2.goto(BASE + '/preauth', { waitUntil: 'networkidle2' })
await sleep(1500)
const row = await p2.evaluate(() => {
  const tr = [...document.querySelectorAll('tbody tr')].find(x => /Ursula/.test(x.innerText) && /SUBMITTED/.test(x.innerText))
  return tr ? { no: (tr.innerText.match(/PA-2026-\d+/) || [])[0], href: tr.querySelector('a')?.getAttribute('href') } : null
})
console.log('PA row:', JSON.stringify(row))
await p2.goto(BASE + row.href, { waitUntil: 'networkidle2' }); await sleep(1400)
console.log('stage1:', await clickText(p2, 'button', 'Send for Medical Review')); await sleep(2500)
console.log('decision:', await clickText(p2, 'button', 'Approve (Full)')); await sleep(500)
console.log('submit:', await clickText(p2, 'button', 'Submit Approval')); await sleep(3000)
console.log('PA now:', /APPROVED/.test(await bodyText(p2, 300)) ? 'APPROVED ✓' : 'check!')
await shot(p2, 'w5-16-pa2-approved')

// hold panel should show fresh 85,000 hold (consumed 1,000 from CLM-761)
const pa = await p2.evaluate(() => document.body.innerText)
const hi = pa.indexOf('Benefit Balance & Hold')
console.log('HOLD PANEL:', pa.slice(hi, hi + 350).replace(/\n+/g, ' | '))

// ---------- 86,000 claim ----------
await p2.goto(BASE + '/claims/new', { waitUntil: 'networkidle2' })
await sleep(1800)
const stepNo = () => p2.evaluate(() => (document.body.innerText.match(/Step (\d) —/) || [])[1] || '?')
async function clickSmallest(match) {
  const box = await p2.evaluate(m => {
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
  await p2.mouse.click(box.x, box.y); return 'clicked ' + match
}
async function comboPick(triggerText, query, optionText) {
  if (!(await clickText(p2, 'button', triggerText))) return 'trigger missing'
  await sleep(800); await p2.keyboard.type(query, { delay: 50 }); await sleep(1400)
  const r = await clickSmallest(optionText); await sleep(800); return r
}
console.log(await comboPick('Search by name, member number', 'Ursula', 'MVX-2026-00250'))
console.log(await comboPick('Search by name, type or county', 'LifeCare', 'LifeCare Hospitals (UAT)'))
await clickText(p2, 'button', 'Next'); await sleep(1400)
console.log('step', await stepNo(), await p2.evaluate(() => {
  const sels = [...document.querySelectorAll('select')].filter(s => s.getClientRects().length)
  sels[0].value = 'DAY_CASE'; sels[0].dispatchEvent(new Event('change', { bubbles: true }))
  sels[1].value = 'INPATIENT'; sels[1].dispatchEvent(new Event('change', { bubbles: true }))
  const d = [...document.querySelectorAll('input[type="date"]')].find(i => i.getClientRects().length)
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(d, '2026-07-04'); d.dispatchEvent(new Event('input', { bubbles: true })); d.dispatchEvent(new Event('change', { bubbles: true }))
  return '→ DAY_CASE/INPATIENT/2026-07-04'
}))
await clickText(p2, 'button', 'Next'); await sleep(1400)
const di = await p2.$('input[placeholder*="ICD" i], input[placeholder*="diagnos" i], input[placeholder*="search" i]')
await di.click(); await p2.keyboard.type('K42.9', { delay: 60 }); await sleep(1700)
console.log('diag:', await clickSmallest('Umbilical hernia without obstruction')); await sleep(800)
await clickText(p2, 'button', 'Next'); await sleep(1400)
console.log('step', await stepNo())
console.log(await clickSmallest('Procedure')); await sleep(900)
console.log(await p2.evaluate(() => {
  const vis = sel => [...document.querySelectorAll(sel)].filter(x => x.getClientRects().length)
  const setV = (i, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })) }
  setV(vis('input[placeholder*="Type description" i]').at(-1), 'Umbilical hernia repair (day case)')
  setV(vis('input[type="number"]').at(-1), '86000')
  return 'line filled 86000'
}))
await sleep(800); await p2.keyboard.press('Escape'); await sleep(400)
console.log('TOTAL:', await p2.evaluate(() => (document.body.innerText.match(/TOTAL BILLED AMOUNT[^]*?KES [\d,]+/) || [])[0]?.replace(/\s+/g, ' ')))
await shot(p2, 'w5-16-step4-86k')
await clickText(p2, 'button', 'Submit Claim')
await sleep(3500)
console.log('URL:', p2.url())
const after = await p2.evaluate(() => document.body.innerText)
const seg = after.slice(after.indexOf('Claim No'), after.indexOf('Claim No') + 420)
console.log('LIST TOP:', seg.replace(/\n+/g, ' | '))
await shot(p2, 'w5-16-claim86k-submitted')
await b.close()
console.log('DONE')
