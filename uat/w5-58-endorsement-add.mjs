import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('admin →', await login(p, 'admin@medvex.co.ug'))
await p.goto(BASE + '/endorsements/new', { waitUntil: 'networkidle2' }); await sleep(1500)
console.log(await p.evaluate(() => {
  const setV = (sel, v) => { const i = document.querySelector(sel); const proto = i.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })) }
  const selOpt = (name, match) => { const s = document.querySelector(`select[name="${name}"]`); const o = [...s.options].find(o => match.test(o.text)); s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); return o.text.slice(0, 40) }
  const r = [selOpt('groupId', /UAT Lifecare/), selOpt('type', /Member Addition/), selOpt('gender', /Female/), selOpt('relationship', /Principal/)]
  setV('input[name="effectiveDate"]', '2026-07-15')
  setV('input[name="firstName"]', 'Wanjiku')
  setV('input[name="lastName"]', 'UAT-Endorsement')
  setV('input[name="dateOfBirth"]', '1990-01-15')
  setV('input[name="idNumber"]', '90011590')
  setV('input[name="phone"]', '+254700000058')
  setV('input[name="email"]', 'wanjiku.endorse@lifecare-staff.test')
  setV('textarea[name="notes"]', 'W5 C3 test — admin-created ADD_MEMBER endorsement, expect pro-rata calc + APPLIED → member materialises.')
  return r.join(' | ')
}))
await sleep(400)
const [nav] = await Promise.all([
  p.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => null),
  clickText(p, 'button', 'Submit for Review'),
])
await sleep(2500)
console.log('URL:', p.url())
let t = await p.evaluate(() => document.body.innerText)
console.log('\n== AFTER SUBMIT ==\n', t.slice(200, 1500).replace(/\n{2,}/g, '\n'))
const btns = await p.evaluate(() => [...document.querySelectorAll('button')].filter(x => x.getClientRects().length && x.innerText.trim() && x.innerText.length < 40 && !/OVERVIEW|MEMBERSHIP|CLINICAL|FINANCE|INSIGHTS|COMPLIANCE|SUPPORT|REINSTATEMENTS|Log out|Dashboard/.test(x.innerText)).map(x => x.innerText.trim()))
console.log('BTNS:', JSON.stringify(btns))
await shot(p, 'w5-58-endorsement-submitted')
await b.close()
console.log('DONE')
