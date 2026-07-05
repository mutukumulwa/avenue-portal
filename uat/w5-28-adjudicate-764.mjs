import { launch, login, BASE, sleep, shot, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('login →', await login(p, 'medical@medvex.co.ug'))
await p.goto(BASE + '/claims', { waitUntil: 'networkidle2' }); await sleep(1400)
const href = await p.evaluate(() => [...document.querySelectorAll('tbody tr')].find(x => /CLM-2026-00764/.test(x.innerText))?.querySelector('a')?.getAttribute('href'))
console.log('href:', href)
await p.goto(BASE + href, { waitUntil: 'networkidle2' }); await sleep(2000)
let t = await p.evaluate(() => document.body.innerText)
const ei = t.indexOf('Adjudicating under')
console.log('== ENGINE ==\n', t.slice(ei, ei + 700).replace(/\n+/g, ' | '))
await shot(p, 'w5-28-764-engine')

console.log('\ncapture:', await clickText(p, 'button', 'Captured')); await sleep(2500)
console.log(await p.evaluate(() => { const c = [...document.querySelectorAll('button')].filter(x => x.getClientRects().length && x.innerText.trim() === '✓'); c.forEach(x => x.click()); return c.length + ' line ✓' }))
await sleep(1200)
t = await p.evaluate(() => document.body.innerText)
const ai = t.indexOf('Adjudicate Claim')
console.log('\n== PANEL ==\n', t.slice(ai, ai + 400).replace(/\n{2,}/g, '\n'))

// attempt 5,000 approval (over ceiling 3,600)
async function decide(amount, note) {
  await p.evaluate((amt, nt) => {
    const s = document.querySelector('select[name="action"]'); s.value = 'APPROVED'; s.dispatchEvent(new Event('change', { bubbles: true }))
    const a = document.querySelector('input[name="approvedAmount"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(a, amt); a.dispatchEvent(new Event('input', { bubbles: true }))
    const n = document.querySelector('textarea[name="notes"]'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(n, nt); n.dispatchEvent(new Event('input', { bubbles: true }))
  }, amount, note)
  await sleep(400)
  const r = await clickText(p, 'button', 'Submit Decision')
  await sleep(3000)
  return r
}
console.log('\nsubmit 5000:', await decide('5000', 'W5 PR-014: approval above case-rate ceiling'))
t = await p.evaluate(() => document.body.innerText)
console.log('BANNER/MSGS:', JSON.stringify((t.match(/[^\n]*(ceiling|case[- ]rate|3,?600|cannot|exceed)[^\n]*/gi) || []).filter(x => x.length < 250).slice(0, 6)))
console.log('STATUS:', (t.match(/(CAPTURED|APPROVED|UNDER REVIEW|PENDING[^\n]{0,25})/g) || []).slice(0, 3))
await shot(p, 'w5-28-764-over-ceiling')

// now 3,600
console.log('\nsubmit 3600:', await decide('3600', 'W5: approve at contract case rate 3,600'))
t = await p.evaluate(() => document.body.innerText)
console.log('STATUS AFTER 3600:', (t.match(/(CAPTURED|APPROVED|UNDER REVIEW|PENDING[^\n]{0,30}|AWAITING[^\n]{0,30})/g) || []).slice(0, 4))
const ti2 = t.indexOf('ADJUDICATION TIMELINE')
console.log('\nTIMELINE:', t.slice(ti2, ti2 + 700).replace(/\n{2,}/g, '\n'))
console.log('\nMATRIX MSGS:', JSON.stringify((t.match(/[^\n]*(approval|matrix|band|UGX|pending|await)[^\n]*/gi) || []).filter(x => x.length < 220).slice(0, 8)))
await shot(p, 'w5-28-764-after-3600')
await b.close()
console.log('DONE')
