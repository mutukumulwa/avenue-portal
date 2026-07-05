import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('admin →', await login(p, 'admin@medvex.co.ug'))

// 1) create provider
await p.goto(BASE + '/providers/new', { waitUntil: 'networkidle2' }); await sleep(1500)
let t = await bodyText(p, 700)
console.log('== /providers/new ==\n', t.slice(200, 700))
const fields = await p.evaluate(() => [...document.querySelectorAll('input, select, textarea')].filter(x => x.getClientRects().length).map(x => `${x.tagName}[${x.type || ''}] name=${x.name} ph=${x.placeholder}`))
console.log('FIELDS:', JSON.stringify(fields, null, 1))
await p.evaluate(() => {
  const set = (sel, v) => { const i = document.querySelector(sel); if (!i) return 'miss ' + sel; const proto = i.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })) }
  set('input[name="name"]', 'UAT W5 Retest Clinic')
  set('input[name="email"]', 'billing@w5clinic.test')
  set('input[name="phone"]', '+254700000005')
  set('input[name="contactPerson"]', 'W5 Tester')
  const s = document.querySelector('select[name="type"], select[name="providerType"]')
  if (s) { const o = [...s.options].find(o => /CLINIC|HOSPITAL/i.test(o.text)); s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })) }
})
await sleep(400)
const [resp] = await Promise.all([
  p.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => null),
  clickText(p, 'button', 'Create') || clickText(p, 'button', 'Save') || clickText(p, 'button', 'Submit'),
])
await sleep(2200)
console.log('\nAFTER CREATE URL:', p.url())
t = await p.evaluate(() => document.body.innerText)
console.log('TOASTS/BANNERS:', JSON.stringify((t.match(/[^\n]*(created|success|saved)[^\n]*/gi) || []).slice(0, 4)))
await shot(p, 'w5-47-provider-created')

// 2) find it and open detail: edit/activate/branches
await p.goto(BASE + '/providers', { waitUntil: 'networkidle2' }); await sleep(1600)
const ph2 = await p.evaluate(() => {
  const tr = [...document.querySelectorAll('tbody tr, a')].find(x => /W5 Retest Clinic/.test(x.innerText))
  return tr?.matches?.('a') ? tr.getAttribute('href') : tr?.querySelector('a')?.getAttribute('href')
})
console.log('new provider href:', ph2)
if (ph2) {
  await p.goto(BASE + ph2, { waitUntil: 'networkidle2' }); await sleep(1800)
  t = await p.evaluate(() => document.body.innerText)
  console.log('\nSTATUS BADGE:', (t.match(/(PENDING|ACTIVE|INACTIVE|SUSPENDED)/) || [])[1])
  const btns = await p.evaluate(() => [...document.querySelectorAll('button, a')].filter(x => x.getClientRects().length && x.innerText.trim() && x.innerText.length < 35).map(x => x.innerText.trim()).filter(x => /edit|activ|branch|suspend|alias/i.test(x)))
  console.log('ACTIONS:', JSON.stringify(btns))
  console.log('BRANCH SECTION:', (t.match(/Branch[^]*?(?=Provider Details|Services|$)/i) || ['(none)'])[0].replace(/\n+/g, ' | ').slice(0, 500))
  await shot(p, 'w5-47-provider-detail')
}
await b.close()
console.log('DONE')
