import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@medvex.co.ug')

// ── PR-036: offline capture → sync → must produce a claim OR a visible exception ──
await p.goto(BASE + '/offline-capture', { waitUntil: 'networkidle2' }); await sleep(1500)
let t = await p.evaluate(() => document.body.innerText)
if (/Offline work is locked/.test(t)) {
  await p.evaluate(() => { const i = document.querySelector('input[name="workCode"], input[placeholder*="OWA"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'OWA-UG7YED'); i.dispatchEvent(new Event('input', { bubbles: true })) })
  await clickText(p, 'button', 'Unlock offline work'); await sleep(4000)
}
// capture a CLEAN op for a real member at the code's facility (LifeCare) — should become a claim
await p.evaluate(() => {
  const setV = (sel, v) => { const i = document.querySelector(sel); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })) }
  setV('input[name="memberNumber"]', 'MVX-2026-00250')
  setV('input[name="providerCode"]', 'IGNORED-FREE-TEXT') // work code resolves the facility now
  const s = document.querySelector('select'); s.value = 'OUTPATIENT'; s.dispatchEvent(new Event('change', { bubbles: true }))
  setV('input[name="description"]', 'Offline GP consult (PR-036 fix-verify)')
  setV('input[name="quantity"]', '1'); setV('input[name="unitCost"]', '1500')
})
await clickText(p, 'button', 'Capture (offline-safe)'); await sleep(1500)
await clickText(p, 'button', 'Sync now'); await sleep(5000)
t = await p.evaluate(() => document.body.innerText)
console.log('OUTBOX:', (t.match(/OUTBOX[^\n]*/) || [])[0])
console.log('row state:', (t.match(/\d\d:\d\d:\d\d\s*Claim[^\n]*/) || [])[0]?.replace(/\s+/g, ' '))
console.log('conflict note:', JSON.stringify((t.match(/[^\n]*(CONFLICT|Exception Register|synced)[^\n]*/i) || ['(none)'])[0]).slice(0, 160))
await shot(p, 'f5-offline-synced')

// did it become a claim?  (source OFFLINE_SYNC, LifeCare)
await p.goto(BASE + '/claims', { waitUntil: 'networkidle2' }); await sleep(1600)
const claim = await p.evaluate(() => { const tr = [...document.querySelectorAll('tbody tr')].find(x => /1,500/.test(x.innerText) && /LifeCare/.test(x.innerText)); return tr?.innerText.replace(/\s+/g, ' ') })
console.log('\nOFFLINE CLAIM in list:', claim || '(not found — checking exceptions)')

// exception register visibility (PR-036: conflicts must be visible even if no claim)
await p.goto(BASE + '/settings/exceptions', { waitUntil: 'networkidle2' }); await sleep(1500)
t = await p.evaluate(() => document.body.innerText)
console.log('EXCEPTION REGISTER total:', (t.match(/TOTAL\s*\n?\s*(\d+)/) || [])[1], '| SYNC rows:', (t.match(/SYNC [a-z0-9-]+/gi) || []).length)
await shot(p, 'f5-exceptions')

// ── PR-033: endorsement maker-checker — same user cannot approve their own ──
await p.goto(BASE + '/endorsements/new', { waitUntil: 'networkidle2' }); await sleep(1400)
await p.evaluate(() => {
  const setV = (sel, v) => { const i = document.querySelector(sel); const proto = i.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })) }
  const sel = (name, m) => { const s = document.querySelector(`select[name="${name}"]`); const o = [...s.options].find(o => new RegExp(m, 'i').test(o.text)); s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })) }
  sel('groupId', 'UAT Lifecare'); sel('type', 'Member Addition'); sel('gender', 'Female'); sel('relationship', 'Principal')
  setV('input[name="effectiveDate"]', '2026-07-20')
  setV('input[name="firstName"]', 'Maker'); setV('input[name="lastName"]', 'Checker-Test')
  setV('input[name="dateOfBirth"]', '1992-02-02'); setV('input[name="idNumber"]', '92020200')
  setV('input[name="phone"]', '+254700000099'); setV('input[name="email"]', 'mc.test@lifecare.test')
  setV('textarea[name="notes"]', 'PR-033: same-user approve must be blocked')
})
await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => null), clickText(p, 'button', 'Submit for Review')])
await sleep(2000)
const endHref = await p.evaluate(() => { const tr = [...document.querySelectorAll('tbody tr')].find(x => /UAT Lifecare/.test(x.innerText) && /SUBMITTED/.test(x.innerText)); return [...(tr?.querySelectorAll('a') || [])].map(a => a.getAttribute('href')).find(h => /endorsement/i.test(h)) })
console.log('\nendorsement:', endHref)
await p.goto(BASE + endHref, { waitUntil: 'networkidle2' }); await sleep(1600)
// same admin tries Approve & Apply → must be blocked
await (clickText(p, 'button', 'Approve & Apply') || clickText(p, 'button', 'Approve')); await sleep(2500)
t = await p.evaluate(() => document.body.innerText)
console.log('SAME-USER APPROVE:', JSON.stringify((t.match(/[^\n]*(Segregation of duties|different user|raised this)[^\n]*/i) || ['(NOT BLOCKED!)'])[0]).slice(0, 200))
console.log('endorsement status:', (t.match(/(SUBMITTED|APPROVED|APPLIED|REJECTED)/) || [])[1])
await shot(p, 'f5-endorse-maker-checker')
await b.close()
console.log('DONE')
