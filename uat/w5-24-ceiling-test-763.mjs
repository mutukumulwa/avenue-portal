import { launch, login, BASE, sleep, shot, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('login →', await login(p, 'medical@medvex.co.ug'))
await p.goto(BASE + '/claims', { waitUntil: 'networkidle2' }); await sleep(1400)
const href = await p.evaluate(() => [...document.querySelectorAll('tbody tr')].find(x => /CLM-2026-00763/.test(x.innerText))?.querySelector('a')?.getAttribute('href'))
console.log('href:', href)
await p.goto(BASE + href, { waitUntil: 'networkidle2' }); await sleep(2000)
let t = await p.evaluate(() => document.body.innerText)
console.log('PA ATTACH:', (t.match(/PRE-AUTHORIZATIONS[^]*?cover/) || ['none'])[0].replace(/\n+/g, ' | '))
const ei = t.indexOf('Adjudicating under')
console.log('\nENGINE:', t.slice(ei, ei + 650).replace(/\n+/g, ' | '))
await shot(p, 'w5-24-763-engine')

// capture
console.log('\ncapture:', await clickText(p, 'button', 'Captured')); await sleep(2500)
// approve line
console.log(await p.evaluate(() => { const c = [...document.querySelectorAll('button')].filter(x => x.getClientRects().length && x.innerText.trim() === '✓'); c.forEach(x => x.click()); return c.length + ' line ✓' }))
await sleep(1200)

// ceiling info in adjudicate panel?
t = await p.evaluate(() => document.body.innerText)
const ai = t.indexOf('Adjudicate Claim')
console.log('\n== ADJUDICATE PANEL ==\n', t.slice(ai, ai + 600).replace(/\n{2,}/g, '\n'))

// attempt full 86,000 approval WITH over-cover confirmed (isolate the ceiling control)
await p.evaluate(() => {
  const s = document.querySelector('select[name="action"]'); s.value = 'APPROVED'; s.dispatchEvent(new Event('change', { bubbles: true }))
  const a = document.querySelector('input[name="approvedAmount"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(a, '86000'); a.dispatchEvent(new Event('input', { bubbles: true }))
  const n = document.querySelector('textarea[name="notes"]'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(n, 'W5 PR-014 re-test: attempt approval at billed 86,000 vs case-rate ceiling'); n.dispatchEvent(new Event('input', { bubbles: true }))
  const c = document.querySelector('input[name="overCoverConfirmed"]'); if (c && !c.checked) c.click()
  const note = document.querySelector('input[name="overCoverNote"]')
  if (note) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(note, 'Ceiling test — expect server to block above contract case rate.'); note.dispatchEvent(new Event('input', { bubbles: true })) }
})
await sleep(400)
console.log('\nsubmit 86,000:', await clickText(p, 'button', 'Submit Decision'))
await sleep(3000)
t = await p.evaluate(() => document.body.innerText)
console.log('STATUS:', (t.match(/Review and adjudicate[^]*?(CAPTURED|APPROVED|UNDER REVIEW|PENDING)/) || [])[1] || '?')
console.log('CEILING MSGS:', JSON.stringify((t.match(/[^\n]*(ceiling|case[ -]rate|contract|3,?600|exceed)[^\n]*/gi) || []).filter(x => x.length < 220).slice(0, 10)))
await shot(p, 'w5-24-763-ceiling-attempt')
await b.close()
console.log('DONE')
