import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
async function fill(pg, name, val) {
  await pg.evaluate((n, v) => {
    const i = document.querySelector(`[name="${n}"]`); if (!i) return
    const proto = i.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true }))
  }, name, val)
}
async function selOpt(pg, name, re) {
  await pg.evaluate((n, r) => { const s = document.querySelector(`select[name="${n}"]`); const o = [...s.options].find(o => new RegExp(r, 'i').test(o.text)); s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })) }, name, re.source)
}
async function smallest(pg, match) {
  const box = await pg.evaluate(m => { let best = null; for (const n of document.querySelectorAll('*')) { const t = (n.innerText || '').trim(); if (!t.includes(m)) continue; const r = n.getBoundingClientRect(); if (!r.width || !r.height) continue; const a = r.width * r.height; if (!best || a < best.area) best = { area: a, x: r.x + r.width / 2, y: r.y + r.height / 2 } } return best }, match)
  if (box) await pg.mouse.click(box.x, box.y); return !!box
}

// ── cancel stale APPROVED Nairobi PAs (direct, one page) ──
const admin = await b.newPage()
await login(admin, 'admin@medvex.co.ug')
await admin.goto(BASE + '/preauth', { waitUntil: 'networkidle2' }); await sleep(1500)
const staleHrefs = await admin.evaluate(() => [...document.querySelectorAll('tbody tr')].filter(x => /Nairobi Hospital/.test(x.innerText) && /\bAPPROVED\b/.test(x.innerText)).map(x => x.querySelector('a')?.getAttribute('href')).filter(Boolean))
console.log('stale PAs:', staleHrefs.length)
for (const h of staleHrefs) {
  await admin.goto(BASE + h, { waitUntil: 'networkidle2' }); await sleep(1200)
  if (await clickText(admin, 'button', 'Cancel PA')) {
    await sleep(1200)
    await fill(admin, 'reason', 'fix-verify cleanup')
    await (clickText(admin, 'button', 'Confirm') || clickText(admin, 'button', 'Cancel'))
    await sleep(1500)
  }
}
console.log('stale cancelled')

// ── fresh PA @ 300,000 ──
await admin.goto(BASE + '/preauth/new', { waitUntil: 'domcontentloaded' })
await admin.waitForSelector('select[name="memberId"]', { timeout: 30000 }); await sleep(700)
await selOpt(admin, 'memberId', /Ursula/); await selOpt(admin, 'providerId', /Nairobi Hospital/)
await selOpt(admin, 'serviceType', /Inpatient/); await selOpt(admin, 'benefitCategory', /^Inpatient/)
await fill(admin, 'expectedDateOfService', '2026-07-04'); await fill(admin, 'estimatedCost', '300000')
await fill(admin, 'diagnosis', 'Admission'); await fill(admin, 'procedure', '2 nights')
await fill(admin, 'clinicalNotes', 'clean PR-025 dual-band chain, 250k ≤ 300k cover')
await Promise.all([admin.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => null), clickText(admin, 'button', 'Submit Pre-Authorization')])
await sleep(2000)

// ── medical approves ──
const med = await b.newPage()
await login(med, 'medical@medvex.co.ug')
await med.goto(BASE + '/preauth', { waitUntil: 'networkidle2' }); await sleep(1400)
const paHref = await med.evaluate(() => [...document.querySelectorAll('tbody tr')].find(x => /Nairobi Hospital/.test(x.innerText) && /SUBMITTED/.test(x.innerText) && /300,000/.test(x.innerText))?.querySelector('a')?.getAttribute('href'))
await med.goto(BASE + paHref, { waitUntil: 'networkidle2' }); await sleep(1400)
if (await clickText(med, 'button', 'Send for Medical Review')) await sleep(2500)
await clickText(med, 'button', 'Approve (Full)'); await sleep(500)
await clickText(med, 'button', 'Submit Approval'); await sleep(3000)
console.log('PA approved')

