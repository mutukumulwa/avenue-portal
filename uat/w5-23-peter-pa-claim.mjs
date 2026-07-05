import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()

// 1) admin creates PA for Peter (SURGICAL)
const p = await b.newPage()
console.log('admin →', await login(p, 'admin@medvex.co.ug'))
await p.goto(BASE + '/preauth/new', { waitUntil: 'networkidle2' }); await sleep(1200)
console.log('picked:', await p.evaluate(() => {
  const sel = (name, matcher) => { const s = document.querySelector(`select[name="${name}"]`); const o = [...s.options].find(o => matcher.test(o.text)); s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); return o.text }
  const set = (name, v) => { const i = document.querySelector(`[name="${name}"]`); const proto = i.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })) }
  const r = [sel('memberId', /Peter/i), sel('providerId', /LifeCare/i), sel('serviceType', /Day Case/i), sel('benefitCategory', /Surgical/i)]
  set('expectedDateOfService', '2026-07-04'); set('estimatedCost', '85000')
  set('diagnosis', 'Unspecified abdominal hernia (K42.9)'); set('procedure', 'Umbilical hernia repair (day case)')
  set('clinicalNotes', 'W5 PR-014 ceiling re-test — surgical day case, replicating CP-004 shape.')
  return r.join(' | ')
}))
await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => null), clickText(p, 'button', 'Submit Pre-Authorization')])
await sleep(2000)

// 2) medical approves
const p2 = await b.newPage()
console.log('medical →', await login(p2, 'medical@medvex.co.ug'))
await p2.goto(BASE + '/preauth', { waitUntil: 'networkidle2' }); await sleep(1400)
const row = await p2.evaluate(() => {
  const tr = [...document.querySelectorAll('tbody tr')].find(x => /Peter/.test(x.innerText) && /SUBMITTED/.test(x.innerText))
  return tr ? { no: (tr.innerText.match(/PA-2026-\d+/) || [])[0], href: tr.querySelector('a')?.getAttribute('href') } : null
})
console.log('PA row:', JSON.stringify(row))
await p2.goto(BASE + row.href, { waitUntil: 'networkidle2' }); await sleep(1400)
console.log('stage1:', await clickText(p2, 'button', 'Send for Medical Review')); await sleep(2500)
console.log('decision:', await clickText(p2, 'button', 'Approve (Full)')); await sleep(500)
console.log('submit:', await clickText(p2, 'button', 'Submit Approval')); await sleep(3000)
console.log('PA state:', await p2.evaluate(() => (document.body.innerText.match(/Review and decide[^]*?(APPROVED|UNDER REVIEW)/) || [])[1]))
await shot(p2, 'w5-23-peter-pa-approved')

// 3) claim wizard for Peter
await p2.goto(BASE + '/claims/new', { waitUntil: 'networkidle2' }); await sleep(1800)
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
console.log(await comboPick('Search by name, member number', 'Peter', 'MVX-2026-00251'))
console.log(await comboPick('Search by name, type or county', 'LifeCare', 'LifeCare Hospitals (UAT)'))
await clickText(p2, 'button', 'Next'); await sleep(1400)
console.log('step', await stepNo(), await p2.evaluate(() => {
  const sels = [...document.querySelectorAll('select')].filter(s => s.getClientRects().length)
  sels[0].value = 'DAY_CASE'; sels[0].dispatchEvent(new Event('change', { bubbles: true }))
  sels[1].value = 'SURGICAL'; sels[1].dispatchEvent(new Event('change', { bubbles: true }))
  const d = [...document.querySelectorAll('input[type="date"]')].find(i => i.getClientRects().length)
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(d, '2026-07-04'); d.dispatchEvent(new Event('input', { bubbles: true })); d.dispatchEvent(new Event('change', { bubbles: true }))
  return '→ DAY_CASE/SURGICAL/2026-07-04'
}))
await clickText(p2, 'button', 'Next'); await sleep(1400)
const di = await p2.$('input[placeholder*="ICD" i], input[placeholder*="diagnos" i], input[placeholder*="search" i]')
await di.click(); await p2.keyboard.type('K42.9', { delay: 60 }); await sleep(1700)
console.log('diag:', await clickSmallest('Umbilical hernia without obstruction')); await sleep(800)
await clickText(p2, 'button', 'Next'); await sleep(1400)
console.log(await clickSmallest('Procedure')); await sleep(900)
console.log(await p2.evaluate(() => {
  const vis = sel => [...document.querySelectorAll(sel)].filter(x => x.getClientRects().length)
  const setV = (i, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })) }
  setV(vis('input[placeholder*="Type description" i]').at(-1), 'Umbilical hernia repair (day case)')
  setV(vis('input[type="number"]').at(-1), '86000')
  return 'line 86000'
}))
await sleep(800); await p2.keyboard.press('Escape'); await sleep(400)
await clickText(p2, 'button', 'Submit Claim')
await sleep(3500)
console.log('URL:', p2.url())
const after = await p2.evaluate(() => document.body.innerText)
console.log('TOP ROWS:', after.slice(after.indexOf('Claim No'), after.indexOf('Claim No') + 320).replace(/\n+/g, ' | '))
await shot(p2, 'w5-23-peter-claim-submitted')
await b.close()
console.log('DONE')
