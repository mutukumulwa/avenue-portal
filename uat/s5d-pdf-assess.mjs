import { launch, login, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')
const q = 'cmq9v5y8q000304k3hevyxek9' // UAT Prospect Ltd QUO-2026-00005

// 5.4 PDF via in-page fetch (carries session cookies)
const pdf = await p.evaluate(async (id) => {
  const r = await fetch(`/api/quotations/${id}/pdf`)
  const ct = r.headers.get('content-type')
  const len = (await r.arrayBuffer()).byteLength
  return { status: r.status, ct, len }
}, q)
console.log('5.4 PDF:', JSON.stringify(pdf))

// 5.2b Add Life on assessment
await p.goto(BASE + `/quotations/${q}/assess`, { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1500))
const fields = await p.evaluate(() =>
  [...document.querySelectorAll('input,select')].filter(e => e.type !== 'hidden').map(e => ({
    tag: e.tagName, type: e.type, name: e.name, ph: e.placeholder || undefined,
    options: e.tagName === 'SELECT' ? [...e.options].map(o => o.text).slice(0, 6) : undefined,
  }))
)
console.log('ASSESS FIELDS:', JSON.stringify(fields, null, 1).slice(0, 1500))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/5.2b-assess.png' })
await b.close()
console.log('DONE')
