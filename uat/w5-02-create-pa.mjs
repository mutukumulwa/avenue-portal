import { launch, login, BASE, sleep, shot, bodyText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('login →', await login(p, 'admin@medvex.co.ug'))
await p.goto(BASE + '/preauth/new', { waitUntil: 'networkidle2' })
await sleep(1200)

// enumerate select options
const opts = await p.evaluate(() => {
  const out = {}
  document.querySelectorAll('select').forEach(s => { out[s.name] = [...s.options].map(o => o.value + ' | ' + o.text).slice(0, 30) })
  return out
})
console.log('OPTIONS:', JSON.stringify(opts, null, 1).slice(0, 3000))

// pick values
const pick = await p.evaluate(() => {
  const sel = (name, matcher) => {
    const s = document.querySelector(`select[name="${name}"]`)
    const o = [...s.options].find(o => matcher.test(o.text) || matcher.test(o.value))
    if (!o) return name + ': NO MATCH'
    s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); return name + ' = ' + o.text
  }
  return [
    sel('memberId', /Ursula/i),
    sel('providerId', /LifeCare/i),
    sel('serviceType', /DAY.?CASE/i),
    sel('benefitCategory', /SURGICAL|INPATIENT/i),
  ]
})
console.log('PICKED:', pick)

await p.evaluate(() => {
  const set = (name, v) => { const i = document.querySelector(`[name="${name}"]`); const proto = i.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })) }
  set('expectedDateOfService', '2026-07-06')
  set('estimatedCost', '85000')
  set('diagnosis', 'Unspecified abdominal hernia without obstruction or gangrene (K42.9)')
  set('procedure', 'Umbilical hernia repair (day case)')
  set('clinicalNotes', 'W5 re-verification of PR-011/014/015/016/017/018 — planned day-case surgical admission.')
})
await shot(p, 'w5-02-pa-filled')

const [resp] = await Promise.all([
  p.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => null),
  p.click('button[type="submit"], form button:last-of-type').catch(async () => { const bs = await p.$$('button'); for (const h of bs) { if (/Submit Pre-Authorization/i.test(await h.evaluate(e => e.innerText))) { await h.click(); break } } }),
])
await sleep(2500)
console.log('\nAFTER SUBMIT URL:', p.url())
console.log(await bodyText(p, 1200))
await shot(p, 'w5-02-pa-submitted')
await b.close()
console.log('DONE')
