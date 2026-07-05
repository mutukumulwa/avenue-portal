import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('broker →', await login(p, 'broker@kaib.co.ke'))
await p.goto(BASE + '/broker/quotations/new', { waitUntil: 'networkidle2' }); await sleep(1500)
console.log(await p.evaluate(() => {
  const setV = (n, v) => { const i = document.querySelector(`[name="${n}"]`); const proto = i.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })) }
  setV('prospectName', 'UAT Nakuru Millers Ltd')
  setV('prospectEmail', 'hr@nakurumillers.test')
  setV('prospectIndustry', 'Food processing')
  setV('ratePerMember', '9500')
  setV('memberCount', '40')
  setV('dependentCount', '60')
  setV('pricingNotes', 'W5 D1 test — 40 principals + 60 dependents, standard corporate rate.')
  return 'filled'
}))
await sleep(400)
const [nav] = await Promise.all([
  p.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => null),
  clickText(p, 'button', 'Create Quote'),
])
await sleep(2500)
console.log('URL:', p.url())
let t = await p.evaluate(() => document.body.innerText)
console.log('\n== AFTER CREATE ==\n', t.slice(100, 1400).replace(/\n{2,}/g, '\n'))
const btns = await p.evaluate(() => [...document.querySelectorAll('button, a')].filter(x => x.getClientRects().length && x.innerText.trim() && x.innerText.length < 45).map(x => x.innerText.trim()).filter(x => !/Log out|Dashboard|My Groups|Submissions|Quotations|Commissions|Renewals|Support|Medvex/.test(x)))
console.log('ACTIONS:', JSON.stringify([...new Set(btns)]))
await shot(p, 'w5-75-quote-created')
await b.close()
console.log('DONE')
