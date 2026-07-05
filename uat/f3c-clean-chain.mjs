import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()

// 0) cancel lingering APPROVED unattached PAs at Nairobi so the wizard attaches
//    the right one; reject any pending approval requests.
const admin = await b.newPage()
console.log('admin →', await login(admin, 'admin@medvex.co.ug'))
await admin.goto(BASE + '/preauth', { waitUntil: 'networkidle2' }); await sleep(1400)
const stale = await admin.evaluate(() =>
  [...document.querySelectorAll('tbody tr')]
    .filter(x => /Nairobi Hospital/.test(x.innerText) && /APPROVED/.test(x.innerText))
    .map(x => x.querySelector('a')?.getAttribute('href')).filter(Boolean));
console.log('stale APPROVED PAs at Nairobi:', stale.length)
for (const href of stale) {
  await admin.goto(BASE + href, { waitUntil: 'networkidle2' }); await sleep(1000)
  const c = await clickText(admin, 'button', 'Cancel PA')
  if (c) { await sleep(1500); // may need a confirm reason input
    await admin.evaluate(() => { const i = document.querySelector('input[name="reason"]'); if (i) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'fix-verify cleanup'); i.dispatchEvent(new Event('input', { bubbles: true })) } })
    await clickText(admin, 'button', 'Confirm') || await clickText(admin, 'button', 'Cancel PA'); await sleep(1500)
  }
}

const uw = await b.newPage()
await login(uw, 'underwriter@medvex.co.ug')
await uw.goto(BASE + '/approvals', { waitUntil: 'networkidle2' }); await sleep(1200)
for (let i = 0; i < 6; i++) { if (!(await clickText(uw, 'button', 'Reject'))) break; await sleep(1800) }
console.log('approvals cleared:', (await bodyText(uw, 300)).includes('No approvals awaiting'))

// 1) fresh PA @ 300,000
await admin.goto(BASE + "/preauth/new", { waitUntil: "networkidle2" }); await admin.waitForSelector("select[name=memberId]", { timeout: 15000 }); await sleep(800)
await admin.evaluate(() => {
  const sel = (name, m) => { const s = document.querySelector(`select[name="${name}"]`); const o = [...s.options].find(o => m.test(o.text)); s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })) }
  const set = (name, v) => { const i = document.querySelector(`[name="${name}"]`); const proto = i.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })) }
  sel('memberId', /Ursula/i); sel('providerId', /Nairobi Hospital/i); sel('serviceType', /Inpatient/i); sel('benefitCategory', /^Inpatient/i)
  set('expectedDateOfService', '2026-07-04'); set('estimatedCost', '300000')
  set('diagnosis', 'Admission'); set('procedure', 'Inpatient 2 nights')
  set('clinicalNotes', 'clean PR-025 chain: 250k claim ≤ 300k cover (no over-cover), dual band')
})
await Promise.all([admin.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => null), clickText(admin, 'button', 'Submit Pre-Authorization')])
await sleep(2000)

const med = await b.newPage()
console.log('medical →', await login(med, 'medical@medvex.co.ug'))
await med.goto(BASE + '/preauth', { waitUntil: 'networkidle2' }); await sleep(1400)
const paHref = await med.evaluate(() => [...document.querySelectorAll('tbody tr')].find(x => /Nairobi Hospital/.test(x.innerText) && /SUBMITTED/.test(x.innerText) && /300,000/.test(x.innerText))?.querySelector('a')?.getAttribute('href'))
await med.goto(BASE + paHref, { waitUntil: 'networkidle2' }); await sleep(1400)
const s1 = await clickText(med, 'button', 'Send for Medical Review'); if (s1) await sleep(2500)
await clickText(med, 'button', 'Approve (Full)'); await sleep(500)
await clickText(med, 'button', 'Submit Approval'); await sleep(3000)
console.log('PA approved')

