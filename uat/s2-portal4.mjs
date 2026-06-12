import { launch, login, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')
await p.goto(BASE + '/members/cmq9udg5o000004k3zr7kpgan', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1500))
// dump all visible inputs with context
const dump = await p.evaluate(() =>
  [...document.querySelectorAll('input')].filter(i => i.type !== 'hidden').map(i => ({
    type: i.type, name: i.name, placeholder: i.placeholder, value: i.value.slice(0, 30),
    near: i.parentElement?.parentElement?.innerText?.replace(/\s+/g, ' ').slice(0, 80),
  }))
)
console.log(JSON.stringify(dump, null, 1))
await b.close()
