import { launch, login, checkPage, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')
await p.goto(BASE + '/members/new', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1500))

// dump form structure
const fields = await p.evaluate(() => {
  return [...document.querySelectorAll('input, select, textarea, button[type="submit"]')].map(el => ({
    tag: el.tagName, type: el.type || '', name: el.name || '', id: el.id || '',
    placeholder: el.placeholder || '',
    label: (el.closest('label')?.innerText || el.closest('div')?.querySelector('label')?.innerText || '').slice(0, 40),
    options: el.tagName === 'SELECT' ? [...el.options].map(o => o.text).slice(0, 10) : undefined,
    text: el.tagName === 'BUTTON' ? el.innerText : undefined,
  }))
})
console.log('FORM FIELDS:', JSON.stringify(fields, null, 1))
await b.close()
