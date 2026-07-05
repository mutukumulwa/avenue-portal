import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('medical →', await login(p, 'medical@medvex.co.ug'))
await p.goto(BASE + '/claims/new', { waitUntil: 'networkidle2' }); await sleep(1800)

async function clickSmallest(match) {
  const box = await p.evaluate(m => {
    let best = null
    for (const n of document.querySelectorAll('*')) {
      const t = (n.innerText || n.textContent || '').trim()
      if (!t.includes(m)) continue
      const r = n.getBoundingClientRect(); if (!r.width || !r.height) continue
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
console.log(await comboPick('Search by name, member number', 'Peter', 'MVX-2026-00251'))
console.log(await comboPick('Search by name, type or county', 'LifeCare', 'LifeCare Hospitals (UAT)'))
await clickText(p, 'button', 'Next'); await sleep(1400)
await p.evaluate(() => {
  const sels = [...document.querySelectorAll('select')].filter(s => s.getClientRects().length)
  sels[0].value = 'OUTPATIENT'; sels[0].dispatchEvent(new Event('change', { bubbles: true }))
  sels[1].value = 'OUTPATIENT'; sels[1].dispatchEvent(new Event('change', { bubbles: true }))
  const d = [...document.querySelectorAll('input[type="date"]')].find(i => i.getClientRects().length)
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(d, '2026-07-04'); d.dispatchEvent(new Event('input', { bubbles: true })); d.dispatchEvent(new Event('change', { bubbles: true }))
})
await clickText(p, 'button', 'Next'); await sleep(1400)
const di = await p.$('input[placeholder*="ICD" i], input[placeholder*="search" i]')
await di.click(); await p.keyboard.type('J06.9', { delay: 60 }); await sleep(1700)
console.log('diag:', await clickSmallest('J06.9')); await sleep(800)
await clickText(p, 'button', 'Next'); await sleep(1400)
console.log(await clickSmallest('Consultation')); await sleep(900)
await p.evaluate(() => {
  const vis = sel => [...document.querySelectorAll(sel)].filter(x => x.getClientRects().length)
  const setV = (i, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })) }
  setV(vis('input[placeholder*="Type description" i]').at(-1), 'GP review consultation (fix-verify)')
  setV(vis('input[type="number"]').at(-1), '5000')
})
await sleep(600); await p.keyboard.press('Escape'); await sleep(300)
await clickText(p, 'button', 'Submit Claim'); await sleep(3500)
let t = await p.evaluate(() => document.body.innerText)
const claimNo = (t.match(/CLM-2026-\d+/) || [])[0]
console.log('NEW CLAIM:', claimNo, '| row:', (t.match(new RegExp(claimNo + '[^\\n]*')) || [])[0]?.replace(/\t/g, ' '))

// open it
const href = await p.evaluate(no => [...document.querySelectorAll('tbody tr')].find(x => x.innerText.includes(no))?.querySelector('a')?.getAttribute('href'), claimNo)
await p.goto(BASE + href, { waitUntil: 'networkidle2' }); await sleep(2000)
t = await p.evaluate(() => document.body.innerText)
const ei = t.indexOf('Contract engine')
console.log('\n== ENGINE PANEL ==\n', t.slice(ei, ei + 700).replace(/\n+/g, ' | '))
const ai = t.indexOf('Adjudicate Claim')
console.log('\n== ADJUDICATE PANEL HEAD ==\n', t.slice(ai, ai + 160).replace(/\n+/g, ' | '))
await shot(p, 'f1-engine-panel')

// capture + line approve
console.log('\ncapture:', await clickText(p, 'button', 'Captured')); await sleep(2500)
await p.evaluate(() => { [...document.querySelectorAll('button')].filter(x => x.getClientRects().length && x.innerText.trim() === '✓').forEach(x => x.click()) })
await sleep(1200)

// attempt 5,000 (over ceiling 3,600)
async function decide(amount, note) {
  await p.evaluate((amt, nt) => {
    const s = document.querySelector('select[name="action"]'); s.value = 'APPROVED'; s.dispatchEvent(new Event('change', { bubbles: true }))
    const a = document.querySelector('input[name="approvedAmount"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(a, amt); a.dispatchEvent(new Event('input', { bubbles: true }))
    const n = document.querySelector('textarea[name="notes"]'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(n, nt); n.dispatchEvent(new Event('input', { bubbles: true }))
  }, amount, note)
  await sleep(300)
  await clickText(p, 'button', 'Submit Decision'); await sleep(3000)
  return p.evaluate(() => document.body.innerText)
}
t = await decide('5000', 'fix-verify: attempt above case-rate ceiling')
console.log('\nAFTER 5,000 ATTEMPT — status:', (t.match(/(RECEIVED|CAPTURED|APPROVED|UNDER REVIEW)/g) || []).slice(0, 2),
  '\nceiling msgs:', JSON.stringify((t.match(/[^\n]*(ceiling|Contract enforcement)[^\n]*/gi) || []).filter(x => x.length < 250).slice(0, 3)))
await shot(p, 'f1-over-ceiling-blocked')

t = await decide('3600', 'fix-verify: approve at contract case rate')
console.log('\nAFTER 3,600 — status:', (t.match(/(CAPTURED|APPROVED|UNDER REVIEW)/g) || []).slice(0, 3))
console.log('workflow:', (t.match(/Outcome: [^\n]*[\n][^\n]*/) || [])[0]?.replace(/\n/g, ' | '))
await shot(p, 'f1-approved-at-ceiling')
console.log('\nCLAIM:', claimNo)
await b.close()
console.log('DONE')
