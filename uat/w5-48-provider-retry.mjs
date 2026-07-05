import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('admin →', await login(p, 'admin@medvex.co.ug'))
await p.goto(BASE + '/providers/new', { waitUntil: 'networkidle2' }); await sleep(1500)
const btns = await p.evaluate(() => [...document.querySelectorAll('button')].filter(x => x.getClientRects().length && x.innerText.trim() && x.innerText.length < 40).map(x => `${x.innerText.trim()} [type=${x.type}]`))
console.log('BUTTONS:', JSON.stringify(btns.filter(x => !/OVERVIEW|MEMBERSHIP|CLINICAL|FINANCE|INSIGHTS|COMPLIANCE|SUPPORT|REINSTATEMENTS|Log out|▸|▾|\+|−/.test(x))))

console.log(await p.evaluate(() => {
  const set = (sel, v) => { const i = document.querySelector(sel); if (!i) return; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })) }
  set('input[name="name"]', 'UAT W5 Retest Clinic')
  set('input[name="address"]', 'Moi Avenue, Nairobi')
  set('input[name="county"]', 'Nairobi')
  set('input[name="contactPerson"]', 'W5 Tester')
  set('input[name="phone"]', '+254700000005')
  set('input[name="email"]', 'billing@w5clinic.test')
  const type = document.querySelector('select[name="type"]'); type.value = [...type.options].find(o => /Clinic/i.test(o.text)).value; type.dispatchEvent(new Event('change', { bubbles: true }))
  const tier = document.querySelector('select[name="tier"]'); tier.value = [...tier.options].find(o => /Partner/i.test(o.text)).value; tier.dispatchEvent(new Event('change', { bubbles: true }))
  const svc = [...document.querySelectorAll('input[name="servicesOffered"]')]; if (svc[1] && !svc[1].checked) svc[1].click()
  return 'filled all'
}))
await sleep(500)
const [resp] = await Promise.all([
  p.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => null),
  p.evaluate(() => { const bs = [...document.querySelectorAll('button')].filter(x => x.getClientRects().length); const b = bs.find(x => /add provider|create|save|register/i.test(x.innerText)); if (b) { b.click(); return } document.querySelector('form button[type="submit"]')?.click() }),
])
await sleep(2500)
console.log('AFTER URL:', p.url())
let t = await p.evaluate(() => document.body.innerText)
console.log('ERRORS:', JSON.stringify((t.match(/[^\n]*(required|invalid|error|failed)[^\n]*/gi) || []).filter(x => x.length < 140).slice(0, 5)))
await shot(p, 'w5-48-after-submit')

await p.goto(BASE + '/providers', { waitUntil: 'networkidle2' }); await sleep(1600)
const found = await p.evaluate(() => {
  const tr = [...document.querySelectorAll('tbody tr')].find(x => /W5 Retest Clinic/.test(x.innerText))
  return tr ? { row: tr.innerText.replace(/\s+/g, ' '), href: tr.querySelector('a')?.getAttribute('href') } : null
})
console.log('IN LIST:', JSON.stringify(found))
if (found?.href) {
  await p.goto(BASE + found.href, { waitUntil: 'networkidle2' }); await sleep(1600)
  t = await p.evaluate(() => document.body.innerText)
  console.log('\nSTATUS:', (t.match(/(PENDING|ACTIVE|INACTIVE)/) || [])[1])
  const acts = await p.evaluate(() => [...document.querySelectorAll('button, a')].filter(x => x.getClientRects().length && /edit|activate|branch|suspend/i.test(x.innerText) && x.innerText.length < 35).map(x => x.innerText.trim()))
  console.log('ACTIONS:', JSON.stringify(acts))
  const bi = t.indexOf('Branch')
  console.log('BRANCHES:', bi >= 0 ? t.slice(bi, bi + 400).replace(/\n+/g, ' | ') : '(no branch section)')
  await shot(p, 'w5-48-new-provider-detail')
}
await b.close()
console.log('DONE')