// ── claim 250,000 ──
await med.goto(BASE + '/claims/new', { waitUntil: 'networkidle2' }); await sleep(1800)
async function combo(q, o) { await clickText(med, 'button', q === 'Ursula' ? 'Search by name, member number' : 'Search by name, type or county'); await sleep(800); await med.keyboard.type(q, { delay: 50 }); await sleep(1400); await smallest(med, o); await sleep(800) }
await combo('Ursula', 'MVX-2026-00250'); await combo('Nairobi Hospital', 'Nairobi Hospital')
await clickText(med, 'button', 'Next'); await sleep(1400)
await med.evaluate(() => { const s = [...document.querySelectorAll('select')].filter(x => x.getClientRects().length); s[0].value = 'INPATIENT'; s[0].dispatchEvent(new Event('change', { bubbles: true })); s[1].value = 'INPATIENT'; s[1].dispatchEvent(new Event('change', { bubbles: true })); const d = [...document.querySelectorAll('input[type="date"]')].find(i => i.getClientRects().length); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(d, '2026-07-04'); d.dispatchEvent(new Event('input', { bubbles: true })); d.dispatchEvent(new Event('change', { bubbles: true })) })
await clickText(med, 'button', 'Next'); await sleep(1400)
const di = await med.$('input[placeholder*="ICD" i], input[placeholder*="search" i]'); await di.click(); await med.keyboard.type('J06.9', { delay: 60 }); await sleep(1700); await smallest(med, 'J06.9'); await sleep(800)
await clickText(med, 'button', 'Next'); await sleep(1400)
await smallest(med, 'Consultation'); await sleep(900)
await med.evaluate(() => { const vis = s => [...document.querySelectorAll(s)].filter(x => x.getClientRects().length); const setV = (i, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })) }; setV(vis('input[placeholder*="Type description" i]').at(-1), 'Inpatient 2 nights'); setV(vis('input[type="number"]').at(-1), '250000') })
await sleep(600); await med.keyboard.press('Escape'); await sleep(300)
await clickText(med, 'button', 'Submit Claim'); await sleep(3500)
let t = await med.evaluate(() => document.body.innerText)
const claimNo = (t.match(/CLM-2026-\d+/) || [])[0]
const href = await med.evaluate(no => [...document.querySelectorAll('tbody tr')].find(x => x.innerText.includes(no))?.querySelector('a')?.getAttribute('href'), claimNo)
console.log('CLAIM:', claimNo)
await med.goto(BASE + href, { waitUntil: 'networkidle2' }); await sleep(1800)
t = await med.evaluate(() => document.body.innerText)
console.log('attached PA cover:', (t.match(/([\d,]+) cover/) || [])[1])

// capture + decide 250,000
await clickText(med, 'button', 'Captured'); await sleep(2500)
await med.evaluate(() => { [...document.querySelectorAll('button')].filter(x => x.getClientRects().length && x.innerText.trim() === '✓').forEach(x => x.click()) }); await sleep(1000)
await med.evaluate(() => { const s = document.querySelector('select[name="action"]'); s.value = 'APPROVED'; s.dispatchEvent(new Event('change', { bubbles: true })); const a = document.querySelector('input[name="approvedAmount"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(a, '250000'); a.dispatchEvent(new Event('input', { bubbles: true })); const n = document.querySelector('textarea[name="notes"]'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(n, 'clean dual chain'); n.dispatchEvent(new Event('input', { bubbles: true })) })
await clickText(med, 'button', 'Submit Decision'); await sleep(3000)
t = await med.evaluate(() => document.body.innerText)
console.log('ROUTING:', JSON.stringify((t.match(/[^\n]*(apply automatically|2-level)[^\n]*/i) || ['(none)'])[0]).slice(0, 150))

// dual approve — pick the request for THIS claim's amount
const uw = await b.newPage(); await login(uw, 'underwriter@medvex.co.ug')
await uw.goto(BASE + '/approvals', { waitUntil: 'networkidle2' }); await sleep(1400)
console.log('L1:', await clickText(uw, 'button', 'Approve L1')); await sleep(2500)
await admin.goto(BASE + '/approvals', { waitUntil: 'networkidle2' }); await sleep(1400)
console.log('L2:', await clickText(admin, 'button', 'Approve L2')); await sleep(3500)

// claim must be APPROVED now
await admin.goto(BASE + href, { waitUntil: 'networkidle2' }); await sleep(1800)
t = await admin.evaluate(() => document.body.innerText)
console.log('\n== AFTER CHAIN ==')
console.log('Net approved:', (t.match(/Net approved:[^\n]*/) || ['(none)'])[0])
console.log('Financial summary:', (t.match(/FINANCIAL SUMMARY[\s\S]{0,80}/) || [''])[0].replace(/\n+/g, ' '))
const ti = t.indexOf('ADJUDICATION TIMELINE'); console.log('TIMELINE:', t.slice(ti, ti + 260).replace(/\n+/g, ' | '))
await shot(admin, 'f3d-auto-applied')

// PR-022 partial: 250k of 300k → hold 50k ACTIVE, PA APPROVED
await admin.goto(BASE + paHref, { waitUntil: 'networkidle2' }); await sleep(1500)
t = await admin.evaluate(() => document.body.innerText)
const hi = t.indexOf('Benefit Balance & Hold')
console.log('\nPA HOLD:', t.slice(hi, hi + 340).replace(/\n+/g, ' | '))
console.log('PA STATUS:', (t.match(/Review and decide[\s\S]*?(APPROVED|UTILISED|ATTACHED)/) || [])[1])
await shot(admin, 'f3d-pa-partial')
await b.close(); console.log('DONE', claimNo)
