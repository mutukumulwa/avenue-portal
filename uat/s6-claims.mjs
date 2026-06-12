import { launch, login, checkPage, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')

// 6.1 claims list
await checkPage(p, '/claims', '6.1-claims-list')
const rows = await p.evaluate(() => [...document.querySelectorAll('tbody tr')].slice(0, 5).map(tr => tr.innerText.replace(/\s+/g, ' ').slice(0, 100)))
console.log('CLAIM ROWS:\n' + rows.join('\n'))
const cHref = await p.evaluate(() => {
  const a = [...document.querySelectorAll('a[href^="/claims/"]')].find(x => /\/claims\/[a-z0-9]{10,}$/i.test(x.getAttribute('href')))
  return a?.getAttribute('href')
})
console.log('CHREF:', cHref)

// 6.2 claim detail
if (cHref) await checkPage(p, cHref, '6.2-claim-detail', { textLen: 900 })

// 6.3 new claim form
await checkPage(p, '/claims/new', '6.3-new-claim')
const fields = await p.evaluate(() =>
  [...document.querySelectorAll('input,select,textarea')].filter(e => e.type !== 'hidden').map(e => ({
    tag: e.tagName, type: e.type, name: e.name, ph: e.placeholder || undefined,
    options: e.tagName === 'SELECT' ? [...e.options].map(o => o.text).slice(0, 8) : undefined,
  }))
)
console.log('NEW CLAIM FIELDS:', JSON.stringify(fields, null, 1).slice(0, 2000))

// 6.4 reimbursement
await checkPage(p, '/claims/new/reimbursement', '6.4-reimbursement')

// 6.5 import
await checkPage(p, '/claims/import', '6.5-claims-import')

// 6.6 assessor queue
await checkPage(p, '/assessor-queue', '6.6-assessor-queue')

await b.close()
console.log('\nDONE S6 SWEEP')
