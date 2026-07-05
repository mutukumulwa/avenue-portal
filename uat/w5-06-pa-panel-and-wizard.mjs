import { launch, login, BASE, sleep, shot, bodyText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('login →', await login(p, 'admin@medvex.co.ug'))
await p.goto(BASE + '/preauth/cmr6djj0i000096vqaae6yvx0', { waitUntil: 'networkidle2' })
await sleep(1500)
const t = await p.evaluate(() => document.body.innerText)
const i = t.indexOf('Benefit Balance & Hold')
console.log('== HOLD PANEL ==\n', t.slice(i, i + 700).replace(/\n+/g, ' | '))
await shot(p, 'w5-06-pa-hold-panel')

// wizard step 1 structure
await p.goto(BASE + '/claims/new', { waitUntil: 'networkidle2' })
await sleep(1800)
console.log('\n== CLAIMS/NEW ==\n', await bodyText(p, 1200))
const fields = await p.evaluate(() => {
  const rows = []
  document.querySelectorAll('label').forEach(l => { if (l.offsetParent) rows.push('LABEL: ' + l.innerText.trim().slice(0, 60)) })
  document.querySelectorAll('[role="combobox"], button[aria-haspopup]').forEach(c => { if (c.offsetParent) rows.push('COMBO: ' + (c.innerText || '').trim().slice(0, 60)) })
  document.querySelectorAll('select').forEach(s => { if (s.offsetParent) rows.push('SELECT name=' + s.name + ' opts=' + [...s.options].map(o => o.value).join(',').slice(0, 120)) })
  document.querySelectorAll('input, textarea').forEach(x => { if (x.offsetParent) rows.push(`INPUT[${x.type || x.tagName}] name=${x.name} ph=${x.placeholder}`) })
  document.querySelectorAll('button').forEach(x => { if (x.offsetParent && x.innerText.trim() && x.innerText.length < 45 && !/OVERVIEW|MEMBERSHIP|CLINICAL|FINANCE|INSIGHTS|COMPLIANCE|SUPPORT|REINSTATEMENTS|Log out/.test(x.innerText)) rows.push('BTN: ' + x.innerText.trim()) })
  return rows
})
console.log(fields.join('\n'))
await shot(p, 'w5-06-wizard-step1')
await b.close()
console.log('DONE')
