import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('login →', await login(p, 'medical@medvex.co.ug'))
await p.goto(BASE + '/claims/new', { waitUntil: 'networkidle2' })
await sleep(1800)

const stepNo = () => p.evaluate(() => (document.body.innerText.match(/Step (\d) —/) || [])[1] || '?')

async function comboKeyPick(triggerText, query) {
  const t = await clickText(p, 'button', triggerText)
  if (!t) return 'trigger missing: ' + triggerText
  await sleep(800)
  await p.keyboard.type(query, { delay: 50 })
  await sleep(1300)
  await p.keyboard.press('ArrowDown'); await sleep(250)
  await p.keyboard.press('Enter'); await sleep(800)
  return 'keyboard-picked for "' + query + '"'
}

// STEP 1
console.log('member:', await comboKeyPick('Search by name, member number', 'Ursula'))
console.log('provider:', await comboKeyPick('Search by name, type or county', 'LifeCare'))
const s1state = await p.evaluate(() => document.body.innerText.match(/MEMBER \*[^]*?PROVIDER \/ FACILITY \*[^]*?(?=Back)/)?.[0].replace(/\s+/g, ' ').slice(0, 300))
console.log('STEP1 STATE:', s1state)
await shot(p, 'w5-10-step1')
await clickText(p, 'button', 'Next'); await sleep(1400)
console.log('now on step', await stepNo())

// STEP 2
if (await stepNo() === '2') {
  const s2 = await p.evaluate(() => {
    const rows = []
    document.querySelectorAll('select').forEach(s => { if (s.getClientRects().length) rows.push('SELECT name=' + s.name + ' vals=' + [...s.options].map(o => o.value).join(',').slice(0, 130)) })
    document.querySelectorAll('input, textarea').forEach(x => { if (x.getClientRects().length) rows.push(`INPUT[${x.type || x.tagName}] name=${x.name} ph=${x.placeholder} val=${x.value}`) })
    return rows
  })
  console.log('STEP2 FIELDS:\n' + s2.join('\n'))
  await p.evaluate(() => {
    const sel = (name, val) => { const s = document.querySelector(`select[name="${name}"]`); if (s) { s.value = val; s.dispatchEvent(new Event('change', { bubbles: true })) } }
    sel('serviceType', 'DAY_CASE'); sel('benefitCategory', 'INPATIENT')
    const d = [...document.querySelectorAll('input[type="date"]')].find(i => i.getClientRects().length)
    if (d) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(d, '2026-07-06'); d.dispatchEvent(new Event('input', { bubbles: true })); d.dispatchEvent(new Event('change', { bubbles: true })) }
  })
  await sleep(400)
  await clickText(p, 'button', 'Next'); await sleep(1300)
  const st = await stepNo()
  console.log('after FUTURE-date Next → step', st)
  if (st === '2') {
    console.log('FUTURE BLOCKED ✓ — messages:', await p.evaluate(() => [...document.querySelectorAll('p,span,div')].filter(e => e.getClientRects().length && /future|cannot|invalid|today/i.test(e.innerText) && e.innerText.length < 140).map(e => e.innerText.trim()).slice(0, 4)))
    await shot(p, 'w5-10-step2-future-blocked')
    await p.evaluate(() => {
      const d = [...document.querySelectorAll('input[type="date"]')].find(i => i.getClientRects().length)
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(d, '2026-07-04'); d.dispatchEvent(new Event('input', { bubbles: true })); d.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await sleep(300)
    await clickText(p, 'button', 'Next'); await sleep(1300)
    console.log('after 2026-07-04 Next → step', await stepNo())
  } else {
    console.log('!! FUTURE DATE ACCEPTED (advanced to step ' + st + ') — PR-013 REGRESSION; continuing with it noted')
  }
}

// STEP 3 — diagnoses
if (await stepNo() === '3') {
  const inputs = await p.evaluate(() => [...document.querySelectorAll('input')].filter(i => i.getClientRects().length).map(i => i.placeholder))
  console.log('STEP3 inputs:', JSON.stringify(inputs))
  const di = await p.$('input[placeholder*="ICD" i], input[placeholder*="diagnos" i], input[placeholder*="search" i]')
  if (di) {
    await di.click(); await p.keyboard.type('K42.9', { delay: 60 }); await sleep(1600)
    await p.keyboard.press('ArrowDown'); await sleep(250); await p.keyboard.press('Enter'); await sleep(800)
  }
  const chosen = await p.evaluate(() => document.body.innerText.match(/Step 3 —[^]*?(?=Back)/)?.[0].replace(/\s+/g, ' ').slice(0, 400))
  console.log('STEP3 STATE:', chosen)
  await shot(p, 'w5-10-step3')
  await clickText(p, 'button', 'Next'); await sleep(1400)
  console.log('now on step', await stepNo())
}
await shot(p, 'w5-10-step4-arrival')
console.log('\nfinal body:', (await bodyText(p, 800)).slice(200))
await b.close()
console.log('PAUSED-AT-STEP4')
