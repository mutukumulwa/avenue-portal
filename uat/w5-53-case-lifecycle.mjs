import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('admin →', await login(p, 'admin@medvex.co.ug'))
await p.goto(BASE + '/cases/new', { waitUntil: 'networkidle2' }); await sleep(1500)
console.log(await p.evaluate(() => {
  const setV = (sel, v) => { const i = document.querySelector(sel); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })) }
  setV('input[name="memberNumber"]', 'MVX-2026-00250')
  const prov = document.querySelector('select[name="providerId"]'); prov.value = [...prov.options].find(o => /LifeCare/.test(o.text)).value; prov.dispatchEvent(new Event('change', { bubbles: true }))
  const ct = document.querySelector('select[name="caseType"]'); ct.value = [...ct.options].find(o => /OUTPATIENT/.test(o.text)).value; ct.dispatchEvent(new Event('change', { bubbles: true }))
  const bc = document.querySelector('select[name="benefitCategory"]'); bc.value = [...bc.options].find(o => /^OUTPATIENT/i.test(o.text)).value; bc.dispatchEvent(new Event('change', { bubbles: true }))
  setV('input[name="admissionDate"]', '2026-07-04')
  setV('input[name="attendingDoctor"]', 'Dr. W5 Case Tester')
  setV('input[name="estimatedCost"]', '4000')
  return 'filled'
}))
await sleep(400)
const [nav] = await Promise.all([
  p.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => null),
  clickText(p, 'button', 'Open case'),
])
await sleep(2200)
console.log('AFTER OPEN URL:', p.url())
let t = await p.evaluate(() => document.body.innerText)
console.log('\n== CASE DETAIL ==\n', t.slice(200, 1700).replace(/\n{2,}/g, '\n'))
const btns = await p.evaluate(() => [...document.querySelectorAll('button')].filter(x => x.getClientRects().length && x.innerText.trim() && x.innerText.length < 45 && !/OVERVIEW|MEMBERSHIP|CLINICAL|FINANCE|INSIGHTS|COMPLIANCE|SUPPORT|REINSTATEMENTS|Log out|Dashboard/.test(x.innerText)).map(x => x.innerText.trim()))
console.log('BTNS:', JSON.stringify(btns))
await shot(p, 'w5-53-case-open')
await b.close()
console.log('DONE')
