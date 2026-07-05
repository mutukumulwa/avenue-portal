import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('admin →', await login(p, 'admin@medvex.co.ug'))

// ── V2: PR-024 — PA for a benefit outside the package must be rejected at creation
await p.goto(BASE + '/preauth/new', { waitUntil: 'networkidle2' }); await sleep(1200)
console.log(await p.evaluate(() => {
  const sel = (name, matcher) => { const s = document.querySelector(`select[name="${name}"]`); const o = [...s.options].find(o => matcher.test(o.text)); s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); return o.text }
  const set = (name, v) => { const i = document.querySelector(`[name="${name}"]`); const proto = i.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })) }
  const r = [sel('memberId', /Peter/i), sel('providerId', /LifeCare/i), sel('serviceType', /Day Case/i), sel('benefitCategory', /Surgical/i)]
  set('expectedDateOfService', '2026-07-05'); set('estimatedCost', '50000')
  set('diagnosis', 'PR-024 verify'); set('procedure', 'Should be rejected')
  return r.join(' | ')
}))
await clickText(p, 'button', 'Submit Pre-Authorization'); await sleep(3000)
let t = await p.evaluate(() => document.body.innerText)
console.log('PR-024 GATE:', JSON.stringify((t.match(/[^\n]*not in this member.s package[^\n]*/i) || t.match(/[^\n]*(error|not in)[^\n]*/i) || ['(no message found)'])[0]))
console.log('still on /preauth/new?', p.url().includes('/preauth/new'))
await shot(p, 'f2-pr024-blocked')

// ── GL check: decision JE for CLM-2026-00767 at 3,600
await p.goto(BASE + '/billing/gl/ledger', { waitUntil: 'networkidle2' }); await sleep(1600)
await p.evaluate(() => { const s = [...document.querySelectorAll('select')].find(s => s.getClientRects().length); const o = [...s.options].find(o => /2010/.test(o.text)); s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })) })
await sleep(400)
await p.evaluate(() => [...document.querySelectorAll('button')].find(b => /View Ledger/i.test(b.innerText))?.click())
await sleep(2200)
t = await p.evaluate(() => document.body.innerText)
console.log('\n767 JE ROW:', JSON.stringify((t.match(/[^\n]*CLM-2026-00767[^\n]*/g) || ['(none)'])))
await shot(p, 'f2-gl-767')

// ── Cleanup: reject orphan approval requests for 765 (as underwriter), then decide 765 at 3,600
const p2 = await b.newPage()
console.log('\nuw →', await login(p2, 'underwriter@medvex.co.ug'))
await p2.goto(BASE + '/approvals', { waitUntil: 'networkidle2' }); await sleep(1500)
for (let i = 0; i < 4; i++) {
  const r = await clickText(p2, 'button', 'Reject')
  if (!r) break
  console.log('rejected one pending request'); await sleep(2000)
}
console.log('queue now:', (await bodyText(p2, 400)).includes('No approvals awaiting') ? 'empty' : 'still has items')

// medical decides 765 at the enforced ceiling (3,600 — engine folds it under the case rate)
const p3 = await b.newPage()
console.log('\nmedical →', await login(p3, 'medical@medvex.co.ug'))
await p3.goto(BASE + '/claims/cmr6ev3cv000mwmvq6vthwjcy', { waitUntil: 'networkidle2' }); await sleep(1800)
await p3.evaluate(() => {
  const s = document.querySelector('select[name="action"]'); s.value = 'APPROVED'; s.dispatchEvent(new Event('change', { bubbles: true }))
  const a = document.querySelector('input[name="approvedAmount"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(a, '3600'); a.dispatchEvent(new Event('input', { bubbles: true }))
  const n = document.querySelector('textarea[name="notes"]'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(n, 'Resolved at contract case rate after PR-025/PR-026 fixes'); n.dispatchEvent(new Event('input', { bubbles: true }))
})
await clickText(p3, 'button', 'Submit Decision'); await sleep(3000)
t = await p3.evaluate(() => document.body.innerText)
console.log('765 STATUS:', (t.match(/(CAPTURED|APPROVED|UNDER REVIEW)/g) || []).slice(0, 3), '| msgs:', JSON.stringify((t.match(/[^\n]*(ceiling|approval|cover)[^\n]*/gi) || []).filter(x => x.length < 200).slice(0, 2)))
await shot(p3, 'f2-765-resolved')
await b.close()
console.log('DONE')
