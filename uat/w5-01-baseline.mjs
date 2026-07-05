import { launch, login, BASE, sleep, shot, bodyText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('login →', await login(p, 'admin@medvex.co.ug'))

// 1. Ursula member detail — benefits/utilisation baseline
await p.goto(BASE + '/members/cmr617noo0041huvqphul38x2', { waitUntil: 'networkidle2' })
await sleep(1500)
console.log('\n== MEMBER DETAIL ==\n', await bodyText(p, 900))
const tabs = await p.evaluate(() => [...document.querySelectorAll('[role="tab"], nav a, .tabs button')].filter(e => e.offsetParent).map(e => e.innerText.trim()).filter(Boolean))
console.log('\nTABS:', JSON.stringify(tabs))
await shot(p, 'w5-01-member-detail')

// click a benefits/utilisation-ish tab if present
for (const label of ['Benefit', 'Utilis', 'Utiliz', 'Usage', 'Coverage']) {
  const t = await p.$$('[role="tab"], button, a')
  let hit = null
  for (const h of t) {
    const txt = (await h.evaluate(el => el.innerText || '')).trim()
    if (txt && txt.toLowerCase().includes(label.toLowerCase()) && txt.length < 40) { await h.click(); hit = txt; break }
  }
  if (hit) { console.log('\nclicked tab:', hit); await sleep(1500); console.log(await bodyText(p, 1500)); await shot(p, 'w5-01-member-benefits'); break }
}

// 2. /preauth/new form structure
await p.goto(BASE + '/preauth/new', { waitUntil: 'networkidle2' })
await sleep(1500)
console.log('\n== PREAUTH NEW ==\n', await bodyText(p, 1200))
const fields = await p.evaluate(() => {
  const rows = []
  document.querySelectorAll('label').forEach(l => rows.push('LABEL: ' + l.innerText.trim()))
  document.querySelectorAll('[role="combobox"], button[aria-haspopup]').forEach(c => { if (c.offsetParent) rows.push('COMBO: ' + (c.innerText || '').trim().slice(0, 60)) })
  document.querySelectorAll('input, textarea, select').forEach(i => { if (i.offsetParent) rows.push(`INPUT[${i.type || i.tagName}] name=${i.name} ph=${i.placeholder}`) })
  document.querySelectorAll('button').forEach(x => { if (x.offsetParent && x.innerText.trim()) rows.push('BTN: ' + x.innerText.trim().slice(0, 40)) })
  return rows
})
console.log(fields.join('\n'))
await shot(p, 'w5-01-preauth-new')
await b.close()
console.log('DONE')
