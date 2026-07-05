import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('login →', await login(p, 'medical@medvex.co.ug'))
await p.goto(BASE + '/claims/new', { waitUntil: 'networkidle2' })
await sleep(1800)

const stepNo = () => p.evaluate(() => (document.body.innerText.match(/Step (\d) —/) || [])[1] || '?')

// click the smallest visible element containing `match`
async function clickSmallest(match) {
  const box = await p.evaluate(m => {
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
  await p.mouse.click(box.x, box.y)
  return `clicked "${match}" @${Math.round(box.x)},${Math.round(box.y)}`
}

async function comboPick(triggerText, query, optionText) {
  if (!(await clickText(p, 'button', triggerText))) return 'trigger missing'
  await sleep(800)
  await p.keyboard.type(query, { delay: 50 })
  await sleep(1400)
  const r = await clickSmallest(optionText)
  await sleep(800)
  return r
}

// STEP 1
console.log('member:', await comboPick('Search by name, member number', 'Ursula', 'MVX-2026-00250'))
console.log('provider:', await comboPick('Search by name, type or county', 'LifeCare', 'LifeCare Hospitals (UAT)'))
console.log('STEP1 STATE:', await p.evaluate(() => document.body.innerText.match(/MEMBER \*[^]*?(?=Back)/)?.[0].replace(/\s+/g, ' ').slice(0, 320)))
await shot(p, 'w5-12-step1')
await clickText(p, 'button', 'Next'); await sleep(1400)
console.log('→ step', await stepNo())

// STEP 2 — future date first
if (await stepNo() === '2') {
  console.log('STEP2 FIELDS:', JSON.stringify(await p.evaluate(() => {
    const rows = []
    document.querySelectorAll('select').forEach(s => { if (s.getClientRects().length) rows.push('SELECT ' + s.name + '=' + [...s.options].map(o => o.value).join('|').slice(0, 110)) })
    document.querySelectorAll('input,textarea').forEach(x => { if (x.getClientRects().length) rows.push(`${x.type || x.tagName} ${x.name} "${x.placeholder}"`) })
    return rows
  }), null, 1))
  await p.evaluate(() => {
    const sel = (name, val) => { const s = document.querySelector(`select[name="${name}"]`); if (s) { s.value = val; s.dispatchEvent(new Event('change', { bubbles: true })) } }
    sel('serviceType', 'DAY_CASE'); sel('benefitCategory', 'INPATIENT')
    const d = [...document.querySelectorAll('input[type="date"]')].find(i => i.getClientRects().length)
    if (d) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(d, '2026-07-06'); d.dispatchEvent(new Event('input', { bubbles: true })); d.dispatchEvent(new Event('change', { bubbles: true })) }
  })
  await sleep(400)
  await clickText(p, 'button', 'Next'); await sleep(1300)
  const st = await stepNo()
  if (st === '2') {
    console.log('FUTURE DOS BLOCKED ✓ msg:', await p.evaluate(() => [...document.querySelectorAll('p,span,div')].filter(e => e.getClientRects().length && /future|cannot|invalid|past|today/i.test(e.innerText) && e.innerText.length < 140).map(e => e.innerText.trim()).slice(0, 4)))
    await shot(p, 'w5-12-step2-future-blocked')
    await p.evaluate(() => {
      const d = [...document.querySelectorAll('input[type="date"]')].find(i => i.getClientRects().length)
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(d, '2026-07-04'); d.dispatchEvent(new Event('input', { bubbles: true })); d.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await sleep(300); await clickText(p, 'button', 'Next'); await sleep(1300)
  } else console.log('!! FUTURE DOS ACCEPTED — PR-013 REGRESSION (now on step ' + st + ')')
  console.log('→ step', await stepNo())
}

// STEP 3 — diagnosis K42.9
if (await stepNo() === '3') {
  const di = await p.$('input[placeholder*="ICD" i], input[placeholder*="diagnos" i], input[placeholder*="search" i]')
  if (di) { await di.click(); await p.keyboard.type('K42.9', { delay: 60 }); await sleep(1700); console.log('diag:', await clickSmallest('K42.9')) }
  await sleep(800)
  console.log('STEP3 STATE:', await p.evaluate(() => document.body.innerText.match(/Step 3 —[^]*?(?=Back)/)?.[0].replace(/\s+/g, ' ').slice(0, 350)))
  await shot(p, 'w5-12-step3')
  await clickText(p, 'button', 'Next'); await sleep(1400)
  console.log('→ step', await stepNo())
}

// STEP 4 — structure only
if (await stepNo() === '4') {
  console.log('STEP4:', await p.evaluate(() => document.body.innerText.match(/Step 4 —[^]*$/)?.[0].replace(/\s+/g, ' ').slice(0, 700)))
  console.log('FIELDS:', JSON.stringify(await p.evaluate(() => {
    const rows = []
    document.querySelectorAll('select').forEach(s => { if (s.getClientRects().length) rows.push('SELECT ' + s.name + '=' + [...s.options].map(o => o.value).join('|').slice(0, 110)) })
    document.querySelectorAll('input,textarea').forEach(x => { if (x.getClientRects().length) rows.push(`${x.type || x.tagName} ${x.name} "${x.placeholder}"`) })
    document.querySelectorAll('button').forEach(x => { const t = x.innerText.trim(); if (x.getClientRects().length && t && t.length < 40 && !/OVERVIEW|MEMBERSHIP|CLINICAL|INSIGHTS|SUPPORT|REINSTATEMENTS|Log out|Dashboard/.test(t)) rows.push('BTN ' + t) })
    return rows
  }), null, 1))
  await shot(p, 'w5-12-step4')
}
await b.close()
console.log('DONE-AT-STEP4')
