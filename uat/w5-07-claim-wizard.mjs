import { launch, login, BASE, sleep, shot, bodyText, clickText, pointerClick } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('login →', await login(p, 'medical@medvex.co.ug'))
await p.goto(BASE + '/claims/new', { waitUntil: 'networkidle2' })
await sleep(1800)

async function pickCombo(triggerMatch, query, optionMatch) {
  const trigs = await p.$$('button')
  for (const h of trigs) {
    const t = (await h.evaluate(el => el.innerText || '')).trim()
    if (t.toLowerCase().includes(triggerMatch.toLowerCase()) && await h.evaluate(el => !!el.offsetParent)) {
      await pointerClick(p, h); await sleep(700)
      const inp = await p.$('[cmdk-input], [role="dialog"] input, input[placeholder*="earch" i]:not([type="hidden"])')
      if (inp) { await inp.type(query, { delay: 40 }); await sleep(1100) }
      const opts = await p.$$('[cmdk-item], [role="option"]')
      for (const o of opts) {
        const ot = (await o.evaluate(el => el.innerText || '')).trim()
        if (ot.toLowerCase().includes(optionMatch.toLowerCase())) { await pointerClick(p, o); await sleep(600); return 'picked: ' + ot.slice(0, 70).replace(/\n/g, ' ') }
      }
      return 'no option match; n=' + opts.length
    }
  }
  return 'no trigger: ' + triggerMatch
}

// STEP 1
console.log('member:', await pickCombo('Search by name, member number', 'Ursula', 'Ursula'))
console.log('provider:', await pickCombo('Search by name, type or county', 'LifeCare', 'LifeCare'))
await shot(p, 'w5-07-step1-picked')
console.log('next:', await clickText(p, 'button', 'Next'))
await sleep(1200)

// STEP 2 — dump structure
console.log('\n== STEP 2 ==\n', await bodyText(p, 900))
const s2 = await p.evaluate(() => {
  const rows = []
  document.querySelectorAll('select').forEach(s => { if (s.offsetParent) rows.push('SELECT name=' + s.name + ' opts=' + [...s.options].map(o => o.value).join(',').slice(0, 140)) })
  document.querySelectorAll('input, textarea').forEach(x => { if (x.offsetParent) rows.push(`INPUT[${x.type || x.tagName}] name=${x.name} ph=${x.placeholder} val=${x.value}`) })
  return rows
})
console.log(s2.join('\n'))

// service type DAY_CASE, benefit INPATIENT if selects exist
await p.evaluate(() => {
  const sel = (name, val) => { const s = document.querySelector(`select[name="${name}"]`); if (s) { s.value = val; s.dispatchEvent(new Event('change', { bubbles: true })) } }
  sel('serviceType', 'DAY_CASE'); sel('benefitCategory', 'INPATIENT')
})
// FUTURE DOS first (PR-013 re-test)
await p.evaluate(() => {
  const d = [...document.querySelectorAll('input[type="date"]')].find(i => i.offsetParent)
  if (d) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(d, '2026-07-06'); d.dispatchEvent(new Event('input', { bubbles: true })); d.dispatchEvent(new Event('change', { bubbles: true })) }
})
await sleep(400)
console.log('\nnext w/ FUTURE date:', await clickText(p, 'button', 'Next'))
await sleep(1200)
const after = await bodyText(p, 600)
const futureBlocked = /future|cannot be after|invalid date/i.test(after) || /Step 2|Encounter/i.test(after)
console.log('AFTER-NEXT text:', after.slice(0, 400))
await shot(p, 'w5-07-step2-future-attempt')
console.log('\nvisible errors:', await p.evaluate(() => [...document.querySelectorAll('[role="alert"], .text-red-500, .text-destructive, [class*="error" i]')].filter(e => e.offsetParent).map(e => e.innerText.trim()).filter(Boolean).slice(0, 6)))
await b.close()
console.log('PAUSED-AFTER-FUTURE-ATTEMPT')
