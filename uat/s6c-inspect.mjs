import { launch, login, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')
await p.goto(BASE + '/claims/new', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 4000))

const info = await p.evaluate(() => {
  const el = [...document.querySelectorAll('*')].filter(x => x.children.length === 0 && /Search by name, member number/i.test(x.innerText || x.placeholder || ''))
  return el.map(x => ({ tag: x.tagName, cls: (x.className || '').toString().slice(0, 80), html: x.outerHTML.slice(0, 200) }))
})
console.log('SEARCH EL:', JSON.stringify(info, null, 1))
const counts = await p.evaluate(() => ({
  inputs: document.querySelectorAll('input').length,
  buttons: document.querySelectorAll('button').length,
  iframes: document.querySelectorAll('iframe').length,
  body: document.body.innerText.length,
}))
console.log('COUNTS:', JSON.stringify(counts))
await b.close()
