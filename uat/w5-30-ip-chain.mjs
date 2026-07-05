import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()

// 1) admin creates PA (Ursula INPATIENT 10,000)
const p = await b.newPage()
console.log('admin →', await login(p, 'admin@medvex.co.ug'))
await p.goto(BASE + '/preauth/new', { waitUntil: 'networkidle2' }); await sleep(1200)
console.log('picked:', await p.evaluate(() => {
  const sel = (name, matcher) => { const s = document.querySelector(`select[name="${name}"]`); const o = [...s.options].find(o => matcher.test(o.text)); s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); return o.text }
  const set = (name, v) => { const i = document.querySelector(`[name="${name}"]`); const proto = i.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })) }
  const r = [sel('memberId', /Ursula/i), sel('providerId', /LifeCare/i), sel('serviceType', /Inpatient/i), sel('benefitCategory', /^Inpatient/i)]
  set('expectedDateOfService', '2026-07-04'); set('estimatedCost', '10000')
  set('diagnosis', 'Acute URTI (J06.9) — observation'); set('procedure', 'Inpatient observation - 1 night')
  set('clinicalNotes', 'W5 matrix band-3 test: INPATIENT ≥200k UGX requires dual underwriter approval.')
  return r.join(' | ')
}))
await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => null), clickText(p, 'button', 'Submit Pre-Authorization')])
await sleep(2000)

// 2) medical approves PA
const p2 = await b.newPage()
console.log('medical →', await login(p2, 'medical@medvex.co.ug'))
await p2.goto(BASE + '/preauth', { waitUntil: 'networkidle2' }); await sleep(1400)
const row = await p2.evaluate(() => {
  const tr = [...document.querySelectorAll('tbody tr')].find(x => /Ursula/.test(x.innerText) && /SUBMITTED/.test(x.innerText) && /10,000/.test(x.innerText))
  return tr ? { no: (tr.innerText.match(/PA-2026-\d+/) || [])[0], href: tr.querySelector('a')?.getAttribute('href') } : null
})
console.log('PA row:', JSON.stringify(row))
await p2.goto(BASE + row.href, { waitUntil: 'networkidle2' }); await sleep(1400)
const s1 = await clickText(p2, 'button', 'Send for Medical Review')
if (s1) { await sleep(2500) } else { console.log('(no stage-1 needed for INPATIENT?)') }
console.log('decision:', await clickText(p2, 'button', 'Approve (Full)')); await sleep(500)
console.log('submit:', await clickText(p2, 'button', 'Submit Approval')); await sleep(3000)
console.log('PA state:', (await p2.evaluate(() => document.body.innerText)).match(/Review and decide[^]*?(APPROVED|UNDER REVIEW|SUBMITTED)/)?.[1])

// 3) claim wizard (Ursula INPATIENT 10,000)
await p2.goto(BASE + '/claims/new', { waitUntil: 'networkidle2' }); await sleep(1800)
async function clickSmallest(match) {
  const box = await p2.evaluate(m => {
    let best = null
    for (const n of document.querySelectorAll('*')) {
      const tx = (n.innerText || n.textContent || '').trim()
      if (!tx.includes(m)) continue
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
console.log(await p2.evaluate(() => {
  const sels = [...document.querySelectorAll('select')].filter(s => s.getClientRects().length)
  sels[0].value = 'INPATIENT'; sels[0].dispatchEvent(new Event('change', { bubbles: true }))
  sels[1].value = 'INPATIENT'; sels[1].dispatchEvent(new Event('change', { bubbles: true }))
  const d = [...document.querySelectorAll('input[type="date"]')].find(i => i.getClientRects().length)
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(d, '2026-07-04'); d.dispatchEvent(new Event('input', { bubbles: true })); d.dispatchEvent(new Event('change', { bubbles: true }))
  return '→ INPATIENT/INPATIENT/2026-07-04'
}))
await clickText(p2, 'button', 'Next'); await sleep(1400)
const di = await p2.$('input[placeholder*="ICD" i], input[placeholder*="diagnos" i], input[placeholder*="search" i]')
await di.click(); await p2.keyboard.type('J06.9', { delay: 60 }); await sleep(1700)
console.log('diag:', await clickSmallest('J06.9')); await sleep(800)
await clickText(p2, 'button', 'Next'); await sleep(1400)
console.log(await clickSmallest('Consultation')); await sleep(900)
console.log(await p2.evaluate(() => {
  const vis = sel => [...document.querySelectorAll(sel)].filter(x => x.getClientRects().length)
  const setV = (i, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })) }
  setV(vis('input[placeholder*="Type description" i]').at(-1), 'Inpatient observation - 1 night')
  setV(vis('input[type="number"]').at(-1), '10000')
  return 'line 10000'
}))
await sleep(800); await p2.keyboard.press('Escape'); await sleep(400)
await clickText(p2, 'button', 'Submit Claim'); await sleep(3500)
console.log('URL:', p2.url())
let after = await p2.evaluate(() => document.body.innerText)
const claimNo = (after.match(/CLM-2026-\d+/) || [])[0]
console.log('TOP ROW:', after.slice(after.indexOf('Claim No'), after.indexOf('Claim No') + 220).replace(/\n+/g, ' | '))

// 4) capture + decide 10,000
const chref = await p2.evaluate(() => [...document.querySelectorAll('tbody tr')].find(x => /INPATIENT/.test(x.innerText) && /10,000/.test(x.innerText) && /RECEIVED/.test(x.innerText))?.querySelector('a')?.getAttribute('href'))
console.log('claim href:', chref)
await p2.goto(BASE + chref, { waitUntil: 'networkidle2' }); await sleep(1800)
console.log('capture:', await clickText(p2, 'button', 'Captured')); await sleep(2500)
console.log(await p2.evaluate(() => { const c = [...document.querySelectorAll('button')].filter(x => x.getClientRects().length && x.innerText.trim() === '✓'); c.forEach(x => x.click()); return c.length + ' line ✓' }))
await sleep(1200)
await p2.evaluate(() => {
  const s = document.querySelector('select[name="action"]'); s.value = 'APPROVED'; s.dispatchEvent(new Event('change', { bubbles: true }))
  const a = document.querySelector('input[name="approvedAmount"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(a, '10000'); a.dispatchEvent(new Event('input', { bubbles: true }))
  const n = document.querySelector('textarea[name="notes"]'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(n, 'W5 matrix band-3: expect dual underwriter routing at 290,000 UGX'); n.dispatchEvent(new Event('input', { bubbles: true }))
})
await sleep(400)
console.log('submit 10,000:', await clickText(p2, 'button', 'Submit Decision')); await sleep(3200)
after = await p2.evaluate(() => document.body.innerText)
console.log('\nSTATUS:', JSON.stringify((after.match(/(APPROVED|CAPTURED|UNDER REVIEW|PENDING[ _A-Z]*)/g) || []).slice(0, 5)))
const ti = after.indexOf('ADJUDICATION TIMELINE')
console.log('TIMELINE:', after.slice(ti, ti + 600).replace(/\n{2,}/g, '\n'))
await shot(p2, 'w5-30-ip-claim-decided')

// 5) approvals queue as underwriter
const p3 = await b.newPage()
console.log('\nunderwriter →', await login(p3, 'underwriter@medvex.co.ug'))
await p3.goto(BASE + '/approvals', { waitUntil: 'networkidle2' }); await sleep(1600)
console.log('== APPROVALS (UW) ==\n', (await bodyText(p3, 1200)).slice(200))
await shot(p3, 'w5-30-approvals-uw')
await b.close()
console.log('DONE')
