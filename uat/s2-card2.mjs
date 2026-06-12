import { launch, login, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')

const uat = '/members/cmq9udg5o000004k3zr7kpgan'
await p.goto(BASE + uat + '/card', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1200))
await p.evaluate(() => { [...document.querySelectorAll('button')].find(b => /issue card/i.test(b.innerText))?.click() })
await new Promise(r => setTimeout(r, 1500))
// fill card number if input requires it
const inputInfo = await p.evaluate(() => {
  const i = [...document.querySelectorAll('input')].filter(x => x.type !== 'hidden').map(x => ({ name: x.name, placeholder: x.placeholder, value: x.value }))
  return i
})
console.log('dialog inputs:', JSON.stringify(inputInfo))
await p.evaluate(() => {
  const inp = [...document.querySelectorAll('input')].find(x => x.type !== 'hidden' && !x.value)
  if (inp) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(inp, 'AV-UAT-99999'); inp.dispatchEvent(new Event('input', { bubbles: true }))
  }
})
await p.evaluate(() => { [...document.querySelectorAll('button')].find(b => /^confirm$/i.test(b.innerText.trim()))?.click() })
await new Promise(r => setTimeout(r, 4000))
console.log('after confirm:', await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 350)))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/2.5-card-confirmed.png' })
await b.close()
console.log('DONE')
