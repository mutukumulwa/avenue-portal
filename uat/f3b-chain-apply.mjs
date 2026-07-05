import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()

// 0) cleanup: decline CLM-2026-00768 (frees PA-2026-00013 back to APPROVED)
const p0 = await b.newPage()
console.log('medical →', await login(p0, 'medical@medvex.co.ug'))
await p0.goto(BASE + '/claims/cmr6oxdwx000t66vqcim5x90u', { waitUntil: 'networkidle2' }); await sleep(1600)
await p0.evaluate(() => {
  const s = document.querySelector('select[name="action"]'); if (s) { s.value = 'DECLINED'; s.dispatchEvent(new Event('change', { bubbles: true })) }
  const n = document.querySelector('textarea[name="notes"]'); if (n) { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(n, 'fix-verify cleanup: wrong-provider PA attach exhibit'); n.dispatchEvent(new Event('input', { bubbles: true })) }
  const d = document.querySelector('textarea[name="declineNotes"]'); if (d) { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(d, 'Declined: PA belonged to another facility (pre-fix exhibit)'); d.dispatchEvent(new Event('input', { bubbles: true })) }
})
await clickText(p0, 'button', 'Submit Decision'); await sleep(2500)
console.log('768:', ((await bodyText(p0, 300)).match(/(DECLINED|CAPTURED|APPROVED)/) || [])[1])

// 1) admin: PA Ursula @ Nairobi Hospital INPATIENT est 300,000 (UGX scheme rule)
const p = await b.newPage()
console.log('admin →', await login(p, 'admin@medvex.co.ug'))
await p.goto(BASE + '/preauth/new', { waitUntil: 'networkidle2' }); await sleep(1200)
await p.evaluate(() => {
  const sel = (name, matcher) => { const s = document.querySelector(`select[name="${name}"]`); const o = [...s.options].find(o => matcher.test(o.text)); s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })) }
  const set = (name, v) => { const i = document.querySelector(`[name="${name}"]`); const proto = i.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })) }
  sel('memberId', /Ursula/i); sel('providerId', /Nairobi Hospital/i); sel('serviceType', /Inpatient/i); sel('benefitCategory', /^Inpatient/i)
  set('expectedDateOfService', '2026-07-04'); set('estimatedCost', '300000')
  set('diagnosis', 'Acute condition — admission'); set('procedure', 'Inpatient admission - 2 nights')
  set('clinicalNotes', 'fix-verify PR-025: dual-approval auto-apply at 250,000; partial consumption leaves 50,000 reserved')
})
await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => null), clickText(p, 'button', 'Submit Pre-Authorization')])
await sleep(2000)

// 2) medical approves the new PA
const p2 = await b.newPage()
console.log('medical →', await login(p2, 'medical@medvex.co.ug'))
await p2.goto(BASE + '/preauth', { waitUntil: 'networkidle2' }); await sleep(1400)
const row = await p2.evaluate(() => {
  const tr = [...document.querySelectorAll('tbody tr')].find(x => /Nairobi Hospital/.test(x.innerText) && /SUBMITTED/.test(x.innerText) && /300,000/.test(x.innerText))
  return tr ? { no: (tr.innerText.match(/PA-2026-\d+/) || [])[0], href: tr.querySelector('a')?.getAttribute('href') } : null
})
console.log('PA:', JSON.stringify(row))
await p2.goto(BASE + row.href, { waitUntil: 'networkidle2' }); await sleep(1400)
const s1 = await clickText(p2, 'button', 'Send for Medical Review'); if (s1) await sleep(2500)
await clickText(p2, 'button', 'Approve (Full)'); await sleep(500)
await clickText(p2, 'button', 'Submit Approval'); await sleep(3000)

// 3) claim: Ursula @ Nairobi Hospital INPATIENT 250,000
await p2.goto(BASE + '/claims/new', { waitUntil: 'networkidle2' }); await sleep(1800)
async function clickSmallest(match) {
  const box = await p2.evaluate(m => {
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
  await p2.mouse.click(box.x, box.y); return 'clicked ' + match
}
async function comboPick(triggerText, query, optionText) {
  if (!(await clickText(p2, 'button', triggerText))) return 'trigger missing'
  await sleep(800); await p2.keyboard.type(query, { delay: 50 }); await sleep(1400)
  const r = await clickSmallest(optionText); await sleep(800); return r
}
console.log(await comboPick('Search by name, member number', 'Ursula', 'MVX-2026-00250'))
console.log(await comboPick('Search by name, type or county', 'Nairobi Hospital', 'Nairobi Hospital'))
await clickText(p2, 'button', 'Next'); await sleep(1400)
await p2.evaluate(() => {
  const sels = [...document.querySelectorAll('select')].filter(s => s.getClientRects().length)
  sels[0].value = 'INPATIENT'; sels[0].dispatchEvent(new Event('change', { bubbles: true }))
  sels[1].value = 'INPATIENT'; sels[1].dispatchEvent(new Event('change', { bubbles: true }))
  const d = [...document.querySelectorAll('input[type="date"]')].find(i => i.getClientRects().length)
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(d, '2026-07-04'); d.dispatchEvent(new Event('input', { bubbles: true })); d.dispatchEvent(new Event('change', { bubbles: true }))
})
await clickText(p2, 'button', 'Next'); await sleep(1400)
const di = await p2.$('input[placeholder*="ICD" i], input[placeholder*="search" i]')
await di.click(); await p2.keyboard.type('J06.9', { delay: 60 }); await sleep(1700)
console.log('diag:', await clickSmallest('J06.9')); await sleep(800)
await clickText(p2, 'button', 'Next'); await sleep(1400)
console.log(await clickSmallest('Consultation')); await sleep(900)
await p2.evaluate(() => {
  const vis = sel => [...document.querySelectorAll(sel)].filter(x => x.getClientRects().length)
  const setV = (i, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })) }
  setV(vis('input[placeholder*="Type description" i]').at(-1), 'Inpatient admission - 2 nights')
  setV(vis('input[type="number"]').at(-1), '250000')
})
await sleep(600); await p2.keyboard.press('Escape'); await sleep(300)
await clickText(p2, 'button', 'Submit Claim'); await sleep(3500)
let t = await p2.evaluate(() => document.body.innerText)
const claimNo = (t.match(/CLM-2026-\d+/) || [])[0]
console.log('NEW CLAIM:', claimNo)
const href = await p2.evaluate(no => [...document.querySelectorAll('tbody tr')].find(x => x.innerText.includes(no))?.querySelector('a')?.getAttribute('href'), claimNo)

