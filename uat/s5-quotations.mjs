import { launch, login, checkPage, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')

// 5.1 list
await checkPage(p, '/quotations', '5.1-quotations-list')
const rows = await p.evaluate(() => [...document.querySelectorAll('tbody tr')].slice(0, 8).map(tr => tr.innerText.replace(/\s+/g, ' ').slice(0, 110)))
console.log('ROWS:\n' + rows.join('\n'))
const qHref = await p.evaluate(() => {
  const a = [...document.querySelectorAll('a[href^="/quotations/"]')].find(x => /\/quotations\/[a-z0-9]{10,}$/i.test(x.getAttribute('href')))
  return a?.getAttribute('href')
})
console.log('QHREF:', qHref)

// 5.3 calculator
await checkPage(p, '/quotations/calculator', '5.3-calculator')

// 5.4 existing quotation detail
if (qHref) {
  await checkPage(p, qHref, '5.4-quote-detail', { textLen: 800 })
  await checkPage(p, qHref + '/build', '5.4-quote-build')
  await checkPage(p, qHref + '/assess', '5.4-quote-assess')
  await checkPage(p, qHref + '/bind', '5.5-quote-bind')
}

// 5.2 new quotation form fields
await checkPage(p, '/quotations/new', '5.2-new-quote')
const fields = await p.evaluate(() =>
  [...document.querySelectorAll('input, select, textarea')].filter(e => e.type !== 'hidden').map(e => ({
    tag: e.tagName, type: e.type, name: e.name, ph: e.placeholder || undefined,
    options: e.tagName === 'SELECT' ? [...e.options].map(o => o.text).slice(0, 8) : undefined,
  }))
)
console.log('\nNEW QUOTE FIELDS:', JSON.stringify(fields, null, 1))

// 5.6 onboarding queue
await checkPage(p, '/onboarding-queue', '5.6-onboarding-queue')

await b.close()
console.log('\nDONE S5 SWEEP')