// 2) claim 250,000 (fraud eval OFF-hours may flag — resolve if so)
await med.goto(BASE + '/claims/new', { waitUntil: 'networkidle2' }); await sleep(1800)
async function clickSmallest(pg, match) {
  const box = await pg.evaluate(m => { let best = null; for (const n of document.querySelectorAll('*')) { const t = (n.innerText || n.textContent || '').trim(); if (!t.includes(m)) continue; const r = n.getBoundingClientRect(); if (!r.width || !r.height) continue; const a = r.width * r.height; if (!best || a < best.area) best = { area: a, x: r.x + r.width / 2, y: r.y + r.height / 2 } } return best }, match)
  if (!box) return 'nf:' + match; await pg.mouse.click(box.x, box.y); return 'clicked ' + match
}
async function combo(t2, q, o) { if (!(await clickText(med, 'button', t2))) return 'no trig'; await sleep(800); await med.keyboard.type(q, { delay: 50 }); await sleep(1400); const r = await clickSmallest(med, o); await sleep(800); return r }
console.log(await combo('Search by name, member number', 'Ursula', 'MVX-2026-00250'))
console.log(await combo('Search by name, type or county', 'Nairobi Hospital', 'Nairobi Hospital'))
await clickText(med, 'button', 'Next'); await sleep(1400)
await med.evaluate(() => {
  const sels = [...document.querySelectorAll('select')].filter(s => s.getClientRects().length)
  sels[0].value = 'INPATIENT'; sels[0].dispatchEvent(new Event('change', { bubbles: true }))
  sels[1].value = 'INPATIENT'; sels[1].dispatchEvent(new Event('change', { bubbles: true }))
  const d = [...document.querySelectorAll('input[type="date"]')].find(i => i.getClientRects().length)
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(d, '2026-07-04'); d.dispatchEvent(new Event('input', { bubbles: true })); d.dispatchEvent(new Event('change', { bubbles: true }))
})
await clickText(med, 'button', 'Next'); await sleep(1400)
const di = await med.$('input[placeholder*="ICD" i], input[placeholder*="search" i]')
await di.click(); await med.keyboard.type('J06.9', { delay: 60 }); await sleep(1700)
await clickSmallest(med, 'J06.9'); await sleep(800)
await clickText(med, 'button', 'Next'); await sleep(1400)
await clickSmallest(med, 'Consultation'); await sleep(900)
await med.evaluate(() => {
  const vis = sel => [...document.querySelectorAll(sel)].filter(x => x.getClientRects().length)
  const setV = (i, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })) }
  setV(vis('input[placeholder*="Type description" i]').at(-1), 'Inpatient 2 nights')
  setV(vis('input[type="number"]').at(-1), '250000')
})
await sleep(600); await med.keyboard.press('Escape'); await sleep(300)
await clickText(med, 'button', 'Submit Claim'); await sleep(3500)
let t = await med.evaluate(() => document.body.innerText)
const claimNo = (t.match(/CLM-2026-\d+/) || [])[0]
const href = await med.evaluate(no => [...document.querySelectorAll('tbody tr')].find(x => x.innerText.includes(no))?.querySelector('a')?.getAttribute('href'), claimNo)
console.log('CLAIM:', claimNo)
await med.goto(BASE + href, { waitUntil: 'networkidle2' }); await sleep(1800)
t = await med.evaluate(() => document.body.innerText)
console.log('attached PA cover:', (t.match(/([\d,]+) cover/) || [])[1])

// resolve any open fraud alert on the claim so intake-route doesn't mask the test
const fraudLink = await med.evaluate(() => [...document.querySelectorAll('a')].find(a => /fraud/i.test(a.getAttribute('href') || ''))?.getAttribute('href'))

// capture + decide 250,000
console.log('capture:', await clickText(med, 'button', 'Captured')); await sleep(2500)
await med.evaluate(() => { [...document.querySelectorAll('button')].filter(x => x.getClientRects().length && x.innerText.trim() === '✓').forEach(x => x.click()) })
await sleep(1000)
await med.evaluate(() => {
  const s = document.querySelector('select[name="action"]'); s.value = 'APPROVED'; s.dispatchEvent(new Event('change', { bubbles: true }))
  const a = document.querySelector('input[name="approvedAmount"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(a, '250000'); a.dispatchEvent(new Event('input', { bubbles: true }))
  const n = document.querySelector('textarea[name="notes"]'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(n, 'clean dual chain'); n.dispatchEvent(new Event('input', { bubbles: true }))
})
await clickText(med, 'button', 'Submit Decision'); await sleep(3000)
t = await med.evaluate(() => document.body.innerText)
console.log('ROUTING:', JSON.stringify((t.match(/[^\n]*(2-level|apply automatically)[^\n]*/gi) || ['(none)'])[0]).slice(0, 160))

// dual approve
await uw.goto(BASE + '/approvals', { waitUntil: 'networkidle2' }); await sleep(1400)
console.log('L1:', await clickText(uw, 'button', 'Approve L1')); await sleep(2500)
await admin.goto(BASE + '/approvals', { waitUntil: 'networkidle2' }); await sleep(1400)
console.log('L2:', await clickText(admin, 'button', 'Approve L2')); await sleep(3500)

await admin.goto(BASE + href, { waitUntil: 'networkidle2' }); await sleep(1800)
t = await admin.evaluate(() => document.body.innerText)
console.log('\n== CLAIM AFTER CHAIN ==')
console.log('badge:', (t.match(/Review and adjudicate[\s\S]*?(APPROVED|CAPTURED|UNDER REVIEW|DECLINED)/) || [])[1])
console.log('Net approved:', (t.match(/Net approved:[^\n]*/) || [])[0])
const ti = t.indexOf('ADJUDICATION TIMELINE')
console.log('TIMELINE:', t.slice(ti, ti + 350).replace(/\n+/g, ' | '))
await shot(admin, 'f3c-auto-applied')

// PA partial: 250k of 300k → 50k still ACTIVE hold, PA APPROVED
await admin.goto(BASE + paHref, { waitUntil: 'networkidle2' }); await sleep(1500)
t = await admin.evaluate(() => document.body.innerText)
const hi = t.indexOf('Benefit Balance & Hold')
console.log('\nPA HOLD PANEL:', t.slice(hi, hi + 380).replace(/\n+/g, ' | '))
console.log('PA STATUS:', (t.match(/Review and decide[\s\S]*?(APPROVED|UTILISED|ATTACHED)/) || [])[1])
await shot(admin, 'f3c-pa-partial')
await b.close()
console.log('DONE —', claimNo)