// PA attached must be the NAIROBI one (provider-scoped attach fix)
await p2.goto(BASE + href, { waitUntil: 'networkidle2' }); await sleep(1800)
t = await p2.evaluate(() => document.body.innerText)
console.log('ATTACHED PA:', (t.match(/PA-2026-\d+[^\n]*/) || [])[0]?.replace(/\t/g, ' '), '| cover:', (t.match(/([\d,]+) cover/) || [])[1])

// 4) capture + decide 250,000 → dual chain
console.log('capture:', await clickText(p2, 'button', 'Captured')); await sleep(2500)
await p2.evaluate(() => { [...document.querySelectorAll('button')].filter(x => x.getClientRects().length && x.innerText.trim() === '✓').forEach(x => x.click()) })
await sleep(1000)
await p2.evaluate(() => {
  const s = document.querySelector('select[name="action"]'); s.value = 'APPROVED'; s.dispatchEvent(new Event('change', { bubbles: true }))
  const a = document.querySelector('input[name="approvedAmount"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(a, '250000'); a.dispatchEvent(new Event('input', { bubbles: true }))
  const n = document.querySelector('textarea[name="notes"]'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(n, 'fix-verify PR-025 dual chain @250,000'); n.dispatchEvent(new Event('input', { bubbles: true }))
})
await clickText(p2, 'button', 'Submit Decision'); await sleep(3000)
t = await p2.evaluate(() => document.body.innerText)
console.log('\nROUTING:', JSON.stringify((t.match(/[^\n]*(2-level|apply automatically|already in progress)[^\n]*/gi) || []).slice(0, 2)))

// duplicate submit → refused
await p2.reload({ waitUntil: 'networkidle2' }); await sleep(1500)
await p2.evaluate(() => {
  const s = document.querySelector('select[name="action"]'); if (s) { s.value = 'APPROVED'; s.dispatchEvent(new Event('change', { bubbles: true })) }
  const a = document.querySelector('input[name="approvedAmount"]'); if (a) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(a, '250000'); a.dispatchEvent(new Event('input', { bubbles: true })) }
  const n = document.querySelector('textarea[name="notes"]'); if (n) { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(n, 'dup'); n.dispatchEvent(new Event('input', { bubbles: true })) }
})
await clickText(p2, 'button', 'Submit Decision'); await sleep(2500)
t = await p2.evaluate(() => document.body.innerText)
console.log('DUP GUARD:', JSON.stringify((t.match(/[^\n]*already in progress[^\n]*/i) || ['(none)'])[0]).slice(0, 180))

// 5) UW L1 (pick the row for this claim), admin L2
const p3 = await b.newPage()
console.log('\nuw →', await login(p3, 'underwriter@medvex.co.ug'))
await p3.goto(BASE + '/approvals', { waitUntil: 'networkidle2' }); await sleep(1500)
console.log('queue:', (await bodyText(p3, 700)).slice(200, 650).replace(/\n+/g, ' | '))
console.log('L1:', await clickText(p3, 'button', 'Approve L1')); await sleep(2500)
const p4 = await b.newPage()
console.log('admin →', await login(p4, 'admin@medvex.co.ug'))
await p4.goto(BASE + '/approvals', { waitUntil: 'networkidle2' }); await sleep(1500)
console.log('L2:', await clickText(p4, 'button', 'Approve L2')); await sleep(3500)

// 6) claim must be APPROVED automatically
await p4.goto(BASE + href, { waitUntil: 'networkidle2' }); await sleep(1800)
t = await p4.evaluate(() => document.body.innerText)
console.log('\n== CLAIM AFTER CHAIN ==\nSTATUS:', (t.match(/(APPROVED|CAPTURED|UNDER REVIEW|DECLINED)/g) || []).slice(0, 3))
console.log('APPROVED AMT:', (t.match(/Approved\s*\n\s*(UGX|KES) ([\d,]+)/) || []).slice(1, 3).join(' '))
const ti = t.indexOf('ADJUDICATION TIMELINE')
console.log('TIMELINE HEAD:', t.slice(ti, ti + 300).replace(/\n+/g, ' | '))
await shot(p4, 'f3b-claim-auto-applied')

// 7) PR-022: PA partial — 250,000 of 300,000 consumed, 50,000 still held
await p4.goto(BASE + row.href, { waitUntil: 'networkidle2' }); await sleep(1500)
t = await p4.evaluate(() => document.body.innerText)
const hi = t.indexOf('Benefit Balance & Hold')
console.log('\nPA HOLD PANEL:', t.slice(hi, hi + 400).replace(/\n+/g, ' | '))
console.log('PA STATUS:', (t.match(/Review and decide[\s\S]*?(APPROVED|UTILISED|ATTACHED)/) || [])[1])
await shot(p4, 'f3b-pa-partial')
await b.close()
console.log('DONE —', claimNo)
